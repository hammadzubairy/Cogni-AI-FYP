from datetime import UTC, datetime

from fastapi import HTTPException

from app.core.db import get_db, oid, to_out
from app.core.deps import CurrentUser
from app.services import settings as settings_service
from app.services.exam_generator import (
    MAX_TOTAL_QUESTIONS,
    generate_questions,
    regenerate_one,
)
from app.services.grading import finalize_attempt
from app.services.llm import get_llm_client
from app.services.notify import log_activity, notify

EDITABLE_STATUSES = {"draft", "returned"}
STUDENT_HIDDEN_FIELDS = {"answer_index", "model_answer", "keywords"}
HIGHER_ORDER_BLOOMS = {"Analyze", "Evaluate", "Create"}


async def _get_exam_or_404(exam_id: str) -> dict:
    db = get_db()
    exam = await db.exams.find_one({"_id": oid(exam_id)})
    if exam is None:
        raise HTTPException(status_code=404, detail="Exam not found.")
    return exam


async def _get_class_or_404(class_id: str) -> dict:
    db = get_db()
    cls = await db.classes.find_one({"_id": oid(class_id)})
    if cls is None:
        raise HTTPException(status_code=404, detail="Class not found.")
    return cls


async def _get_department_or_404(dept_id: str | None) -> dict:
    if dept_id is None:
        raise HTTPException(status_code=404, detail="Department not found.")
    db = get_db()
    dept = await db.departments.find_one({"_id": oid(dept_id)})
    if dept is None:
        raise HTTPException(status_code=404, detail="Department not found.")
    return dept


async def _log_history(db, exam: dict, actor_id: str, text: str) -> None:
    entry = {"at": datetime.now(UTC), "by": actor_id, "text": text}
    await db.exams.update_one({"_id": exam["_id"]}, {"$push": {"history": entry}})
    exam.setdefault("history", []).append(entry)


def _assert_hod_owns_dept(hod: CurrentUser, cls: dict) -> None:
    if hod.role != "hod" or hod.dept_id != cls["dept_id"]:
        raise HTTPException(status_code=403, detail="This exam is outside your department.")


def needs_approval(exam: dict, settings_doc: dict) -> bool:
    approval = settings_doc.get("approval", "major")
    if approval == "all":
        return True
    if approval == "major":
        return exam["kind"] != "Quiz"
    return False


async def _repeated_question_ids(exam: dict) -> list[str]:
    db = get_db()
    prior = [
        e
        async for e in db.exams.find(
            {
                "class_id": exam["class_id"],
                "_id": {"$ne": exam["_id"]},
                "status": {"$ne": "draft"},
                "created_at": {"$lt": exam["created_at"]},
            },
            {"questions": 1},
        )
    ]
    used = {
        q["source_chunk_idx"]
        for e in prior
        for q in e.get("questions", [])
        if q.get("source_chunk_idx") is not None
    }
    return [q["qid"] for q in exam["questions"] if q.get("source_chunk_idx") in used]


def _assert_teacher_owns(user: CurrentUser, exam: dict) -> None:
    if user.role != "teacher" or exam["teacher_id"] != user.id:
        raise HTTPException(status_code=403, detail="You do not own this exam.")


def _assert_editable(exam: dict) -> None:
    if exam["status"] not in EDITABLE_STATUSES:
        raise HTTPException(status_code=400, detail="This exam can no longer be edited.")


def _strip_for_student(exam_doc: dict) -> dict:
    out = to_out(exam_doc)
    out["questions"] = [
        {k: v for k, v in q.items() if k not in STUDENT_HIDDEN_FIELDS}
        for q in out.get("questions", [])
    ]
    return out


