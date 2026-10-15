from datetime import UTC, datetime

from fastapi import HTTPException

from app.core.db import get_db, oid, to_out
from app.core.deps import CurrentUser
from app.core.security import hash_password
from app.services import auth as auth_service
from app.services.notify import log_activity, notify
from app.services.passwords import generate_temporary_password, validate_password


async def list_users(role: str | None, q: str | None) -> list[dict]:
    db = get_db()
    query: dict = {}
    if role:
        query["role"] = role
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"email": {"$regex": q, "$options": "i"}},
        ]
    out = []
    async for u in db.users.find(query).sort("name", 1):
        shaped = to_out(u)
        shaped.pop("password_hash", None)
        out.append(shaped)
    return out


async def create_user(
    actor: CurrentUser, name: str, email: str, role: str, dept_id: str | None
) -> tuple[dict, str]:
    db = get_db()
    email = email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Someone already uses this email.")

    if role == "admin":
        dept_id = None
    elif not dept_id:
        raise HTTPException(status_code=400, detail="Choose a department.")

    temp = generate_temporary_password()
    doc = {
        "name": name,
        "email": email,
        "password_hash": hash_password(temp),
        "role": role,
        "dept_id": dept_id,
        "status": "active",
        "must_change_password": True,
        "token_version": 0,
        "created_at": datetime.now(UTC),
        "created_by": actor.id,
        "last_login_at": None,
    }
    result = await db.users.insert_one(doc)
    doc["_id"] = result.inserted_id
    user_id = str(result.inserted_id)

    if dept_id:
        dept = await db.departments.find_one({"_id": oid(dept_id)})
        if dept:
            if role == "hod" and not dept.get("hod_id"):
                await db.departments.update_one(
                    {"_id": dept["_id"]}, {"$set": {"hod_id": user_id}}
                )
                await notify(
                    user_id, f"You are now head of {dept['name']}", "department", dept_id, actor.id
                )
            elif role != "student" and dept.get("hod_id"):
                await notify(
                    dept["hod_id"],
                    f"{actor.name} added {role} {name} to {dept['name']}",
                    "department",
                    dept_id,
                    actor.id,
                )

    await log_activity(actor, f"Added {role} {name} ({email})")
    shaped = to_out(doc)
    shaped.pop("password_hash", None)
    return shaped, temp


async def update_user(actor: CurrentUser, user_id: str, fields: dict) -> dict:
    db = get_db()
    user = await db.users.find_one({"_id": oid(user_id)})
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")

    old_role = user["role"]
    new_role = fields.get("role", old_role)
    updates = dict(fields)

    if new_role == "admin":
        updates["dept_id"] = None

    if old_role == "hod" and new_role != "hod":
        await db.departments.update_many({"hod_id": user_id}, {"$set": {"hod_id": None}})

    if updates.get("status") == "inactive":
        updates["token_version"] = int(user.get("token_version", 0)) + 1

    if updates:
        await db.users.update_one({"_id": user["_id"]}, {"$set": updates})
        user = {**user, **updates}

    if "role" in fields and new_role != old_role:
        await notify(
            user_id, f"An admin changed your role to {new_role.upper()}", actor_id=actor.id
        )
        await log_activity(actor, f"Changed role of {user['name']} to {new_role}")

    if new_role == "hod" and user.get("dept_id"):
        dept = await db.departments.find_one({"_id": oid(user["dept_id"])})
        if dept and not dept.get("hod_id"):
            await db.departments.update_one(
                {"_id": dept["_id"]}, {"$set": {"hod_id": user_id}}
            )
            await notify(
                user_id,
                f"You are now head of {dept['name']}",
                "department",
                str(dept["_id"]),
                actor.id,
            )

    await log_activity(actor, f"Updated {user['name']}")
    shaped = to_out(user)
    shaped.pop("password_hash", None)
    return shaped


async def reset_password(actor: CurrentUser, user_id: str) -> str:
    db = get_db()
    user = await db.users.find_one({"_id": oid(user_id)})
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    temp = generate_temporary_password()
    new_tv = int(user.get("token_version", 0)) + 1
    await db.users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "password_hash": hash_password(temp),
                "must_change_password": True,
                "token_version": new_tv,
            }
        },
    )
    await notify(user_id, "Your password was reset by an admin", actor_id=actor.id)
    await log_activity(actor, f"Reset password for {user['name']}")
    return temp


# silence unused import warning if validate unused
_ = (auth_service, validate_password)
