from typing import Literal

from pydantic import BaseModel

from app.schemas.common import OutBase

Role = Literal["admin", "hod", "teacher", "student"]
UserStatus = Literal["active", "inactive"]


class UserOut(OutBase):
    name: str
    email: str
    role: Role
    dept_id: str | None = None
    status: UserStatus
    must_change_password: bool = False
    dept_name: str | None = None
    institution_name: str = ""
    current_term: str = ""


class UserCreate(BaseModel):
    name: str
    email: str
    role: Role
    dept_id: str | None = None


class UserCreateResult(BaseModel):
    user: UserOut
    temporary_password: str


class UserUpdate(BaseModel):
    role: Role | None = None
    dept_id: str | None = None
    status: UserStatus | None = None


class PasswordResetResult(BaseModel):
    temporary_password: str
