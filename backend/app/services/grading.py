"""The attempt grading engine: MCQ auto-grading, LLM rubric grading of
written answers with keyword + embedding similarity signals, and AI-writing
likelihood detection. `finalize_attempt` is the single place an attempt's
answers turn into results, used both by an explicit student submit and by
auto-close of an expired/closed attempt."""

import asyncio
import logging
import re
from datetime import UTC, datetime
from typing import ClassVar

import httpx

from app.core.config import settings
from app.core.db import get_db, oid
from app.prompts.grading import GRADING_SYSTEM_PROMPT, build_grading_user_prompt
from app.services.embeddings import cosine_similarity_percent
from app.services.llm import LLMError, call_json, get_llm_client

GRADE_STEP = 0.5
WRITTEN_GRADING_CONCURRENCY = 4
# v7 scoregrid weights: semantic similarity / key concepts / LLM rubric
W_SIM = 0.4
W_KEYS = 0.2
W_RUBRIC = 0.4

logger = logging.getLogger("app.grading")


class AIDetector:
    label: str

    def predict(self, text: str) -> float:
        raise NotImplementedError


class HeuristicDetector(AIDetector):
    """Ported verbatim from v7's `aiProb()`: a handful of AI-writing marker
    phrases, sentence length, and a short-answer floor. Advisory only."""

    label = "heuristic"

    MARKERS: ClassVar[list[str]] = [
        "furthermore", "moreover", "it is essential", "robust", "in conclusion",
        "multifaceted", "additionally", "utiliz", "comprehensive", "crucial",
        "paramount", "in summary", "ensures", "facilitates", "it is important to",
        "overall,",
    ]

    def predict(self, text: str) -> float:
        txt = (text or "").strip()
        words = [w for w in txt.split() if w]
        if len(words) < 8:
            return 4.0
        low = txt.lower()
        marker_hits = sum(1 for marker in self.MARKERS if marker in low)
        sentences = [s for s in re.split(r"[.!?]+", txt) if s.strip()] or [txt]
        avg_sentence_len = len(words) / len(sentences)
        value = 10 + marker_hits * 14 + max(0, avg_sentence_len - 14) * 2.2 + (len(txt) % 7)
        return float(max(3, min(97, round(value))))


class GPTZeroDetector(AIDetector):
    """GPTZero HTTP API (free tier). Falls back to HeuristicDetector on any
    failure so grading never blocks on the external service."""

    label = "gptzero"
    API_URL = "https://api.gptzero.me/v2/predict/text"

    def __init__(self) -> None:
        self._fallback = HeuristicDetector()

    def predict(self, text: str) -> float:
        txt = (text or "").strip()
        if not txt:
            return self._fallback.predict(txt)
        api_key = (settings.GPTZERO_API_KEY or "").strip()
        if not api_key:
            logger.info("GPTZERO_API_KEY unset; using heuristic AI detector.")
            return self._fallback.predict(txt)
        try:
            with httpx.Client(timeout=12.0) as client:
                resp = client.post(
                    self.API_URL,
                    headers={
                        "x-api-key": api_key,
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                    },
                    json={"document": txt},
                )
            if resp.status_code >= 400:
                logger.warning("GPTZero HTTP %s; falling back to heuristic.", resp.status_code)
                return self._fallback.predict(txt)
            data = resp.json()
            prob = _gptzero_probability(data)
            if prob is None:
                return self._fallback.predict(txt)
            return float(max(3, min(97, round(prob))))
        except Exception:
            logger.exception("GPTZero request failed; falling back to heuristic.")
            return self._fallback.predict(txt)


def _prob_to_percent(p: float) -> float:
    return p * 100 if p <= 1 else p


def _class_probabilities_ai_pct(probs: dict) -> float | None:
    """Map GPTZero class_probabilities {human, ai, mixed} to 0-100 AI likelihood.

    Treat `mixed` as AI-tainted (ai + mixed). Prefer `1 - human` when present.
    """
    human = probs.get("human")
    ai = probs.get("ai", probs.get("AI", probs.get("generated", probs.get("fake"))))
    mixed = probs.get("mixed")
    if isinstance(human, (int, float)):
        return _prob_to_percent(max(0.0, min(1.0, 1.0 - float(human))))
    total = 0.0
    found = False
    if isinstance(ai, (int, float)):
        total += float(ai)
        found = True
    if isinstance(mixed, (int, float)):
        total += float(mixed)
        found = True
    if not found:
        return None
    return _prob_to_percent(max(0.0, min(1.0, total)))


