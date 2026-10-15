"""The attempt grading engine: MCQ auto-grading, LLM rubric grading of
written answers with a keyword-overlap fallback, and AI-writing likelihood
detection. `finalize_attempt` is the single place an attempt's answers turn
into results, used both by an explicit student submit and by auto-close of
an expired/closed attempt."""

import asyncio
import re
from datetime import UTC, datetime
from typing import ClassVar

from app.core.config import settings
from app.core.db import get_db, oid
from app.prompts.grading import GRADING_SYSTEM_PROMPT, build_grading_user_prompt
from app.services.llm import LLMError, call_json, get_llm_client

GRADE_STEP = 0.5
WRITTEN_GRADING_CONCURRENCY = 4


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
    label = "gptzero"

    def predict(self, text: str) -> float:
        raise NotImplementedError("GPTZero integration is not implemented.")


def get_ai_detector() -> AIDetector:
    if settings.AI_DETECTOR == "heuristic":
        return HeuristicDetector()
    raise NotImplementedError(f"AI_DETECTOR={settings.AI_DETECTOR!r} is not implemented.")


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


def _keyword_fallback(question: dict, answer: str) -> dict:
    """Ported from v7's `gradeWritten()`. Used when the LLM grader fails."""
    max_marks = question["marks"]
    text = (answer or "").lower()
    words = [w for w in text.split() if w]
    keywords = question.get("keywords", [])
    if not words:
        return {
            "score": 0.0, "max": max_marks, "similarity": 0,
            "key_points_hit": [], "key_points_missed": [k["label"] for k in keywords],
            "reason": "No answer given", "fallback": True,
        }
    hit, miss = [], []
    for k in keywords:
        variants = [v.lower() for v in k.get("variants", [])]
        (hit if any(v in text for v in variants) else miss).append(k["label"])
    coverage = len(hit) / len(keywords) if keywords else 0.0
    len_factor = min(1.0, len(words) / (70 if question["type"] == "Essay" else 25))
    similarity = round((coverage * 0.8 + len_factor * 0.2) * 100)
    key_pts = round(coverage * 100)
    rubric = round(len_factor * 10) if coverage == 0 else min(100, round(coverage * 92 + len_factor * 10))
    score = round(max_marks * (0.4 * similarity + 0.2 * key_pts + 0.4 * rubric) / 100 * 2) / 2
    reason = "Missing: " + "; ".join(miss) if miss else "Covers every key point"
    return {
        "score": score, "max": max_marks, "similarity": similarity,
        "key_points_hit": hit, "key_points_missed": miss,
        "reason": reason, "fallback": True,
    }


async def _grade_written_llm(llm, question: dict, answer: str, detector: AIDetector) -> dict:
    max_marks = question["marks"]
    labels = {k["label"] for k in question.get("keywords", [])}
    user_prompt = build_grading_user_prompt(question, answer)
    try:
        data = await call_json(llm, GRADING_SYSTEM_PROMPT, user_prompt, max_tokens=500, temperature=0.2)
        score = float(data.get("score", 0))
        score = max(0.0, min(float(max_marks), round(score / GRADE_STEP) * GRADE_STEP))
        similarity = data.get("similarity")
        similarity = max(0, min(100, int(similarity))) if isinstance(similarity, (int, float)) else None
        hit = [label for label in (data.get("key_points_hit") or []) if label in labels]
        missed = [label for label in (data.get("key_points_missed") or []) if label in labels]
        reason = str(data.get("reason", ""))[:200]
        result = {
            "score": score, "max": max_marks, "similarity": similarity,
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
        if question["type"] == "MCQ":
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


async def finalize_attempt(attempt: dict) -> dict:
    """Grade every answer and mark the attempt submitted. Used both for an
    explicit student submit and for auto-closing an attempt whose deadline
    has passed (lazily on read, or when the teacher closes the exam)."""
    db = get_db()
    exam = await db.exams.find_one({"_id": oid(attempt["exam_id"])})
    results = await grade_attempt_answers(exam, attempt.get("answers", {})) if exam else {}
    now = datetime.now(UTC)
    await db.attempts.update_one(
        {"_id": attempt["_id"]},
        {"$set": {"status": "submitted", "submitted_at": now, "results": results}},
    )
    attempt["status"] = "submitted"
    attempt["submitted_at"] = now
    attempt["results"] = results
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
