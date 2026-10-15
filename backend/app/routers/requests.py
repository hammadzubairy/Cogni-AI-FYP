from fastapi import APIRouter, Depends

from app.core.deps import CurrentUser, require_role
from app.schemas.departments import DeptPolicy
from app.schemas.exams import ExamOut
from app.schemas.requests import RequestCreate, RequestOut
from app.services import departments as dept_service
from app.services import exams as exam_service
from app.services import requests as request_service

router = APIRouter(tags=["requests"])


@router.get("/api/requests", response_model=list[RequestOut])
async def list_requests(user: CurrentUser = Depends(require_role("teacher", "hod"))):
    return await request_service.list_requests(user)


@router.post("/api/requests", response_model=RequestOut, status_code=201)
async def create_request(payload: RequestCreate, hod: CurrentUser = Depends(require_role("hod"))):
    return await request_service.create_request(
        hod, payload.teacher_id, payload.class_id, payload.kind, payload.due, payload.note
    )


@router.get("/api/hod/policy", response_model=DeptPolicy)
async def get_policy(hod: CurrentUser = Depends(require_role("hod"))):
    return await dept_service.get_policy(hod.dept_id)


@router.put("/api/hod/policy", response_model=DeptPolicy)
async def update_policy(payload: DeptPolicy, hod: CurrentUser = Depends(require_role("hod"))):
    return await dept_service.update_policy(hod, hod.dept_id, payload.model_dump())


@router.get("/api/hod/approvals", response_model=list[ExamOut])
async def list_approvals(hod: CurrentUser = Depends(require_role("hod"))):
    return await exam_service.list_hod_approvals(hod)
