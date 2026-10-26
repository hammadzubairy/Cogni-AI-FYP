"""Aggregate read endpoints for each role's home dashboard, plus the HOD
department analytics page. Pure reads: no writes, no notifications."""

from app.core.db import get_db, oid, to_out
from app.core.deps import CurrentUser
from app.services import classes as class_service
from app.services.attempts import auto_close_if_expired
from app.services.exams import get_checks
from app.services.grading import effective_score, effective_total

RECENT_LIMIT = 5


def _exam_summary(exam: dict, class_code: str) -> dict:
    out = to_out(exam)
    return {
        "id": out["id"],
        "title": exam["title"],
        "class_id": exam["class_id"],
        "class_code": class_code,
        "kind": exam["kind"],
        "status": exam["status"],
        "question_count": len(exam.get("questions", [])),
        "hod_comment": exam.get("hod_comment", ""),
        "created_at": exam["created_at"],
    }


async def teacher_dashboard(teacher: CurrentUser) -> dict:
    db = get_db()
    classes = await class_service.list_classes(teacher)
    class_code_by_id = {c["id"]: c["code"] for c in classes}

    exams = [e async for e in db.exams.find({"teacher_id": teacher.id}).sort("created_at", -1)]
    draft = [e for e in exams if e["status"] == "draft"]
    returned = [e for e in exams if e["status"] == "returned"]
    approved = [e for e in exams if e["status"] == "approved"]
    live = [e for e in exams if e["status"] == "published"]
    pending = [e for e in exams if e["status"] == "pending"]

    open_requests = [
        to_out(r)
        async for r in db.requests.find({"teacher_id": teacher.id, "status": "open"}).sort("due", 1)
    ]

    exam_ids = [str(e["_id"]) for e in exams]
    undecided_flags = 0
    recent_submissions: list[dict] = []
    if exam_ids:
        attempts = [
            a
            async for a in db.attempts.find(
                {"exam_id": {"$in": exam_ids}, "status": "submitted"}
            ).sort("submitted_at", -1)
        ]
        exam_by_id = {str(e["_id"]): e for e in exams}
        for attempt in attempts[:RECENT_LIMIT]:
            student = await db.users.find_one({"_id": oid(attempt["student_id"])})
            exam = exam_by_id[attempt["exam_id"]]
            recent_submissions.append(
                {
                    "attempt_id": str(attempt["_id"]),
                    "exam_id": attempt["exam_id"],
                    "exam_title": exam["title"],
                    "student_id": attempt["student_id"],
                    "student_name": student["name"] if student else "Unknown",
                    "submitted_at": attempt["submitted_at"],
                }
            )
        for attempt in attempts:
            exam = exam_by_id[attempt["exam_id"]]
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
                undecided_flags += 1

    student_ids: set[str] = set()
    for c in classes:
        student_ids.update(c.get("student_ids", []))

    return {
        "classes": classes,
        "open_requests": open_requests,
        "draft_exams": [_exam_summary(e, class_code_by_id.get(e["class_id"], "")) for e in draft],
        "returned_exams": [
            _exam_summary(e, class_code_by_id.get(e["class_id"], "")) for e in returned
        ],
        "approved_exams": [
            _exam_summary(e, class_code_by_id.get(e["class_id"], "")) for e in approved
        ],
        "live_exams": [_exam_summary(e, class_code_by_id.get(e["class_id"], "")) for e in live],
        "undecided_flags": undecided_flags,
        "recent_submissions": recent_submissions,
        "stats": {
            "live_exams": len(live),
            "waiting_on_hod": len(pending),
            "students": len(student_ids),
        },
    }


