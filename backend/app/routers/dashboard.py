from fastapi import APIRouter, Depends

from app.core.deps import CurrentUser, require_role
from app.schemas.dashboard import (
    HodAnalyticsOut,
    HodDashboardOut,
    StudentDashboardOut,
    TeacherDashboardOut,
)
from app.services import dashboard as dashboard_service

router = APIRouter(tags=["dashboard"])


@router.get("/api/dashboard/teacher", response_model=TeacherDashboardOut)
async def teacher_dashboard(teacher: CurrentUser = Depends(require_role("teacher"))):
    return await dashboard_service.teacher_dashboard(teacher)


@router.get("/api/dashboard/student", response_model=StudentDashboardOut)
async def student_dashboard(student: CurrentUser = Depends(require_role("student"))):
    return await dashboard_service.student_dashboard(student)


@router.get("/api/dashboard/hod", response_model=HodDashboardOut)
async def hod_dashboard(hod: CurrentUser = Depends(require_role("hod"))):
    return await dashboard_service.hod_dashboard(hod)


@router.get("/api/hod/analytics", response_model=HodAnalyticsOut)
async def hod_analytics(hod: CurrentUser = Depends(require_role("hod"))):
    return await dashboard_service.hod_analytics(hod)
