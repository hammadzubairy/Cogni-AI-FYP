from fastapi import APIRouter, Depends

from app.core.deps import CurrentUser, get_current_user, require_role
from app.schemas.classes import (
    AddStudentRequest,
    ClassCreate,
    ClassOut,
    JoinClassRequest,
)
from app.services import classes as class_service

router = APIRouter(prefix="/api/classes", tags=["classes"])


@router.get("", response_model=list[ClassOut])
async def list_classes(user: CurrentUser = Depends(get_current_user)):
    return await class_service.list_classes(user)


@router.post("", response_model=ClassOut, status_code=201)
async def create_class(
    payload: ClassCreate, teacher: CurrentUser = Depends(require_role("teacher"))
):
    return await class_service.create_class(
        teacher, payload.name, payload.code, payload.content_library
    )


@router.post("/join", response_model=ClassOut)
async def join_class(
    payload: JoinClassRequest, student: CurrentUser = Depends(require_role("student"))
):
    return await class_service.join_class(student, payload.join_code)


@router.get("/{class_id}", response_model=ClassOut)
async def get_class(class_id: str, user: CurrentUser = Depends(get_current_user)):
    return await class_service.get_class(user, class_id)


@router.post("/{class_id}/students", response_model=ClassOut)
async def add_student(
    class_id: str,
    payload: AddStudentRequest,
    teacher: CurrentUser = Depends(require_role("teacher")),
):
    return await class_service.add_student(teacher, class_id, payload.email)


@router.delete("/{class_id}/students/{student_id}", status_code=204)
async def remove_student(
    class_id: str, student_id: str, teacher: CurrentUser = Depends(require_role("teacher"))
):
    await class_service.remove_student(teacher, class_id, student_id)
