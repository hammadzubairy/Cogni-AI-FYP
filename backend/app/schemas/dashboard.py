from datetime import datetime

from pydantic import BaseModel

from app.schemas.classes import ClassOut
from app.schemas.requests import RequestOut


class ExamSummary(BaseModel):
    id: str
    title: str
    class_id: str
    class_code: str
    kind: str
    status: str
    question_count: int
    hod_comment: str = ""
    created_at: datetime


class RecentSubmission(BaseModel):
    attempt_id: str
    exam_id: str
    exam_title: str
    student_id: str
    student_name: str
    submitted_at: datetime


class TeacherDashboardOut(BaseModel):
    classes: list[ClassOut]
    open_requests: list[RequestOut]
    draft_exams: list[ExamSummary]
    returned_exams: list[ExamSummary]
    approved_exams: list[ExamSummary]
    live_exams: list[ExamSummary]
    undecided_flags: int
    recent_submissions: list[RecentSubmission]
    stats: dict[str, int]


class LiveExamForStudent(BaseModel):
    id: str
    title: str
    class_id: str
    class_code: str
    kind: str
    duration_min: int
    question_count: int
    in_progress: bool


class ReleasedResult(BaseModel):
    attempt_id: str
    exam_id: str
    exam_title: str
    percent: int
    submitted_at: datetime


class StudentDashboardOut(BaseModel):
    classes: list[ClassOut]
    live_exams: list[LiveExamForStudent]
    released_results: list[ReleasedResult]
    recent_notifications: list[dict]


class PendingApproval(BaseModel):
    id: str
    title: str
    class_id: str
    class_code: str
    teacher_name: str
    kind: str
    failed_checks: int
    created_at: datetime


class HodDashboardOut(BaseModel):
    pending_approvals: list[PendingApproval]
    open_requests: list[RequestOut]
    stats: dict[str, int | None]


class ClassAnalyticsRow(BaseModel):
    class_id: str
    class_code: str
    class_name: str
    teacher_name: str
    exam_count: int
    submission_count: int
    average_percent: int | None
    weakest_topic: dict | None


class CloAverage(BaseModel):
    clo: str
    average_percent: int | None


class TeacherActivityRow(BaseModel):
    teacher_id: str
    teacher_name: str
    papers_by_status: dict[str, int]
    flags_pending: int
    flags_total: int


class HodAnalyticsOut(BaseModel):
    by_class: list[ClassAnalyticsRow]
    by_clo: list[CloAverage]
    weakest_topics: list[dict]
    teacher_activity: list[TeacherActivityRow]
