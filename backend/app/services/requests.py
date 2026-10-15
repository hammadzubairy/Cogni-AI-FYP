from datetime import datetime

from fastapi import HTTPException

from app.core.db import get_db, oid, to_out
from app.core.deps import CurrentUser
from app.services.notify import log_activity, notify


async def create_request(
    actor: CurrentUser, teacher_id: str, class_id: str, kind: str, due: datetime, note: str
) -> dict:
    db = get_db()
    cls = await db.classes.find_one({"_id": oid(class_id)})
    if cls is None:
        raise HTTPException(status_code=404, detail="Class not found.")
    if cls["teacher_id"] != teacher_id or cls["dept_id"] != actor.dept_id:
        raise HTTPException(
            status_code=400,
            detail="That class does not belong to this teacher in your department.",
        )
    teacher = await db.users.find_one({"_id": oid(teacher_id)})
    if teacher is None:
        raise HTTPException(status_code=404, detail="Teacher not found.")

    doc = {
        "hod_id": actor.id,
        "teacher_id": teacher_id,
        "class_id": class_id,
        "kind": kind,
        "due": due,
        "note": note,
        "status": "open",
        "exam_id": None,
    }
    result = await db.requests.insert_one(doc)
    doc["_id"] = result.inserted_id
    await notify(
        teacher_id,
        f"{actor.name} requested a {kind} for {cls['code']}, due {due:%Y-%m-%d}",
        "request",
        str(result.inserted_id),
        actor.id,
    )
    await log_activity(actor, f"Requested a {kind} from {teacher['name']} for {cls['code']}")
    return to_out(doc)


async def list_requests(user: CurrentUser) -> list[dict]:
    db = get_db()
    if user.role == "teacher":
        query = {"teacher_id": user.id}
    elif user.role == "hod":
        query = {"hod_id": user.id}
    else:
        raise HTTPException(status_code=403, detail="You do not have permission to view requests.")
    return [to_out(r) async for r in db.requests.find(query).sort("due", 1)]
