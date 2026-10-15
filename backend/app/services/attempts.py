from datetime import UTC, datetime, timedelta

from fastapi import HTTPException

from app.core.db import get_db, oid, to_out
from app.core.deps import CurrentUser
from app.services.grading import (
    effective_score,
    effective_total,
    finalize_attempt,
    get_ai_detector,
)
from app.services.notify import log_activity, notify

GRACE_SECONDS = 15


async def _get_exam_or_404(db, exam_id: str) -> dict:
    exam = await db.exams.find_one({"_id": oid(exam_id)})
    if exam is None:
        raise HTTPException(status_code=404, detail="Exam not found.")
    return exam


async def _get_attempt_or_404(db, attempt_id: str) -> dict:
    attempt = await db.attempts.find_one({"_id": oid(attempt_id)})
    if attempt is None:
        raise HTTPException(status_code=404, detail="Attempt not found.")
    return attempt


def _deadline(attempt: dict, exam: dict) -> datetime:
    started_at = attempt["started_at"]
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=UTC)
    return started_at + timedelta(minutes=exam["duration_min"])


async def auto_close_if_expired(attempt: dict, exam: dict | None) -> dict:
    """Lazy auto-close: an in_progress attempt past its deadline (plus grace)
    is finalized the moment anything reads it."""
    if exam is None or attempt["status"] != "in_progress":
        return attempt
    if datetime.now(UTC) > _deadline(attempt, exam) + timedelta(seconds=GRACE_SECONDS):
        return await finalize_attempt(attempt)
    return attempt


def _assert_teacher_owns_exam(teacher: CurrentUser, exam: dict) -> None:
    if exam["teacher_id"] != teacher.id:
        raise HTTPException(status_code=403, detail="You do not own this exam.")


def _strip_attempt_for_student(attempt: dict, exam: dict) -> dict:
    out = to_out(attempt)
    if attempt["status"] != "submitted" or not exam.get("released"):
        out["results"] = {}
        out["flags"] = {}
        out["overrides"] = {}
    else:
        out["ai_detector"] = get_ai_detector().label
    return out


# ---------------- student ----------------


async def start_attempt(student: CurrentUser, exam_id: str) -> dict:
    db = get_db()
    exam = await _get_exam_or_404(db, exam_id)
    if exam["status"] != "published":
        raise HTTPException(status_code=400, detail="This exam is not open.")
    cls = await db.classes.find_one({"_id": oid(exam["class_id"])})
    if cls is None or student.id not in cls.get("student_ids", []):
        raise HTTPException(status_code=403, detail="You are not enrolled in this class.")

    existing = await db.attempts.find_one({"exam_id": exam_id, "student_id": student.id})
    if existing:
        existing = await auto_close_if_expired(existing, exam)
        if existing["status"] == "submitted":
            raise HTTPException(status_code=400, detail="You have already submitted this exam.")
        return _attempt_start_response(existing, exam)

    now = datetime.now(UTC)
    doc = {
        "exam_id": exam_id,
        "student_id": student.id,
        "status": "in_progress",
        "started_at": now,
        "submitted_at": None,
        "answers": {},
        "results": {},
        "flags": {},
        "overrides": {},
    }
    result = await db.attempts.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _attempt_start_response(doc, exam)


def _attempt_start_response(attempt: dict, exam: dict) -> dict:
    out = to_out(attempt)
    out["deadline"] = _deadline(attempt, exam)
    out["server_now"] = datetime.now(UTC)
    return out


async def save_answer(student: CurrentUser, attempt_id: str, qid: str, value) -> dict:
    db = get_db()
    attempt = await _get_attempt_or_404(db, attempt_id)
    if attempt["student_id"] != student.id:
        raise HTTPException(status_code=403, detail="This is not your attempt.")
    exam = await db.exams.find_one({"_id": oid(attempt["exam_id"])})
    attempt = await auto_close_if_expired(attempt, exam)
    if attempt["status"] != "in_progress":
        raise HTTPException(status_code=400, detail="This exam has already been submitted.")

    question = next((q for q in exam["questions"] if q["qid"] == qid), None)
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found.")
    if question["type"] == "MCQ":
        if not isinstance(value, int) or isinstance(value, bool) or not (0 <= value < 4):
            raise HTTPException(status_code=400, detail="Invalid answer for a multiple-choice question.")
    elif not isinstance(value, str):
        raise HTTPException(status_code=400, detail="Invalid answer for a written question.")

    await db.attempts.update_one({"_id": attempt["_id"]}, {"$set": {f"answers.{qid}": value}})
    attempt["answers"][qid] = value
    return to_out(attempt)


