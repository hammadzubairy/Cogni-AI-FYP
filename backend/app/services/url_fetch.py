"""Fetch and extract main article text from a public HTTP(S) URL (FR-04).

Uses trafilatura for clean article extraction. Blocks private/loopback hosts
(SSRF guard) and rejects empty or too-short extracts.
"""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

from fastapi import HTTPException

MIN_EXTRACT_CHARS = 300
FETCH_TIMEOUT_SEC = 20


def _is_private_ip(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return True
    return (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_reserved
        or addr.is_multicast
        or addr.is_unspecified
    )


def _assert_public_http_url(url: str) -> str:
    raw = (url or "").strip()
    parsed = urlparse(raw)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(
            status_code=400,
            detail="URL must start with http:// or https://.",
        )
    host = parsed.hostname
    if not host:
        raise HTTPException(status_code=400, detail="URL is missing a host.")
    if host.lower() in ("localhost",) or host.endswith(".localhost"):
        raise HTTPException(status_code=400, detail="That host is not allowed.")
    try:
        infos = socket.getaddrinfo(host, parsed.port or 80, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise HTTPException(status_code=400, detail="Could not resolve that URL host.") from exc
    for info in infos:
        ip = info[4][0]
        if _is_private_ip(ip):
            raise HTTPException(status_code=400, detail="That host is not allowed.")
    return raw


def fetch_url_text(url: str) -> tuple[str, str]:
    """Return (title_or_hostname, extracted_text). Raises HTTPException on failure."""
    safe_url = _assert_public_http_url(url)
    try:
        import trafilatura
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail="URL fetching is unavailable (trafilatura not installed).",
        ) from exc

    try:
        downloaded = trafilatura.fetch_url(safe_url)
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail="Could not fetch that URL.",
        ) from exc

    if not downloaded:
        raise HTTPException(status_code=400, detail="Could not fetch that URL.")

    text = trafilatura.extract(
        downloaded,
        include_comments=False,
        include_tables=True,
        favor_recall=True,
    )
    text = (text or "").strip()
    if len(text) < MIN_EXTRACT_CHARS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Could not extract enough readable text from that page "
                f"(need at least {MIN_EXTRACT_CHARS} characters)."
            ),
        )

    meta = trafilatura.extract_metadata(downloaded)
    title = ""
    if meta is not None:
        title = (getattr(meta, "title", None) or "").strip()
    if not title:
        host = urlparse(safe_url).hostname or "Web page"
        title = host
    return title[:120], text
