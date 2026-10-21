import random
import string

from fastapi import HTTPException

from app.core.db import get_db, oid, to_out
from app.core.deps import CurrentUser
from app.services.notify import log_activity, notify


async def _with_counts(cls: dict) -> dict:
    db = get_db()
    exam_count = await db.exams.count_documents({"class_id": str(cls["_id"])})
    out = to_out(cls)
    out["student_count"] = len(cls.get("student_ids", []))
    out["exam_count"] = exam_count
    return out


async def list_classes(user: CurrentUser) -> list[dict]:
    db = get_db()
    if user.role == "teacher":
        query = {"teacher_id": user.id}
    elif user.role == "student":
        query = {"student_ids": user.id}
    elif user.role == "hod":
        query = {"dept_id": user.dept_id}
    else:
        query = {}
    classes = [c async for c in db.classes.find(query).sort("code", 1)]
    return [await _with_counts(c) for c in classes]


def _generate_join_code(code: str) -> str:
    prefix = code.split("-")[0][:3]
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=3))
    return f"{prefix}-{suffix}"


async def create_class(
    actor: CurrentUser, name: str, code: str, content_library: str | None
) -> dict:
    db = get_db()
    code = code.strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Enter a course code.")
    if await db.classes.find_one({"code": code}):
        raise HTTPException(status_code=409, detail="That course code already exists.")

    join_code = _generate_join_code(code)
    for _ in range(5):
        if not await db.classes.find_one({"join_code": join_code}):
            break
        join_code = _generate_join_code(code)

    from app.services import settings as settings_service

    term = (await settings_service.get_settings()).get("current_term") or ""
    doc = {
        "code": code,
        "name": name,
        "teacher_id": actor.id,
        "dept_id": actor.dept_id,
        "student_ids": [],
        "join_code": join_code,
        "clos": [],
        "section": term,
    }
    result = await db.classes.insert_one(doc)
    doc["_id"] = result.inserted_id
    class_id = str(result.inserted_id)

    dept = await db.departments.find_one({"_id": oid(actor.dept_id)}) if actor.dept_id else None
    if dept and dept.get("hod_id"):
        await notify(
            dept["hod_id"],
            f"{actor.name} created class {code} · {name}",
            "class",
            class_id,
            actor.id,
        )

    await log_activity(actor, f"Created class {code} {name}")
    return await _with_counts(doc)


async def _get_class_or_404(class_id: str) -> dict:
    db = get_db()
    cls = await db.classes.find_one({"_id": oid(class_id)})
    if cls is None:
        raise HTTPException(status_code=404, detail="Class not found.")
    return cls


def _assert_access(user: CurrentUser, cls: dict) -> None:
    if user.role == "admin":
        return
    if user.role == "teacher" and cls["teacher_id"] == user.id:
        return
    if user.role == "hod" and cls["dept_id"] == user.dept_id:
        return
    if user.role == "student" and user.id in cls.get("student_ids", []):
        return
    raise HTTPException(status_code=403, detail="You do not have access to this class.")


def _assert_teacher_owns(user: CurrentUser, cls: dict) -> None:
    if user.role != "teacher" or cls["teacher_id"] != user.id:
        raise HTTPException(status_code=403, detail="You do not own this class.")


async def _student_roster(student_ids: list[str]) -> list[dict]:
    """Resolve enrolled student ids to {id, name, email} for teacher/HOD views."""
    if not student_ids:
        return []
    db = get_db()
    oids = []
    for sid in student_ids:
        try:
            oids.append(oid(sid))
        except Exception:
            continue
    if not oids:
        return []
    by_id: dict[str, dict] = {}
    async for u in db.users.find(
        {"_id": {"$in": oids}}, {"name": 1, "email": 1}
    ):
        by_id[str(u["_id"])] = {
            "id": str(u["_id"]),
            "name": u.get("name") or "Student",
            "email": u.get("email") or "",
        }
    return [by_id[sid] for sid in student_ids if sid in by_id]


async def get_class(user: CurrentUser, class_id: str) -> dict:
    cls = await _get_class_or_404(class_id)
    _assert_access(user, cls)
    out = await _with_counts(cls)
    if user.role == "student":
        out["student_ids"] = []
        out["students"] = []
    else:
        out["students"] = await _student_roster(cls.get("student_ids", []))
    return out


