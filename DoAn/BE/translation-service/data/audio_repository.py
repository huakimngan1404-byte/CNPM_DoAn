from typing import Optional


class AudioRepository:
    def __init__(self, database):
        self.database = database
        self.sites = database["sites"]
        self.translations = database["translations"]
        self.audio_assets = database["audio_assets"]

    async def get_site(self, site_code: str):
        return await self.sites.find_one(
            {"code": site_code},
            {"_id": 0, "code": 1, "description": 1},
        )

    async def get_language(self, lang: str):
        try:
            collection = self.database["languages"]
        except KeyError:
            return None
        return await collection.find_one({"_id": lang})

    async def get_translation(self, site_code: str, lang: str, source_text: str):
        if self.sites is self.translations:
            return None
        return await self.translations.find_one({
            "site_code": site_code,
            "lang": lang,
            "source_text": source_text,
        })

    async def update_translation_audio(
        self,
        translation_id,
        audio_asset_id: Optional[str],
        audio_url: Optional[str],
    ):
        record = await self.translations.find_one(
            {"_id": translation_id},
            {"narration_status": 1, "is_hidden": 1},
        )
        updates = {"audio_asset_id": audio_asset_id, "audio_url": audio_url}
        if record:
            if record.get("is_hidden") is True or record.get("narration_status") == "hidden":
                updates["status_before_hidden"] = "not_ready"
            else:
                updates["narration_status"] = "ready"
        await self.translations.update_one(
            {"_id": translation_id},
            {"$set": updates},
        )

    async def get_audio_asset(self, asset_id: str):
        return await self.audio_assets.find_one(
            {"_id": asset_id},
            {"_id": 1},
        )

    async def read_audio_asset(self, asset_id: str):
        return await self.audio_assets.find_one({"_id": asset_id})

    async def save_audio_asset(
        self,
        asset_id: str,
        audio_data: bytes,
        site_code: str,
        lang: str,
    ):
        await self.audio_assets.update_one(
            {"_id": asset_id},
            {
                "$setOnInsert": {
                    "data": audio_data,
                    "content_type": "audio/mpeg",
                    "site_code": site_code,
                    "lang": lang,
                }
            },
            upsert=True,
        )

    async def save_translation(
        self,
        site_code: str,
        lang: str,
        source_text: str,
        description: str,
        audio_asset_id: str,
        audio_url: str,
        updated_at,
    ):
        existing = await self.translations.find_one(
            {"site_code": site_code, "lang": lang},
        )
        has_audio = bool(audio_asset_id and audio_url)
        status = "ready" if has_audio else "not_ready"
        updates = {
            "site_code": site_code,
            "lang": lang,
            "source_text": source_text,
            "description": description,
            "audio_asset_id": audio_asset_id,
            "audio_url": audio_url,
            "updated_at": updated_at,
        }
        unset = {}

        if existing:
            content_changed = existing.get("description") != description
            published_version = existing.get("published_version")
            if (content_changed or not has_audio) and (
                existing.get("narration_status") == "published"
                or (
                    existing.get("is_hidden") is True
                    and existing.get("status_before_hidden") == "published"
                )
            ):
                published_version = {
                    "source_text": existing.get("source_text"),
                    "description": existing.get("description"),
                    "audio_asset_id": existing.get("audio_asset_id"),
                    "audio_url": existing.get("audio_url"),
                    "updated_at": existing.get("updated_at"),
                    "narration_status": "published",
                }
            if published_version:
                updates["published_version"] = published_version

            if (
                existing.get("narration_status") == "published"
                and not content_changed
                and has_audio
            ):
                status = "published"
            if existing.get("is_hidden") is True or existing.get("narration_status") == "hidden":
                updates["narration_status"] = "hidden"
                updates["status_before_hidden"] = status
            else:
                updates["narration_status"] = status
                unset["status_before_hidden"] = ""
        else:
            updates["narration_status"] = status

        update = {"$set": updates}
        if unset:
            update["$unset"] = unset
        await self.translations.update_one(
            {"site_code": site_code, "lang": lang},
            update,
            upsert=True,
        )
