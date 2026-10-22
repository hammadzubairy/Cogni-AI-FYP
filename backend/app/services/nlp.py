"""NLP preprocessing for course material (FR-05).

Uses spaCy (`en_core_web_sm`) for tokenization, lemmatization, stopword
removal and sentence splitting when available. Falls back to regex cleaning
so uploads still work without the model.
"""

from __future__ import annotations

import logging
import re
from functools import lru_cache

logger = logging.getLogger("app.nlp")

_NOISE_LINE = re.compile(
    r"^(page\s+\d+(\s+of\s+\d+)?|contents|table of contents|copyright|all rights reserved)\.?$",
    re.IGNORECASE,
)
_MULTI_SPACE = re.compile(r"[ \t]+")
_MULTI_NEWLINE = re.compile(r"\n{3,}")


@lru_cache(maxsize=1)
def _nlp():
    try:
        import spacy
    except ImportError:
        logger.warning("spaCy not installed; using regex NLP fallback.")
        return None
    try:
        return spacy.load("en_core_web_sm", disable=["ner"])
    except OSError:
        logger.warning(
            "spaCy model en_core_web_sm missing; run: python -m spacy download en_core_web_sm"
        )
        return None


def _regex_clean(text: str) -> str:
    lines = []
    for line in (text or "").splitlines():
        stripped = line.strip()
        if not stripped or _NOISE_LINE.match(stripped):
            continue
        lines.append(stripped)
    joined = "\n".join(lines)
    joined = _MULTI_SPACE.sub(" ", joined)
    joined = _MULTI_NEWLINE.sub("\n\n", joined)
    return joined.strip()


def preprocess_text(text: str, *, for_embedding: bool = False) -> str:
    """Clean raw extracted text.

    When `for_embedding` is True, also drop stopwords and use lemmas (better
    for similarity/chunk signals). Otherwise keep readable prose for the LLM
    while still removing noise lines and normalizing whitespace.
    """
    text = _regex_clean(text)
    if not text:
        return ""

    nlp = _nlp()
    if nlp is None:
        return text

    max_chars = 900_000
    parts: list[str] = []
    for start in range(0, len(text), max_chars):
        doc = nlp(text[start : start + max_chars])
        if for_embedding:
            tokens = [
                t.lemma_.lower()
                for t in doc
                if not t.is_stop
                and not t.is_punct
                and not t.is_space
                and t.lemma_.strip()
                and not t.like_url
                and not t.like_email
            ]
            parts.append(" ".join(tokens))
        else:
            kept = []
            for t in doc:
                if t.is_space:
                    if kept:
                        kept.append(t.text_with_ws)
                    continue
                if t.like_url or t.like_email:
                    continue
                kept.append(t.text_with_ws)
            parts.append("".join(kept).strip())
    cleaned = "\n".join(p for p in parts if p).strip()
    return _MULTI_NEWLINE.sub("\n\n", cleaned) or text


def split_sentences(text: str) -> list[str]:
    """Split text into sentences (spaCy when available, else regex)."""
    text = (text or "").strip()
    if not text:
        return []
    nlp = _nlp()
    if nlp is not None:
        doc = nlp(text[:900_000])
        return [s.text.strip() for s in doc.sents if s.text.strip()]
    parts = re.split(r"(?<=[.!?])\s+", text)
    return [p.strip() for p in parts if p.strip()]


def preprocess_pages(pages: list[dict]) -> list[dict]:
    """Apply preprocess_text to each page's text (readable form for storage)."""
    out = []
    for p in pages:
        cleaned = preprocess_text(p.get("text") or "", for_embedding=False)
        if cleaned:
            out.append({**p, "text": cleaned})
    return out or pages
