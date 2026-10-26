from datetime import UTC, datetime

from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError

from app.core.db import get_db
from app.core.security import hash_password
from app.services import settings as settings_service
from app.services.notify import log_activity
from app.services.passwords import validate_password


async def needs_setup() -> bool:
    db = get_db()
    return await db.users.count_documents({}) == 0


async def create_first_admin(
    name: str, email: str, password: str, institution_name: str, current_term: str
) -> dict:
    db = get_db()
    if await db.users.count_documents({}) > 0:
        raise HTTPException(status_code=409, detail="Setup has already been completed.")
    email_n = email.strip().lower()
    err = validate_password(password, email=email_n, name=name)
    if err:
        raise HTTPException(status_code=400, detail=err)
    from app.core.roles import with_roles_fields

    doc = {
        "name": name.strip(),
        "email": email_n,
        "password_hash": hash_password(password),
        **with_roles_fields(["admin"]),
        "dept_id": None,
        "status": "active",
        "must_change_password": False,
        "token_version": 0,
        "created_at": datetime.now(UTC),
        "created_by": None,
        "last_login_at": None,
    }
    try:
        result = await db.users.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="Setup has already been completed.")
    # Race: another insert may have won between count and insert
    if await db.users.count_documents({}) > 1:
        await db.users.delete_one({"_id": result.inserted_id})
        raise HTTPException(status_code=409, detail="Setup has already been completed.")
    doc["_id"] = result.inserted_id
    await settings_service.ensure_settings_document(
        institution_name=(institution_name or "").strip(),
        current_term=(current_term or "").strip(),
    )
    await log_activity(
        None,
        f"Initial admin created ({email_n})",
        actor_override={"id": str(doc["_id"]), "name": doc["name"], "role": "admin"},
    )
    return doc