async def add_student(actor: CurrentUser, class_id: str, email: str) -> dict:
    db = get_db()
    cls = await _get_class_or_404(class_id)
    _assert_teacher_owns(actor, cls)
    user = await db.users.find_one({"email": email.strip().lower()})
    if user is None:
        raise HTTPException(status_code=404, detail="No user with that email.")
    if user["role"] != "student":
        raise HTTPException(status_code=400, detail=f"{user['name']} is not a student account.")
    student_id = str(user["_id"])
    if student_id in cls.get("student_ids", []):
        raise HTTPException(status_code=409, detail=f"{user['name']} is already enrolled.")
    await db.classes.update_one({"_id": cls["_id"]}, {"$push": {"student_ids": student_id}})
    await notify(
        student_id,
        f"{actor.name} added you to {cls['code']} · {cls['name']}",
        "class",
        class_id,
        actor.id,
    )
    await log_activity(actor, f"Added {user['name']} to {cls['code']}")
    cls["student_ids"] = cls.get("student_ids", []) + [student_id]
    return await _with_counts(cls)


async def remove_student(actor: CurrentUser, class_id: str, student_id: str) -> None:
    db = get_db()
    cls = await _get_class_or_404(class_id)
    _assert_teacher_owns(actor, cls)
    if student_id not in cls.get("student_ids", []):
        raise HTTPException(status_code=404, detail="That student is not enrolled in this class.")
    student = await db.users.find_one({"_id": oid(student_id)})
    await db.classes.update_one({"_id": cls["_id"]}, {"$pull": {"student_ids": student_id}})
    await notify(
        student_id,
        f"You were removed from {cls['code']} · {cls['name']}",
        "class",
        class_id,
        actor.id,
    )
    await log_activity(
        actor, f"Removed {student['name'] if student else student_id} from {cls['code']}"
    )


async def join_class(actor: CurrentUser, join_code: str) -> dict:
    db = get_db()
    cls = await db.classes.find_one({"join_code": join_code.strip().upper()})
    if cls is None:
        raise HTTPException(status_code=404, detail="No class uses that join code.")
    if actor.id in cls.get("student_ids", []):
        raise HTTPException(status_code=409, detail=f"You are already in {cls['code']}.")
    await db.classes.update_one({"_id": cls["_id"]}, {"$push": {"student_ids": actor.id}})
    await notify(
        cls["teacher_id"],
        f"{actor.name} joined {cls['code']} with the join code",
        "class",
        str(cls["_id"]),
        actor.id,
    )
    await log_activity(actor, f"Joined {cls['code']}")
    cls["student_ids"] = cls.get("student_ids", []) + [actor.id]
    return await _with_counts(cls)


async def reassign_teacher(actor: CurrentUser, class_id: str, new_teacher_id: str) -> dict:
    db = get_db()
    cls = await _get_class_or_404(class_id)
    new_teacher = await db.users.find_one({"_id": oid(new_teacher_id)})
    if new_teacher is None or new_teacher["role"] != "teacher":
        raise HTTPException(status_code=400, detail="Choose an active teacher.")
    if new_teacher.get("dept_id") != cls["dept_id"]:
        raise HTTPException(
            status_code=400, detail="The teacher must be in the class's department."
        )
    prev_teacher_id = cls["teacher_id"]
    await db.classes.update_one({"_id": cls["_id"]}, {"$set": {"teacher_id": new_teacher_id}})
    await db.exams.update_many({"class_id": class_id}, {"$set": {"teacher_id": new_teacher_id}})
    prev_teacher = (
        await db.users.find_one({"_id": oid(prev_teacher_id)}) if prev_teacher_id else None
    )
    await notify(
        new_teacher_id,
        f"{cls['code']} · {cls['name']} was assigned to you",
        "class",
        class_id,
        actor.id,
    )
    if prev_teacher_id:
        await notify(
            prev_teacher_id,
            f"{cls['code']} was reassigned to {new_teacher['name']}",
            "class",
            class_id,
            actor.id,
        )
    await log_activity(
        actor,
        f"Reassigned {cls['code']} from {prev_teacher['name'] if prev_teacher else 'nobody'} "
        f"to {new_teacher['name']}",
    )
    cls["teacher_id"] = new_teacher_id
    return await _with_counts(cls)
