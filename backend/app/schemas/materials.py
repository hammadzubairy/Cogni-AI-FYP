from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import OutBase


class MaterialChunk(BaseModel):
    idx: int
    page: str | None = None
    heading: str | None = None
    text: str


class MaterialOut(OutBase):
    class_id: str
    owner_id: str | None = None
    name: str
    kind: Literal["pdf", "text"]
    text: str
    chunks: list[MaterialChunk] = Field(default_factory=list)
    created_at: datetime


class MaterialSummaryOut(OutBase):
    class_id: str
    owner_id: str | None = None
    name: str
    kind: Literal["pdf", "text"]
    chunk_count: int
    word_count: int
    created_at: datetime
