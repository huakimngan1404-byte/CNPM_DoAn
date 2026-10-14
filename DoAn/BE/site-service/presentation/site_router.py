from fastapi import APIRouter
from pydantic import BaseModel
from business.site_service import SiteService

router = APIRouter(prefix="/api/sites")
service = SiteService()

class GPSData(BaseModel):
    user_id: str
    lat: float
    lng: float
    lang: str = "vi"

@router.post("/sync-location")
async def sync_location(data: GPSData):
    return await service.process_gps(data.user_id, data.lat, data.lng, data.lang)

@router.get("/init-data")
async def init_data():
    """API dùng để nạp dữ liệu mẫu Bến Nhà Rồng vào Database"""
    from data.site_repository import db
    
    # Tạo Index bản đồ (bắt buộc để thuật toán GPS hoạt động)
    await db.sites.create_index([("location", "2dsphere")])
    
    # Nạp điểm Bến Nhà Rồng
    await db.sites.update_one(
        {"code": "BEN_NHA_RONG"},
        {"$set": {
            "name": "Bảo tàng Hồ Chí Minh - Bến Nhà Rồng",
            "location": {
                "type": "Point",
                "coordinates": [106.7067, 10.7683] # [Kinh độ, Vĩ độ]
            }
        }},
        upsert=True
    )
    return {"message": "Đã nạp dữ liệu Bến Nhà Rồng và cài đặt thuật toán GPS thành công!"}