from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import OutBase

QuestionType = Literal["MCQ", "Short", "Essay"]
Bloom = Literal["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"]
ExamKind = Literal["Quiz", "Midterm", "Final"]
ExamStatus = Literal["draft", "pending", "returned", "approved", "published", "closed"]


class Keyword(BaseModel):
    label: str
    variants: list[str] = Field(default_factory=list)


class Question(BaseModel):
    qid: str
    type: QuestionType
    bloom: Bloom
    topic: str
    clo: str
    text: str
    options: list[str] | None = None
    answer_index: int | None = None
    model_answer: str = ""
    keywords: list[Keyword] = Field(default_factory=list)
    marks: float
    source_chunk_idx: int | None = None


class HistoryEntry(BaseModel):
    at: datetime
    by: str
    text: str


class ExamOut(OutBase):
    title: str
    class_id: str
    teacher_id: str
    kind: ExamKind
    duration_min: int
    status: ExamStatus
    questions: list[Question] = Field(default_factory=list)
    ai_threshold: int
    released: bool
    hod_comment: str = ""
    request_id: str | None = None
    material_ids: list[str] = Field(default_factory=list)
    history: list[HistoryEntry] = Field(default_factory=list)
    created_at: datetime


class GenerateCounts(BaseModel):
    MCQ: int = 0
    Short: int = 0
    Essay: int = 0


class MarksPerType(BaseModel):
    MCQ: float = Field(default=2, ge=0.5, le=100)
    Short: float = Field(default=5, ge=0.5, le=100)
    Essay: float = Field(default=10, ge=0.5, le=100)


class ExamGenerateRequest(BaseModel):
    class_id: str
    title: str
    kind: ExamKind
    duration_min: int
    material_ids: list[str]
    counts: GenerateCounts
    request_id: str | None = None
    # "suggested": per-type marks (defaults 2/5/10, teacher may edit).
    # "total": spread total_marks across the questions.
    marks_mode: Literal["suggested", "total"] = "suggested"
    marks_per_type: MarksPerType = Field(default_factory=MarksPerType)
    total_marks: float | None = Field(default=None, gt=0, le=1000)


class ExamGenerateResponse(BaseModel):
    exam: ExamOut
    warnings: list[str] = Field(default_factory=list)


class ExamPatch(BaseModel):
    title: str | None = None
    duration_min: int | None = None
    ai_threshold: int | None = None


class QuestionPatch(BaseModel):
    text: str | None = None
    options: list[str] | None = None
    answer_index: int | None = None
    model_answer: str | None = None
    bloom: Bloom | None = None
    marks: float | None = Field(default=None, gt=0, le=100)


class QuestionCreateRequest(BaseModel):
    type: QuestionType


class ApproveRequest(BaseModel):
    comment: str | None = None


class ReturnRequest(BaseModel):
    comment: str


class CheckItem(BaseModel):
    ok: bool
    text: str
    detail: str
