from fastapi import APIRouter, Request

from app.core.ratelimit import check_login_rate_limit
from app.schemas.auth import LoginResponse, SetupAdminRequest, TokenUser
from app.services import auth as auth_service
from app.services import setup as setup_service

router = APIRouter(prefix="/api/setup", tags=["setup"])


@router.post("/admin", response_model=LoginResponse, status_code=201)
async def setup_admin(payload: SetupAdminRequest, request: Request):
    check_login_rate_limit(request)
    user = await setup_service.create_first_admin(
        payload.name,
        payload.email,
        payload.password,
        payload.institution_name,
        payload.current_term,
    )
    token, scope = auth_service.issue_tokens_for(user)
    fields = await auth_service.user_public_fields(user)
    return LoginResponse(
        access_token=token,
        scope=scope,
        user=TokenUser(**{k: fields[k] for k in TokenUser.model_fields if k in fields}),
    )
