from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from business.site_service import SiteService
from presentation.auth_router import require_admin

router = APIRouter(prefix="/api/sites")
service = SiteService()

# --- MODEL REQUEST ---
class GPSData(BaseModel):
    user_id: str
    lat: float
    lng: float
    lang: str = "vi"

class SiteAdminForm(BaseModel):
    code: str = Field(min_length=2, max_length=100, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    name: str = Field(min_length=2, max_length=200)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    address: str = Field(min_length=2, max_length=300)
    category: str = Field(min_length=2, max_length=100)
    description: str = Field(min_length=10, max_length=20000)
    is_active: bool = True

class SiteAdminUpdate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    address: str = Field(min_length=2, max_length=300)
    category: str = Field(min_length=2, max_length=100)
    description: str = Field(min_length=10, max_length=20000)
    is_active: bool = True

# --- CONTROLLERS ---

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
