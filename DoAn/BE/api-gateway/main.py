from fastapi import FastAPI, Request, Depends
from fastapi.responses import JSONResponse
import httpx
from auth_middleware import verify_token

app = FastAPI(dependencies=[Depends(verify_token)])

SERVICES = {
    "sites": "http://site-service:8002",
    "audio": "http://translation-service:8001",
    "users": "http://user-service:8003"
}

@app.api_route("/api/{service}/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def gateway_route(service: str, path: str, request: Request):
    if service not in SERVICES:
        return JSONResponse(status_code=404, content={"message": "Service not found"})
    
    url = f"{SERVICES[service]}/api/{service}/{path}"
    async with httpx.AsyncClient() as client:
        body = await request.body()
        response = await client.request(
            method=request.method,
            url=url,
            headers=dict(request.headers),
            content=body,
            params=request.query_params
        )
        return JSONResponse(status_code=response.status_code, content=response.json())