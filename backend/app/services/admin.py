from app.core.config import settings
from app.core.db import get_db, to_out
from app.core.roles import roles_query

ROLES = ("admin", "hod", "teacher", "student")
EXAM_STATUSES = ("draft", "pending", "returned", "approved", "published", "closed")


async def list_activity(role: str | None, limit: int) -> list[dict]:
    db = get_db()
    query = {"role": role} if role else {}
    cursor = db.activity_log.find(query).sort("at", -1).limit(limit)
    return [to_out(a) async for a in cursor]


async def summary() -> dict:
    db = get_db()
    users_by_role = {r: await db.users.count_documents(roles_query(r)) for r in ROLES}
    classes_count = await db.classes.count_documents({})
    papers_by_status = {s: await db.exams.count_documents({"status": s}) for s in EXAM_STATUSES}
    recent = [to_out(a) async for a in db.activity_log.find().sort("at", -1).limit(10)]
    return {
        "users_by_role": users_by_role,
        "classes": classes_count,
        "papers_by_status": papers_by_status,
        "recent_activity": recent,
    }


async def onboarding() -> dict:
    db = get_db()
    has_dept = await db.departments.count_documents({}) > 0
    has_teacher = await db.users.count_documents(roles_query("teacher")) > 0
    has_head = await db.departments.count_documents({"hod_id": {"$ne": None}}) > 0
    has_class = await db.classes.count_documents({}) > 0
    has_student_joined = await db.classes.count_documents({"student_ids.0": {"$exists": True}}) > 0
    has_published = await db.exams.count_documents({"status": "published"}) > 0
    items = [
        {"key": "department", "done": has_dept, "label": "Create a department", "href": "/app/admin/departments"},
        {"key": "teacher", "done": has_teacher, "label": "Add a teacher", "href": "/app/admin/users/new"},
        {"key": "head", "done": has_head, "label": "Assign a department head", "href": "/app/admin/departments"},
        {"key": "class", "done": has_class, "label": "A class exists", "href": "/app/admin"},
        {"key": "student", "done": has_student_joined, "label": "A student has joined a class", "href": "/app/admin/users"},
        {"key": "exam", "done": has_published, "label": "An exam has been published", "href": "/app/admin"},
    ]
    return {"items": items, "complete": all(i["done"] for i in items)}


async def llm_status() -> dict:
    return {
        "provider": settings.LLM_PROVIDER,
        "model": settings.LLM_MODEL or None,
        "configured": bool(settings.LLM_API_KEY) or settings.LLM_PROVIDER == "mock",
    }
