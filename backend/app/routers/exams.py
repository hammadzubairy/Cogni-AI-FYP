from fastapi import APIRouter, Depends, Query

from app.core.deps import CurrentUser, get_current_user, require_role
from app.core.ratelimit import check_llm_rate_limit
from app.schemas.exams import (
    ApproveRequest,
    ExamGenerateRequest,
    ExamPatch,
    QuestionCreateRequest,
    QuestionPatch,
    ReturnRequest,
)
from app.services import exams as exam_service

router = APIRouter(prefix="/api/exams", tags=["exams"])


@router.post("/generate", status_code=201)
async def generate_exam(
    payload: ExamGenerateRequest, teacher: CurrentUser = Depends(require_role("teacher"))
):
    check_llm_rate_limit(teacher)
    exam, warnings = await exam_service.generate_exam(teacher, payload)
    return {"exam": exam, "warnings": warnings}


@router.get("")
async def list_exams(
    status: str | None = Query(default=None),
    class_id: str | None = Query(default=None),
    user: CurrentUser = Depends(get_current_user),
):
    return await exam_service.list_exams(user, status, class_id)


@router.get("/{exam_id}")
async def get_exam(exam_id: str, user: CurrentUser = Depends(get_current_user)):
    return await exam_service.get_exam(user, exam_id)


@router.patch("/{exam_id}")
async def update_exam(
    exam_id: str, payload: ExamPatch, teacher: CurrentUser = Depends(require_role("teacher"))
):
    return await exam_service.update_exam(teacher, exam_id, payload)


@router.delete("/{exam_id}", status_code=204)
async def delete_exam(exam_id: str, teacher: CurrentUser = Depends(require_role("teacher"))):
    await exam_service.delete_exam(teacher, exam_id)


@router.patch("/{exam_id}/questions/{qid}")
async def update_question(
    exam_id: str,
    qid: str,
    payload: QuestionPatch,
    teacher: CurrentUser = Depends(require_role("teacher")),
):
    return await exam_service.update_question(teacher, exam_id, qid, payload)


@router.delete("/{exam_id}/questions/{qid}")
async def delete_question(
    exam_id: str, qid: str, teacher: CurrentUser = Depends(require_role("teacher"))
):
    return await exam_service.delete_question(teacher, exam_id, qid)


@router.post("/{exam_id}/questions/{qid}/regenerate")
async def regenerate_question(
    exam_id: str, qid: str, teacher: CurrentUser = Depends(require_role("teacher"))
):
    check_llm_rate_limit(teacher)
    return await exam_service.regenerate_question(teacher, exam_id, qid)


@router.post("/{exam_id}/questions", status_code=201)
async def add_question(
    exam_id: str,
    payload: QuestionCreateRequest,
    teacher: CurrentUser = Depends(require_role("teacher")),
):
    exam, warnings = await exam_service.add_question(
        teacher, exam_id, payload.type, format_=payload.format
    )
    return {"exam": exam, "warnings": warnings}


@router.post("/{exam_id}/submit")
async def submit_exam(exam_id: str, teacher: CurrentUser = Depends(require_role("teacher"))):
    return await exam_service.submit_exam(teacher, exam_id)


@router.post("/{exam_id}/withdraw")
async def withdraw_exam(exam_id: str, teacher: CurrentUser = Depends(require_role("teacher"))):
    return await exam_service.withdraw_exam(teacher, exam_id)


@router.post("/{exam_id}/publish")
async def publish_exam(exam_id: str, teacher: CurrentUser = Depends(require_role("teacher"))):
    return await exam_service.publish_exam(teacher, exam_id)


@router.post("/{exam_id}/close")
async def close_exam(exam_id: str, teacher: CurrentUser = Depends(require_role("teacher"))):
    return await exam_service.close_exam(teacher, exam_id)


@router.post("/{exam_id}/approve")
async def approve_exam(
    exam_id: str, payload: ApproveRequest, hod: CurrentUser = Depends(require_role("hod"))
):
    return await exam_service.approve_exam(hod, exam_id, payload.comment)


@router.post("/{exam_id}/return")
async def return_exam(
    exam_id: str, payload: ReturnRequest, hod: CurrentUser = Depends(require_role("hod"))
):
    return await exam_service.return_exam(hod, exam_id, payload.comment)


@router.get("/{exam_id}/checks")
async def get_checks(exam_id: str, user: CurrentUser = Depends(get_current_user)):
    return await exam_service.get_checks(user, exam_id)
