"""
Comprehensive test suite for translation error handling, retry logic, and timeout handling.
Tests cover exception types, exponential backoff, caching, and edge cases.
"""

import pytest
import asyncio
import logging
import base64
import hashlib
import hmac
import json
import time
from unittest.mock import patch, MagicMock, AsyncMock, call
from business import audio_service
from business.audio_service import TTSService
from business.site_translation_service import SiteTranslationService
from presentation.audio_router import get_audio_file, get_site_translation, require_admin
from deep_translator.exceptions import (
    ServerException,
    RequestError,
    LanguageNotSupportedException
)

# Configure logging for tests
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TestDatabaseBackedSiteTranslation:
    @staticmethod
    def create_audio_file(tmp_path, filename):
        audio_path = tmp_path / filename
        audio_path.write_bytes(b"test audio")
        return str(audio_path)

    @pytest.mark.asyncio
    async def test_translation_generation_requires_valid_admin_session(self):
        from fastapi import HTTPException

        secret = b"admin-test-secret"
        encode = lambda value: base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")
        payload = encode(json.dumps({
            "sub": "admin",
            "exp": int(time.time()) + 600,
        }, separators=(",", ":")).encode())
        signature = encode(hmac.new(secret, payload.encode("ascii"), hashlib.sha256).digest())
        token = f"{payload}.{signature}"

        accounts = MagicMock()
        accounts.find_one = AsyncMock(return_value={
            "_id": "primary",
            "username": "admin",
            "token_secret": encode(secret),
        })
        database = MagicMock()
        database.__getitem__.side_effect = {"admin_accounts": accounts}.__getitem__

        with patch("presentation.audio_router.main.db", database):
            assert await require_admin(f"Bearer {token}") == {"username": "admin"}

            with pytest.raises(HTTPException) as exc_info:
                await require_admin("Bearer invalid")

        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    @pytest.mark.parametrize("lang", ["fr", "de", "es", "ru", "th", "it"])
    @patch("presentation.audio_router.tts_service.generate_audio", new_callable=AsyncMock)
    @patch("presentation.audio_router.translate_with_timeout", new_callable=AsyncMock)
    async def test_translates_additional_voice_languages(
        self,
        mock_translate,
        mock_generate_audio,
        lang,
        tmp_path,
    ):
        mock_translate.return_value = f"Translated to {lang}"
        mock_generate_audio.return_value = (
            self.create_audio_file(tmp_path, f"{lang}_audio-key.mp3"),
            False,
            "audio-key",
        )
        sites = MagicMock()
        sites.find_one = AsyncMock(
            return_value={"code": "site-1", "description": "Mô tả tiếng Việt"}
        )
        translations = MagicMock()
        translations.find_one = AsyncMock(return_value=None)
        translations.update_one = AsyncMock()
        audio_assets = MagicMock()
        audio_assets.find_one = AsyncMock(return_value=None)
        audio_assets.update_one = AsyncMock()

        with patch("presentation.audio_router.main.db") as mock_db:
            mock_db.__getitem__.side_effect = {
                "sites": sites,
                "translations": translations,
                "audio_assets": audio_assets,
            }.__getitem__
            result = await get_site_translation("site-1", lang)

        mock_translate.assert_awaited_once_with("Mô tả tiếng Việt", lang)
        mock_generate_audio.assert_awaited_once_with(
            f"Translated to {lang}",
            lang,
            do_translate=False,
        )
        assert result["lang"] == lang
        assert result["description"] == f"Translated to {lang}"
        assert result["audio_url"].startswith("http://localhost:8001/api/audio/files/")
        audio_assets.update_one.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_google_translation_retries_temporary_520(self, monkeypatch):
        responses = [520, 200]

        class FakeResponse:
            def __init__(self, status):
                self.status = status

            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return False

            async def json(self):
                return [[["Traduit", "source", None, None]]]

        class FakeSession:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return False

            def get(self, *_args, **_kwargs):
                return FakeResponse(responses.pop(0))

        monkeypatch.setattr(audio_service.aiohttp, "ClientSession", FakeSession)
        monkeypatch.setattr(audio_service.asyncio, "sleep", AsyncMock())

        translator = audio_service.AudioService()
        result = await translator._google_gtx_direct("Bonjour", "vi", "fr")

        assert result == "Traduit"
        assert responses == []

    @pytest.mark.asyncio
    async def test_resolves_edge_voice_for_language_not_in_default_mapping(self, monkeypatch):
        monkeypatch.setattr(
            audio_service,
            "_VOICE_CATALOG",
            [
                {"Locale": "xx-XX", "Gender": "Male", "ShortName": "xx-XX-VoiceNeural"},
            ],
        )

        voice = await audio_service._resolve_voice("xx", {})

        assert voice == "xx-XX-VoiceNeural"

    def test_dynamic_voice_audio_uses_a_new_cache_key(self, tmp_path):
        service = TTSService(cache_dir=str(tmp_path))
        text = "Test narration"

        assert service.get_audio_cache_key(text, "xx") != (
            f"xx_{service._get_hash(text, 'xx')}"
        )

    def test_tts_has_explicit_voices_for_more_than_15_languages(self):
        assert len(audio_service.VOICE_MAPPING) >= 20

    @pytest.mark.asyncio
    async def test_vietnamese_site_narration_uses_manual_source_without_translation(self, tmp_path):
        audio_path = self.create_audio_file(tmp_path, "vi_audio-key.mp3")
        repository = MagicMock()
        repository.get_language = AsyncMock(return_value={"code": "vi", "is_active": True})
        repository.get_site = AsyncMock(
            return_value={"code": "site-1", "description": "Bài tiếng Việt tự viết"}
        )
        repository.get_translation = AsyncMock(return_value=None)
        repository.save_translation = AsyncMock()
        repository.get_audio_asset = AsyncMock(return_value=None)
        repository.save_audio_asset = AsyncMock()
        translator = AsyncMock()
        tts = MagicMock()
        tts.get_audio_cache_key.return_value = "vi_audio-key"
        tts.generate_audio = AsyncMock(return_value=(audio_path, False, "audio-key"))
        service = SiteTranslationService(
            repository,
            tts,
            "http://localhost:8001",
            translator,
        )

        result = await service.get_translation("site-1", "vi")

        translator.assert_not_awaited()
        tts.generate_audio.assert_awaited_once_with(
            "Bài tiếng Việt tự viết",
            "vi",
            do_translate=False,
        )
        repository.save_audio_asset.assert_awaited_once()
        assert result["description"] == "Bài tiếng Việt tự viết"
        assert result["audio_url"].endswith("/api/audio/files/vi_audio-key")

    @pytest.mark.asyncio
    @patch("presentation.audio_router.tts_service.generate_audio", new_callable=AsyncMock)
    @patch("presentation.audio_router.translate_with_timeout", new_callable=AsyncMock)
    async def test_reads_vietnamese_description_translates_and_generates_audio(
        self,
        mock_translate,
        mock_generate_audio,
        tmp_path,
    ):
        mock_translate.return_value = "A translated description"
        mock_generate_audio.return_value = (
            self.create_audio_file(tmp_path, "en_audio-key.mp3"),
            False,
            "audio-key",
        )
        sites = MagicMock()
        sites.find_one = AsyncMock(
            return_value={"code": "site-1", "description": "Mô tả tiếng Việt"}
        )
        translations = MagicMock()
        translations.find_one = AsyncMock(return_value=None)
        translations.update_one = AsyncMock()
        audio_assets = MagicMock()
        audio_assets.find_one = AsyncMock(return_value=None)
        audio_assets.update_one = AsyncMock()

        with patch("presentation.audio_router.main.db") as mock_db:
            mock_db.__getitem__.side_effect = {
                "sites": sites,
                "translations": translations,
                "audio_assets": audio_assets,
            }.__getitem__
            result = await get_site_translation("site-1", "en")

        sites.find_one.assert_awaited_once_with(
            {"code": "site-1"},
            {"_id": 0, "code": 1, "description": 1},
        )
        mock_translate.assert_awaited_once_with("Mô tả tiếng Việt", "en")
        mock_generate_audio.assert_awaited_once_with(
            "A translated description",
            "en",
            do_translate=False,
        )
        assert result["description"] == "A translated description"
        assert result["audio_url"].startswith("http://localhost:8001/api/audio/files/")
        assert result["audio_cache"] == "MISS"
        assert translations.update_one.await_count == 2
        update_filter, update_document = translations.update_one.await_args_list[-1].args[:2]
        assert update_filter == {"site_code": "site-1", "lang": "en"}
        assert update_document["$set"]["description"] == "A translated description"
        assert update_document["$set"]["source_text"] == "Mô tả tiếng Việt"
        assert update_document["$set"]["audio_asset_id"] in result["audio_url"]
        first_update = translations.update_one.await_args_list[0].args[1]["$set"]
        assert first_update["description"] == "A translated description"
        assert first_update["audio_asset_id"] is None
        assert first_update["audio_url"] is None
        audio_assets.update_one.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_returns_not_found_when_site_is_missing(self):
        from fastapi import HTTPException

        collection = MagicMock()
        collection.find_one = AsyncMock(return_value=None)

        with patch("presentation.audio_router.main.db") as mock_db:
            mock_db.__getitem__.return_value = collection
            with pytest.raises(HTTPException) as exc_info:
                await get_site_translation("missing", "en")

        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_rejects_site_without_a_vietnamese_description(self):
        from fastapi import HTTPException

        collection = MagicMock()
        collection.find_one = AsyncMock(return_value={"code": "site-1", "description": ""})

        with patch("presentation.audio_router.main.db") as mock_db:
            mock_db.__getitem__.return_value = collection
            with pytest.raises(HTTPException) as exc_info:
                await get_site_translation("site-1", "en")

        assert exc_info.value.status_code == 422

    @pytest.mark.asyncio
    async def test_cached_translation_and_audio_do_not_call_translation_or_tts(self):
        repository = MagicMock()
        repository.get_site = AsyncMock(
            return_value={"code": "site-1", "description": "Unchanged source"}
        )
        repository.get_translation = AsyncMock(
            return_value={
                "_id": "translation-id",
                "description": "Cached translation",
                "audio_asset_id": "en_cached-audio",
                "audio_url": "http://localhost:8001/api/audio/files/en_cached-audio",
            }
        )
        repository.get_audio_asset = AsyncMock(
            return_value={"_id": "en_cached-audio"}
        )
        repository.save_audio_asset = AsyncMock()
        repository.save_translation = AsyncMock()
        translator = AsyncMock()
        tts = MagicMock()
        tts.get_audio_cache_key.return_value = "en_cached-audio"
        tts.generate_audio = AsyncMock()
        service = SiteTranslationService(
            repository,
            tts,
            "http://localhost:8001",
            translator,
        )

        result = await service.get_translation("site-1", "en")

        assert result["translation_cache"] == "HIT"
        assert result["audio_cache"] == "HIT"
        translator.assert_not_awaited()
        tts.generate_audio.assert_not_awaited()
        repository.save_audio_asset.assert_not_awaited()
        repository.save_translation.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_persists_translation_before_audio_generation_and_reuses_it_after_tts_failure(
        self,
        tmp_path,
    ):
        audio_path = self.create_audio_file(tmp_path, "en_cached-audio.mp3")
        repository = MagicMock()
        repository.get_site = AsyncMock(
            return_value={"code": "site-1", "description": "Unchanged source"}
        )
        repository.get_translation = AsyncMock(side_effect=[
            None,
            {
                "_id": "translation-id",
                "description": "Translated description",
                "audio_asset_id": None,
                "audio_url": None,
            },
        ])
        repository.get_audio_asset = AsyncMock(return_value=None)
        repository.save_translation = AsyncMock()
        repository.save_audio_asset = AsyncMock()
        repository.update_translation_audio = AsyncMock()
        translator = AsyncMock(return_value="Translated description")
        tts = MagicMock()
        tts.get_audio_cache_key.return_value = "en_cached-audio"
        tts.generate_audio = AsyncMock(side_effect=[
            RuntimeError("TTS service unavailable"),
            (audio_path, False, "en_cached-audio"),
        ])
        service = SiteTranslationService(
            repository,
            tts,
            "http://localhost:8001",
            translator,
        )

        from business.site_translation_service import SiteTranslationError

        with pytest.raises(SiteTranslationError, match="Audio generation failed"):
            await service.get_translation("site-1", "en")

        first_save = repository.save_translation.await_args.args
        assert first_save[3] == "Translated description"
        assert first_save[4:6] == (None, None)

        result = await service.get_translation("site-1", "en")

        assert result["translation_cache"] == "HIT"
        assert result["description"] == "Translated description"
        translator.assert_awaited_once_with("Unchanged source", "en")
        assert tts.generate_audio.await_count == 2
        repository.save_translation.assert_awaited_once()
        repository.update_translation_audio.assert_awaited_once()

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("method", "headers", "expected_status", "expected_data"),
        [
            ("HEAD", [], 200, b""),
            ("GET", [(b"range", b"bytes=1-3")], 206, b"bcd"),
        ],
    )
    async def test_audio_asset_supports_head_and_byte_range(
        self,
        method,
        headers,
        expected_status,
        expected_data,
    ):
        from starlette.requests import Request

        request = Request({
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": method,
            "scheme": "http",
            "path": "/api/audio/files/vi_test",
            "raw_path": b"/api/audio/files/vi_test",
            "query_string": b"",
            "headers": headers,
            "client": ("testclient", 80),
            "server": ("testserver", 80),
        })
        with patch("presentation.audio_router.main.db") as mock_db:
            with patch(
                "presentation.audio_router.AudioRepository.read_audio_asset",
                new_callable=AsyncMock,
                return_value={"data": b"abcdef", "content_type": "audio/mpeg"},
            ):
                response = await get_audio_file("vi_test", request)

        assert response.status_code == expected_status
        assert response.body == expected_data
        assert response.headers["accept-ranges"] == "bytes"

    @pytest.mark.asyncio
    @patch("presentation.audio_router.tts_service.generate_audio", new_callable=AsyncMock)
    @patch("presentation.audio_router.translate_with_timeout", new_callable=AsyncMock)
    async def test_changed_source_text_is_translated_and_replaces_saved_translation(
        self,
        mock_translate,
        mock_generate_audio,
        tmp_path,
    ):
        mock_translate.return_value = "Updated English description"
        mock_generate_audio.return_value = (
            self.create_audio_file(tmp_path, "en_audio-key.mp3"),
            False,
            "audio-key",
        )
        sites = MagicMock()
        sites.find_one = AsyncMock(
            return_value={"code": "site-1", "description": "Updated Vietnamese description"}
        )
        translations = MagicMock()
        translations.find_one = AsyncMock(return_value=None)
        translations.update_one = AsyncMock()
        audio_assets = MagicMock()
        audio_assets.find_one = AsyncMock(return_value=None)
        audio_assets.update_one = AsyncMock()

        with patch("presentation.audio_router.main.db") as mock_db:
            mock_db.__getitem__.side_effect = {
                "sites": sites,
                "translations": translations,
                "audio_assets": audio_assets,
            }.__getitem__
            result = await get_site_translation("site-1", "en")

        translations.find_one.assert_awaited_once_with({
            "site_code": "site-1",
            "lang": "en",
            "source_text": "Updated Vietnamese description",
        })
        mock_translate.assert_awaited_once_with(
            "Updated Vietnamese description",
            "en",
        )
        assert translations.update_one.await_count == 2
        update_filter, update_document = translations.update_one.await_args_list[-1].args[:2]
        assert update_filter == {"site_code": "site-1", "lang": "en"}
        assert update_document["$set"]["source_text"] == "Updated Vietnamese description"
        assert update_document["$set"]["description"] == "Updated English description"
        assert result["description"] == "Updated English description"


