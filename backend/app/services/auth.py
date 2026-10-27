from datetime import UTC, datetime, timedelta

import secrets
from fastapi import HTTPException

from app.core.config import settings
from app.core.db import get_db, oid
from app.core.security import (
    create_token,
    dummy_password_check,
    hash_password,
    verify_password,
)
from app.services import settings as settings_service
from app.services.mailer import get_mailer, render_action_email, smtp_configured
from app.services.notify import log_activity
from app.services.passwords import generate_temporary_password, hash_reset_token, validate_password

GENERIC_LOGIN_ERROR = "Incorrect email or password."
INACTIVE_ERROR = "This account is deactivated. Ask an admin to reactivate it."
UNVERIFIED_ERROR = "Verify your email before signing in. Check your inbox for a link."
LOCKED_ERROR = "Too many failed sign-in attempts. Try again later."


class AuthError(Exception):
    def __init__(self, status_code: int, detail: str, *, headers: dict | None = None):
        self.status_code = status_code
        self.detail = detail
        self.headers = headers or {}
        super().__init__(detail)


async def _count_recent_failures(email: str) -> int:
    db = get_db()
    since = datetime.now(UTC) - timedelta(minutes=settings.LOGIN_LOCKOUT_MINUTES)
    return await db.login_failures.count_documents({"email": email, "at": {"$gte": since}})


async def _record_failure(email: str) -> None:
    db = get_db()
    await db.login_failures.insert_one({"email": email, "at": datetime.now(UTC)})


PORTAL_DENIED = "You do not have access to that portal."


async def authenticate(email: str, password: str, portal_role: str) -> dict:
    from app.core.roles import user_roles

    db = get_db()
    email_n = email.strip().lower()
    failures = await _count_recent_failures(email_n)
    limit = settings.LOGIN_LOCKOUT_FAILURES
    if settings.is_test:
        limit = max(limit, 1000)
    if failures >= limit:
        raise AuthError(
            429,
            LOCKED_ERROR,
            headers={"Retry-After": str(settings.LOGIN_LOCKOUT_MINUTES * 60)},
        )

    user = await db.users.find_one({"email": email_n})
    if user is None:
        dummy_password_check(password)
        await _record_failure(email_n)
        raise AuthError(401, GENERIC_LOGIN_ERROR)
    if not verify_password(password, user["password_hash"]):
        await _record_failure(email_n)
        from app.core.roles import primary_role, user_roles as _ur

        roles = _ur(user)
        await log_activity(
            None,
            f"Failed login for {email_n}",
            actor_override={
                "id": str(user["_id"]),
                "name": user["name"],
                "role": primary_role(roles) if roles else user.get("role", "student"),
            },
        )
        raise AuthError(401, GENERIC_LOGIN_ERROR)
    status = user.get("status", "active")
    if status == "pending_verification":
        raise AuthError(403, UNVERIFIED_ERROR)
    if status != "active":
        raise AuthError(403, INACTIVE_ERROR)

    if portal_role not in user_roles(user):
        raise AuthError(403, PORTAL_DENIED)

    await db.users.update_one(
        {"_id": user["_id"]}, {"$set": {"last_login_at": datetime.now(UTC)}}
    )
    return user


def issue_tokens_for(user: dict, *, role: str | None = None) -> tuple[str, str | None]:
    """Return (access_token, scope). JWT role is the active portal."""
    from app.core.roles import primary_role, user_roles

    roles = user_roles(user)
    portal = role or (primary_role(roles) if roles else user.get("role"))
    if portal not in roles:
        raise AuthError(403, PORTAL_DENIED)
    scope = "change_password" if user.get("must_change_password") else None
    token = create_token(
        str(user["_id"]),
        portal,
        token_version=int(user.get("token_version", 0)),
        scope=scope,
    )
    return token, scope


async def switch_role(user_id: str, portal_role: str) -> dict:
    """Re-load user and verify portal membership (caller issues tokens)."""
    from app.core.roles import user_roles

    db = get_db()
    user = await db.users.find_one({"_id": oid(user_id)})
    if user is None:
        raise HTTPException(status_code=401, detail=GENERIC_LOGIN_ERROR)
    if user.get("status") != "active":
        raise HTTPException(status_code=403, detail=INACTIVE_ERROR)
    if portal_role not in user_roles(user):
        raise HTTPException(status_code=403, detail=PORTAL_DENIED)
    return user


