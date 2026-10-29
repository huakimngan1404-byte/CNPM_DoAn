from motor.motor_asyncio import AsyncIOMotorClient
import os
from datetime import datetime, timezone

MONGO_URL = (
    os.getenv("MONGO_URI")
    or os.getenv("MONGODB_URI")
    or os.getenv("MONGO_URL")
    or "mongodb://localhost:27017"
)
client = AsyncIOMotorClient(MONGO_URL)
db = client[os.getenv("MONGO_DATABASE", "district1_historical_db")]

DEFAULT_SITES = (
    {
        "code": "ben-nha-rong",
        "name": "Bến Nhà Rồng",
        "description": "Chào mừng bạn đến với Bến Nhà Rồng, một địa điểm gắn liền với hành trình tìm đường cứu nước của Nguyễn Tất Thành. Ngày 5 tháng 6 năm 1911, từ thương cảng Sài Gòn, người thanh niên ấy rời Tổ quốc trên con tàu Amiral Latouche-Tréville. Sự kiện này mở đầu cho chặng đường dài bôn ba, học hỏi và hoạt động cách mạng ở nhiều quốc gia. Công trình ban đầu được xây dựng làm trụ sở của hãng vận tải biển Messageries Maritimes, nổi bật với kiến trúc kết hợp giữa phong cách phương Tây và các chi tiết trang trí phương Đông, đặc biệt là hình rồng trên mái. Ngày nay, nơi đây là Bảo tàng Hồ Chí Minh - Chi nhánh Thành phố Hồ Chí Minh, lưu giữ hình ảnh, tư liệu và hiện vật về cuộc đời hoạt động của Chủ tịch Hồ Chí Minh. Khi đứng bên sông Sài Gòn, bạn có thể hình dung khung cảnh bến cảng đầu thế kỷ trước và câu chuyện về quyết tâm ra đi để tìm con đường độc lập cho dân tộc.",
        "address": "01 Nguyễn Tất Thành, Quận 1",
        "category": "Di tích lịch sử",
        "geofence_radius": 100.0,
        "location": {"type": "Point", "coordinates": [106.7066, 10.7687]},
    },
    {
        "code": "dinh-doc-lap",
        "name": "Dinh Độc Lập",
        "description": "Dinh Độc Lập, còn được gọi là Hội trường Thống Nhất, là một địa chỉ quan trọng để tìm hiểu lịch sử hiện đại Việt Nam. Công trình hiện nay do kiến trúc sư Ngô Viết Thụ thiết kế và được xây dựng trong thập niên 1960 trên khu đất từng có Dinh Norodom. Không gian bên trong gồm nhiều phòng tiếp khách, phòng họp và khu vực làm việc, được tổ chức quanh các khoảng sân và hành lang rộng. Kiến trúc của dinh kết hợp cách bố trí hiện đại với những gợi ý từ triết lý phương Đông, thể hiện qua hình khối và các chi tiết trang trí. Ngày 30 tháng 4 năm 1975, xe tăng tiến vào dinh; sự kiện này gắn với thời khắc kết thúc chiến tranh và đất nước thống nhất. Trong chuyến tham quan, bạn hãy để ý những hiện vật, căn phòng và dấu tích được bảo tồn tại chỗ: mỗi nơi kể một lát cắt khác nhau về đời sống chính trị và bối cảnh của Sài Gòn trong thế kỷ 20.",
        "address": "135 Nam Kỳ Khởi Nghĩa, Quận 1",
        "category": "Di tích lịch sử",
        "geofence_radius": 100.0,
        "location": {"type": "Point", "coordinates": [106.69525, 10.777022]},
    },
    {
        "code": "nha-tho-duc-ba-sai-gon",
        "name": "Nhà thờ Đức Bà Sài Gòn",
        "description": "Nhà thờ Đức Bà Sài Gòn nằm giữa quảng trường Công xã Paris, ngay trung tâm thành phố. Công trình được xây dựng vào cuối thế kỷ 19, với vật liệu và nhiều chi tiết kiến trúc mang ảnh hưởng châu Âu. Hai tháp chuông cao là dấu mốc dễ nhận ra từ các tuyến đường xung quanh; phía trước nhà thờ là quảng trường rộng, nơi người dân và du khách thường dừng chân. Hãy quan sát mặt tiền, những ô cửa và bố cục cân xứng của công trình để cảm nhận phong cách kiến trúc tôn giáo thời kỳ đó. Nhà thờ cũng là một phần của quần thể di sản đô thị gần Bưu điện Trung tâm và đường Đồng Khởi, giúp bạn hình dung diện mạo khu trung tâm Sài Gòn qua nhiều giai đoạn. Công trình có thể đang được bảo tồn, tu sửa hoặc hạn chế tiếp cận ở một số khu vực; bạn nên quan sát từ không gian công cộng và tuân thủ các hướng dẫn tại chỗ.",
        "address": "01 Công xã Paris, Quận 1",
        "category": "Di tích kiến trúc",
        "geofence_radius": 100.0,
        "location": {"type": "Point", "coordinates": [106.699018, 10.779783]},
    },
    {
        "code": "buu-dien-trung-tam-sai-gon",
        "name": "Bưu điện Trung tâm Sài Gòn",
        "description": "Bưu điện Trung tâm Sài Gòn là một công trình công cộng lâu đời vẫn nằm giữa nhịp sống của Quận 1. Được xây dựng vào cuối thế kỷ 19, tòa nhà gây ấn tượng với mặt tiền rộng, đồng hồ lớn và những ô cửa vòm. Bước vào bên trong, bạn sẽ thấy không gian mái vòm cao, các quầy giao dịch và những bản đồ cổ trang trí trên tường. Kiến trúc vừa phục vụ công năng bưu chính vừa cho thấy cách người ta tổ chức các công trình đô thị trong giai đoạn Sài Gòn phát triển thành một trung tâm thương mại. Ngày nay, nơi đây vẫn là điểm tham quan được nhiều người ghé thăm và là địa chỉ gửi thư, bưu phẩm. Bạn có thể dành ít phút quan sát các chi tiết sắt, gỗ và bảng chỉ dẫn, đồng thời lưu ý giữ lối đi thông thoáng để hoạt động của bưu điện không bị ảnh hưởng.",
        "address": "02 Công xã Paris, Quận 1",
        "category": "Di tích kiến trúc",
        "geofence_radius": 100.0,
        "location": {"type": "Point", "coordinates": [106.699586, 10.779729]},
    },
    {
        "code": "nha-hat-thanh-pho",
        "name": "Nhà hát Thành phố",
        "description": "Nhà hát Thành phố, thường được gọi là Nhà hát Lớn, được khánh thành năm 1900 tại quảng trường Lam Sơn. Mặt tiền mang phong cách kiến trúc châu Âu cuối thế kỷ 19, với các chi tiết trang trí và bậc thềm hướng ra quảng trường. Qua thời gian, công trình có những giai đoạn được sử dụng cho nhiều mục đích khác nhau, trước khi trở lại với chức năng biểu diễn nghệ thuật. Ngày nay, nhà hát là địa điểm tổ chức các chương trình sân khấu, âm nhạc và sự kiện văn hóa. Nếu có dịp vào xem biểu diễn, bạn sẽ cảm nhận rõ hơn không gian khán phòng và lịch sử hoạt động của nơi này; nếu chỉ tham quan bên ngoài, hãy quan sát sự tương phản giữa công trình cổ và những tuyến phố sôi động xung quanh. Nhà hát cũng nằm gần phố đi bộ Nguyễn Huệ, vì vậy đây là điểm dừng thuận tiện trong hành trình khám phá trung tâm thành phố.",
        "address": "07 Công trường Lam Sơn, Quận 1",
        "category": "Di tích kiến trúc",
        "geofence_radius": 100.0,
        "location": {"type": "Point", "coordinates": [106.70331, 10.77649]},
    },
    {
        "code": "cho-ben-thanh",
        "name": "Chợ Bến Thành",
        "description": "Chợ Bến Thành là một trong những hình ảnh quen thuộc nhất của Thành phố Hồ Chí Minh. Ngôi chợ hiện nay được khánh thành năm 1914, sau quá trình đô thị mở rộng và hình thành những tuyến phố mới ở trung tâm. Cổng chính nhìn ra quảng trường Quách Thị Trang nổi bật với tháp đồng hồ, thường được xem là dấu hiệu nhận diện của khu chợ. Bên trong, các lối đi tập trung nhiều quầy hàng thực phẩm, đồ thủ công, quần áo và đặc sản địa phương. Chợ vừa là nơi mua bán thường ngày vừa là điểm gặp gỡ của du khách muốn tìm hiểu nhịp sống thương mại của thành phố. Khi tham quan, bạn có thể hỏi giá trước khi mua, chú ý bảo quản tư trang và để ý lối đi đông người. Nếu không định mua sắm, chỉ cần dừng lại quan sát cổng chợ và dòng người qua lại cũng đủ cảm nhận sự nhộn nhịp rất riêng của khu vực này.",
        "address": "Lê Lợi, Quận 1",
        "category": "Di sản đô thị",
        "geofence_radius": 100.0,
        "location": {"type": "Point", "coordinates": [106.698083, 10.77249]},
    },
    {
        "code": "bao-tang-thanh-pho-ho-chi-minh",
        "name": "Bảo tàng Thành phố Hồ Chí Minh",
        "description": "Bảo tàng Thành phố Hồ Chí Minh nằm trong một tòa nhà cổ ở trung tâm Quận 1, gần các tuyến đường Lý Tự Trọng và Nam Kỳ Khởi Nghĩa. Bản thân kiến trúc của tòa nhà đã là một phần đáng chú ý trong chuyến tham quan: hãy quan sát mặt đứng, hành lang và những khoảng không gian rộng bên trong. Các phòng trưng bày giới thiệu nhiều chủ đề về lịch sử hình thành, đời sống văn hóa, kinh tế và quá trình phát triển của thành phố qua các thời kỳ. Tư liệu, hình ảnh và hiện vật giúp kết nối những biến đổi của Sài Gòn với câu chuyện của người dân nơi đây. Bạn có thể chọn một chủ đề mình quan tâm để xem kỹ thay vì cố gắng đi thật nhanh qua toàn bộ không gian. Khi tham quan, hãy tuân theo quy định về chụp ảnh và bảo vệ hiện vật. Đây là điểm dừng phù hợp để hiểu thêm bối cảnh lịch sử phía sau những con phố hiện đại của thành phố.",
        "address": "65 Lý Tự Trọng, Quận 1",
        "category": "Bảo tàng",
        "geofence_radius": 100.0,
        "location": {"type": "Point", "coordinates": [106.6998, 10.77564]},
    },
    {
        "code": "bao-tang-ton-duc-thang",
        "name": "Bảo tàng Tôn Đức Thắng",
        "description": "Bảo tàng Tôn Đức Thắng dành riêng không gian giới thiệu cuộc đời và sự nghiệp của Chủ tịch Tôn Đức Thắng, người sinh ra tại cù lao Ông Hổ, tỉnh An Giang. Qua hình ảnh, tư liệu và hiện vật, khách tham quan có thể theo dõi các chặng đường hoạt động của ông, từ tuổi trẻ, thời gian tham gia phong trào công nhân đến những năm tháng đảm nhiệm các trọng trách của đất nước. Cách trưng bày giúp câu chuyện cá nhân được đặt trong bối cảnh lịch sử rộng hơn, đồng thời nhấn mạnh những phẩm chất thường được nhắc đến như sự giản dị và tinh thần gắn bó với người lao động. Khi đi qua từng phòng, bạn có thể dành thời gian đọc chú thích để hiểu vì sao mỗi hiện vật được lưu giữ và câu chuyện nào được kể lại. Bảo tàng là một điểm tham quan yên tĩnh bên bờ sông Sài Gòn, bổ sung góc nhìn về lịch sử và con người cho hành trình khám phá Quận 1.",
        "address": "05 Tôn Đức Thắng, Quận 1",
        "category": "Bảo tàng",
        "geofence_radius": 100.0,
        "location": {"type": "Point", "coordinates": [106.704322, 10.782651]},
    },
)