class TestTranslateTextBasics:
    """Test basic translation functionality and passthrough logic."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.service = TTSService(cache_dir="static/audio")
        # Clear cache before each test to avoid interference
        self.service._translate_cached.cache_clear()
    
    def test_empty_text_passthrough(self):
        """Empty text should be returned as-is without translation attempt."""
        result = self.service.translate_text("", "en")
        assert result == ""
    
    def test_vietnamese_passthrough(self):
        """Vietnamese language should be returned as-is without translation attempt."""
        text = "Xin chào"
        result = self.service.translate_text(text, "vi")
        assert result == text
    
    def test_empty_text_with_vietnamese_passthrough(self):
        """Empty Vietnamese should be returned as-is."""
        result = self.service.translate_text("", "vi")
        assert result == ""
    
    @patch('business.audio_service.GoogleTranslator')
    def test_successful_translation_first_attempt(self, mock_translator_class):
        """Successful translation on first attempt should return translated text."""
        mock_translator = MagicMock()
        mock_translator.translate.return_value = "Hello"
        mock_translator_class.return_value = mock_translator
        
        self.service._translate_cached.cache_clear()
        
        result = self.service.translate_text("Xin chào", "en", max_retries=3, retry_delay=1)
        
        assert result == "Hello"
        assert mock_translator.translate.call_count == 1


class TestAITranslationFlow:
    @pytest.mark.asyncio
    async def test_ai_translation_is_used_before_free_fallbacks(self):
        service = TTSService(cache_dir="static/audio")
        service.ai_translator._ai_gemini = AsyncMock(return_value="AI translated")
        service.ai_translator._ai_groq = AsyncMock(return_value=None)
        service.ai_translator._ai_openrouter = AsyncMock(return_value=None)
        service.ai_translator._ai_mistral = AsyncMock(return_value=None)
        service.ai_translator._ai_deepseek = AsyncMock(return_value=None)
        service.ai_translator._google_gtx_direct = AsyncMock(return_value=None)

        result = await service.translate_text_async(
            "Unique AI test text",
            "en",
        )

        assert result == "AI translated"
        service.ai_translator._ai_gemini.assert_awaited_once()
        service.ai_translator._google_gtx_direct.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_free_translation_fallback_runs_when_ai_providers_fail(self):
        service = TTSService(cache_dir="static/audio")
        for provider in (
            "_ai_gemini",
            "_ai_groq",
            "_ai_openrouter",
            "_ai_mistral",
            "_ai_deepseek",
        ):
            setattr(service.ai_translator, provider, AsyncMock(return_value=None))
        service.ai_translator._google_gtx_direct = AsyncMock(
            return_value="Free fallback translated"
        )

        result = await service.translate_text_async(
            "Unique fallback test text",
            "en",
        )

        assert result == "Free fallback translated"
        service.ai_translator._google_gtx_direct.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_deepseek_translation_is_used_before_free_fallbacks(self):
        service = TTSService(cache_dir="static/audio")
        for provider in ("_ai_gemini", "_ai_groq", "_ai_openrouter", "_ai_mistral"):
            setattr(service.ai_translator, provider, AsyncMock(return_value=None))
        service.ai_translator._ai_deepseek = AsyncMock(return_value="DeepSeek translated")
        service.ai_translator._google_gtx_direct = AsyncMock(return_value=None)

        result = await service.translate_text_async("Unique DeepSeek test text", "fr")

        assert result == "DeepSeek translated"
        service.ai_translator._ai_deepseek.assert_awaited_once_with(
            "Unique DeepSeek test text",
            "vi",
            "fr",
        )
        service.ai_translator._google_gtx_direct.assert_not_awaited()


class TestRetryLogic:
    """Test retry mechanism and exponential backoff timing."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.service = TTSService(cache_dir="static/audio")
        self.service._translate_cached.cache_clear()
    
    @patch('business.audio_service.GoogleTranslator')
    @patch('time.sleep', new_callable=MagicMock)
    def test_retry_on_server_exception(self, mock_sleep, mock_translator_class):
        """ServerException should trigger retry and eventually succeed."""
        mock_translator = MagicMock()
        mock_translator.translate.side_effect = [
            ServerException("Server error"),
            "Success"
        ]
        mock_translator_class.return_value = mock_translator
        
        self.service._translate_cached.cache_clear()
        
        result = self.service.translate_text("Test", "en", max_retries=2, retry_delay=1)
        
        assert result == "Success"
        assert mock_sleep.call_count == 1
    
    @patch('business.audio_service.GoogleTranslator')
    @patch('time.sleep', new_callable=MagicMock)
    def test_retry_on_request_error(self, mock_sleep, mock_translator_class):
        """RequestError should trigger retry."""
        mock_translator = MagicMock()
        mock_translator.translate.side_effect = [
            RequestError("Request failed"),
            "Success"
        ]
        mock_translator_class.return_value = mock_translator
        
        self.service._translate_cached.cache_clear()
        
        result = self.service.translate_text("Test", "en", max_retries=2, retry_delay=1)
        
        assert result == "Success"
        assert mock_sleep.call_count == 1
    
    @patch('business.audio_service.GoogleTranslator')
    @patch('time.sleep', new_callable=MagicMock)
    def test_exponential_backoff_timing(self, mock_sleep, mock_translator_class):
        """Retry delays should follow exponential backoff: delay * (attempt + 1)."""
        mock_translator = MagicMock()
        mock_translator.translate.side_effect = [
            ServerException("Error 1"),
            ServerException("Error 2"),
            "Success"
        ]
        mock_translator_class.return_value = mock_translator
        
        self.service._translate_cached.cache_clear()
        
        result = self.service.translate_text("Test", "en", max_retries=3, retry_delay=2)
        
        assert result == "Success"
        # Should have 2 sleep calls (after attempt 0 and 1)
        assert mock_sleep.call_count == 2
        
        # Check sleep durations: 2*(0+1)=2, 2*(1+1)=4
        sleep_calls = mock_sleep.call_args_list
        # Each call uses time.sleep, so we check the call structure
        assert len(sleep_calls) == 2
    
    @patch('business.audio_service.GoogleTranslator')
    @patch('time.sleep', new_callable=MagicMock)
    def test_max_retries_exceeded_returns_original(self, mock_sleep, mock_translator_class):
        """If all retries fail, should return original text."""
        mock_translator = MagicMock()
        mock_translator.translate.side_effect = ServerException("Server error")
        mock_translator_class.return_value = mock_translator
        
        self.service._translate_cached.cache_clear()
        
        result = self.service.translate_text("Xin chào", "en", max_retries=3, retry_delay=1)
        
        # Should return original text
        assert result == "Xin chào"
        
        # Should have attempted max_retries times
        assert mock_translator.translate.call_count == 3
        
        # Should have slept 2 times (after attempt 0 and 1, not after attempt 2)
        assert mock_sleep.call_count == 2


