import asyncio
import math
import pika
import json
import time
from data.site_repository import SiteRepository

ACTIVE_VISITOR_TTL_SECONDS = 45


class SiteService:
    def __init__(self):
        self.repo = SiteRepository()
        self.catalog_seeded = False
        self.active_visitors = {}
        self.visitor_lock = asyncio.Lock()

    async def ensure_catalog_seeded(self):
        if not self.catalog_seeded:
            await self.repo.seed_default_sites()
            self.catalog_seeded = True

    async def heartbeat_visitor(self, session_id: str):
        async with self.visitor_lock:
            self.active_visitors[session_id] = time.monotonic()

    async def leave_visitor(self, session_id: str):
        async with self.visitor_lock:
            self.active_visitors.pop(session_id, None)

    async def get_active_visitor_count(self):
        now = time.monotonic()
        cutoff = now - ACTIVE_VISITOR_TTL_SECONDS
        async with self.visitor_lock:
            expired_sessions = [
                session_id
                for session_id, last_seen in self.active_visitors.items()
                if last_seen <= cutoff
            ]
            for session_id in expired_sessions:
                del self.active_visitors[session_id]
            return len(self.active_visitors)

    # Yêu cầu 3.2: Thuật toán cốt lõi tính toán khoảng cách (công thức hình học không gian) tại lớp Service
    def calculate_distance(self, lat1, lon1, lat2, lon2):
        R = 6371000 # Bán kính trái đất (mét)
        phi1, phi2 = math.radians(lat1), math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)
        
        a = math.sin(delta_phi/2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda/2.0)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return R * c # Trả về mét

    async def process_gps(self, user_id: str, lat: float, lng: float, lang: str):
        await self.ensure_catalog_seeded()

        # Phát hiện vùng địa lý (Geofencing) bằng thuật toán hình học
        sites = await self.repo.get_all_sites()
        entered_site = None
        nearest_distance = None
        
        for site in sites:
            site_lng = site["location"]["coordinates"][0]
            site_lat = site["location"]["coordinates"][1]
            geofence_radius = 100
            # Tính toán khoảng cách
            distance = self.calculate_distance(lat, lng, site_lat, site_lng)
            if distance <= geofence_radius and (
                nearest_distance is None or distance < nearest_distance
            ):
                entered_site = site
                nearest_distance = distance

        if not entered_site:
            previous_site_id = await self.repo.get_active_geofence(user_id)
            if previous_site_id is not None:
                await self.repo.set_active_geofence(user_id, None)
            return {"in_zone": False, "trigger": False}
        
        site_id = str(entered_site["_id"])
        previous_site_id = await self.repo.get_active_geofence(user_id)
        should_trigger = previous_site_id != site_id
        if should_trigger:
            await self.repo.set_active_geofence(user_id, site_id)

        # 3. Yêu cầu 3.3: Bắn sự kiện (UserEnteredPOI) vào Message Broker (RabbitMQ)
        if should_trigger:
            self.publish_event(user_id, site_id, lang)

        return {
            "in_zone": True,
            "trigger": should_trigger,
            "site_id": site_id,
            "site_name": entered_site["name"],
            "distance_meters": round(nearest_distance, 1),
            "message": "Đã vào vùng di tích" if should_trigger else "Đang ở trong vùng di tích"
        }

    def publish_event(self, user_id: str, site_id: str, lang: str):
        try:
            # Kết nối tới RabbitMQ Container
            connection = pika.BlockingConnection(pika.ConnectionParameters(host='rabbitmq'))
            channel = connection.channel()
            channel.exchange_declare(exchange='event_bus', exchange_type='topic')
            
            event_data = {
                "event_name": "UserEnteredPOI",
                "user_id": user_id,
                "site_id": site_id,
                "lang": lang
            }
            
            # Bắn sự kiện
            channel.basic_publish(
                exchange='event_bus', 
                routing_key='location.entered_poi', 
                body=json.dumps(event_data)
            )
            connection.close()
        except Exception as e:
            print(f"Lỗi kết nối RabbitMQ: {e}")

    async def add_site(self, data: dict):
        if not data.get("name") or not data.get("code") or not data.get("location"):
            raise ValueError("Cần có mã, tên và vị trí di tích.")
        if await self.repo.get_site_by_code(data["code"]):
            raise ValueError("Mã di tích đã tồn tại.")
        data["geofence_radius"] = 100.0
        await self.repo.create_site(data)
        return {"status": "success"}

    async def update_site(self, code: str, data: dict):
        existing = await self.repo.get_site_by_code(code)
        if not existing:
            raise LookupError("Không tìm thấy di tích.")
        if not data.get("name") or not data.get("location"):
            raise ValueError("Cần có tên và vị trí di tích.")
        data["geofence_radius"] = 100.0
        await self.repo.update_site(code, data)
        return {"status": "success"}

    async def delete_site(self, code: str):
        if not await self.repo.delete_site(code):
            raise LookupError("Không tìm thấy di tích.")
        return {"status": "success"}

    async def get_sites(self):
        await self.ensure_catalog_seeded()
        sites = await self.repo.get_all_sites()
        return sites

    async def get_admin_sites(self):
        await self.ensure_catalog_seeded()
        return await self.repo.get_admin_sites()

    async def initialize_default_site(self):
        await self.repo.seed_default_sites()
        self.catalog_seeded = True
        return {"message": "Đã nạp dữ liệu các điểm tham quan Quận 1 thành công!"}
