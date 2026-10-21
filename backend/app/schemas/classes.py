from pydantic import BaseModel, Field

from app.schemas.common import OutBase


class ClassStudentOut(BaseModel):
    id: str
    name: str
    email: str


class ClassOut(OutBase):
    code: str
    name: str
    teacher_id: str
    dept_id: str
    student_ids: list[str] = Field(default_factory=list)
    students: list[ClassStudentOut] = Field(default_factory=list)
    join_code: str
    clos: list[str] = Field(default_factory=list)
    section: str
    student_count: int | None = None
    exam_count: int | None = None


class ClassCreate(BaseModel):
    name: str
    code: str
    content_library: str | None = None


class ClassUpdate(BaseModel):
    teacher_id: str


class AddStudentRequest(BaseModel):
    email: str


class JoinClassRequest(BaseModel):
    join_code: str
