from bson import ObjectId
from bson.errors import InvalidId
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWTError
from pydantic import BaseModel

from app.core.db import get_db
from app.core.security import decode_token
from app.schemas.users import Role, UserStatus

bearer_scheme = HTTPBearer(auto_error=False)

AUTH_ERROR = "Could not validate credentials."


class CurrentUser(BaseModel):
    id: str
    name: str
    email: str
    role: Role
    dept_id: str | None
    status: UserStatus
    must_change_password: bool = False
    token_version: int = 0
    scope: str | None = None
    dept_name: str | None = None
    institution_name: str | None = None
    current_term: str | None = None


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> CurrentUser:
    if credentials is None:
        raise HTTPException(status_code=401, detail=AUTH_ERROR)
    try:
        payload = decode_token(credentials.credentials)
        user_oid = ObjectId(payload["sub"])
        token_tv = int(payload.get("tv", 0))
        scope = payload.get("scope")
    except (PyJWTError, InvalidId, TypeError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail=AUTH_ERROR)

    db = get_db()
    doc = await db.users.find_one({"_id": user_oid})
    if doc is None:
        raise HTTPException(status_code=401, detail=AUTH_ERROR)
    if doc["status"] != "active":
        raise HTTPException(
            status_code=403,
            detail="This account is deactivated. Ask an admin to reactivate it.",
        )
    if int(doc.get("token_version", 0)) != token_tv:
        raise HTTPException(status_code=401, detail=AUTH_ERROR)

    from app.core.db import oid
    from app.core.roles import user_roles
    from app.services import settings as settings_service

    jwt_role = payload.get("role")
    held = user_roles(doc)
    if jwt_role not in held:
        raise HTTPException(status_code=401, detail=AUTH_ERROR)

    s = await settings_service.get_settings()
    dept_name = None
    if doc.get("dept_id"):
        try:
            dept = await db.departments.find_one({"_id": oid(doc["dept_id"])})
            if dept:
                dept_name = dept.get("name")
        except HTTPException:
            dept_name = None

    return CurrentUser(
        id=str(doc["_id"]),
        name=doc["name"],
        email=doc["email"],
        role=jwt_role,
        dept_id=doc.get("dept_id"),
        status=doc["status"],
        must_change_password=bool(doc.get("must_change_password", False)),
        token_version=int(doc.get("token_version", 0)),
        scope=scope,
        dept_name=dept_name,
        institution_name=s.get("institution_name") or None,
        current_term=s.get("current_term") or None,
    )


def require_role(*roles: str):
    async def checker(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.scope == "change_password":
            raise HTTPException(
                status_code=403,
                detail="Change your password before continuing.",
            )
        if user.role not in roles:
            raise HTTPException(
                status_code=403,
                detail="You do not have permission to perform this action.",
            )
        return user

    return checker


def teacher_owns_class(user: CurrentUser, cls: dict) -> bool:
    return user.role == "teacher" and cls.get("teacher_id") == user.id


def student_in_class(user: CurrentUser, cls: dict) -> bool:
    return user.role == "student" and user.id in cls.get("student_ids", [])


def hod_owns_dept(user: CurrentUser, dept_id: str | None) -> bool:
    return user.role == "hod" and dept_id is not None and user.dept_id == dept_id
