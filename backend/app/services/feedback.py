from fastapi import HTTPException

from app.core.db import get_db, oid
from app.core.deps import CurrentUser
from app.prompts.feedback import STUDY_TIPS_SYSTEM_PROMPT, build_study_tips_user_prompt
from app.services.attempts import auto_close_if_expired
from app.services.grading import effective_score, effective_total
from app.services.llm import LLMError, call_json, get_llm_client

MAX_TIPS = 5


async def get_feedback(user: CurrentUser, attempt_id: str) -> dict:
    db = get_db()
    attempt = await db.attempts.find_one({"_id": oid(attempt_id)})
    if attempt is None:
        raise HTTPException(status_code=404, detail="Attempt not found.")
    exam = await db.exams.find_one({"_id": oid(attempt["exam_id"])})
    if exam is None:
        raise HTTPException(status_code=404, detail="Exam not found.")

    if user.role == "student":
        if attempt["student_id"] != user.id:
            raise HTTPException(status_code=403, detail="This is not your submission.")
        if not exam.get("released"):
            raise HTTPException(
                status_code=404, detail="Results for this exam have not been released yet."
            )
    elif user.role == "teacher":
        if exam["teacher_id"] != user.id:
            raise HTTPException(status_code=403, detail="You do not own this exam.")
    else:
        raise HTTPException(status_code=403, detail="You do not have permission to view this feedback.")

    attempt = await auto_close_if_expired(attempt, exam)
    if attempt["status"] != "submitted":
        raise HTTPException(status_code=400, detail="This attempt has not been submitted yet.")

    max_marks = sum(q["marks"] for q in exam["questions"]) or 1
    overall_percent = round(effective_total(attempt, exam) / max_marks * 100)

    topic_totals: dict[str, list[float]] = {}
    bloom_totals: dict[str, list[float]] = {}
    for q in exam["questions"]:
        score = effective_score(attempt, q)
        t = topic_totals.setdefault(q["topic"], [0.0, 0.0])
        t[0] += score
        t[1] += q["marks"]
        b = bloom_totals.setdefault(q["bloom"], [0.0, 0.0])
        b[0] += score
        b[1] += q["marks"]

    topics = [(t, round(s / m * 100) if m else 0) for t, (s, m) in topic_totals.items()]
    topics.sort(key=lambda item: item[1], reverse=True)
    blooms = [(b, round(s / m * 100) if m else 0) for b, (s, m) in bloom_totals.items()]

    strongest = [t for t, _p in topics[:2]]
    weakest_pairs = sorted(topics, key=lambda item: item[1])[:3]
    weakest = [t for t, _p in weakest_pairs]

    material_ids = [oid(mid) for mid in exam.get("material_ids", [])]
    materials = [m async for m in db.materials.find({"_id": {"$in": material_ids}})] if material_ids else []
    chunk_by_idx = {c["idx"]: c for m in materials for c in m.get("chunks", [])}

    missed_by_topic: dict[str, list[str]] = {}
    for q in exam["questions"]:
        if q["topic"] not in weakest or q["type"] == "MCQ":
            continue
        result = attempt.get("results", {}).get(q["qid"], {})
        missed_by_topic.setdefault(q["topic"], []).extend(result.get("key_points_missed", []))

    study_plan = []
    for topic in weakest:
        chunk = None
        for q in exam["questions"]:
            if q["topic"] == topic and q.get("source_chunk_idx") is not None:
                chunk = chunk_by_idx.get(q["source_chunk_idx"])
                if chunk:
                    break
        study_plan.append(
            {
                "topic": topic,
                "page": chunk.get("page") if chunk else None,
                "heading": chunk.get("heading") if chunk else None,
                "missed_key_points": missed_by_topic.get(topic, []),
            }
        )

    tips = await _study_tips(weakest_pairs, missed_by_topic)

    return {
        "attempt_id": str(attempt["_id"]),
        "exam_id": str(exam["_id"]),
        "exam_title": exam["title"],
        "overall_percent": overall_percent,
        "topics": [{"topic": t, "percent": p} for t, p in topics],
        "bloom_levels": [{"bloom": b, "percent": p} for b, p in blooms],
        "strongest_topics": strongest,
        "weakest_topics": weakest,
        "study_plan": study_plan,
        "tips": tips,
    }


async def _study_tips(weakest_pairs: list[tuple[str, int]], missed_by_topic: dict[str, list[str]]) -> list[dict]:
    if not weakest_pairs:
        return []
    payload_topics = [
        {"topic": topic, "missed_key_points": missed_by_topic.get(topic, [])} for topic, _pct in weakest_pairs
    ]
    try:
        llm = get_llm_client()
        data = await call_json(
            llm,
            STUDY_TIPS_SYSTEM_PROMPT,
            build_study_tips_user_prompt(payload_topics),
            max_tokens=500,
            temperature=0.4,
        )
        tips = data.get("tips")
        if isinstance(tips, list):
            cleaned = [
                {"topic": t.get("topic", ""), "tip": t.get("tip", "")}
                for t in tips
                if isinstance(t, dict) and t.get("topic") and t.get("tip")
            ]
            if cleaned:
                return cleaned[:MAX_TIPS]
    except LLMError:
        pass
    return _fallback_tips(payload_topics)


def _fallback_tips(payload_topics: list[dict]) -> list[dict]:
    tips = []
    for item in payload_topics:
        missed = item["missed_key_points"]
        if missed:
            tip = f"Review {', '.join(missed[:3])} for {item['topic']}."
        else:
            tip = f"Revisit the material on {item['topic']} and practice related questions."
        tips.append({"topic": item["topic"], "tip": tip})
    return tips[:MAX_TIPS]
