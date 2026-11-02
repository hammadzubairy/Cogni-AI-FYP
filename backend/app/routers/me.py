from fastapi import APIRouter, Depends

from app.core.deps import CurrentUser, require_role
from app.schemas.llm_settings import TeacherLlmSettingsOut, TeacherLlmSettingsUpdate
from app.services import llm_settings as llm_settings_service

router = APIRouter(prefix="/api/me", tags=["me"])


@router.get("/llm", response_model=TeacherLlmSettingsOut)
async def get_my_llm(teacher: CurrentUser = Depends(require_role("teacher"))):
    return await llm_settings_service.get_teacher_llm_settings(teacher)


@router.put("/llm", response_model=TeacherLlmSettingsOut)
async def put_my_llm(
    payload: TeacherLlmSettingsUpdate,
    teacher: CurrentUser = Depends(require_role("teacher")),
):
    return await llm_settings_service.update_teacher_llm_settings(teacher, payload)
