import logging
import os
import asyncio
from datetime import datetime, timezone
from typing import Callable

from data.audio_repository import AudioRepository

logger = logging.getLogger(__name__)


class SiteTranslationError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class SiteTranslationService:
    supported_languages = {"vi", "en", "zh", "ja", "ko", "fr", "de"}

    def __init__(
        self,
        repository: AudioRepository,
        tts_service,
        public_base_url: str,
        translate_with_timeout: Callable,
    ):
        self.repository = repository
        self.tts_service = tts_service
        self.public_base_url = public_base_url.rstrip("/")
        self.translate_with_timeout = translate_with_timeout

    async def get_translation(self, site_code: str, lang: str):
        if lang not in self.supported_languages:
            raise SiteTranslationError(400, f"Unsupported language: {lang}")

        site = await self.repository.get_site(site_code)
        if site is None:
            raise SiteTranslationError(404, f"Site '{site_code}' was not found")

        source_text = site.get("description")
        if not isinstance(source_text, str) or not source_text.strip():
            raise SiteTranslationError(422, "Site has no Vietnamese description")
        source_text = source_text.strip()

        cached = await self.repository.get_translation(site_code, lang, source_text)
        if cached:
            translated_text = cached.get("description")
            if isinstance(translated_text, str) and translated_text.strip():
                translated_text = translated_text.strip()
                audio_path, audio_hit, _ = await self._generate_audio(
                    site_code, lang, translated_text
                )
                audio_url = self._audio_url(audio_path)
                if "_id" in cached:
                    await self.repository.update_translation_audio(
                        cached["_id"], audio_url
                    )
                return self._result(
                    site_code, lang, translated_text, audio_url, "HIT", audio_hit
                )

        if lang == "vi":
            translated_text = source_text
        else:
            try:
                translated_text = await self.translate_with_timeout(source_text, lang)
                if not isinstance(translated_text, str) or not translated_text.strip():
                    raise RuntimeError("Translation returned empty text")
                translated_text = translated_text.strip()
            except asyncio.TimeoutError as exc:
                logger.error("[Translation] Timeout for site=%s, lang=%s", site_code, lang)
                raise SiteTranslationError(504, "Translation timed out") from exc
            except Exception as exc:
                logger.exception(
                    "[Translation] Failed for site=%s, lang=%s", site_code, lang
                )
                raise SiteTranslationError(
                    502, "Translation failed. Please try again later."
                ) from exc

        audio_path, audio_hit, _ = await self._generate_audio(
            site_code, lang, translated_text
        )
        audio_url = self._audio_url(audio_path)
        await self.repository.save_translation(
            site_code,
            lang,
            source_text,
            translated_text,
            audio_url,
            datetime.now(timezone.utc),
        )
        return self._result(
            site_code, lang, translated_text, audio_url, "MISS", audio_hit
        )

    async def _generate_audio(self, site_code: str, lang: str, text: str):
        try:
            return await self.tts_service.generate_audio(
                text, lang, do_translate=False
            )
        except Exception as exc:
            logger.exception("[Audio] Failed for site=%s, lang=%s", site_code, lang)
            raise SiteTranslationError(
                502, "Audio generation failed. Please try again later."
            ) from exc

    def _audio_url(self, audio_path: str) -> str:
        return (
            f"{self.public_base_url}/static/audio/"
            f"{os.path.basename(audio_path)}"
        )

    @staticmethod
    def _result(site_code, lang, description, audio_url, translation_cache, audio_hit):
        return {
            "code": site_code,
            "lang": lang,
            "description": description,
            "audio_url": audio_url,
            "translation_cache": translation_cache,
            "audio_cache": "HIT" if audio_hit else "MISS",
        }