class TestExceptionHandling:
    """Test exception type classification and handling."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.service = TTSService(cache_dir="static/audio")
        self.service._translate_cached.cache_clear()
    
    @patch('business.audio_service.GoogleTranslator')
    @patch('time.sleep', new_callable=MagicMock)
    def test_server_exception_retryable(self, mock_sleep, mock_translator_class):
        """ServerException should be retryable."""
        mock_translator = MagicMock()
        mock_translator.translate.side_effect = [
            ServerException("Server error"),
            "Success"
        ]
        mock_translator_class.return_value = mock_translator
        
        self.service._translate_cached.cache_clear()
        
        result = self.service.translate_text("Test", "en", max_retries=2, retry_delay=1)
        
        assert result == "Success"
        assert mock_sleep.call_count == 1
    
    @patch('business.audio_service.GoogleTranslator')
    @patch('time.sleep', new_callable=MagicMock)
    def test_request_error_retryable(self, mock_sleep, mock_translator_class):
        """RequestError should be retryable."""
        mock_translator = MagicMock()
        mock_translator.translate.side_effect = [
            RequestError("Request failed"),
            "Success"
        ]
        mock_translator_class.return_value = mock_translator
        
        self.service._translate_cached.cache_clear()
        
        result = self.service.translate_text("Test", "en", max_retries=2, retry_delay=1)
        
        assert result == "Success"
        assert mock_sleep.call_count == 1
    
    @patch('business.audio_service.GoogleTranslator')
    def test_language_not_supported_no_retry(self, mock_translator_class):
        """LanguageNotSupportedException should not retry, return original text immediately."""
        mock_translator = MagicMock()
        mock_translator.translate.side_effect = LanguageNotSupportedException("Unsupported language")
        mock_translator_class.return_value = mock_translator
        
        self.service._translate_cached.cache_clear()
        
        result = self.service.translate_text("Test", "en", max_retries=3, retry_delay=1)
        
        # Should return original text
        assert result == "Test"
        
        # Should attempt only once (no retries for LanguageNotSupportedException)
        assert mock_translator.translate.call_count == 1
    
    @patch('business.audio_service.GoogleTranslator')
    def test_unexpected_exception_no_retry(self, mock_translator_class):
        """Unexpected exceptions should not retry, return original text immediately."""
        mock_translator = MagicMock()
        mock_translator.translate.side_effect = ValueError("Unexpected error")
        mock_translator_class.return_value = mock_translator
        
        self.service._translate_cached.cache_clear()
        
        result = self.service.translate_text("Test", "en", max_retries=3, retry_delay=1)
        
        # Should return original text
        assert result == "Test"
        
        # Should attempt only once (no retries for unexpected errors)
        assert mock_translator.translate.call_count == 1


class TestCaching:
    """Test LRU cache functionality."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.service = TTSService(cache_dir="static/audio")
        self.service._translate_cached.cache_clear()
    
    @patch('business.audio_service.GoogleTranslator')
    def test_cache_hit_on_repeated_translation(self, mock_translator_class):
        """Repeated translations should use cache (avoid calling translator again)."""
        mock_translator = MagicMock()
        mock_translator.translate.return_value = "Hello"
        mock_translator_class.return_value = mock_translator
        
        self.service._translate_cached.cache_clear()
        
        # First call
        result1 = self.service.translate_text("Test", "en", max_retries=1, retry_delay=1)
        # Second call - should hit cache
        result2 = self.service.translate_text("Test", "en", max_retries=1, retry_delay=1)
        
        assert result1 == "Hello"
        assert result2 == "Hello"
        
        # Translator should only be called once (cache hit on second call)
        assert mock_translator.translate.call_count == 1
    
    @patch('business.audio_service.GoogleTranslator')
    def test_cache_miss_for_different_languages(self, mock_translator_class):
        """Different language combinations should not share cache."""
        mock_translator = MagicMock()
        mock_translator.translate.side_effect = ["Hello", "Bonjour"]
        mock_translator_class.return_value = mock_translator
        
        self.service._translate_cached.cache_clear()
        
        result1 = self.service.translate_text("Test", "en", max_retries=1, retry_delay=1)
        result2 = self.service.translate_text("Test", "fr", max_retries=1, retry_delay=1)
        
        assert result1 == "Hello"
        assert result2 == "Bonjour"
        
        # Translator should be called twice (different lang combinations)
        assert mock_translator.translate.call_count == 2
    
    @patch('business.audio_service.GoogleTranslator')
    def test_cache_clear_resets_cache(self, mock_translator_class):
        """cache_clear() should reset the cache."""
        mock_translator = MagicMock()
        mock_translator.translate.return_value = "Hello"
        mock_translator_class.return_value = mock_translator
        
        self.service._translate_cached.cache_clear()
        
        # First call
        result1 = self.service.translate_text("Test", "en", max_retries=1, retry_delay=1)
        
        # Clear cache
        self.service._translate_cached.cache_clear()
        
        # Second call (cache cleared, so should call translator again)
        result2 = self.service.translate_text("Test", "en", max_retries=1, retry_delay=1)
        
        assert result1 == "Hello"
        assert result2 == "Hello"
        
        # Translator should be called twice (cache was cleared)
        assert mock_translator.translate.call_count == 2


