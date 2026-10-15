from fastapi import APIRouter

from app.schemas.auth import PublicConfigOut, PublicDepartmentOut
from app.services import departments as dept_service
from app.services import settings as settings_service
from app.services import setup as setup_service

router = APIRouter(prefix="/api/public", tags=["public"])


@router.get("/config", response_model=PublicConfigOut)
async def public_config():
    s = await settings_service.get_settings()
    return PublicConfigOut(
        needs_setup=await setup_service.needs_setup(),
        institution_name=s.get("institution_name") or "",
        current_term=s.get("current_term") or "",
        student_signup_enabled=bool(s.get("student_signup_enabled", True)),
    )


@router.get("/departments", response_model=list[PublicDepartmentOut])
async def public_departments():
    """Minimal department list for the self-signup form (no HOD/policy)."""
    depts = await dept_service.list_departments()
    return [
        PublicDepartmentOut(id=d["id"], code=d["code"], name=d["name"]) for d in depts
    ]