async def _assert_read_access(user: CurrentUser, exam: dict) -> dict:
    """Returns the exam shaped for the caller's role, or raises 403/404."""
    if user.role == "admin":
        return to_out(exam)
    if user.role == "teacher":
        if exam["teacher_id"] != user.id:
            raise HTTPException(status_code=403, detail="You do not own this exam.")
        return to_out(exam)
    if user.role == "hod":
        cls = await _get_class_or_404(exam["class_id"])
        if cls["dept_id"] != user.dept_id:
            raise HTTPException(status_code=403, detail="This exam is outside your department.")
        return to_out(exam)
    if user.role == "student":
        if exam["status"] != "published":
            raise HTTPException(status_code=404, detail="Exam not found.")
        cls = await _get_class_or_404(exam["class_id"])
        if user.id not in cls.get("student_ids", []):
            raise HTTPException(status_code=403, detail="You are not enrolled in this class.")
        return _strip_for_student(exam)
    raise HTTPException(status_code=403, detail="You do not have permission to view this exam.")


async def _materials_chunks(material_ids: list[str]) -> list[dict]:
    db = get_db()
    chunks: list[dict] = []
    for mid in material_ids:
        m = await db.materials.find_one({"_id": oid(mid)})
        if m:
            chunks.extend(m.get("chunks", []))
    return chunks


async def list_exams(user: CurrentUser, status: str | None, class_id: str | None) -> list[dict]:
    db = get_db()
    query: dict = {}

    if user.role == "admin":
        if class_id:
            query["class_id"] = class_id
        if status:
            query["status"] = status
    elif user.role == "teacher":
        query["teacher_id"] = user.id
        if class_id:
            query["class_id"] = class_id
        if status:
            query["status"] = status
    elif user.role == "hod":
        allowed = [str(c["_id"]) async for c in db.classes.find({"dept_id": user.dept_id}, {"_id": 1})]
        if class_id:
            if class_id not in allowed:
                return []
            query["class_id"] = class_id
        else:
            query["class_id"] = {"$in": allowed}
        if status:
            query["status"] = status
    elif user.role == "student":
        allowed = [str(c["_id"]) async for c in db.classes.find({"student_ids": user.id}, {"_id": 1})]
        if class_id:
            if class_id not in allowed:
                return []
            query["class_id"] = class_id
        else:
            query["class_id"] = {"$in": allowed}
        query["status"] = "published"
    else:
        raise HTTPException(status_code=403, detail="You do not have permission to view exams.")

    exams = [e async for e in db.exams.find(query).sort("created_at", -1)]
    if user.role == "student":
        return [_strip_for_student(e) for e in exams]
    return [to_out(e) for e in exams]


async def get_exam(user: CurrentUser, exam_id: str) -> dict:
    exam = await _get_exam_or_404(exam_id)
    return await _assert_read_access(user, exam)