async def student_dashboard(student: CurrentUser) -> dict:
    db = get_db()
    classes = await class_service.list_classes(student)
    class_code_by_id = {c["id"]: c["code"] for c in classes}
    class_ids = list(class_code_by_id.keys())

    live_exams: list[dict] = []
    released_results: list[dict] = []
    if class_ids:
        exams = [
            e
            async for e in db.exams.find({"class_id": {"$in": class_ids}, "status": "published"})
        ]
        exam_ids = [str(e["_id"]) for e in exams]
        attempts = {
            a["exam_id"]: a
            async for a in db.attempts.find({"student_id": student.id, "exam_id": {"$in": exam_ids}})
        }
        for exam in exams:
            exam_id = str(exam["_id"])
            attempt = attempts.get(exam_id)
            if attempt:
                attempt = await auto_close_if_expired(attempt, exam)
                if attempt["status"] == "submitted":
                    continue
            live_exams.append(
                {
                    "id": exam_id,
                    "title": exam["title"],
                    "class_id": exam["class_id"],
                    "class_code": class_code_by_id.get(exam["class_id"], ""),
                    "kind": exam["kind"],
                    "duration_min": exam["duration_min"],
                    "question_count": len(exam.get("questions", [])),
                    "in_progress": attempt is not None,
                }
            )

        all_attempts = [
            a
            async for a in db.attempts.find(
                {"student_id": student.id, "status": "submitted"}
            ).sort("submitted_at", -1)
        ]
        for attempt in all_attempts:
            exam = await db.exams.find_one({"_id": oid(attempt["exam_id"])})
            if exam is None or not exam.get("released"):
                continue
            max_marks = sum(q["marks"] for q in exam["questions"]) or 1
            percent = round(effective_total(attempt, exam) / max_marks * 100)
            released_results.append(
                {
                    "attempt_id": str(attempt["_id"]),
                    "exam_id": attempt["exam_id"],
                    "exam_title": exam["title"],
                    "percent": percent,
                    "submitted_at": attempt["submitted_at"],
                }
            )
            if len(released_results) >= RECENT_LIMIT:
                break

    notifications = [
        to_out(n)
        async for n in db.notifications.find({"to_user_id": student.id})
        .sort("created_at", -1)
        .limit(RECENT_LIMIT)
    ]

    return {
        "classes": classes,
        "live_exams": live_exams,
        "released_results": released_results,
        "recent_notifications": notifications,
    }


async def hod_dashboard(hod: CurrentUser) -> dict:
    db = get_db()
    class_ids = [str(c["_id"]) async for c in db.classes.find({"dept_id": hod.dept_id}, {"_id": 1})]

    pending_approvals: list[dict] = []
    submitted_count = 0
    percents: list[int] = []
    if class_ids:
        pending_exams = [
            e
            async for e in db.exams.find(
                {"class_id": {"$in": class_ids}, "status": "pending"}
            ).sort("created_at", 1)
        ]
        class_by_id = {
            str(c["_id"]): c
            async for c in db.classes.find({"_id": {"$in": [oid(cid) for cid in class_ids]}})
        }
        for exam in pending_exams:
            teacher = await db.users.find_one({"_id": oid(exam["teacher_id"])})
            cls = class_by_id.get(exam["class_id"])
            checks = await get_checks(hod, str(exam["_id"]))
            pending_approvals.append(
                {
                    "id": str(exam["_id"]),
                    "title": exam["title"],
                    "class_id": exam["class_id"],
                    "class_code": cls["code"] if cls else "",
                    "teacher_name": teacher["name"] if teacher else "Unknown",
                    "kind": exam["kind"],
                    "failed_checks": sum(1 for c in checks if not c["ok"]),
                    "created_at": exam["created_at"],
                }
            )

        exams_all = [str(e["_id"]) async for e in db.exams.find({"class_id": {"$in": class_ids}}, {"_id": 1})]
        if exams_all:
            attempts = [
                a
                async for a in db.attempts.find(
                    {"exam_id": {"$in": exams_all}, "status": "submitted"}
                )
            ]
            submitted_count = len(attempts)
            exam_by_id = {
                str(e["_id"]): e
                async for e in db.exams.find({"_id": {"$in": [oid(x) for x in exams_all]}})
            }
            for attempt in attempts:
                exam = exam_by_id.get(attempt["exam_id"])
                if not exam:
                    continue
                max_marks = sum(q["marks"] for q in exam["questions"]) or 1
                percents.append(round(effective_total(attempt, exam) / max_marks * 100))

    open_requests = [
        to_out(r) async for r in db.requests.find({"hod_id": hod.id, "status": "open"}).sort("due", 1)
    ]

    return {
        "pending_approvals": pending_approvals,
        "open_requests": open_requests,
        "stats": {
            "pending_approvals": len(pending_approvals),
            "department_average": round(sum(percents) / len(percents)) if percents else None,
            "open_requests": len(open_requests),
            "submissions_graded": submitted_count,
        },
    }