async def user_public_fields(user: dict, *, active_role: str | None = None) -> dict:
    from app.core.roles import primary_role, user_roles

    s = await settings_service.get_settings()
    dept_name = None
    if user.get("dept_id"):
        from app.core.db import oid as _oid

        dept = await get_db().departments.find_one({"_id": _oid(user["dept_id"])})
        if dept:
            dept_name = dept.get("name")
    roles = user_roles(user)
    role = active_role if active_role and active_role in roles else (
        primary_role(roles) if roles else user.get("role")
    )
    return {
        "id": str(user["_id"]),
        "name": user["name"],
        "email": user["email"],
        "role": role,
        "roles": roles,
        "dept_id": user.get("dept_id"),
        "status": user.get("status", "active"),
        "must_change_password": bool(user.get("must_change_password", False)),
        "dept_name": dept_name,
        "institution_name": s.get("institution_name") or "",
        "current_term": s.get("current_term") or "",
    }


async def change_password(user_id: str, current_password: str, new_password: str) -> dict:
    db = get_db()
    from app.core.db import oid

    user = await db.users.find_one({"_id": oid(user_id)})
    if user is None:
        raise HTTPException(status_code=401, detail=GENERIC_LOGIN_ERROR)
    if not verify_password(current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    err = validate_password(new_password, email=user["email"], name=user["name"])
    if err:
        raise HTTPException(status_code=400, detail=err)
    new_tv = int(user.get("token_version", 0)) + 1
    await db.users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "password_hash": hash_password(new_password),
                "must_change_password": False,
                "token_version": new_tv,
            }
        },
    )
    user = await db.users.find_one({"_id": user["_id"]})
    await log_activity(
        None,
        f"Password changed for {user['email']}",
        actor_override={"id": str(user["_id"]), "name": user["name"], "role": user["role"]},
    )
    return user


async def _issue_email_verification(user: dict) -> str:
    """Create a verification token, store hash, send mail. Returns raw token."""
    db = get_db()
    raw = secrets.token_urlsafe(32)
    token_hash = hash_reset_token(raw)
    expires = datetime.now(UTC) + timedelta(minutes=settings.EMAIL_VERIFY_MINUTES)
    await db.email_verifications.delete_many({"user_id": str(user["_id"])})
    await db.email_verifications.insert_one(
        {
            "token_hash": token_hash,
            "user_id": str(user["_id"]),
            "expires_at": expires,
            "used": False,
        }
    )
    link = f"{settings.PUBLIC_BASE_URL.rstrip('/')}/verify/{raw}"
    body, html = render_action_email(
        "Confirm your email address to finish creating your Cogni.ai account.",
        link,
        "Verify my email",
        settings.EMAIL_VERIFY_MINUTES,
    )
    # Always send via mailer (ConsoleMailer in test/dev when SMTP unset).
    get_mailer().send(user["email"], "Verify your Cogni.ai email", body, html)
    return raw


async def register_user(
    name: str, email: str, password: str, *, role: str = "student"
) -> dict:
    """Public student self-signup. Creates pending_verification user and emails a link."""
    db = get_db()
    s = await settings_service.get_settings()
    if not s.get("student_signup_enabled", True):
        raise HTTPException(status_code=403, detail="Self-signup is disabled.")
    if (role or "student").strip().lower() != "student":
        raise HTTPException(
            status_code=400,
            detail="Public signup is for students only. Ask an admin to add staff accounts.",
        )

    email_n = email.strip().lower()
    err = validate_password(password, email=email_n, name=name)
    if err:
        raise HTTPException(status_code=400, detail=err)
    if await db.users.find_one({"email": email_n}):
        raise HTTPException(status_code=409, detail="Could not create that account.")

    from app.core.roles import with_roles_fields

    doc = {
        "name": name.strip(),
        "email": email_n,
        "password_hash": hash_password(password),
        **with_roles_fields(["student"]),
        "dept_id": None,
        "status": "pending_verification",
        "must_change_password": False,
        "token_version": 0,
        "created_at": datetime.now(UTC),
        "created_by": None,
        "last_login_at": None,
    }
    result = await db.users.insert_one(doc)
    doc["_id"] = result.inserted_id
    await _issue_email_verification(doc)
    return doc


