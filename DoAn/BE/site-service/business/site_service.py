import httpx
from data.site_repository import SiteRepository

class SiteService:
    def __init__(self):
        self.repo = SiteRepository()
        self.translation_url = "http://translation-service:8001/api/audio"

    async def process_gps(self, user_id: str, lat: float, lng: float, lang: str):
        # 1. Lưu tracking
        await self.repo.save_tracking(user_id, lat, lng)

        # 2. Phát hiện vùng địa lý (Geofencing)
        nearby = await self.repo.find_nearby(lng, lat, 30)
        if not nearby:
            return {"in_zone": False, "trigger": False}

        site = nearby[0]
        
        # 3. Giao tiếp với Translation Service
        audio_data = {}
        async with httpx.AsyncClient() as client:
            try:
                res = await client.get(f"{self.translation_url}/{site['code']}?lang={lang}")
                if res.status_code == 200:
                    audio_data = res.json()
            except Exception:
                pass

        return {
            "in_zone": True,
            "site_name": site["name"],
            "audio": {
                "trigger_audio": True,
                "url": audio_data.get("url"),
                "text": audio_data.get("text")
            }
        }