async def generate_exam(actor: CurrentUser, payload) -> tuple[dict, list[str]]:
    counts = payload.counts.model_dump()
    total = sum(counts.values())
    if total <= 0:
        raise HTTPException(status_code=400, detail="Request at least one question.")
    if total > MAX_TOTAL_QUESTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot request more than {MAX_TOTAL_QUESTIONS} questions in total.",
        )

    db = get_db()
    cls = await _get_class_or_404(payload.class_id)
    if cls["teacher_id"] != actor.id:
        raise HTTPException(status_code=403, detail="You do not own this class.")

    if not payload.material_ids:
        raise HTTPException(status_code=400, detail="Select at least one material.")
    materials = []
    for mid in payload.material_ids:
        m = await db.materials.find_one({"_id": oid(mid)})
        if m is None:
            raise HTTPException(status_code=404, detail="One or more materials were not found.")
        if m["class_id"] != payload.class_id:
            raise HTTPException(status_code=400, detail="A material does not belong to this class.")
        materials.append(m)

    chunks: list[dict] = []
    for m in materials:
        chunks.extend(m.get("chunks", []))
    if not chunks:
        raise HTTPException(status_code=400, detail="The selected material has no usable content.")

    if payload.request_id:
        request_doc = await db.requests.find_one({"_id": oid(payload.request_id)})
        if request_doc is None:
            raise HTTPException(status_code=404, detail="Request not found.")
        if request_doc["teacher_id"] != actor.id or request_doc["status"] != "open":
            raise HTTPException(status_code=400, detail="That request is not open for you.")

    existing_exam_questions = [
        e["questions"] async for e in db.exams.find({"class_id": payload.class_id}, {"questions": 1})
    ]

    llm = get_llm_client()
    questions, warnings = await generate_questions(
        llm, chunks, counts, cls.get("clos", []), existing_exam_questions=existing_exam_questions
    )
    if not questions:
        raise HTTPException(
            status_code=400,
            detail="The AI could not generate any valid questions from this material.",
        )

    settings_doc = await settings_service.get_settings()
    ai_threshold = settings_doc.get("ai_threshold_default", 70)

    material_names = ", ".join(m["name"] for m in materials)
    now = datetime.now(UTC)
    doc = {
        "title": payload.title,
        "class_id": payload.class_id,
        "teacher_id": actor.id,
        "kind": payload.kind,
        "duration_min": payload.duration_min,
        "status": "draft",
        "questions": questions,
        "ai_threshold": ai_threshold,
        "released": False,
        "hod_comment": "",
        "request_id": payload.request_id,
        "material_ids": payload.material_ids,
        "history": [{"at": now, "by": actor.id, "text": f"Draft generated from {material_names}"}],
        "created_at": now,
    }
    result = await db.exams.insert_one(doc)
    doc["_id"] = result.inserted_id

    if payload.request_id:
        await db.requests.update_one(
            {"_id": oid(payload.request_id)}, {"$set": {"exam_id": str(result.inserted_id)}}
        )

    await log_activity(actor, f"Generated draft exam '{payload.title}' for {cls['code']}")
    return to_out(doc), warnings


async def update_exam(actor: CurrentUser, exam_id: str, patch) -> dict:
    exam = await _get_exam_or_404(exam_id)
    _assert_teacher_owns(actor, exam)
    _assert_editable(exam)

    updates = {k: v for k, v in patch.model_dump(exclude_unset=True).items() if v is not None}
    if updates:
        db = get_db()
        await db.exams.update_one({"_id": exam["_id"]}, {"$set": updates})
        exam.update(updates)
    return to_out(exam)


