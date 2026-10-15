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


class ExamGenerateRequest(BaseModel):
    class_id: str
    title: str
    kind: ExamKind
    duration_min: int
    material_ids: list[str]
    counts: GenerateCounts
    request_id: str | None = None


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
    marks: float | None = None


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
