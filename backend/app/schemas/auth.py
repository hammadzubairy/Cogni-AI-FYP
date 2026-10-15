from pydantic import BaseModel, Field

from app.schemas.users import Role, UserStatus


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenUser(BaseModel):
    id: str
    name: str
    email: str
    role: Role
    dept_id: str | None = None
    status: UserStatus = "active"
    must_change_password: bool = False
    dept_name: str | None = None
    institution_name: str = ""
    current_term: str = ""


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    scope: str | None = None
    user: TokenUser


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    # Accepted only as "student" for backwards-compatible clients; staff roles are rejected.
    role: Role = "student"


class RegisterPendingOut(BaseModel):
    status: str = "pending_verification"
    message: str = "Check your email to verify your account before signing in."
    email: str


class PublicDepartmentOut(BaseModel):
    id: str
    code: str
    name: str


class ForgotRequest(BaseModel):
    email: str


class VerifyEmailRequest(BaseModel):
    token: str


class ResendVerificationRequest(BaseModel):
    email: str


class ResetRequest(BaseModel):
    token: str
    new_password: str


class SetupAdminRequest(BaseModel):
    name: str
    email: str
    password: str
    institution_name: str = ""
    current_term: str = ""


class PublicConfigOut(BaseModel):
    needs_setup: bool
    institution_name: str = ""
    current_term: str = ""
    student_signup_enabled: bool = True


class TemporaryPasswordOut(BaseModel):
    temporary_password: str = Field(
        ..., description="Shown once; never stored in plaintext."
    )
