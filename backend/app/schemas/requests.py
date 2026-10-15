from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.schemas.common import OutBase

RequestStatus = Literal["open", "submitted", "approved"]


class RequestOut(OutBase):
    hod_id: str
    teacher_id: str
    class_id: str
    kind: str
    due: datetime
    note: str
    status: RequestStatus
    exam_id: str | None = None


class RequestCreate(BaseModel):
    teacher_id: str
    class_id: str
    kind: str
    due: datetime
    note: str = ""