def _gptzero_probability(data: dict) -> float | None:
    """Extract a 0-100 AI likelihood from a GPTZero v2 response."""
    if not isinstance(data, dict):
        return None
    docs = data.get("documents")
    if isinstance(docs, list) and docs:
        doc = docs[0] if isinstance(docs[0], dict) else {}
        for key in (
            "completely_generated_prob",
            "average_generated_prob",
            "predicted_prob",
            "class_probabilities",
        ):
            val = doc.get(key)
            if isinstance(val, dict):
                pct = _class_probabilities_ai_pct(val)
                if pct is not None:
                    return pct
            if isinstance(val, (int, float)):
                return _prob_to_percent(float(val))
    for key in ("completely_generated_prob", "average_generated_prob", "ai_probability"):
        val = data.get(key)
        if isinstance(val, (int, float)):
            return _prob_to_percent(float(val))
    return None


def get_ai_detector() -> AIDetector:
    choice = (settings.AI_DETECTOR or "heuristic").strip().lower()
    if choice == "gptzero":
        return GPTZeroDetector()
    if choice == "heuristic":
        return HeuristicDetector()
    raise NotImplementedError(f"AI_DETECTOR={settings.AI_DETECTOR!r} is not implemented.")


def _keyword_coverage(question: dict, answer: str) -> tuple[list[str], list[str], float]:
    text = (answer or "").lower()
    keywords = question.get("keywords", [])
    hit, miss = [], []
    for k in keywords:
        variants = [v.lower() for v in k.get("variants", [])]
        (hit if any(v in text for v in variants) else miss).append(k["label"])
    coverage = len(hit) / len(keywords) if keywords else 0.0
    return hit, miss, coverage


def _blend_score(max_marks: float, sim_pct: int, key_pct: float, rubric_pct: float) -> float:
    blended = (W_SIM * sim_pct + W_KEYS * key_pct + W_RUBRIC * rubric_pct) / 100
    raw = max_marks * blended
    return max(0.0, min(float(max_marks), round(raw / GRADE_STEP) * GRADE_STEP))


def _keyword_fallback(question: dict, answer: str) -> dict:
    """Used when the LLM grader fails. Still uses embedding similarity (FR-18)."""
    max_marks = question["marks"]
    words = [w for w in (answer or "").split() if w]
    keywords = question.get("keywords", [])
    if not words:
        return {
            "score": 0.0, "max": max_marks, "similarity": 0,
            "key_points_hit": [], "key_points_missed": [k["label"] for k in keywords],
            "reason": "No answer given", "fallback": True,
        }
    hit, miss, coverage = _keyword_coverage(question, answer)
    model_answer = question.get("model_answer") or ""
    key_pct = coverage * 100
    sim_pct = cosine_similarity_percent(answer, model_answer)
    # Long-form written (Essay / Long Questions / heavy custom) vs short written.
    long_form = float(question.get("marks") or 0) >= 8 or (
        str(question.get("type") or "").lower() in {"essay", "long questions"}
        or "long" in str(question.get("type") or "").lower()
        or "essay" in str(question.get("type") or "").lower()
    )
    len_factor = min(1.0, len(words) / (70 if long_form else 25))
    rubric_pct = round(len_factor * 10) if coverage == 0 else min(
        100, round(coverage * 92 + len_factor * 10)
    )
    score = _blend_score(max_marks, sim_pct, key_pct, rubric_pct)
    reason = "Missing: " + "; ".join(miss) if miss else "Covers every key point"
    return {
        "score": score, "max": max_marks, "similarity": sim_pct,
        "key_points_hit": hit, "key_points_missed": miss,
        "reason": reason, "fallback": True,
    }


