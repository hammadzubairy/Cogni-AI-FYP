from typing import Literal

from pydantic import BaseModel, Field

ApprovalPolicy = Literal["all", "major", "none"]


class SettingsOut(BaseModel):
    approval: ApprovalPolicy = "major"
    max_upload_mb: int = 25
    ai_threshold_default: int = 70
    institution_name: str = ""
    current_term: str = ""
    student_signup_enabled: bool = True
    allowed_email_domains: list[str] = Field(default_factory=list)


class SettingsUpdate(BaseModel):
    approval: ApprovalPolicy | None = None
    max_upload_mb: int | None = None
    ai_threshold_default: int | None = None
    institution_name: str | None = None
    current_term: str | None = None
    student_signup_enabled: bool | None = None
    allowed_email_domains: list[str] | None = None
