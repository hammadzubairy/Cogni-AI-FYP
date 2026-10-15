from pydantic import BaseModel

from app.schemas.common import OutBase


class DeptPolicy(BaseModel):
    min_clo: int
    higher_order_pct: int
    max_repeats: int


class DepartmentOut(OutBase):
    code: str
    name: str
    hod_id: str | None = None
    policy: DeptPolicy


class DepartmentCreate(BaseModel):
    code: str
    name: str


class DepartmentUpdate(BaseModel):
    hod_id: str | None = None
