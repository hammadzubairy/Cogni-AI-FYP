from fastapi import HTTPException

from app.core.db import get_db, oid, to_out
from app.core.deps import CurrentUser
from app.core.roles import add_role, remove_role, roles_query, with_roles_fields
from app.services.notify import log_activity, notify

DEFAULT_POLICY = {"min_clo": 2, "higher_order_pct": 25, "max_repeats": 2}


async def list_departments() -> list[dict]:
    db = get_db()
    return [to_out(d) async for d in db.departments.find().sort("name", 1)]


async def create_department(actor: CurrentUser, code: str, name: str) -> dict:
    db = get_db()
    if await db.departments.find_one({"code": code}):
        raise HTTPException(status_code=409, detail="That department code is already in use.")
    doc = {"code": code, "name": name, "hod_id": None, "policy": dict(DEFAULT_POLICY)}
    result = await db.departments.insert_one(doc)
    doc["_id"] = result.inserted_id
    await log_activity(actor, f"Created department {name}")
    return to_out(doc)


async def set_hod(actor: CurrentUser, dept_id: str, new_hod_id: str | None) -> dict:
    db = get_db()
    dept = await db.departments.find_one({"_id": oid(dept_id)})
    if dept is None:
        raise HTTPException(status_code=404, detail="Department not found.")
    prev_hod_id = dept.get("hod_id")

    new_hod = None
    if new_hod_id:
        new_hod = await db.users.find_one({"_id": oid(new_hod_id)})
        if new_hod is None:
            raise HTTPException(status_code=404, detail="User not found.")
        # Add hod (+ teacher via normalize); do not strip other roles.
        new_roles = add_role(new_hod, "hod")
        await db.users.update_one(
            {"_id": new_hod["_id"]},
            {
                "$set": {
                    **with_roles_fields(new_roles),
                    "dept_id": dept_id,
                    "token_version": int(new_hod.get("token_version", 0)) + 1,
                }
            },
        )
        await notify(
            new_hod_id, f"You are now head of {dept['name']}", "department", dept_id, actor.id
        )

    if prev_hod_id and prev_hod_id != new_hod_id:
        prev_hod = await db.users.find_one({"_id": oid(prev_hod_id)})
        if prev_hod:
            from app.core.roles import has_role

            if has_role(prev_hod, "hod"):
                try:
                    demoted = remove_role(prev_hod, "hod")
                except ValueError:
                    demoted = ["teacher"]
                await db.users.update_one(
                    {"_id": prev_hod["_id"]},
                    {
                        "$set": {
                            **with_roles_fields(demoted),
                            "token_version": int(prev_hod.get("token_version", 0)) + 1,
                        }
                    },
                )
                await notify(
                    prev_hod_id,
                    f"You are no longer head of {dept['name']}",
                    "department",
                    dept_id,
                    actor.id,
                )

    await db.departments.update_one({"_id": dept["_id"]}, {"$set": {"hod_id": new_hod_id}})
    new_name = new_hod["name"] if new_hod else "nobody"
    await log_activity(actor, f"Changed head of {dept['name']} to {new_name}")
    dept["hod_id"] = new_hod_id
    return to_out(dept)


async def get_policy(dept_id: str | None) -> dict:
    if dept_id is None:
        raise HTTPException(status_code=404, detail="Department not found.")
    db = get_db()
    dept = await db.departments.find_one({"_id": oid(dept_id)})
    if dept is None:
        raise HTTPException(status_code=404, detail="Department not found.")
    return dept["policy"]


async def update_policy(actor: CurrentUser, dept_id: str | None, policy: dict) -> dict:
    if dept_id is None:
        raise HTTPException(status_code=404, detail="Department not found.")
    db = get_db()
    dept = await db.departments.find_one({"_id": oid(dept_id)})
    if dept is None:
        raise HTTPException(status_code=404, detail="Department not found.")
    await db.departments.update_one({"_id": dept["_id"]}, {"$set": {"policy": policy}})
    teacher_q = {"dept_id": dept_id, **roles_query("teacher")}
    teacher_ids = [str(u["_id"]) async for u in db.users.find(teacher_q)]
    await notify(
        teacher_ids,
        f"{actor.name} updated the {dept['name']} exam policy",
        "department",
        dept_id,
        actor.id,
    )
    await log_activity(
        actor,
        f"Updated {dept['name']} policy: {policy['min_clo']} per CLO, "
        f"{policy['higher_order_pct']}% higher-order, max {policy['max_repeats']} repeats",
    )
    return policy
