from pydantic import BaseModel

from app.schemas.activity_log import ActivityLogOut


class UserRoleCounts(BaseModel):
    admin: int
    hod: int
    teacher: int
    student: int


class ExamStatusCounts(BaseModel):
    draft: int
    pending: int
    returned: int
    approved: int
    published: int
    closed: int


class SummaryOut(BaseModel):
    users_by_role: UserRoleCounts
    classes: int
    papers_by_status: ExamStatusCounts
    recent_activity: list[ActivityLogOut]
