import os
from uuid import UUID
from typing import Literal
from urllib.parse import quote

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from business.site_service import SiteService
from presentation.auth_router import require_admin

router = APIRouter(prefix="/api/sites")
visitor_router = APIRouter(prefix="/api/visitors")
listen_router = APIRouter(prefix="/api/listens")
language_router = APIRouter(prefix="/api/languages")
narration_router = APIRouter(prefix="/api/narrations")
service = SiteService()
translation_service_url = os.getenv(
    "TRANSLATION_SERVICE_URL",
    "http://localhost:8001",
).rstrip("/")

# --- MODEL REQUEST ---
class GPSData(BaseModel):
    user_id: str
    lat: float
    lng: float
    lang: str = "vi"

class VisitorSession(BaseModel):
    session_id: UUID

class ListenEvent(BaseModel):
    site_code: str = Field(min_length=2, max_length=100, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    language: str = Field(min_length=2, max_length=10, pattern=r"^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$")
    device: Literal["web", "android", "ios"]

class SiteAdminForm(BaseModel):
    code: str = Field(min_length=2, max_length=100, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    name: str = Field(min_length=2, max_length=200)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    address: str = Field(min_length=2, max_length=300)
    category: str = Field(min_length=2, max_length=100)
    description: str = Field(default="", max_length=20000)
    is_active: bool = True

class SiteAdminUpdate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    address: str = Field(min_length=2, max_length=300)
    category: str = Field(min_length=2, max_length=100)
    description: str = Field(min_length=10, max_length=20000)
    is_active: bool = True

class SiteGeofenceRadiusUpdate(BaseModel):
    geofence_radius: float = Field(ge=10, le=1000)

class LanguageAdminForm(BaseModel):
    code: str = Field(min_length=2, max_length=35, pattern=r"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$")
    name: str = Field(min_length=1, max_length=100)
    flag: str = Field(min_length=1, max_length=16)

class LanguageAdminUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    flag: str = Field(min_length=1, max_length=16)
    is_active: bool

class NarrationAdminCreate(BaseModel):
    site_code: str = Field(min_length=2, max_length=100, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    lang: str = Field(min_length=2, max_length=35, pattern=r"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$")
    description: str = Field(min_length=10, max_length=20000)

class NarrationAdminUpdate(BaseModel):
    description: str = Field(min_length=10, max_length=20000)

# --- CONTROLLERS ---

@language_router.get("/")
async def get_active_languages():
    return await service.get_languages(active_only=True)

@language_router.get("/admin", dependencies=[Depends(require_admin)])
async def get_admin_languages():
    return await service.get_languages()

@language_router.post("/", status_code=201, dependencies=[Depends(require_admin)])
async def create_language(data: LanguageAdminForm):
    try:
        await service.add_language(data.code, data.name.strip(), data.flag.strip())
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return {"status": "success"}

@language_router.put("/{code}", dependencies=[Depends(require_admin)])
async def update_language(code: str, data: LanguageAdminUpdate):
    try:
        await service.update_language(code, data.name.strip(), data.flag.strip(), data.is_active)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return {"status": "success"}

@language_router.delete("/{code}", status_code=204, dependencies=[Depends(require_admin)])
async def delete_language(code: str):
    try:
        await service.delete_language(code)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

@narration_router.get("/admin", dependencies=[Depends(require_admin)])
async def get_admin_narrations():
    return await service.get_admin_narrations()

@narration_router.post("/", status_code=201, dependencies=[Depends(require_admin)])
async def create_narration(data: NarrationAdminCreate):
    try:
        await service.save_narration(data.site_code, data.lang, data.description.strip())
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return {"status": "success"}

@narration_router.put("/{site_code}/{lang}", dependencies=[Depends(require_admin)])
async def update_narration(site_code: str, lang: str, data: NarrationAdminUpdate):
    try:
        await service.save_narration(
            site_code,
            lang,
            data.description.strip(),
            require_existing=True,
        )
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return {"status": "success"}

@narration_router.delete("/{site_code}/{lang}", status_code=204, dependencies=[Depends(require_admin)])
async def delete_narration(site_code: str, lang: str):
    try:
        await service.delete_narration(site_code, lang)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

@visitor_router.post("/heartbeat", status_code=204)
async def heartbeat_visitor(data: VisitorSession):
    await service.heartbeat_visitor(str(data.session_id))

@visitor_router.post("/leave", status_code=204)
async def leave_visitor(data: VisitorSession):
    await service.leave_visitor(str(data.session_id))

@visitor_router.get("/active", dependencies=[Depends(require_admin)])
async def get_active_visitors():
    return {"active_visitors": await service.get_active_visitor_count()}

@listen_router.post("/", status_code=201)
async def record_listen(data: ListenEvent):
    try:
        await service.record_listen(data.site_code, data.language, data.device)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return {"status": "recorded"}

@listen_router.get("/stats", dependencies=[Depends(require_admin)])
async def get_listen_stats(
    period: Literal["day", "month"] = "month",
    date: str | None = None,
    device: Literal["all", "web", "android", "ios"] = "all",
):
    try:
        return await service.get_listen_stats(period, date, device)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

@router.post("/sync-location")
async def sync_location(data: GPSData):
    # API Gateway chuyển tiếp về đây
    return await service.process_gps(data.user_id, data.lat, data.lng, data.lang)

@router.get("/")
async def get_sites():
    sites = await service.get_sites()
    return [
        {**site, "_id": str(site["_id"])}
        for site in sites
    ]

def to_site_document(data: SiteAdminForm | SiteAdminUpdate, code: str):
    return {
        "code": code,
        "name": data.name,
        "address": data.address,
        "category": data.category,
        "description": data.description,
        "is_active": data.is_active,
        "location": {
            "type": "Point",
            "coordinates": [data.lng, data.lat]
        }
    }

@router.get("/admin", dependencies=[Depends(require_admin)])
async def get_admin_sites():
    sites = await service.get_admin_sites()
    return [{**site, "_id": str(site["_id"])} for site in sites]

@router.get("/{code}/narration")
async def get_site_narration(code: str, lang: str = "vi"):
    try:
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.get(
                f"{translation_service_url}/api/audio/{quote(code, safe='')}",
                params={"lang": lang},
            )
    except httpx.RequestError as error:
        raise HTTPException(
            status_code=502,
            detail="Không kết nối được dịch vụ dịch và tạo audio.",
        ) from error
    try:
        result = response.json()
    except ValueError as error:
        raise HTTPException(
            status_code=502,
            detail="Dịch vụ dịch trả về dữ liệu không hợp lệ.",
        ) from error
    if not response.is_success:
        detail = result.get("detail") if isinstance(result, dict) else None
        raise HTTPException(
            status_code=response.status_code,
            detail=detail or "Dịch vụ dịch không thể tạo bài thuyết minh.",
        )
    return result

@router.post("/", dependencies=[Depends(require_admin)])
async def create_site(data: SiteAdminForm):
    try:
        return await service.add_site(to_site_document(data, data.code))
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error

@router.put("/{code}", dependencies=[Depends(require_admin)])
async def update_site(code: str, data: SiteAdminUpdate):
    try:
        return await service.update_site(code, to_site_document(data, code))
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

@router.patch("/{code}/geofence-radius", dependencies=[Depends(require_admin)])
async def update_site_geofence_radius(code: str, data: SiteGeofenceRadiusUpdate):
    try:
        return await service.update_geofence_radius(code, data.geofence_radius)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

@router.delete("/{code}", dependencies=[Depends(require_admin)])
async def delete_site(code: str):
    try:
        return await service.delete_site(code)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

@router.get("/init-data")
async def init_data():
    """API dùng để nạp dữ liệu mẫu các điểm tham quan Quận 1"""
    return await service.initialize_default_site()
