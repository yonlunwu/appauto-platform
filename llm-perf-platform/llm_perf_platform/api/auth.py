from fastapi import APIRouter, Depends, Header, HTTPException, status

from llm_perf_platform.api.schemas import (
    AuthResponse,
    LoginRequest,
    ProfileResponse,
    RegisterRequest,
)
from llm_perf_platform.services.auth_service import AuthService

router = APIRouter(prefix="/auth")

auth_service = AuthService()


def get_token(authorization: str = Header(..., alias="Authorization")) -> str:
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_token")
    return authorization.split(" ", 1)[1]


def get_current_user(token: str = Depends(get_token)):
    """获取当前登录用户（依赖注入）"""
    user = auth_service.get_user_by_token(token)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_token")
    return user


@router.post("/register", response_model=AuthResponse)
def register(payload: RegisterRequest):
    try:
        user = auth_service.register_user(email=payload.email, password=payload.password)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="email_exists")

    token = auth_service.create_token(user.id)
    return AuthResponse(user_id=user.id, email=user.email, token=token.token)


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest):
    user = auth_service.authenticate(email=payload.email, password=payload.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_credentials")
    token = auth_service.create_token(user.id)
    return AuthResponse(user_id=user.id, email=user.email, token=token.token)


@router.get("/me", response_model=ProfileResponse)
def profile(token: str = Depends(get_token)):
    user = auth_service.get_user_by_token(token)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_token")
    return ProfileResponse(user_id=user.id, email=user.email, role=user.role, created_at=user.created_at)

