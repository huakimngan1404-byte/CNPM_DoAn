from motor.motor_asyncio import AsyncIOMotorClient
import os

client = AsyncIOMotorClient(os.getenv("MONGO_URL", "mongodb://localhost:27017"))
db = client.historical_db

class AudioRepository:
    async def get_audio_info(self, site_code: str, lang: str):
        # Yêu cầu 4.3 & 4.4: Truy vấn DB lấy nội dung đa ngôn ngữ
        site = await db.audio_contents.find_one({"site_code": site_code})
        if site and lang in site.get("translations", {}):
            return site["translations"][lang]
        return None
async def save_new_audio(self, site_code: str, lang: str, data: dict):
        await db.audio_contents.update_one(
            {"site_code": site_code},
            {"$set": {f"translations.{lang}": data}},
            upsert=True 
        )