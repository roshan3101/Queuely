from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from queuely.api.auth import get_client_ip, get_current_user, get_user_agent, require_active_user
from queuely.api.dependencies import get_db_session, get_request_id
from queuely.core.responses import ApiResponse
from queuely.models.user import User
from queuely.schemas.auth import (
    AuthResponse,
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    UserCreateRequest,
    UserRead,
)
from queuely.services.auth import (
    authenticate_user,
    register_user,
    revoke_refresh_token,
    rotate_refresh_token,
    serialize_user,
)


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=ApiResponse[AuthResponse], status_code=status.HTTP_201_CREATED)
def register(
    payload: UserCreateRequest,
    request: Request,
    session: Session = Depends(get_db_session),
    request_id: str | None = Depends(get_request_id),
    user_agent: str | None = Depends(get_user_agent),
) -> ApiResponse[AuthResponse]:
    auth_response = register_user(
        session=session,
        payload=payload,
        user_agent=user_agent,
        ip_address=get_client_ip(request),
    )
    return ApiResponse(data=auth_response, request_id=request_id)


@router.post("/login", response_model=ApiResponse[AuthResponse])
def login(
    payload: LoginRequest,
    request: Request,
    session: Session = Depends(get_db_session),
    request_id: str | None = Depends(get_request_id),
    user_agent: str | None = Depends(get_user_agent),
) -> ApiResponse[AuthResponse]:
    auth_response = authenticate_user(
        session=session,
        email=payload.email,
        password=payload.password,
        user_agent=user_agent,
        ip_address=get_client_ip(request),
    )
    return ApiResponse(data=auth_response, request_id=request_id)


@router.post("/refresh", response_model=ApiResponse[AuthResponse])
def refresh(
    payload: RefreshRequest,
    request: Request,
    session: Session = Depends(get_db_session),
    request_id: str | None = Depends(get_request_id),
    user_agent: str | None = Depends(get_user_agent),
) -> ApiResponse[AuthResponse]:
    auth_response = rotate_refresh_token(
        session=session,
        refresh_token=payload.refresh_token,
        user_agent=user_agent,
        ip_address=get_client_ip(request),
    )
    return ApiResponse(data=auth_response, request_id=request_id)


@router.post("/logout", response_model=ApiResponse[dict[str, str]])
def logout(
    payload: LogoutRequest,
    session: Session = Depends(get_db_session),
    request_id: str | None = Depends(get_request_id),
) -> ApiResponse[dict[str, str]]:
    if payload.refresh_token:
        revoke_refresh_token(session, payload.refresh_token)
    return ApiResponse(data={"status": "revoked"}, request_id=request_id)


@router.get("/me", response_model=ApiResponse[UserRead])
def current_user(
    current_user: User = Depends(require_active_user),
    request_id: str | None = Depends(get_request_id),
) -> ApiResponse[UserRead]:
    return ApiResponse(data=serialize_user(current_user), request_id=request_id)