async def _grade_written_llm(llm, question: dict, answer: str, detector: AIDetector) -> dict:
    max_marks = question["marks"]
    labels = {k["label"] for k in question.get("keywords", [])}
    model_answer = question.get("model_answer") or ""
    hit_kw, miss_kw, coverage = _keyword_coverage(question, answer)
    key_pct = coverage * 100
    # FR-18: similarity is embedding-only (not floored by keywords — those are W_KEYS).
    sim_pct = cosine_similarity_percent(answer, model_answer)

    user_prompt = build_grading_user_prompt(question, answer)
    try:
        data = await call_json(llm, GRADING_SYSTEM_PROMPT, user_prompt, max_tokens=500, temperature=0.2)
        llm_score = float(data.get("score", 0))
        llm_score = max(0.0, min(float(max_marks), round(llm_score / GRADE_STEP) * GRADE_STEP))
        rubric_pct = (llm_score / max_marks) * 100 if max_marks else 0.0
        hit = [label for label in (data.get("key_points_hit") or []) if label in labels]
        missed = [label for label in (data.get("key_points_missed") or []) if label in labels]
        if not hit and not missed:
            hit, missed = hit_kw, miss_kw
        reason = str(data.get("reason", ""))[:200]
        score = _blend_score(max_marks, sim_pct, key_pct, rubric_pct)
        result = {
            "score": score, "max": max_marks, "similarity": sim_pct,
            "key_points_hit": hit, "key_points_missed": missed,
            "reason": reason, "fallback": False,
        }
    except (LLMError, TypeError, ValueError, KeyError):
        result = _keyword_fallback(question, answer)
    result["ai_probability"] = detector.predict(answer)
    return result


async def grade_attempt_answers(exam: dict, answers: dict) -> dict:
    llm = get_llm_client()
    detector = get_ai_detector()
    semaphore = asyncio.Semaphore(WRITTEN_GRADING_CONCURRENCY)
    results: dict[str, dict] = {}

    async def grade_one(question: dict) -> None:
        qid = question["qid"]
        answer = answers.get(qid)
        fmt = question.get("format")
        is_mcq_q = fmt == "mcq" or (
            fmt not in ("mcq", "written")
            and (question.get("type") == "MCQ" or bool(question.get("options")))
        )
        if is_mcq_q:
            results[qid] = _grade_mcq(question, answer)
            return
        text = (answer or "").strip()
        if not text:
            results[qid] = {
                "score": 0.0, "max": question["marks"], "similarity": 0,
                "key_points_hit": [],
                "key_points_missed": [k["label"] for k in question.get("keywords", [])],
                "reason": "No answer given", "ai_probability": None, "fallback": False,
            }
            return
        async with semaphore:
            results[qid] = await _grade_written_llm(llm, question, text, detector)

    await asyncio.gather(*(grade_one(q) for q in exam["questions"]))
    return results


def _grade_mcq(question: dict, answer) -> dict:
    marks = question["marks"]
    correct = question.get("answer_index")
    ok = answer is not None and answer == correct
    if answer is None:
        note = "Not answered"
    elif ok:
        note = "Correct"
    else:
        note = f"Chose {'ABCD'[answer]}, correct is {'ABCD'[correct]}"
    return {
        "score": marks if ok else 0.0,
        "max": marks,
        "similarity": None,
        "key_points_hit": [],
        "key_points_missed": [],
        "reason": note,
        "ai_probability": None,
        "fallback": False,
    }


async def finalize_attempt(
    attempt: dict,
    *,
    end_reason: str | None = None,
    integrity_events: list[dict] | None = None,
    violation_count: int | None = None,
) -> dict:
    """Grade every answer and mark the attempt submitted. Used both for an
    explicit student submit and for auto-closing an attempt whose deadline
    has passed (lazily on read, or when the teacher closes the exam)."""
    db = get_db()
    exam = await db.exams.find_one({"_id": oid(attempt["exam_id"])})
    results = await grade_attempt_answers(exam, attempt.get("answers", {})) if exam else {}
    now = datetime.now(UTC)
    update: dict = {"status": "submitted", "submitted_at": now, "results": results}
    if end_reason is not None:
        update["end_reason"] = end_reason
    if integrity_events is not None:
        update["integrity_events"] = integrity_events
    if violation_count is not None:
        update["violation_count"] = violation_count
    await db.attempts.update_one({"_id": attempt["_id"]}, {"$set": update})
    attempt["status"] = "submitted"
    attempt["submitted_at"] = now
    attempt["results"] = results
    if end_reason is not None:
        attempt["end_reason"] = end_reason
    if integrity_events is not None:
        attempt["integrity_events"] = integrity_events
    if violation_count is not None:
        attempt["violation_count"] = violation_count
    return attempt


def effective_score(attempt: dict, question: dict) -> float:
    qid = question["qid"]
    override = attempt.get("overrides", {}).get(qid)
    if override is not None:
        return override
    result = attempt.get("results", {}).get(qid)
    return result["score"] if result else 0.0


def effective_total(attempt: dict, exam: dict) -> float:
    return sum(effective_score(attempt, q) for q in exam["questions"])
