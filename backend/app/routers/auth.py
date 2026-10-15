from fastapi import APIRouter, Depends, HTTPException, Request, Response

from app.core.deps import CurrentUser, get_current_user
from app.core.ratelimit import check_login_rate_limit
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotRequest,
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    ResetRequest,
    TokenUser,
)
from app.schemas.users import UserOut
from app.services import auth as auth_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _token_user(fields: dict) -> TokenUser:
    return TokenUser(**{k: fields[k] for k in TokenUser.model_fields if k in fields})


@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest, request: Request):
    check_login_rate_limit(request)
    try:
        user = await auth_service.authenticate(payload.email, payload.password)
    except auth_service.AuthError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail, headers=e.headers or None)

    token, scope = auth_service.issue_tokens_for(user)
    fields = await auth_service.user_public_fields(user)
    return LoginResponse(access_token=token, scope=scope, user=_token_user(fields))


@router.get("/me", response_model=UserOut)
async def me(current: CurrentUser = Depends(get_current_user)):
    if current.scope == "change_password":
        raise HTTPException(
            status_code=403, detail="Change your password before continuing."
        )
    from app.core.db import get_db, oid

    doc = await get_db().users.find_one({"_id": oid(current.id)})
    fields = await auth_service.user_public_fields(doc)
    return UserOut(**fields)


@router.post("/change-password", response_model=LoginResponse)
async def change_password(
    payload: ChangePasswordRequest, current: CurrentUser = Depends(get_current_user)
):
    user = await auth_service.change_password(
        current.id, payload.current_password, payload.new_password
    )
    token, scope = auth_service.issue_tokens_for(user)
    fields = await auth_service.user_public_fields(user)
    return LoginResponse(access_token=token, scope=scope, user=_token_user(fields))


@router.post("/register", response_model=LoginResponse, status_code=201)
async def register(payload: RegisterRequest, request: Request):
    check_login_rate_limit(request)
    user = await auth_service.register_user(
        payload.name,
        payload.email,
        payload.password,
        role=payload.role,
        dept_id=payload.dept_id,
    )
    token, scope = auth_service.issue_tokens_for(user)
    fields = await auth_service.user_public_fields(user)
    return LoginResponse(access_token=token, scope=scope, user=_token_user(fields))


@router.post("/forgot", status_code=202)
async def forgot(payload: ForgotRequest, request: Request):
    check_login_rate_limit(request)
    await auth_service.forgot_password(payload.email)
    return {"status": "ok"}


@router.post("/reset", status_code=204)
async def reset(payload: ResetRequest):
    await auth_service.reset_password_with_token(payload.token, payload.new_password)
    return Response(status_code=204)
