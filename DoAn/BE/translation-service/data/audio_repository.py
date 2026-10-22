class AudioRepository:
    def __init__(self, database):
        self.sites = database["sites"]
        self.translations = database["translations"]

    async def get_site(self, site_code: str):
        return await self.sites.find_one(
            {"code": site_code},
            {"_id": 0, "code": 1, "description": 1},
        )

    async def get_translation(self, site_code: str, lang: str, source_text: str):
        if self.sites is self.translations:
            return None
        return await self.translations.find_one({
            "site_code": site_code,
            "lang": lang,
            "source_text": source_text,
        })

    async def update_translation_audio(self, translation_id, audio_url: str):
        await self.translations.update_one(
            {"_id": translation_id},
            {"$set": {"audio_url": audio_url}},
        )

    async def save_translation(
        self,
        site_code: str,
        lang: str,
        source_text: str,
        description: str,
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
                    "audio_url": audio_url,
                    "updated_at": updated_at,
                }
            },
            upsert=True,
        )
