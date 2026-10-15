from pydantic import BaseModel


class AskRequest(BaseModel):
    question: str


class AskSource(BaseModel):
    page: str | None = None
    heading: str | None = None


class AskResponse(BaseModel):
    answer: str
    sources: list[AskSource]