DEFAULT_LANGUAGES = (
    {"code": "vi", "name": "Tiếng Việt", "flag": "🇻🇳", "is_active": True},
    {"code": "en", "name": "English", "flag": "🇬🇧", "is_active": True},
    {"code": "ja", "name": "日本語", "flag": "🇯🇵", "is_active": True},
    {"code": "zh", "name": "中文", "flag": "🇨🇳", "is_active": True},
    {"code": "fr", "name": "Français", "flag": "🇫🇷", "is_active": True},
)


class SiteRepository:
    async def get_ready_audio_asset_ids(self, translations):
        asset_ids = {
            record.get("audio_asset_id")
            for record in translations
            if isinstance(record.get("audio_asset_id"), str)
            and record.get("audio_url")
        }
        if not asset_ids:
            return set()
        cursor = db.audio_assets.find(
            {
                "_id": {"$in": list(asset_ids)},
                "data": {"$type": "binData"},
            },
            {"_id": 1},
        )
        return {asset["_id"] async for asset in cursor}

    async def ensure_language_catalog(self):
        default_codes = [language["code"] for language in DEFAULT_LANGUAGES]
        for language in DEFAULT_LANGUAGES:
            await db.languages.update_one(
                {"_id": language["code"]},
                {
                    "$setOnInsert": {
                        **language,
                        "_id": language["code"],
                    },
                    "$set": {
                        "is_deleted": False,
                        "catalog_hidden_until_added": False,
                    },
                },
                upsert=True,
            )
        migrations = db["language_catalog_migrations"]
        migration_id = "hide-extra-languages-until-added-v1"
        if not await migrations.find_one({"_id": migration_id}):
            await db.languages.update_many(
                {"_id": {"$nin": default_codes}},
                {
                    "$set": {
                        "is_active": False,
                        "is_deleted": True,
                        "catalog_hidden_until_added": True,
                    }
                },
            )
            await migrations.update_one(
                {"_id": migration_id},
                {
                    "$setOnInsert": {
                        "completed_at": datetime.now(timezone.utc),
                    }
                },
                upsert=True,
            )

    async def get_admin_narrations(self):
        cursor = db.translations.find({}).sort("updated_at", -1)
        translations = [record async for record in cursor]
        ready_audio_ids = await self.get_ready_audio_asset_ids(translations)
        translations = [
            record for record in translations
            if record.get("audio_asset_id") in ready_audio_ids
        ]
        site_codes = {record.get("site_code") for record in translations if record.get("site_code")}
        language_codes = {record.get("lang") for record in translations if record.get("lang")}
        sites = {}
        languages = {}
        if site_codes:
            sites = {
                site["code"]: site
                async for site in db.sites.find(
                    {"code": {"$in": list(site_codes)}},
                    {"_id": 0, "code": 1, "name": 1},
                )
            }
        if language_codes:
            languages = {
                language["_id"]: language
                async for language in db.languages.find(
                    {"_id": {"$in": list(language_codes)}},
                    {"_id": 1, "name": 1, "flag": 1, "is_active": 1, "is_deleted": 1},
                )
            }
        return [
            {
                "site_code": record.get("site_code", ""),
                "site_name": sites.get(record.get("site_code"), {}).get("name", record.get("site_code", "")),
                "lang": record.get("lang", ""),
                "audio_url": record["audio_url"],
                "has_audio": True,
                "language_name": languages.get(record.get("lang"), {}).get("name", record.get("lang", "").upper()),
                "language_flag": languages.get(record.get("lang"), {}).get("flag", ""),
                "is_active": languages.get(record.get("lang"), {}).get("is_active", True)
                and not languages.get(record.get("lang"), {}).get("is_deleted", False),
                "description": record.get("description", ""),
                "updated_at": record.get("updated_at").isoformat() if record.get("updated_at") else None,
            }
            for record in translations
            if record.get("site_code") and record.get("lang")
        ]

    async def get_narration(self, site_code: str, lang: str):
        return await db.translations.find_one({"site_code": site_code, "lang": lang})

    async def save_narration(
        self,
        site_code: str,
        lang: str,
        source_text: str,
        description: str,
        updated_at: datetime,
    ):
        existing = await db.translations.find_one(
            {"site_code": site_code, "lang": lang},
            {"_id": 0, "description": 1},
        )
        updates = {
            "site_code": site_code,
            "lang": lang,
            "source_text": source_text,
            "description": description,
            "updated_at": updated_at,
        }
        if not existing or existing.get("description") != description:
            updates.update({"audio_asset_id": None, "audio_url": None})
        await db.translations.update_one(
            {"site_code": site_code, "lang": lang},
            {"$set": updates},
            upsert=True,
        )

    async def delete_narration(self, site_code: str, lang: str):
        result = await db.translations.delete_one({"site_code": site_code, "lang": lang})
        return result.deleted_count > 0

    async def get_languages(self, active_only: bool = False):
        filters = {"is_deleted": False}
        if active_only:
            filters["is_active"] = True
        cursor = db.languages.find(filters)
        languages = []
        async for record in cursor:
            languages.append({
                "code": record["_id"],
                "name": record["name"],
                "flag": record["flag"],
                "is_active": record.get("is_active", True),
                "places": len(await db.translations.distinct(
                    "site_code", {"lang": record["_id"]}
                )),
            })
        return sorted(languages, key=lambda language: (language["code"] != "vi", language["name"].casefold()))

    async def get_language(self, code: str):
        return await db.languages.find_one({"_id": code})

    async def save_language(self, language: dict):
        await db.languages.update_one(
            {"_id": language["code"]},
            {
                "$set": {
                    "name": language["name"],
                    "flag": language["flag"],
                    "is_active": language["is_active"],
                    "is_deleted": False,
                    "catalog_hidden_until_added": False,
                },
                "$setOnInsert": {"_id": language["code"]},
            },
            upsert=True,
        )

    async def update_language(self, code: str, updates: dict):
        updates = {**updates, "catalog_hidden_until_added": False}
        return await db.languages.update_one(
            {"_id": code, "is_deleted": False},
            {"$set": updates},
        )

    async def delete_language(self, code: str):
        return await db.languages.update_one(
            {"_id": code, "is_deleted": False},
            {"$set": {"is_active": False, "is_deleted": True}},
        )

    async def record_listen(self, site_code: str, language: str, device: str):
        await db.listening_events.insert_one({
            "site_code": site_code,
            "language": language,
            "device": device,
            "occurred_at": datetime.now(timezone.utc),
        })

    async def get_listen_stats(self, start, end, period: str, device: str):
        filters = {"occurred_at": {"$gte": start, "$lt": end}}
        if device != "all":
            filters["device"] = device

        bucket_format = "%H" if period == "day" else "%d"
        bucket_pipeline = [
            {"$match": filters},
            {
                "$group": {
                    "_id": {
                        "$dateToString": {
                            "format": bucket_format,
                            "date": "$occurred_at",
                            "timezone": "Asia/Ho_Chi_Minh",
                        }
                    },
                    "count": {"$sum": 1},
                }
            },
        ]
        buckets = [item async for item in db.listening_events.aggregate(bucket_pipeline)]
        total = sum(item["count"] for item in buckets)

        site_pipeline = [
            {"$match": filters},
            {"$group": {"_id": "$site_code", "count": {"$sum": 1}}},
            {"$sort": {"count": -1, "_id": 1}},
            {"$limit": 8},
        ]
        top_sites = [item async for item in db.listening_events.aggregate(site_pipeline)]
        listen_counts = {item["_id"]: item["count"] for item in top_sites}
        all_sites_cursor = db.sites.find(
            {},
            {"_id": 0, "code": 1, "name": 1},
        ).sort("name", 1)
        all_sites = [site async for site in all_sites_cursor]
        top_sites_with_zero_counts = [
            {
                "site_code": site["code"],
                "site_name": site.get("name", site["code"]),
                "count": listen_counts.get(site["code"], 0),
            }
            for site in all_sites
            if site.get("code")
        ]
        top_sites_with_zero_counts.sort(
            key=lambda site: (-site["count"], site["site_name"].casefold())
        )

        return {
            "total": total,
            "buckets": buckets,
            "top_sites": top_sites_with_zero_counts[:8],
        }

    async def get_all_sites(self):
        # Lấy tất cả các điểm tham quan để lớp Service tính Geofencing
        cursor = db.sites.find({})
        return [doc async for doc in cursor]

    async def get_admin_sites(self):
        cursor = db.sites.find({}).sort("name", 1)
        sites = [doc async for doc in cursor]
        site_codes = [site["code"] for site in sites if site.get("code")]
        languages_by_site = {}
        if site_codes:
            translations = db.translations.find(
                {"site_code": {"$in": site_codes}},
                {
                    "_id": 0,
                    "site_code": 1,
                    "lang": 1,
                    "audio_asset_id": 1,
                    "audio_url": 1,
                },
            )
            translation_records = [translation async for translation in translations]
            ready_audio_ids = await self.get_ready_audio_asset_ids(translation_records)
            for translation in translation_records:
                site_code = translation.get("site_code")
                language = translation.get("lang")
                if (
                    isinstance(site_code, str)
                    and isinstance(language, str)
                    and language
                    and translation.get("audio_asset_id") in ready_audio_ids
                ):
                    languages_by_site.setdefault(site_code, set()).add(language)

        for site in sites:
            site["languages"] = sorted(
                languages_by_site.get(site.get("code"), set()),
                key=lambda language: (language != "vi", language),
            )
        return sites

    async def get_site_by_code(self, code: str):
        return await db.sites.find_one({"code": code})

    async def create_site(self, site_data: dict):
        return await db.sites.insert_one(site_data)

    async def update_site(self, code: str, site_data: dict):
        return await db.sites.update_one({"code": code}, {"$set": site_data})

    async def delete_site(self, code: str):
        site = await db.sites.find_one({"code": code}, {"_id": 1})
        if not site:
            return False
        await db.sites.delete_one({"_id": site["_id"]})
        await db.translations.delete_many({"site_code": code})
        await db.geofence_state.update_many(
            {"active_site_id": str(site["_id"])},
            {"$set": {"active_site_id": None, "updated_at": datetime.utcnow()}},
        )
        return True

    async def get_active_geofence(self, user_id: str):
        state = await db.geofence_state.find_one({"user_id": user_id})
        return state.get("active_site_id") if state else None

    async def set_active_geofence(self, user_id: str, site_id: str | None):
        await db.geofence_state.update_one(
            {"user_id": user_id},
            {"$set": {"active_site_id": site_id, "updated_at": datetime.utcnow()}},
            upsert=True,
        )

    async def seed_default_sites(self):
        for site in DEFAULT_SITES:
            await db.sites.update_one(
                {"code": site["code"]},
                {"$setOnInsert": site},
                upsert=True,
            )
        await db.sites.update_many({}, {"$set": {"geofence_radius": 100.0}})