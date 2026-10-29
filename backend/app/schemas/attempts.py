from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import OutBase

AttemptStatus = Literal["in_progress", "submitted"]
FlagDecision = Literal["cleared", "discuss"]
EndReason = Literal["manual", "time_up", "exit", "violations"]
ForfeitReason = Literal["exit", "violations"]
IntegrityEventType = Literal[
    "tab_hide",
    "window_blur",
    "fullscreen_exit",
    "exit",
    "violations",
]


class QuestionResult(BaseModel):
    score: float
    max: float
    similarity: int | None = None
    key_points_hit: list[str] = []
    key_points_missed: list[str] = []
    reason: str = ""
    ai_probability: float | None = None
    fallback: bool = False


class IntegrityEvent(BaseModel):
    type: IntegrityEventType
    at: datetime


class AttemptOut(OutBase):
    exam_id: str
    student_id: str
    status: AttemptStatus
    started_at: datetime
    submitted_at: datetime | None = None
    answers: dict[str, int | str] = Field(default_factory=dict)
    results: dict[str, QuestionResult] = Field(default_factory=dict)
    flags: dict[str, FlagDecision] = Field(default_factory=dict)
    overrides: dict[str, float] = Field(default_factory=dict)
    end_reason: EndReason | None = None
    violation_count: int = 0
    integrity_events: list[IntegrityEvent] = Field(default_factory=list)


class AttemptStartOut(AttemptOut):
    deadline: datetime
    server_now: datetime


class AnswerIn(BaseModel):
    qid: str
    value: int | str


class SubmitIn(BaseModel):
    end_reason: EndReason = "manual"
    integrity_events: list[IntegrityEvent] = Field(default_factory=list)
    violation_count: int | None = Field(default=None, ge=0)


class ForfeitIn(BaseModel):
    reason: ForfeitReason = "exit"
    integrity_events: list[IntegrityEvent] = Field(default_factory=list)
    violation_count: int | None = Field(default=None, ge=0)


class FlagIn(BaseModel):
    qid: str
    decision: FlagDecision


class OverrideIn(BaseModel):
    qid: str
    score: float


class ThresholdIn(BaseModel):
    value: int = Field(ge=50, le=95)
