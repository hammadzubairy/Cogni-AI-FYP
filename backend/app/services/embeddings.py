"""Shared sentence-transformer embeddings (FR-06 semantic chunking, FR-18 grading).

Model: all-MiniLM-L6-v2 (local, free). Lazy-loaded; falls back to a lightweight
token-overlap scorer when the model is unavailable so tests and lean deploys
still run.
"""

from __future__ import annotations

import logging
import math
import re
from functools import lru_cache

logger = logging.getLogger("app.embeddings")

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
_TOKEN_RE = re.compile(r"[a-z0-9]+")


@lru_cache(maxsize=1)
def _model():
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError:
        logger.warning("sentence-transformers not installed; using overlap fallback.")
        return None
    try:
        return SentenceTransformer(MODEL_NAME)
    except Exception:
        logger.exception("Failed to load %s; using overlap fallback.", MODEL_NAME)
        return None


def _tokenize(text: str) -> list[str]:
    return _TOKEN_RE.findall((text or "").lower())


def _overlap_similarity(a: str, b: str) -> float:
    ta, tb = set(_tokenize(a)), set(_tokenize(b))
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def _cosine(u, v) -> float:
    dot = sum(x * y for x, y in zip(u, v))
    nu = math.sqrt(sum(x * x for x in u))
    nv = math.sqrt(sum(y * y for y in v))
    if nu == 0 or nv == 0:
        return 0.0
    return float(dot / (nu * nv))


def embed_texts(texts: list[str]) -> list[list[float]] | None:
    """Return embedding vectors, or None if the model is unavailable."""
    if not texts:
        return []
    model = _model()
    if model is None:
        return None
    vectors = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
    return [list(map(float, row)) for row in vectors]


def cosine_similarity(a: str, b: str) -> float:
    """Cosine similarity in [0, 1] between two strings."""
    a = (a or "").strip()
    b = (b or "").strip()
    if not a or not b:
        return 0.0
    vectors = embed_texts([a, b])
    if vectors is None or len(vectors) < 2:
        return _overlap_similarity(a, b)
    # Normalized MiniLM vectors → cosine ≈ dot product in roughly [-1, 1].
    return max(0.0, min(1.0, _cosine(vectors[0], vectors[1])))


def cosine_similarity_percent(a: str, b: str) -> int:
    return int(round(cosine_similarity(a, b) * 100))


def adjacent_cosine_scores(sentences: list[str]) -> list[float]:
    """Cosine similarity between each consecutive sentence pair."""
    if len(sentences) < 2:
        return []
    vectors = embed_texts(sentences)
    if vectors is None:
        return [_overlap_similarity(sentences[i], sentences[i + 1]) for i in range(len(sentences) - 1)]
    return [_cosine(vectors[i], vectors[i + 1]) for i in range(len(vectors) - 1)]