async def update_question(actor: CurrentUser, exam_id: str, qid: str, patch) -> dict:
    exam = await _get_exam_or_404(exam_id)
    _assert_teacher_owns(actor, exam)
    _assert_editable(exam)

    questions = exam["questions"]
    idx = next((i for i, q in enumerate(questions) if q["qid"] == qid), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Question not found.")

    updates = patch.model_dump(exclude_unset=True)
    question = {**questions[idx], **updates}
    if question["type"] == "MCQ":
        options = question.get("options")
        if not isinstance(options, list) or len(options) != 4:
            raise HTTPException(status_code=400, detail="MCQ needs exactly 4 options.")
        answer_index = question.get("answer_index")
        if not isinstance(answer_index, int) or not (0 <= answer_index < 4):
            raise HTTPException(status_code=400, detail="MCQ needs a valid answer_index.")

    questions[idx] = question
    db = get_db()
    await db.exams.update_one({"_id": exam["_id"]}, {"$set": {"questions": questions}})
    exam["questions"] = questions
    return to_out(exam)


async def delete_question(actor: CurrentUser, exam_id: str, qid: str) -> dict:
    exam = await _get_exam_or_404(exam_id)
    _assert_teacher_owns(actor, exam)
    _assert_editable(exam)

    questions = exam["questions"]
    if len(questions) <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the last question.")
    new_questions = [q for q in questions if q["qid"] != qid]
    if len(new_questions) == len(questions):
        raise HTTPException(status_code=404, detail="Question not found.")

    db = get_db()
    await db.exams.update_one({"_id": exam["_id"]}, {"$set": {"questions": new_questions}})
    exam["questions"] = new_questions
    return to_out(exam)


async def regenerate_question(actor: CurrentUser, exam_id: str, qid: str) -> dict:
    exam = await _get_exam_or_404(exam_id)
    _assert_teacher_owns(actor, exam)
    _assert_editable(exam)

    questions = exam["questions"]
    idx = next((i for i, q in enumerate(questions) if q["qid"] == qid), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Question not found.")
    old = questions[idx]

    cls = await _get_class_or_404(exam["class_id"])
    chunks = await _materials_chunks(exam["material_ids"])

    try:
        new_q = await regenerate_one(
            get_llm_client(),
            chunks,
            questions,
            old["type"],
            cls.get("clos", []),
            preferred_topic=old.get("topic"),
            preferred_clo=old.get("clo"),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    questions[idx] = new_q
    db = get_db()
    await db.exams.update_one({"_id": exam["_id"]}, {"$set": {"questions": questions}})
    exam["questions"] = questions
    return to_out(exam)


async def add_question(actor: CurrentUser, exam_id: str, qtype: str) -> tuple[dict, list[str]]:
    exam = await _get_exam_or_404(exam_id)
    _assert_teacher_owns(actor, exam)
    _assert_editable(exam)

    if len(exam["questions"]) >= MAX_TOTAL_QUESTIONS:
        raise HTTPException(status_code=400, detail=f"Cannot exceed {MAX_TOTAL_QUESTIONS} questions.")

    cls = await _get_class_or_404(exam["class_id"])
    chunks = await _materials_chunks(exam["material_ids"])

    try:
        new_q = await regenerate_one(get_llm_client(), chunks, exam["questions"], qtype, cls.get("clos", []))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    questions = exam["questions"] + [new_q]
    db = get_db()
    await db.exams.update_one({"_id": exam["_id"]}, {"$set": {"questions": questions}})
    exam["questions"] = questions
    return to_out(exam), []


async def delete_exam(actor: CurrentUser, exam_id: str) -> None:
    exam = await _get_exam_or_404(exam_id)
    _assert_teacher_owns(actor, exam)
    if exam["status"] != "draft":
        raise HTTPException(status_code=400, detail="Only draft exams can be deleted.")

    db = get_db()
    await db.exams.delete_one({"_id": exam["_id"]})
    if exam.get("request_id"):
        await db.requests.update_one(
            {"_id": oid(exam["request_id"])}, {"$set": {"status": "open", "exam_id": None}}
        )
    await log_activity(actor, f"Deleted draft exam '{exam['title']}'")


async def submit_exam(actor: CurrentUser, exam_id: str) -> dict:
    exam = await _get_exam_or_404(exam_id)
    _assert_teacher_owns(actor, exam)
    if exam["status"] not in ("draft", "returned"):
        raise HTTPException(status_code=409, detail="This paper cannot be sent for approval right now.")
    if not exam["questions"]:
        raise HTTPException(status_code=400, detail="Add at least one question.")

    cls = await _get_class_or_404(exam["class_id"])
    dept = await _get_department_or_404(cls["dept_id"])
    if not dept.get("hod_id"):
        raise HTTPException(
            status_code=400,
            detail="Your department has no HOD yet. Ask your admin to assign one.",
        )

    db = get_db()
    await db.exams.update_one({"_id": exam["_id"]}, {"$set": {"status": "pending", "hod_comment": ""}})
    exam["status"] = "pending"
    exam["hod_comment"] = ""
    await _log_history(db, exam, actor.id, "Sent to HOD for approval")

    if exam.get("request_id"):
        await db.requests.update_one(
            {"_id": oid(exam["request_id"])}, {"$set": {"status": "submitted"}}
        )

    await notify(
        dept["hod_id"], f"{actor.name} sent {exam['title']} for approval", "h-review", str(exam["_id"]), actor.id
    )
    await log_activity(actor, f"Sent '{exam['title']}' to HOD for approval")
    return to_out(exam)


async def withdraw_exam(actor: CurrentUser, exam_id: str) -> dict:
    exam = await _get_exam_or_404(exam_id)
    _assert_teacher_owns(actor, exam)
    if exam["status"] != "pending":
        raise HTTPException(status_code=409, detail="Only a paper pending approval can be withdrawn.")

    db = get_db()
    await db.exams.update_one({"_id": exam["_id"]}, {"$set": {"status": "draft"}})
    exam["status"] = "draft"
    await _log_history(db, exam, actor.id, "Withdrawn from HOD review")

    cls = await _get_class_or_404(exam["class_id"])
    dept = await _get_department_or_404(cls["dept_id"])
    await notify(
        dept.get("hod_id"), f"{actor.name} withdrew {exam['title']} for editing", "h-approvals", None, actor.id
    )
    await log_activity(actor, f"Withdrew '{exam['title']}' from HOD review")
    return to_out(exam)


async def approve_exam(actor: CurrentUser, exam_id: str, comment: str | None) -> dict:
    exam = await _get_exam_or_404(exam_id)
    cls = await _get_class_or_404(exam["class_id"])
    _assert_hod_owns_dept(actor, cls)
    if exam["status"] != "pending":
        raise HTTPException(status_code=409, detail="Only a pending paper can be approved.")

    comment = comment or ""
    db = get_db()
    await db.exams.update_one(
        {"_id": exam["_id"]}, {"$set": {"status": "approved", "hod_comment": comment}}
    )
    exam["status"] = "approved"
    exam["hod_comment"] = comment
    await _log_history(db, exam, actor.id, "Approved by HOD")

    if exam.get("request_id"):
        await db.requests.update_one({"_id": oid(exam["request_id"])}, {"$set": {"status": "approved"}})

    await notify(
        exam["teacher_id"],
        f"{actor.name} approved {exam['title']}. You can publish it now.",
        "t-exam",
        str(exam["_id"]),
        actor.id,
    )
    await log_activity(actor, f"Approved '{exam['title']}'")
    return to_out(exam)


async def return_exam(actor: CurrentUser, exam_id: str, comment: str) -> dict:
    exam = await _get_exam_or_404(exam_id)
    cls = await _get_class_or_404(exam["class_id"])
    _assert_hod_owns_dept(actor, cls)
    if exam["status"] != "pending":
        raise HTTPException(status_code=409, detail="Only a pending paper can be returned.")

    comment = (comment or "").strip()
    if not comment:
        raise HTTPException(
            status_code=400, detail="Add a comment so the teacher knows what to change."
        )

    db = get_db()
    await db.exams.update_one(
        {"_id": exam["_id"]}, {"$set": {"status": "returned", "hod_comment": comment}}
    )
    exam["status"] = "returned"
    exam["hod_comment"] = comment
    await _log_history(db, exam, actor.id, f"Returned by HOD: {comment}")

    if exam.get("request_id"):
        await db.requests.update_one(
            {"_id": oid(exam["request_id"])}, {"$set": {"status": "submitted"}}
        )

    await notify(
        exam["teacher_id"],
        f"{actor.name} returned {exam['title']}: {comment}",
        "t-exam",
        str(exam["_id"]),
        actor.id,
    )
    await log_activity(actor, f"Returned '{exam['title']}': {comment}")
    return to_out(exam)


async def publish_exam(actor: CurrentUser, exam_id: str) -> dict:
    exam = await _get_exam_or_404(exam_id)
    _assert_teacher_owns(actor, exam)
    if exam["status"] not in ("draft", "approved"):
        raise HTTPException(status_code=409, detail="This paper cannot be published right now.")
    if not exam["questions"]:
        raise HTTPException(status_code=400, detail="Add at least one question.")

    settings_doc = await settings_service.get_settings()
    if exam["status"] == "draft" and needs_approval(exam, settings_doc):
        raise HTTPException(status_code=400, detail="This paper needs HOD approval first.")

    db = get_db()
    await db.exams.update_one({"_id": exam["_id"]}, {"$set": {"status": "published"}})
    exam["status"] = "published"
    await _log_history(db, exam, actor.id, "Published to students")

    cls = await _get_class_or_404(exam["class_id"])
    student_ids = cls.get("student_ids", [])
    await notify(
        student_ids, f"{exam['title']} is now live in {cls['code']}", "s-take", str(exam["_id"]), actor.id
    )
    await log_activity(actor, f"Published '{exam['title']}' to {len(student_ids)} students")
    return to_out(exam)


async def close_exam(actor: CurrentUser, exam_id: str) -> dict:
    exam = await _get_exam_or_404(exam_id)
    _assert_teacher_owns(actor, exam)
    if exam["status"] != "published":
        raise HTTPException(status_code=409, detail="Only a published paper can be closed.")

    db = get_db()
    await db.exams.update_one({"_id": exam["_id"]}, {"$set": {"status": "closed"}})
    exam["status"] = "closed"
    await _log_history(db, exam, actor.id, "Closed to new submissions")

    in_progress = [
        a async for a in db.attempts.find({"exam_id": str(exam["_id"]), "status": "in_progress"})
    ]
    for attempt in in_progress:
        await finalize_attempt(attempt)

    await log_activity(actor, f"Closed '{exam['title']}'")
    return to_out(exam)


async def get_checks(actor: CurrentUser, exam_id: str) -> list[dict]:
    exam = await _get_exam_or_404(exam_id)
    cls = await _get_class_or_404(exam["class_id"])
    if actor.role == "teacher":
        _assert_teacher_owns(actor, exam)
    elif actor.role == "hod":
        _assert_hod_owns_dept(actor, cls)
    else:
        raise HTTPException(status_code=403, detail="You do not have permission to view this report.")

    dept = await _get_department_or_404(cls["dept_id"])
    policy = dept["policy"]
    questions = exam["questions"]
    out = []

    for clo in cls.get("clos", []):
        n = sum(1 for q in questions if q["clo"] == clo)
        out.append({
            "ok": n >= policy["min_clo"],
            "text": f"{clo} covered by {n} question{'' if n == 1 else 's'}",
            "detail": f"min {policy['min_clo']}",
        })

    hi = sum(1 for q in questions if q["bloom"] in HIGHER_ORDER_BLOOMS)
    pct = round(hi / len(questions) * 100) if questions else 0
    out.append({
        "ok": pct >= policy["higher_order_pct"],
        "text": f"Higher-order questions (Analyze and above): {pct}%",
        "detail": f"min {policy['higher_order_pct']}%",
    })

    repeated = await _repeated_question_ids(exam)
    out.append({
        "ok": len(repeated) <= policy["max_repeats"],
        "text": f"Questions repeated from earlier papers in this class: {len(repeated)}",
        "detail": f"max {policy['max_repeats']}",
    })

    missing_model = sum(1 for q in questions if q["type"] != "MCQ" and not q["model_answer"].strip())
    out.append({
        "ok": missing_model == 0,
        "text": (
            f"{missing_model} written question(s) missing a model answer"
            if missing_model
            else "Every written question has an approved model answer"
        ),
        "detail": "",
    })

    total_marks = sum(q["marks"] for q in questions)
    out.append({
        "ok": True,
        "text": f"{len(questions)} questions · {total_marks} marks · {exam['duration_min']} minutes",
        "detail": "",
    })

    return out


async def list_hod_approvals(actor: CurrentUser) -> list[dict]:
    db = get_db()
    allowed = [str(c["_id"]) async for c in db.classes.find({"dept_id": actor.dept_id}, {"_id": 1})]
    exams = [
        e
        async for e in db.exams.find(
            {"class_id": {"$in": allowed}, "status": {"$ne": "draft"}}
        ).sort("created_at", -1)
    ]
    exams.sort(key=lambda e: 0 if e["status"] == "pending" else 1)
    return [to_out(e) for e in exams]
