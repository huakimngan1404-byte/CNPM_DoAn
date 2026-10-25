from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from business.admin_auth_service import AdminAuthService


router = APIRouter(prefix="/api/auth")
service = AdminAuthService()


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=1024)


class CredentialsUpdate(BaseModel):
    current_password: str = Field(min_length=1, max_length=1024)
    username: str = Field(min_length=3, max_length=128)
    new_password: str = Field(min_length=8, max_length=1024)


async def require_admin(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Vui lòng đăng nhập quản trị.")
    account = await service.authenticate(authorization[7:].strip())
    if not account:
        raise HTTPException(status_code=401, detail="Phiên đăng nhập không hợp lệ hoặc đã hết hạn.")
    return account


@router.post("/login")
async def login(data: LoginRequest):
    try:
        return await service.login(data.username, data.password)
    except ValueError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error


@router.put("/credentials")
async def update_credentials(
    data: CredentialsUpdate,
    account=Depends(require_admin),
):
    try:
        return await service.update_credentials(
            data.current_password,
            data.username,
            data.new_password,
        )
    except ValueError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error
