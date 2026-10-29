import asyncio
import math
import pika
import json
import time
import calendar
import re
from datetime import date, datetime, time as datetime_time, timedelta, timezone
from zoneinfo import ZoneInfo
from data.site_repository import SiteRepository

ACTIVE_VISITOR_TTL_SECONDS = 45
HO_CHI_MINH_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
LANGUAGE_CODE_PATTERN = re.compile(r"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$")


class SiteService:
    def __init__(self):
        self.repo = SiteRepository()
        self.catalog_seeded = False
        self.language_catalog_seeded = False
        self.active_visitors = {}
        self.visitor_lock = asyncio.Lock()
        self.language_catalog_lock = asyncio.Lock()

    async def ensure_language_catalog_seeded(self):
        if self.language_catalog_seeded:
            return
        async with self.language_catalog_lock:
            if not self.language_catalog_seeded:
                await self.repo.ensure_language_catalog()
                self.language_catalog_seeded = True

    async def get_languages(self, active_only: bool = False):
        await self.ensure_language_catalog_seeded()
        return await self.repo.get_languages(active_only)

    async def add_language(self, code: str, name: str, flag: str):
        await self.ensure_language_catalog_seeded()
        if not LANGUAGE_CODE_PATTERN.fullmatch(code):
            raise ValueError("Mã ngôn ngữ không hợp lệ.")
        if not name.strip() or not flag.strip():
            raise ValueError("Tên và biểu tượng ngôn ngữ không được để trống.")
        existing = await self.repo.get_language(code)
        if existing and not existing.get("is_deleted", False):
            raise ValueError("Ngôn ngữ này đã có trong danh sách.")
        await self.repo.save_language({
            "code": code,
            "name": name,
            "flag": flag,
            "is_active": True,
        })

    async def update_language(self, code: str, name: str, flag: str, is_active: bool):
        await self.ensure_language_catalog_seeded()
        if not name.strip() or not flag.strip():
            raise ValueError("Tên và biểu tượng ngôn ngữ không được để trống.")
        if code == "vi" and not is_active:
            raise ValueError("Không thể tắt Tiếng Việt vì đây là ngôn ngữ nội dung gốc.")
        result = await self.repo.update_language(code, {
            "name": name,
            "flag": flag,
            "is_active": is_active,
        })
        if not result.matched_count:
            raise LookupError("Không tìm thấy ngôn ngữ.")

    async def delete_language(self, code: str):
        await self.ensure_language_catalog_seeded()
        if code == "vi":
            raise ValueError("Không thể xóa Tiếng Việt vì đây là ngôn ngữ nội dung gốc.")
        result = await self.repo.delete_language(code)
        if not result.matched_count:
            raise LookupError("Không tìm thấy ngôn ngữ.")

    async def get_admin_narrations(self):
        await self.ensure_language_catalog_seeded()
        return await self.repo.get_admin_narrations()

    async def save_narration(
        self,
        site_code: str,
        lang: str,
        description: str,
        require_existing: bool = False,
    ):
        await self.ensure_language_catalog_seeded()
        if not LANGUAGE_CODE_PATTERN.fullmatch(lang):
            raise ValueError("Mã ngôn ngữ không hợp lệ.")
        site = await self.repo.get_site_by_code(site_code)
        if not site:
            raise LookupError("Không tìm thấy di tích.")
        language = await self.repo.get_language(lang)
        if not language or language.get("is_deleted") is True:
            raise ValueError("Ngôn ngữ này đang tắt hoặc không tồn tại.")
        existing = await self.repo.get_narration(site_code, lang)
        if require_existing and not existing:
            raise LookupError("Không tìm thấy bài thuyết minh.")
        if language.get("is_active") is False and not require_existing:
            raise ValueError("Ngôn ngữ này đang tắt hoặc không tồn tại.")
        source_text = site.get("description")
        if not isinstance(source_text, str) or not source_text.strip():
            raise ValueError("Di tích chưa có nội dung tiếng Việt để làm nguồn dịch.")
        await self.repo.save_narration(
            site_code,
            lang,
            source_text.strip(),
            description.strip(),
            datetime.now(timezone.utc),
        )

    async def delete_narration(self, site_code: str, lang: str):
        if not await self.repo.delete_narration(site_code, lang):
            raise LookupError("Không tìm thấy bài thuyết minh.")

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

    async def record_listen(self, site_code: str, language: str, device: str):
        if not await self.repo.get_site_by_code(site_code):
            raise LookupError("Không tìm thấy di tích.")
        await self.repo.record_listen(site_code, language, device)

    async def get_listen_stats(
        self,
        period: str,
        selected_date: str | None,
        device: str,
    ):
        now = datetime.now(HO_CHI_MINH_TZ)
        try:
            if period == "day":
                local_date = date.fromisoformat(selected_date) if selected_date else now.date()
                start = datetime.combine(local_date, datetime_time.min, HO_CHI_MINH_TZ)
                end = start + timedelta(days=1)
                labels = [f"{hour:02d}" for hour in range(24)]
            else:
                if selected_date:
                    year, month = (int(part) for part in selected_date.split("-", 1))
                    local_date = date(year, month, 1)
                else:
                    local_date = now.date().replace(day=1)
                next_month = (
                    date(local_date.year + 1, 1, 1)
                    if local_date.month == 12
                    else date(local_date.year, local_date.month + 1, 1)
                )
                start = datetime.combine(local_date, datetime_time.min, HO_CHI_MINH_TZ)
                end = datetime.combine(next_month, datetime_time.min, HO_CHI_MINH_TZ)
                labels = [
                    f"{day:02d}"
                    for day in range(1, calendar.monthrange(local_date.year, local_date.month)[1] + 1)
                ]
        except ValueError as error:
            raise ValueError("Ngày thống kê không hợp lệ.") from error

        result = await self.repo.get_listen_stats(
            start.astimezone(timezone.utc),
            end.astimezone(timezone.utc),
            period,
            device,
        )
        counts = {item["_id"]: item["count"] for item in result["buckets"]}
        return {
            "period": period,
            "date": local_date.isoformat() if period == "day" else local_date.strftime("%Y-%m"),
            "device": device,
            "total": result["total"],
            "buckets": [
                {
                    "label": f"{label}:00" if period == "day" else label,
                    "count": counts.get(label, 0),
                }
                for label in labels
            ],
            "top_sites": result["top_sites"],
        }

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
        data["geofence_radius"] = existing.get("geofence_radius", 100.0)
        await self.repo.update_site(code, data)
        return {"status": "success"}

    async def update_geofence_radius(self, code: str, radius: float):
        if not await self.repo.get_site_by_code(code):
            raise LookupError("Không tìm thấy di tích.")
        await self.repo.update_site(code, {"geofence_radius": radius})
        return {"status": "success", "geofence_radius": radius}

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
