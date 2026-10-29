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
        await self.translations.update_one(
            {"_id": translation_id},
            {"$set": {"audio_asset_id": audio_asset_id, "audio_url": audio_url}},
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
        await self.translations.update_one(
            {"site_code": site_code, "lang": lang},
            {
                "$set": {
                    "site_code": site_code,
                    "lang": lang,
                    "source_text": source_text,
                    "description": description,
                    "audio_asset_id": audio_asset_id,
                    "audio_url": audio_url,
                    "updated_at": updated_at,
                }
            },
            upsert=True,
        )
