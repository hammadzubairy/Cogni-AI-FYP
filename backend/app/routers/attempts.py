from fastapi import APIRouter, Depends, Query

from app.core.deps import CurrentUser, require_role
from app.schemas.attempts import AnswerIn, FlagIn, ForfeitIn, OverrideIn, SubmitIn, ThresholdIn
from app.services import attempts as attempt_service
from app.services import feedback as feedback_service

router = APIRouter(tags=["attempts"])


@router.post("/api/exams/{exam_id}/attempts", status_code=201)
async def start_attempt(exam_id: str, student: CurrentUser = Depends(require_role("student"))):
    return await attempt_service.start_attempt(student, exam_id)


@router.put("/api/attempts/{attempt_id}/answers")
async def save_answer(
    attempt_id: str, payload: AnswerIn, student: CurrentUser = Depends(require_role("student"))
):
    return await attempt_service.save_answer(student, attempt_id, payload.qid, payload.value)


@router.post("/api/attempts/{attempt_id}/submit")
async def submit_attempt(
    attempt_id: str,
    payload: SubmitIn | None = None,
    student: CurrentUser = Depends(require_role("student")),
):
    body = payload or SubmitIn()
    return await attempt_service.submit_attempt(
        student,
        attempt_id,
        end_reason=body.end_reason,
        integrity_events=body.integrity_events,
        violation_count=body.violation_count,
    )


@router.post("/api/attempts/{attempt_id}/forfeit")
async def forfeit_attempt(
    attempt_id: str,
    payload: ForfeitIn | None = None,
    student: CurrentUser = Depends(require_role("student")),
):
    body = payload or ForfeitIn()
    return await attempt_service.forfeit_attempt(
        student,
        attempt_id,
        reason=body.reason,
        integrity_events=body.integrity_events,
        violation_count=body.violation_count,
    )


@router.get("/api/attempts/mine")
async def list_my_attempts(
    exam_id: str | None = Query(default=None),
    student: CurrentUser = Depends(require_role("student")),
):
    return await attempt_service.get_my_attempts(student, exam_id)


@router.get("/api/attempts/{attempt_id}")
async def get_attempt(attempt_id: str, student: CurrentUser = Depends(require_role("student"))):
    return await attempt_service.get_attempt_for_student(student, attempt_id)


@router.get("/api/exams/{exam_id}/results")
async def get_results(exam_id: str, teacher: CurrentUser = Depends(require_role("teacher"))):
    return await attempt_service.get_exam_results(teacher, exam_id)


@router.get("/api/attempts/{attempt_id}/detail")
async def get_attempt_detail(attempt_id: str, teacher: CurrentUser = Depends(require_role("teacher"))):
    return await attempt_service.get_attempt_detail(teacher, attempt_id)


@router.put("/api/exams/{exam_id}/threshold")
async def set_threshold(
    exam_id: str, payload: ThresholdIn, teacher: CurrentUser = Depends(require_role("teacher"))
):
    return await attempt_service.set_threshold(teacher, exam_id, payload.value)


@router.post("/api/attempts/{attempt_id}/flags")
async def set_flag(
    attempt_id: str, payload: FlagIn, teacher: CurrentUser = Depends(require_role("teacher"))
):
    return await attempt_service.set_flag(teacher, attempt_id, payload.qid, payload.decision)


@router.post("/api/attempts/{attempt_id}/override")
async def set_override(
    attempt_id: str, payload: OverrideIn, teacher: CurrentUser = Depends(require_role("teacher"))
):
    return await attempt_service.set_override(teacher, attempt_id, payload.qid, payload.score)


@router.post("/api/exams/{exam_id}/release")
async def release_exam(exam_id: str, teacher: CurrentUser = Depends(require_role("teacher"))):
    return await attempt_service.release_exam(teacher, exam_id)


@router.get("/api/flags")
async def list_flags(teacher: CurrentUser = Depends(require_role("teacher"))):
    return await attempt_service.list_flags(teacher)


@router.get("/api/attempts/{attempt_id}/feedback")
async def get_feedback(
    attempt_id: str, user: CurrentUser = Depends(require_role("student", "teacher"))
):
    return await feedback_service.get_feedback(user, attempt_id)
