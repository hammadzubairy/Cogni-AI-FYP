"""Extract clean, page-tagged text from PDF bytes.

Prefer `documents.extract_pages` for uploads (OCR + DOCX/PPTX). This module
keeps the synchronous text-layer path used by tests and older call sites.
"""

import io
import re
from collections import Counter

from fastapi import HTTPException
from pypdf import PdfReader

MIN_TEXT_CHARS = 200


def _join_hyphenated(text: str) -> str:
    """Join a word broken across a line by a trailing hyphen, e.g.
    'hash func-\\ntion' -> 'hash function'."""
    return re.sub(r"(\w)-\n(\w)", r"\1\2", text)


def _normalize_whitespace(text: str) -> str:
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n[ \t]+", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_pdf_pages(data: bytes) -> list[dict]:
    """Return [{page, text}], one entry per PDF page: whitespace-normalised,
    hyphenated line breaks joined, and lines repeated on more than half the
    pages (headers/footers) dropped.

    Note: scanned PDFs with little extractable text raise SCANNED_PDF. Upload
    routes should use documents.extract_pages which runs OCR instead.
    """
    try:
        reader = PdfReader(io.BytesIO(data))
        raw_pages = [page.extract_text() or "" for page in reader.pages]
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Could not read this PDF file.") from exc

    n_pages = len(raw_pages)
    line_counts: Counter[str] = Counter()
    page_lines = []
    for text in raw_pages:
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        page_lines.append(lines)
        for line in set(lines):
            line_counts[line] += 1

    threshold = n_pages / 2
    repeated = {line for line, count in line_counts.items() if n_pages > 1 and count > threshold}

    pages = []
    for i, lines in enumerate(page_lines):
        kept = [line for line in lines if line not in repeated]
        text = _join_hyphenated("\n".join(kept))
        text = _normalize_whitespace(text)
        pages.append({"page": i + 1, "text": text})

    total_chars = sum(len(p["text"]) for p in pages)
    if total_chars < MIN_TEXT_CHARS:
        raise HTTPException(
            status_code=400,
            detail={
                "detail": (
                    "This PDF looks like scanned images. OCR will be attempted "
                    "on upload; if that fails, paste the text instead."
                ),
                "code": "SCANNED_PDF",
            },
        )
    return pages