async def submit_attempt(student: CurrentUser, attempt_id: str) -> dict:
    db = get_db()
    attempt = await _get_attempt_or_404(db, attempt_id)
    if attempt["student_id"] != student.id:
        raise HTTPException(status_code=403, detail="This is not your attempt.")
    exam = await db.exams.find_one({"_id": oid(attempt["exam_id"])})
    attempt = await auto_close_if_expired(attempt, exam)
    if attempt["status"] == "in_progress":
        attempt = await finalize_attempt(attempt)
    await log_activity(student, f"Submitted '{exam['title']}'" if exam else "Submitted an exam")
    return {"status": "submitted"}


async def get_my_attempts(student: CurrentUser, exam_id: str | None) -> list[dict]:
    db = get_db()
    query: dict = {"student_id": student.id}
    if exam_id:
        query["exam_id"] = exam_id
    out = []
    async for attempt in db.attempts.find(query):
        exam = await db.exams.find_one({"_id": oid(attempt["exam_id"])})
        attempt = await auto_close_if_expired(attempt, exam)
        out.append(_strip_attempt_for_student(attempt, exam) if exam else to_out(attempt))
    return out


async def get_attempt_for_student(student: CurrentUser, attempt_id: str) -> dict:
    db = get_db()
    attempt = await _get_attempt_or_404(db, attempt_id)
    if attempt["student_id"] != student.id:
        raise HTTPException(status_code=403, detail="This is not your attempt.")
    exam = await db.exams.find_one({"_id": oid(attempt["exam_id"])})
    attempt = await auto_close_if_expired(attempt, exam)
    return _strip_attempt_for_student(attempt, exam)


# ---------------- teacher ----------------


async def get_exam_results(teacher: CurrentUser, exam_id: str) -> dict:
    db = get_db()
    exam = await _get_exam_or_404(db, exam_id)
    _assert_teacher_owns_exam(teacher, exam)
    cls = await db.classes.find_one({"_id": oid(exam["class_id"])})

    attempts = [a async for a in db.attempts.find({"exam_id": exam_id})]
    attempts = [await auto_close_if_expired(a, exam) for a in attempts]
    submitted = [a for a in attempts if a["status"] == "submitted"]

    max_marks = sum(q["marks"] for q in exam["questions"])
    rows: list[dict] = []
    percents: list[int] = []
    flagged_total = 0
    topic_totals: dict[str, list[float]] = {}

    for attempt in submitted:
        student = await db.users.find_one({"_id": oid(attempt["student_id"])})
        total = effective_total(attempt, exam)
        percent = round(total / max_marks * 100) if max_marks else 0
        percents.append(percent)
        flagged = sum(
            1
            for q in exam["questions"]
            if q["type"] != "MCQ"
            and (result := attempt.get("results", {}).get(q["qid"])) is not None
            and result.get("ai_probability") is not None
            and result["ai_probability"] >= exam["ai_threshold"]
            and attempt.get("flags", {}).get(q["qid"]) is None
        )
        flagged_total += flagged
        rows.append(
            {
                "attempt_id": str(attempt["_id"]),
                "student_id": attempt["student_id"],
                "student_name": student["name"] if student else "Unknown",
                "total": total,
                "max": max_marks,
                "percent": percent,
                "flagged_count": flagged,
            }
        )
        for q in exam["questions"]:
            totals = topic_totals.setdefault(q["topic"], [0.0, 0.0])
            totals[0] += effective_score(attempt, q)
            totals[1] += q["marks"]

    topics = sorted(
        ((topic, round(s / m * 100) if m else 0) for topic, (s, m) in topic_totals.items()),
        key=lambda item: item[1],
    )
    weakest = topics[0] if topics else None

    return {
        "exam_id": exam_id,
        "title": exam["title"],
        "ai_threshold": exam["ai_threshold"],
        "released": exam["released"],
        "attempts": rows,
        "aggregate": {
            "submitted_count": len(submitted),
            "enrolled_count": len(cls.get("student_ids", [])) if cls else 0,
            "average_percent": round(sum(percents) / len(percents)) if percents else 0,
            "flagged_total": flagged_total,
            "weakest_topic": {"topic": weakest[0], "percent": weakest[1]} if weakest else None,
        },
    }


