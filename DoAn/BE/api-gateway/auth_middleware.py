from fastapi import Request, HTTPException
import jwt

SECRET_KEY = "your_secret_key"

async def verify_token(request: Request):
    # Bỏ qua xác thực cho các route đăng nhập/đăng ký
    if request.url.path in ["/api/users/login", "/api/users/register", "/api/sites/sync-location"]:
        return
    
    token = request.headers.get("Authorization")
    if not token:
        raise HTTPException(status_code=401, detail="Missing Token")
    try:
        jwt.decode(token.split(" ")[1], SECRET_KEY, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid Token")