from datetime import datetime
from typing import Literal, Self

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import OutBase

QuestionFormat = Literal["mcq", "written"]
Bloom = Literal["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"]
ExamKind = Literal["Quiz", "Midterm", "Final"]
ExamStatus = Literal["draft", "pending", "returned", "approved", "published", "closed"]

# Legacy fixed labels kept for older clients/tests.
LEGACY_LABELS = ("MCQ", "Short", "Essay")


class Keyword(BaseModel):
    label: str
    variants: list[str] = Field(default_factory=list)


class Question(BaseModel):
    qid: str
    type: str = Field(min_length=1, max_length=40)
    format: QuestionFormat | None = None
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

    @model_validator(mode="after")
    def _default_format(self) -> Self:
        if self.format in ("mcq", "written"):
            return self
        if self.type == "MCQ" or (isinstance(self.options, list) and self.options):
            self.format = "mcq"
        else:
            self.format = "written"
        return self


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
    """Legacy fixed-key counts. Prefer `types` on ExamGenerateRequest."""

    MCQ: int = 0
    Short: int = 0
    Essay: int = 0


class MarksPerType(BaseModel):
    """Legacy fixed-key marks. Prefer per-row marks on `types`."""

    MCQ: float = Field(default=2, ge=0.5, le=100)
    Short: float = Field(default=5, ge=0.5, le=100)
    Essay: float = Field(default=10, ge=0.5, le=100)


class QuestionTypeSpec(BaseModel):
    label: str = Field(min_length=1, max_length=40)
    count: int = Field(default=0, ge=0, le=40)
    format: QuestionFormat = "written"
    marks: float = Field(default=5, ge=0.5, le=100)

    @field_validator("label")
    @classmethod
    def _strip_label(cls, v: str) -> str:
        label = (v or "").strip()
        if not label:
            raise ValueError("label must not be empty")
        return label[:40]


class ExamGenerateRequest(BaseModel):
    class_id: str
    title: str
    kind: ExamKind
    duration_min: int
    material_ids: list[str]
    types: list[QuestionTypeSpec] | None = None
    # Legacy shape — translated into `types` when `types` is omitted.
    counts: GenerateCounts | None = None
    request_id: str | None = None
    # "suggested": per-type marks (teacher may edit).
    # "total": spread total_marks across the questions.
    marks_mode: Literal["suggested", "total"] = "suggested"
    marks_per_type: MarksPerType | None = None
    total_marks: float | None = Field(default=None, gt=0, le=1000)

    @model_validator(mode="after")
    def _normalize_types(self) -> Self:
        if self.types:
            labels = [t.label for t in self.types]
            if len(labels) != len(set(labels)):
                raise ValueError("Question type labels must be unique.")
            return self
        if self.counts is None:
            raise ValueError("Provide types or legacy counts.")
        marks = self.marks_per_type or MarksPerType()
        self.types = [
            QuestionTypeSpec(label="MCQ", count=self.counts.MCQ, format="mcq", marks=marks.MCQ),
            QuestionTypeSpec(
                label="Short", count=self.counts.Short, format="written", marks=marks.Short
            ),
            QuestionTypeSpec(
                label="Essay", count=self.counts.Essay, format="written", marks=marks.Essay
            ),
        ]
        return self

    def counts_map(self) -> dict[str, int]:
        assert self.types is not None
        return {t.label: t.count for t in self.types if t.count > 0}

    def marks_map(self) -> dict[str, float]:
        assert self.types is not None
        return {t.label: t.marks for t in self.types}

    def format_map(self) -> dict[str, QuestionFormat]:
        assert self.types is not None
        return {t.label: t.format for t in self.types}


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
    type: str | None = Field(default=None, min_length=1, max_length=40)
    format: QuestionFormat | None = None


class QuestionCreateRequest(BaseModel):
    type: str = Field(min_length=1, max_length=40)
    format: QuestionFormat | None = None

    @field_validator("type")
    @classmethod
    def _strip_type(cls, v: str) -> str:
        label = (v or "").strip()
        if not label:
            raise ValueError("type must not be empty")
        return label[:40]

    @model_validator(mode="after")
    def _default_format(self) -> Self:
        if self.format in ("mcq", "written"):
            return self
        self.format = "mcq" if self.type == "MCQ" else "written"
        return self


class ApproveRequest(BaseModel):
    comment: str | None = None


class ReturnRequest(BaseModel):
    comment: str


class CheckItem(BaseModel):
    ok: bool
    text: str
    detail: str