async def get_attempt_detail(teacher: CurrentUser, attempt_id: str) -> dict:
    db = get_db()
    attempt = await _get_attempt_or_404(db, attempt_id)
    exam = await db.exams.find_one({"_id": oid(attempt["exam_id"])})
    if exam is None:
        raise HTTPException(status_code=404, detail="Exam not found.")
    _assert_teacher_owns_exam(teacher, exam)
    attempt = await auto_close_if_expired(attempt, exam)
    student = await db.users.find_one({"_id": oid(attempt["student_id"])})

    questions = []
    for q in exam["questions"]:
        qid = q["qid"]
        result = attempt.get("results", {}).get(qid, {})
        questions.append(
            {
                "qid": qid,
                "type": q["type"],
                "text": q["text"],
                "topic": q["topic"],
                "bloom": q["bloom"],
                "marks": q["marks"],
                "options": q.get("options"),
                "answer_index": q.get("answer_index"),
                "model_answer": q.get("model_answer") if q["type"] != "MCQ" else None,
                "student_answer": attempt.get("answers", {}).get(qid),
                "result": result,
                "override": attempt.get("overrides", {}).get(qid),
                "effective_score": effective_score(attempt, q),
                "flag_decision": attempt.get("flags", {}).get(qid),
                "flagged": (
                    q["type"] != "MCQ"
                    and result.get("ai_probability") is not None
                    and result["ai_probability"] >= exam["ai_threshold"]
                ),
            }
        )

    return {
        "attempt_id": str(attempt["_id"]),
        "exam_id": str(exam["_id"]),
        "exam_title": exam["title"],
        "student_id": attempt["student_id"],
        "student_name": student["name"] if student else "Unknown",
        "status": attempt["status"],
        "submitted_at": attempt.get("submitted_at"),
        "ai_threshold": exam["ai_threshold"],
        "ai_detector": get_ai_detector().label,
        "questions": questions,
    }


async def set_threshold(teacher: CurrentUser, exam_id: str, value: int) -> dict:
    db = get_db()
    exam = await _get_exam_or_404(db, exam_id)
    _assert_teacher_owns_exam(teacher, exam)
    await db.exams.update_one({"_id": exam["_id"]}, {"$set": {"ai_threshold": value}})
    exam["ai_threshold"] = value
    return to_out(exam)


async def set_flag(teacher: CurrentUser, attempt_id: str, qid: str, decision: str) -> dict:
    db = get_db()
    attempt = await _get_attempt_or_404(db, attempt_id)
    exam = await db.exams.find_one({"_id": oid(attempt["exam_id"])})
    if exam is None:
        raise HTTPException(status_code=404, detail="Exam not found.")
    _assert_teacher_owns_exam(teacher, exam)
    if not any(q["qid"] == qid for q in exam["questions"]):
        raise HTTPException(status_code=404, detail="Question not found.")

    await db.attempts.update_one({"_id": attempt["_id"]}, {"$set": {f"flags.{qid}": decision}})
    attempt["flags"][qid] = decision

    if decision == "discuss":
        await notify(
            attempt["student_id"],
            f"{teacher.name} would like to discuss an answer in {exam['title']}. Your grade has not changed.",
            "s-feedback",
            str(attempt["_id"]),
            teacher.id,
        )
    await log_activity(
        teacher,
        f"{'Cleared a flag' if decision == 'cleared' else 'Asked to discuss a flagged answer'} in '{exam['title']}'",
    )
    return to_out(attempt)


