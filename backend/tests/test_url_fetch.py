import pytest
from fastapi import HTTPException

from app.services.url_fetch import _assert_public_http_url


def test_rejects_non_http_scheme():
    with pytest.raises(HTTPException) as ei:
        _assert_public_http_url("ftp://example.com/a")
    assert ei.value.status_code == 400


def test_rejects_localhost():
    with pytest.raises(HTTPException) as ei:
        _assert_public_http_url("http://localhost/secret")
    assert ei.value.status_code == 400


def test_rejects_loopback_ip():
    with pytest.raises(HTTPException) as ei:
        _assert_public_http_url("http://127.0.0.1/secret")
    assert ei.value.status_code == 400


def test_accepts_public_https():
    # May fail DNS in offline CI; skip if unresolved.
    try:
        url = _assert_public_http_url("https://example.com/page")
    except HTTPException as exc:
        if "resolve" in str(exc.detail).lower():
            pytest.skip("DNS unavailable")
        raise
    assert url.startswith("https://example.com")
