from motor.motor_asyncio import AsyncIOMotorClient
import os
from datetime import datetime

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
client = AsyncIOMotorClient(MONGO_URL)
db = client.historical_db

class SiteRepository:
    async def find_nearby(self, lng: float, lat: float, radius_m: float):
        # Yêu cầu 4.1, 4.2 & 2.2: Lấy điểm tham quan gần nhất
        cursor = db.sites.find({
            "location": {
                "$near": {
                    "$geometry": {"type": "Point", "coordinates": [lng, lat]},
                    "$maxDistance": radius_m
                }
            }
        })
        return [doc async for doc in cursor]

    async def save_tracking(self, user_id: str, lat: float, lng: float):
        # Yêu cầu 2.6: Lưu lộ trình
        await db.tracking.insert_one({
            "user_id": user_id,
            "location": {"type": "Point", "coordinates": [lng, lat]},
            "timestamp": datetime.utcnow()
        })