async def register_student(name: str, email: str, password: str) -> dict:
    """Back-compat wrapper — student self-signup."""
    return await register_user(name, email, password)


async def verify_email(token: str) -> dict:
    db = get_db()
    token_hash = hash_reset_token(token)
    row = await db.email_verifications.find_one({"token_hash": token_hash})
    if row is None or row.get("used"):
        raise HTTPException(status_code=400, detail="This verification link is invalid or expired.")
    exp = row["expires_at"]
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=UTC)
    if exp < datetime.now(UTC):
        raise HTTPException(status_code=400, detail="This verification link is invalid or expired.")
    user = await db.users.find_one({"_id": oid(row["user_id"])})
    if user is None:
        raise HTTPException(status_code=400, detail="This verification link is invalid or expired.")
    if user.get("status") == "active":
        await db.email_verifications.update_one({"_id": row["_id"]}, {"$set": {"used": True}})
        return user
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"status": "active"}},
    )
    await db.email_verifications.update_one({"_id": row["_id"]}, {"$set": {"used": True}})
    user = await db.users.find_one({"_id": user["_id"]})
    await log_activity(
        None,
        f"Email verified for {user['email']}",
        actor_override={"id": str(user["_id"]), "name": user["name"], "role": user["role"]},
    )
    return user


async def resend_verification(email: str) -> None:
    """Always succeeds from the caller's perspective (no email enumeration)."""
    db = get_db()
    email_n = email.strip().lower()
    user = await db.users.find_one({"email": email_n, "status": "pending_verification"})
    if not user:
        return
    await _issue_email_verification(user)


async def forgot_password(email: str) -> None:
    """Always succeeds from the caller's perspective."""
    db = get_db()
    email_n = email.strip().lower()
    user = await db.users.find_one({"email": email_n, "status": "active"})
    if not user:
        return
    raw = secrets.token_urlsafe(32)
    token_hash = hash_reset_token(raw)
    expires = datetime.now(UTC) + timedelta(minutes=settings.PASSWORD_RESET_MINUTES)
    await db.password_resets.insert_one(
        {
            "token_hash": token_hash,
            "user_id": str(user["_id"]),
            "expires_at": expires,
            "used": False,
        }
    )
    link = f"{settings.PUBLIC_BASE_URL.rstrip('/')}/reset/{raw}"
    body, html = render_action_email(
        "We received a request to reset your Cogni.ai password.",
        link,
        "Reset my password",
        settings.PASSWORD_RESET_MINUTES,
    )
    if settings.is_production and not smtp_configured():
        return
    get_mailer().send(email_n, "Reset your Cogni.ai password", body, html)


async def reset_password_with_token(token: str, new_password: str) -> None:
    db = get_db()
    token_hash = hash_reset_token(token)
    row = await db.password_resets.find_one({"token_hash": token_hash})
    if row is None or row.get("used"):
        raise HTTPException(status_code=400, detail="This reset link is invalid or expired.")
    exp = row["expires_at"]
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=UTC)
    if exp < datetime.now(UTC):
        raise HTTPException(status_code=400, detail="This reset link is invalid or expired.")
    from app.core.db import oid

    user = await db.users.find_one({"_id": oid(row["user_id"])})
    if user is None:
        raise HTTPException(status_code=400, detail="This reset link is invalid or expired.")
    err = validate_password(new_password, email=user["email"], name=user["name"])
    if err:
        raise HTTPException(status_code=400, detail=err)
    new_tv = int(user.get("token_version", 0)) + 1
    await db.users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "password_hash": hash_password(new_password),
                "must_change_password": False,
                "token_version": new_tv,
            }
        },
    )
    await db.password_resets.update_one({"_id": row["_id"]}, {"$set": {"used": True}})
    await log_activity(
        None,
        f"Password reset for {user['email']}",
        actor_override={"id": str(user["_id"]), "name": user["name"], "role": user["role"]},
    )


# Re-export for admin create flows
__all__ = [
    "AuthError",
    "authenticate",
    "issue_tokens_for",
    "switch_role",
    "user_public_fields",
    "change_password",
    "register_user",
    "register_student",
    "verify_email",
    "resend_verification",
    "forgot_password",
    "reset_password_with_token",
    "generate_temporary_password",
]
