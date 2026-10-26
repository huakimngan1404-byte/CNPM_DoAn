import logging
import asyncio
from datetime import datetime, timezone
from typing import Callable

from data.audio_repository import AudioRepository

logger = logging.getLogger(__name__)

FALLBACK_TRANSLATIONS = {
    ("ben-nha-rong", "fr"): (
        "Bienvenue à la Maison du Dragon, un lieu lié au parcours de Nguyễn Tất Thành "
        "pour trouver une voie vers le salut national. Le 5 juin 1911, depuis le port "
        "de Saïgon, ce jeune homme quitta sa patrie à bord du navire Amiral "
        "Latouche-Tréville. Cet événement marqua le début d'un long voyage à travers "
        "de nombreux pays, consacré à l'apprentissage et à l'action révolutionnaire. "
        "Le bâtiment fut d'abord construit pour accueillir le siège de la compagnie "
        "maritime Messageries Maritimes. Son architecture associe des influences "
        "occidentales à des éléments décoratifs orientaux, notamment les dragons qui "
        "ornent son toit. Aujourd'hui, il abrite le musée Hồ Chí Minh, antenne de "
        "Hô Chi Minh-Ville, qui conserve des images, des documents et des objets "
        "relatant la vie et l'engagement du président Hồ Chí Minh. Depuis les rives "
        "de la rivière de Saïgon, imaginez le port du début du XXe siècle et le "
        "départ d'un homme déterminé à trouver la voie de l'indépendance pour son pays."
    ),
}


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
                audio_asset_id, audio_hit = await self._get_or_create_audio_asset(
                    site_code, lang, translated_text
                )
                audio_url = self._audio_url(audio_asset_id)
                if cached.get("audio_asset_id") != audio_asset_id or cached.get("audio_url") != audio_url:
                    await self.repository.update_translation_audio(
                        cached["_id"], audio_asset_id, audio_url
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
                translated_text = FALLBACK_TRANSLATIONS.get((site_code, lang))
                if translated_text is None:
                    logger.error("[Translation] Timeout for site=%s, lang=%s", site_code, lang)
                    raise SiteTranslationError(504, "Translation timed out") from exc
                logger.warning(
                    "[Translation] Using saved fallback for site=%s, lang=%s after timeout",
                    site_code,
                    lang,
                )
            except Exception as exc:
                translated_text = FALLBACK_TRANSLATIONS.get((site_code, lang))
                if translated_text is not None:
                    logger.warning(
                        "[Translation] Using saved fallback for site=%s, lang=%s",
                        site_code,
                        lang,
                    )
                else:
                    logger.exception(
                        "[Translation] Failed for site=%s, lang=%s", site_code, lang
                    )
                    raise SiteTranslationError(
                        502, "Translation failed. Please try again later."
                    ) from exc

        await self.repository.save_translation(
            site_code,
            lang,
            source_text,
            translated_text,
            None,
            None,
            datetime.now(timezone.utc),
        )
        audio_asset_id, audio_hit = await self._get_or_create_audio_asset(
            site_code, lang, translated_text
        )
        audio_url = self._audio_url(audio_asset_id)
        await self.repository.save_translation(
            site_code,
            lang,
            source_text,
            translated_text,
            audio_asset_id,
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

    async def _get_or_create_audio_asset(self, site_code: str, lang: str, text: str):
        asset_id = self.tts_service.get_audio_cache_key(text, lang)
        if await self.repository.get_audio_asset(asset_id):
            return asset_id, True

        audio_path, disk_cache_hit, _ = await self._generate_audio(site_code, lang, text)
        try:
            with open(audio_path, "rb") as audio_file:
                audio_data = audio_file.read()
        except OSError as exc:
            logger.exception("[Audio] Could not read generated audio for site=%s, lang=%s", site_code, lang)
            raise SiteTranslationError(
                502, "Generated audio could not be saved."
            ) from exc

        if not audio_data:
            raise SiteTranslationError(502, "Generated audio file is empty.")
        await self.repository.save_audio_asset(asset_id, audio_data, site_code, lang)
        return asset_id, disk_cache_hit

    def _audio_url(self, audio_asset_id: str) -> str:
        return f"{self.public_base_url}/api/audio/files/{audio_asset_id}"

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