class TestAudioFileCache:
    @pytest.mark.asyncio
    async def test_empty_cached_audio_is_regenerated_atomically(self, tmp_path):
        service = TTSService(cache_dir=str(tmp_path))
        text = "Bến Nhà Rồng là di tích lịch sử."
        file_hash = service._get_hash(text, "vi")
        cached_file = tmp_path / f"vi_{file_hash}.mp3"
        cached_file.write_bytes(b"")
        communicate = MagicMock()

        async def save_audio(path):
            with open(path, "wb") as audio_file:
                audio_file.write(b"ID3playable-audio")

        communicate.save = AsyncMock(side_effect=save_audio)

        with patch(
            "business.audio_service.edge_tts.Communicate",
            return_value=communicate,
        ):
            filepath, cache_hit, returned_hash = await service.generate_audio(
                text,
                "vi",
                do_translate=False,
            )

        assert not cache_hit
        assert returned_hash == file_hash
        assert filepath == str(cached_file)
        assert cached_file.read_bytes() == b"ID3playable-audio"
        assert not list(tmp_path.glob("*.tmp"))


class TestConfigurationLoading:
    """Test configuration constants loading from environment variables."""
    
    def test_configuration_constants_exist(self):
        """Configuration constants should be defined in main module."""
        from main import TRANSLATION_MAX_RETRIES, TRANSLATION_RETRY_DELAY, TRANSLATION_TIMEOUT
        
        assert TRANSLATION_MAX_RETRIES > 0
        assert TRANSLATION_RETRY_DELAY > 0
        assert TRANSLATION_TIMEOUT > 0
    
    def test_configuration_defaults(self):
        """Configuration should have sensible defaults."""
        from main import TRANSLATION_MAX_RETRIES, TRANSLATION_RETRY_DELAY, TRANSLATION_TIMEOUT
        
        # Default expectations (from main.py)
        assert TRANSLATION_MAX_RETRIES == 3
        assert TRANSLATION_RETRY_DELAY == 2
        assert TRANSLATION_TIMEOUT == 30


