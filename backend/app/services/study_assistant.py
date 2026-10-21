"""The study assistant: keyword (BM25-style) retrieval over a material's
chunks in plain Python, then one LLM call answering only from the top
chunks. No vector DB, no embeddings."""

import math
import re

from fastapi import HTTPException

from app.core.db import get_db, oid
from app.core.deps import CurrentUser
from app.prompts.study_assistant import ASK_SYSTEM_PROMPT, build_ask_user_prompt
from app.services.llm import call_json, get_llm_client

TOP_K = 6
MIN_QUESTION_CHARS = 3


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", (text or "").lower())


def top_chunks(chunks: list[dict], question: str, k: int = TOP_K) -> list[dict]:
    """Rank chunks against the question with BM25 and return the top `k`.
    Falls back to the first `k` chunks (document order) if nothing scores."""
    query_terms = _tokenize(question)
    if not chunks:
        return []
    if not query_terms:
        return chunks[:k]

    doc_tokens = [_tokenize(c.get("text", "")) for c in chunks]
    n_docs = len(chunks)
    doc_freq: dict[str, int] = {}
    for tokens in doc_tokens:
        for term in set(tokens):
            doc_freq[term] = doc_freq.get(term, 0) + 1
    avg_len = (sum(len(t) for t in doc_tokens) / n_docs) or 1.0

    k1, b = 1.5, 0.75
    scored: list[tuple[float, int]] = []
    for i, tokens in enumerate(doc_tokens):
        term_freq: dict[str, int] = {}
        for term in tokens:
            term_freq[term] = term_freq.get(term, 0) + 1
        doc_len = len(tokens) or 1
        score = 0.0
        for term in query_terms:
            freq = term_freq.get(term, 0)
            if freq == 0:
                continue
            n_q = doc_freq.get(term, 0)
            idf = math.log((n_docs - n_q + 0.5) / (n_q + 0.5) + 1)
            score += idf * (freq * (k1 + 1)) / (freq + k1 * (1 - b + b * doc_len / avg_len))
        scored.append((score, i))

    scored.sort(key=lambda item: (-item[0], item[1]))
    if scored[0][0] <= 0:
        return chunks[:k]
    return [chunks[i] for _score, i in scored[:k]]


async def ask_material(student: CurrentUser, material_id: str, question: str) -> dict:
    question = (question or "").strip()
    if len(question) < MIN_QUESTION_CHARS:
        raise HTTPException(status_code=400, detail="Ask a longer question.")

    db = get_db()
    material = await db.materials.find_one({"_id": oid(material_id)})
    if material is None:
        raise HTTPException(status_code=404, detail="Material not found.")
    cls = await db.classes.find_one({"_id": oid(material["class_id"])})
    if cls is None or student.id not in cls.get("student_ids", []):
        raise HTTPException(status_code=403, detail="You are not enrolled in this class.")

    chunks = material.get("chunks", [])
    if not chunks:
        raise HTTPException(status_code=400, detail="This material has no content yet.")

    selected = top_chunks(chunks, question)
    llm = get_llm_client()
    data = await call_json(
        llm,
        ASK_SYSTEM_PROMPT,
        build_ask_user_prompt(question, selected),
        max_tokens=900,
        temperature=0.4,
    )
    answer = str(data.get("answer", "")).strip()
    sources = [{"page": c.get("page"), "heading": c.get("heading")} for c in selected]
    return {"answer": answer, "sources": sources}