async def hod_analytics(hod: CurrentUser) -> dict:
    db = get_db()
    classes = [c async for c in db.classes.find({"dept_id": hod.dept_id}).sort("code", 1)]
    class_ids = [str(c["_id"]) for c in classes]

    exams_by_class: dict[str, list[dict]] = {cid: [] for cid in class_ids}
    all_exams: list[dict] = []
    if class_ids:
        async for e in db.exams.find({"class_id": {"$in": class_ids}}):
            exams_by_class[e["class_id"]].append(e)
            all_exams.append(e)

    all_exam_ids = [str(e["_id"]) for e in all_exams]
    attempts_by_exam: dict[str, list[dict]] = {}
    if all_exam_ids:
        async for a in db.attempts.find({"exam_id": {"$in": all_exam_ids}, "status": "submitted"}):
            attempts_by_exam.setdefault(a["exam_id"], []).append(a)

    clo_totals: dict[str, list[float]] = {}
    topic_totals: dict[str, list[float]] = {}
    by_class: list[dict] = []

    for cls in classes:
        cid = str(cls["_id"])
        cls_exams = exams_by_class.get(cid, [])
        cls_attempts = [a for e in cls_exams for a in attempts_by_exam.get(str(e["_id"]), [])]
        teacher = await db.users.find_one({"_id": oid(cls["teacher_id"])})

        percents: list[int] = []
        class_topic_totals: dict[str, list[float]] = {}
        for exam in cls_exams:
            exam_attempts = attempts_by_exam.get(str(exam["_id"]), [])
            max_marks = sum(q["marks"] for q in exam["questions"]) or 1
            for attempt in exam_attempts:
                percents.append(round(effective_total(attempt, exam) / max_marks * 100))
                for q in exam["questions"]:
                    score = effective_score(attempt, q)
                    ct = class_topic_totals.setdefault(q["topic"], [0.0, 0.0])
                    ct[0] += score
                    ct[1] += q["marks"]
                    gt = topic_totals.setdefault(q["topic"], [0.0, 0.0])
                    gt[0] += score
                    gt[1] += q["marks"]
                    qt = clo_totals.setdefault(q["clo"], [0.0, 0.0])
                    qt[0] += score
                    qt[1] += q["marks"]

        class_topics = sorted(
            ((t, round(s / m * 100) if m else 0) for t, (s, m) in class_topic_totals.items()),
            key=lambda item: item[1],
        )
        weakest = class_topics[0] if class_topics else None

        by_class.append(
            {
                "class_id": cid,
                "class_code": cls["code"],
                "class_name": cls["name"],
                "teacher_name": teacher["name"] if teacher else "Unknown",
                "exam_count": len(cls_exams),
                "submission_count": len(cls_attempts),
                "average_percent": round(sum(percents) / len(percents)) if percents else None,
                "weakest_topic": {"topic": weakest[0], "percent": weakest[1]} if weakest else None,
            }
        )

    by_clo = [
        {"clo": clo, "average_percent": round(s / m * 100) if m else None}
        for clo, (s, m) in sorted(clo_totals.items())
    ]
    weakest_topics = sorted(
        ({"topic": t, "percent": round(s / m * 100) if m else 0} for t, (s, m) in topic_totals.items()),
        key=lambda item: item["percent"],
    )[:5]

    from app.core.roles import roles_query

    teachers = [
        u async for u in db.users.find({"dept_id": hod.dept_id, **roles_query("teacher")})
    ]
    teacher_activity: list[dict] = []
    for teacher in teachers:
        teacher_exams = [e for e in all_exams if e["teacher_id"] == str(teacher["_id"])]
        papers_by_status: dict[str, int] = {}
        for e in teacher_exams:
            papers_by_status[e["status"]] = papers_by_status.get(e["status"], 0) + 1
        flags_total = 0
        flags_pending = 0
        for exam in teacher_exams:
            for attempt in attempts_by_exam.get(str(exam["_id"]), []):
                for q in exam["questions"]:
                    if q["type"] == "MCQ":
                        continue
                    result = attempt.get("results", {}).get(q["qid"])
                    if not result or result.get("ai_probability") is None:
                        continue
                    if result["ai_probability"] < exam["ai_threshold"]:
                        continue
                    flags_total += 1
                    if not attempt.get("flags", {}).get(q["qid"]):
                        flags_pending += 1
        teacher_activity.append(
            {
                "teacher_id": str(teacher["_id"]),
                "teacher_name": teacher["name"],
                "papers_by_status": papers_by_status,
                "flags_pending": flags_pending,
                "flags_total": flags_total,
            }
        )

    return {
        "by_class": by_class,
        "by_clo": by_clo,
        "weakest_topics": weakest_topics,
        "teacher_activity": teacher_activity,
    }