class TestEdgeCases:
    """Test boundary conditions and edge cases."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.service = TTSService(cache_dir="static/audio")
        self.service._translate_cached.cache_clear()
    
    @patch('business.audio_service.GoogleTranslator')
    def test_single_retry_succeeds_on_second(self, mock_translator_class):
        """With max_retries=1, should fail immediately on first error."""
        mock_translator = MagicMock()
        mock_translator.translate.side_effect = ServerException("Error")
        mock_translator_class.return_value = mock_translator
        
        self.service._translate_cached.cache_clear()
        
        result = self.service.translate_text("Test", "en", max_retries=1, retry_delay=1)
        
        # With max_retries=1, it attempts once, catches error, returns original
        assert result == "Test"
        assert mock_translator.translate.call_count == 1
    
    @patch('business.audio_service.GoogleTranslator')
    def test_long_text_translation(self, mock_translator_class):
        """Long text should be handled correctly."""
        mock_translator = MagicMock()
        mock_translator.translate.return_value = "Long translated text"
        mock_translator_class.return_value = mock_translator
        
        self.service._translate_cached.cache_clear()
        
        long_text = "A" * 1000
        result = self.service.translate_text(long_text, "en", max_retries=1, retry_delay=1)
        
        assert result == "Long translated text"
        assert mock_translator.translate.call_count == 1
    
    @patch('business.audio_service.GoogleTranslator')
    def test_special_characters_in_text(self, mock_translator_class):
        """Text with special characters should be handled correctly."""
        mock_translator = MagicMock()
        mock_translator.translate.return_value = "Translated: !@#$%"
        mock_translator_class.return_value = mock_translator
        
        self.service._translate_cached.cache_clear()
        
        special_text = "Test: !@#$%^&*()"
        result = self.service.translate_text(special_text, "en", max_retries=1, retry_delay=1)
        
        assert result == "Translated: !@#$%"
        assert mock_translator.translate.call_count == 1
    
    @patch('business.audio_service.GoogleTranslator')
    @patch('time.sleep', new_callable=MagicMock)
    def test_zero_retry_delay(self, mock_sleep, mock_translator_class):
        """Zero retry delay should work (though unusual)."""
        mock_translator = MagicMock()
        mock_translator.translate.side_effect = [
            ServerException("Error"),
            "Success"
        ]
        mock_translator_class.return_value = mock_translator
        
        self.service._translate_cached.cache_clear()
        
        result = self.service.translate_text("Test", "en", max_retries=2, retry_delay=0)
        
        assert result == "Success"
        assert mock_sleep.call_count == 1


class TestIntegration:
    """Test realistic failure patterns and sequential translations."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.service = TTSService(cache_dir="static/audio")
        self.service._translate_cached.cache_clear()
    
    @patch('business.audio_service.GoogleTranslator')
    @patch('time.sleep', new_callable=MagicMock)
    def test_retry_succeeds_on_third_attempt(self, mock_sleep, mock_translator_class):
        """Retry succeeds only on third attempt."""
        mock_translator = MagicMock()
        mock_translator.translate.side_effect = [
            ServerException("Error 1"),
            RequestError("Error 2"),
            "Final Success"
        ]
        mock_translator_class.return_value = mock_translator
        
        self.service._translate_cached.cache_clear()
        
        result = self.service.translate_text("Test", "en", max_retries=3, retry_delay=1)
        
        assert result == "Final Success"
        assert mock_sleep.call_count == 2
    
    @patch('business.audio_service.GoogleTranslator')
    def test_multiple_sequential_translations(self, mock_translator_class):
        """Multiple sequential translations should work with and without cache."""
        mock_translator = MagicMock()
        mock_translator.translate.side_effect = ["Hello", "Bonjour", "Hola", "Hello"]
        mock_translator_class.return_value = mock_translator
        
        self.service._translate_cached.cache_clear()
        
        result1 = self.service.translate_text("Test", "en", max_retries=1, retry_delay=1)
        result2 = self.service.translate_text("Test", "fr", max_retries=1, retry_delay=1)
        result3 = self.service.translate_text("Test", "es", max_retries=1, retry_delay=1)
        result4 = self.service.translate_text("Test", "en", max_retries=1, retry_delay=1)
        
        assert result1 == "Hello"
        assert result2 == "Bonjour"
        assert result3 == "Hola"
        assert result4 == "Hello"  # Cache hit from first call
        
        # Should call translator 3 times (en, fr, es hit cache for en)
        assert mock_translator.translate.call_count == 3
    
    @patch('business.audio_service.GoogleTranslator')
    @patch('time.sleep', new_callable=MagicMock)
    def test_mixed_retryable_and_non_retryable_errors(self, mock_sleep, mock_translator_class):
        """Mix of retryable (ServerException) and non-retryable (LanguageNotSupportedException) errors."""
        mock_translator = MagicMock()
        
        # First call: ServerException (retryable) then success
        # Second call: LanguageNotSupportedException (non-retryable) returns original
        mock_translator.translate.side_effect = [
            ServerException("Error 1"),
            "Success 1",
            LanguageNotSupportedException("Unsupported")
        ]
        mock_translator_class.return_value = mock_translator
        
        self.service._translate_cached.cache_clear()
        
        result1 = self.service.translate_text("Test1", "en", max_retries=2, retry_delay=1)
        result2 = self.service.translate_text("Test2", "fr", max_retries=2, retry_delay=1)
        
        assert result1 == "Success 1"
        assert result2 == "Test2"  # Non-retryable, returns original
        assert mock_sleep.call_count == 1  # Only one sleep from first translation
