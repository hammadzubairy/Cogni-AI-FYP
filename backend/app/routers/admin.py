from fastapi import APIRouter, Depends

from app.core.deps import CurrentUser, require_role
from app.schemas.activity_log import ActivityLogOut
from app.schemas.admin import SummaryOut
from app.schemas.classes import ClassOut, ClassUpdate
from app.schemas.departments import DepartmentCreate, DepartmentOut, DepartmentUpdate
from app.schemas.settings import SettingsOut, SettingsUpdate
from app.schemas.users import PasswordResetResult, UserCreate, UserCreateResult, UserOut, UserUpdate
from app.services import admin as admin_service
from app.services import classes as class_service
from app.services import departments as dept_service
from app.services import settings as settings_service
from app.services import users as user_service

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/users", response_model=list[UserOut])
async def list_users(
    role: str | None = None,
    q: str | None = None,
    admin: CurrentUser = Depends(require_role("admin")),
):
    return await user_service.list_users(role, q)


@router.post("/users", response_model=UserCreateResult, status_code=201)
async def create_user(payload: UserCreate, admin: CurrentUser = Depends(require_role("admin"))):
    user, temporary_password = await user_service.create_user(
        admin, payload.name, payload.email, payload.role, payload.dept_id
    )
    return UserCreateResult(
        user=UserOut.model_validate(user), temporary_password=temporary_password
    )


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: str, payload: UserUpdate, admin: CurrentUser = Depends(require_role("admin"))
):
    return await user_service.update_user(admin, user_id, payload.model_dump(exclude_unset=True))


@router.post("/users/{user_id}/reset-password", response_model=PasswordResetResult)
async def reset_password(user_id: str, admin: CurrentUser = Depends(require_role("admin"))):
    temporary_password = await user_service.reset_password(admin, user_id)
    return PasswordResetResult(temporary_password=temporary_password)


@router.get("/departments", response_model=list[DepartmentOut])
async def list_departments(admin: CurrentUser = Depends(require_role("admin"))):
    return await dept_service.list_departments()


@router.post("/departments", response_model=DepartmentOut, status_code=201)
async def create_department(
    payload: DepartmentCreate, admin: CurrentUser = Depends(require_role("admin"))
):
    return await dept_service.create_department(admin, payload.code, payload.name)


@router.patch("/departments/{dept_id}", response_model=DepartmentOut)
async def update_department(
    dept_id: str, payload: DepartmentUpdate, admin: CurrentUser = Depends(require_role("admin"))
):
    return await dept_service.set_hod(admin, dept_id, payload.hod_id)


@router.get("/classes", response_model=list[ClassOut])
async def list_classes(admin: CurrentUser = Depends(require_role("admin"))):
    return await class_service.list_classes(admin)


@router.patch("/classes/{class_id}", response_model=ClassOut)
async def reassign_class(
    class_id: str, payload: ClassUpdate, admin: CurrentUser = Depends(require_role("admin"))
):
    return await class_service.reassign_teacher(admin, class_id, payload.teacher_id)


@router.get("/settings", response_model=SettingsOut)
async def get_settings(admin: CurrentUser = Depends(require_role("admin"))):
    return await settings_service.get_settings()


@router.put("/settings", response_model=SettingsOut)
async def update_settings(
    payload: SettingsUpdate, admin: CurrentUser = Depends(require_role("admin"))
):
    return await settings_service.update_settings(admin, payload.model_dump(exclude_unset=True))


@router.get("/activity", response_model=list[ActivityLogOut])
async def activity(
    role: str | None = None, limit: int = 50, admin: CurrentUser = Depends(require_role("admin"))
):
    return await admin_service.list_activity(role, limit)


@router.get("/summary", response_model=SummaryOut)
async def summary(admin: CurrentUser = Depends(require_role("admin"))):
    return await admin_service.summary()


@router.get("/onboarding")
async def onboarding(admin: CurrentUser = Depends(require_role("admin"))):
    return await admin_service.onboarding()


@router.get("/llm-status")
async def llm_status(admin: CurrentUser = Depends(require_role("admin"))):
    return await admin_service.llm_status()