async def set_override(teacher: CurrentUser, attempt_id: str, qid: str, score: float) -> dict:
    db = get_db()
    attempt = await _get_attempt_or_404(db, attempt_id)
    exam = await db.exams.find_one({"_id": oid(attempt["exam_id"])})
    if exam is None:
        raise HTTPException(status_code=404, detail="Exam not found.")
    _assert_teacher_owns_exam(teacher, exam)
    question = next((q for q in exam["questions"] if q["qid"] == qid), None)
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found.")

    score = max(0.0, min(float(question["marks"]), score))
    await db.attempts.update_one({"_id": attempt["_id"]}, {"$set": {f"overrides.{qid}": score}})
    attempt["overrides"][qid] = score

    if exam.get("released"):
        await notify(
            attempt["student_id"],
            f"{teacher.name} adjusted your score for a question in {exam['title']}.",
            "s-feedback",
            str(attempt["_id"]),
            teacher.id,
        )
    await log_activity(teacher, f"Overrode a score in '{exam['title']}'")
    return to_out(attempt)


async def release_exam(teacher: CurrentUser, exam_id: str) -> dict:
    db = get_db()
    exam = await _get_exam_or_404(db, exam_id)
    _assert_teacher_owns_exam(teacher, exam)
    if exam.get("released"):
        raise HTTPException(status_code=409, detail="Results have already been released.")

    submitted = [a async for a in db.attempts.find({"exam_id": exam_id, "status": "submitted"})]
    await db.exams.update_one({"_id": exam["_id"]}, {"$set": {"released": True}})
    exam["released"] = True

    max_marks = sum(q["marks"] for q in exam["questions"])
    for attempt in submitted:
        percent = round(effective_total(attempt, exam) / max_marks * 100) if max_marks else 0
        await notify(
            attempt["student_id"],
            f"Results released: {exam['title']} · {percent}%",
            "s-feedback",
            str(attempt["_id"]),
            teacher.id,
        )

    cls = await db.classes.find_one({"_id": oid(exam["class_id"])})
    dept = await db.departments.find_one({"_id": oid(cls["dept_id"])}) if cls else None
    if dept and dept.get("hod_id"):
        await notify(
            dept["hod_id"],
            f"{teacher.name} released results for {exam['title']}",
            "h-review",
            str(exam["_id"]),
            teacher.id,
        )

    await log_activity(teacher, f"Released results for '{exam['title']}' to {len(submitted)} student(s)")
    return to_out(exam)


async def list_flags(teacher: CurrentUser) -> list[dict]:
    db = get_db()
    exams = [e async for e in db.exams.find({"teacher_id": teacher.id})]

    out = []
    for exam in exams:
        exam_id = str(exam["_id"])
        in_progress = [a async for a in db.attempts.find({"exam_id": exam_id, "status": "in_progress"})]
        for attempt in in_progress:
            await auto_close_if_expired(attempt, exam)

        submitted = [a async for a in db.attempts.find({"exam_id": exam_id, "status": "submitted"})]
        for attempt in submitted:
            for q in exam["questions"]:
                if q["type"] == "MCQ":
                    continue
                result = attempt.get("results", {}).get(q["qid"])
                if not result or result.get("ai_probability") is None:
                    continue
                if result["ai_probability"] < exam["ai_threshold"]:
                    continue
                if attempt.get("flags", {}).get(q["qid"]):
                    continue
                student = await db.users.find_one({"_id": oid(attempt["student_id"])})
                out.append(
                    {
                        "attempt_id": str(attempt["_id"]),
                        "exam_id": exam_id,
                        "exam_title": exam["title"],
                        "qid": q["qid"],
                        "question_text": q["text"],
                        "student_id": attempt["student_id"],
                        "student_name": student["name"] if student else "Unknown",
                        "ai_probability": result["ai_probability"],
                        "ai_threshold": exam["ai_threshold"],
                        "answer_excerpt": (attempt.get("answers", {}).get(q["qid"]) or "")[:220],
                    }
                )
    return out
