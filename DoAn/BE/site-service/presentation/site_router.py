from fastapi import APIRouter
from pydantic import BaseModel
from business.site_service import SiteService

router = APIRouter(prefix="/api/sites")
service = SiteService()

# --- MODEL REQUEST ---
class GPSData(BaseModel):
    user_id: str
    lat: float
    lng: float
    lang: str = "vi"

class SiteAdminForm(BaseModel):
    name: str
    lat: float
    lng: float
    geofence_radius: float = 30.0

# --- CONTROLLERS ---

@router.post("/sync-location")
async def sync_location(data: GPSData):
    # API Gateway chuyển tiếp về đây
    return await service.process_gps(data.user_id, data.lat, data.lng, data.lang)

@router.get("")
async def get_sites():
    sites = await service.get_sites()
    return [
        {**site, "_id": str(site["_id"])}
        for site in sites
    ]

@router.post("/admin/add")
async def add_site_from_admin(data: SiteAdminForm):
    # Yêu cầu 3.2: Nhận dữ liệu từ Form Admin ở lớp Controller
    site_dict = {
        "name": data.name,
        "geofence_radius": data.geofence_radius,
        "location": {
            "type": "Point",
            "coordinates": [data.lng, data.lat]
        }
    }
    return await service.add_site(site_dict)

@router.get("/init-data")
async def init_data():
    """API dùng để nạp dữ liệu mẫu các điểm tham quan Quận 1"""
    return await service.initialize_default_site()