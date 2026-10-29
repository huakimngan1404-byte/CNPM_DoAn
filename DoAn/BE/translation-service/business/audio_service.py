import os
import re
import hashlib
import asyncio
import json
import logging
import time
import functools
import tempfile
from typing import Optional, Dict, Tuple
import aiohttp
import edge_tts
from deep_translator import (
    GoogleTranslator,
    MyMemoryTranslator,
    LibreTranslator,
)
from deep_translator.exceptions import (
    ServerException,
    RequestError,
    LanguageNotSupportedException,
)
from data.audio_file_repository import AudioFileRepository

logger = logging.getLogger(__name__)

# Cache bản dịch trên RAM để không phải gọi lại API với cùng nội dung di tích
_TRANSLATION_CACHE: Dict[str, str] = {}

# Giọng đọc chuẩn của Edge-TTS cho từng ngôn ngữ thuyết minh di tích
VOICE_MAPPING = {
    "vi": "vi-VN-HoaiMyNeural",
    "en": "en-US-AriaNeural",
    "zh": "zh-CN-XiaoxiaoNeural",
    "zh-cn": "zh-CN-XiaoxiaoNeural",
    "zh-tw": "zh-TW-HsiaoChenNeural",
    "ja": "ja-JP-NanamiNeural",
    "ko": "ko-KR-SunHiNeural",
    "fr": "fr-FR-DeniseNeural",
    "de": "de-DE-KatjaNeural",
    "es": "es-ES-ElviraNeural",
    "it": "it-IT-ElsaNeural",
    "pt": "pt-PT-RaquelNeural",
    "pt-br": "pt-BR-FranciscaNeural",
    "ru": "ru-RU-SvetlanaNeural",
    "th": "th-TH-PremwadeeNeural",
    "ar": "ar-EG-SalmaNeural",
    "hi": "hi-IN-SwaraNeural",
    "id": "id-ID-GadisNeural",
    "ms": "ms-MY-YasminNeural",
    "nl": "nl-NL-ColetteNeural",
    "tr": "tr-TR-EmelNeural",
    "pl": "pl-PL-ZofiaNeural",
    "sv": "sv-SE-SofieNeural",
    "da": "da-DK-ChristelNeural",
    "no": "nb-NO-PernilleNeural",
    "fi": "fi-FI-NooraNeural",
    "el": "el-GR-AthinaNeural",
    "cs": "cs-CZ-VlastaNeural",
    "hu": "hu-HU-NoemiNeural",
    "ro": "ro-RO-AlinaNeural",
    "uk": "uk-UA-PolinaNeural",
    "he": "he-IL-HilaNeural",
    "tl": "fil-PH-BlessicaNeural",
}

TRANSLATION_LANGUAGE_MAP = {
    "pt-br": "pt",
}

LANGUAGE_NAMES = {
    "vi": "Vietnamese",
    "en": "English",
    "zh": "Chinese",
    "ja": "Japanese",
    "ko": "Korean",
    "fr": "French",
    "de": "German",
    "es": "Spanish",
    "it": "Italian",
    "pt": "Portuguese",
    "pt-br": "Brazilian Portuguese",
    "ru": "Russian",
    "th": "Thai",
    "ar": "Arabic",
    "hi": "Hindi",
    "id": "Indonesian",
    "ms": "Malay",
    "nl": "Dutch",
    "tr": "Turkish",
    "pl": "Polish",
    "sv": "Swedish",
    "da": "Danish",
    "no": "Norwegian",
    "fi": "Finnish",
    "el": "Greek",
    "cs": "Czech",
    "hu": "Hungarian",
    "ro": "Romanian",
    "uk": "Ukrainian",
    "he": "Hebrew",
    "tl": "Filipino",
}

MYMEMORY_LANG_MAP = {
    "vi": "vi-VN",
    "en": "en-GB",
    "zh": "zh-CN",
    "zh-cn": "zh-CN",
    "zh-tw": "zh-TW",
    "ja": "ja-JP",
    "ko": "ko-KR",
    "fr": "fr-FR",
    "de": "de-DE",
    "es": "es-ES",
    "it": "it-IT",
    "pt": "pt-PT",
    "pt-br": "pt-BR",
    "ru": "ru-RU",
    "th": "th-TH",
    "ar": "ar-SA",
    "hi": "hi-IN",
    "id": "id-ID",
    "ms": "ms-MY",
    "nl": "nl-NL",
    "tr": "tr-TR",
    "pl": "pl-PL",
    "sv": "sv-SE",
    "da": "da-DK",
    "no": "nb-NO",
    "fi": "fi-FI",
    "el": "el-GR",
    "cs": "cs-CZ",
    "hu": "hu-HU",
    "ro": "ro-RO",
    "uk": "uk-UA",
    "he": "he-IL",
    "tl": "tl-PH",
}

_VOICE_CATALOG = None


async def _resolve_voice(target_lang: str, voice_cache: dict) -> str:
    global _VOICE_CATALOG
    normalized_lang = target_lang.lower().strip()
    if normalized_lang in voice_cache:
        return voice_cache[normalized_lang]

    voice = VOICE_MAPPING.get(normalized_lang)
    if voice is None:
        base_lang = normalized_lang.split("-", 1)[0]
        voice = VOICE_MAPPING.get(base_lang)
    if voice is None:
        if _VOICE_CATALOG is None:
            _VOICE_CATALOG = await edge_tts.list_voices()
        base_lang = normalized_lang.split("-", 1)[0]
        candidates = [
            item for item in _VOICE_CATALOG
            if item.get("Locale", "").lower().split("-", 1)[0] == base_lang
        ]
        candidates.sort(
            key=lambda item: (
                item.get("Locale", "").lower() != normalized_lang,
                item.get("Gender") != "Female",
            )
        )
        if not candidates:
            raise ValueError(f"No text-to-speech voice is available for language '{target_lang}'.")
        voice = candidates[0]["ShortName"]

    voice_cache[normalized_lang] = voice
    return voice


class TTSService:
    def __init__(self, cache_dir: str = "static/audio"):
        self.cache_dir = cache_dir
        os.makedirs(self.cache_dir, exist_ok=True)
        self.audio_file_repository = AudioFileRepository()
        self._voice_cache = {}
        self._translate_cached = functools.lru_cache(maxsize=256)(self._translate_cached_impl)
        self.ai_translator = AudioService(audio_dir=cache_dir)

    def get_pack_manifest(self, lang: str):
        return self.audio_file_repository.get_pack_manifest(self.cache_dir, lang)

    def _get_hash(self, text: str, target_lang: str) -> str:
        raw = f"{target_lang.lower().strip()}:{text.strip()}"
        return hashlib.md5(raw.encode("utf-8")).hexdigest()

    def _get_audio_hash(self, text: str, target_lang: str) -> str:
        normalized_lang = target_lang.lower().strip()
        base_lang = normalized_lang.split("-", 1)[0]
        if normalized_lang not in VOICE_MAPPING and base_lang not in VOICE_MAPPING:
            return self._get_hash(f"dynamic-voice:{text}", normalized_lang)
        return self._get_hash(text, normalized_lang)

    def get_audio_cache_key(self, text: str, target_lang: str) -> str:
        return f"{target_lang.lower().strip()}_{self._get_audio_hash(text, target_lang)}"

    def _translate_cached_impl(
        self,
        text: str,
        target_lang: str,
        source_lang: str = "vi",
        max_retries: int = 3,
        retry_delay: int = 1,
    ) -> str:
        if not text or not text.strip():
            return text

        target_lang = target_lang.lower().strip()
        source_lang = source_lang.lower().strip()
        if source_lang == target_lang:
            return text

        max_retries = max(1, int(max_retries))
        retry_delay = max(0, int(retry_delay))

        for attempt in range(1, max_retries + 1):
            try:
                translator = GoogleTranslator(source=source_lang, target=target_lang)
                return translator.translate(text)
            except (ServerException, RequestError) as exc:
                if attempt >= max_retries:
                    logger.warning("[Translation] Retry limit reached for %s -> %s: %s", source_lang, target_lang, exc)
                    return text
                time.sleep(retry_delay * attempt)
            except LanguageNotSupportedException:
                return text
            except Exception:
                return text

        return text

    def translate_text(
        self,
        text: str,
        target_lang: str,
        source_lang: str = "vi",
        max_retries: int = 3,
        retry_delay: int = 1,
    ) -> str:
        if not text or not text.strip():
            return text

        target_lang = target_lang.lower().strip()
        source_lang = source_lang.lower().strip()
        if source_lang == target_lang:
            return text

        cache_args = (text, target_lang, source_lang, max_retries, retry_delay)
        return self._translate_cached(*cache_args)

    async def translate_text_async(
        self,
        text: str,
        target_lang: str,
        source_lang: str = "vi",
    ) -> str:
        return await self.ai_translator.translate_text(
            text,
            target_lang=target_lang,
            source_lang=source_lang,
        )

    async def generate_audio(
        self,
        text: str,
        target_lang: str = "vi",
        source_lang: str = "vi",
        do_translate: bool = True,
    ):
        translated_text = text
        if do_translate:
            translated_text = await self.translate_text_async(
                text,
                target_lang,
                source_lang,
            )

        file_hash = self._get_audio_hash(translated_text, target_lang)
        filename = f"{target_lang}_{file_hash}.mp3"
        filepath = os.path.join(self.cache_dir, filename)
        is_hit = os.path.isfile(filepath) and os.path.getsize(filepath) > 0

        if not is_hit:
            if os.path.exists(filepath):
                os.remove(filepath)
            os.makedirs(self.cache_dir, exist_ok=True)
            voice = await _resolve_voice(target_lang, self._voice_cache)
            communicate = edge_tts.Communicate(translated_text, voice)
            temp_fd, temp_path = tempfile.mkstemp(
                dir=self.cache_dir,
                prefix=f".{filename}.",
                suffix=".tmp",
            )
            os.close(temp_fd)
            try:
                await communicate.save(temp_path)
                if os.path.getsize(temp_path) == 0:
                    raise RuntimeError("Text-to-speech returned an empty audio file.")
                os.replace(temp_path, filepath)
            finally:
                if os.path.exists(temp_path):
                    os.remove(temp_path)

        return filepath, is_hit, file_hash


class AudioTaskManager:
    def __init__(self, tts_service: TTSService):
        self.tts_service = tts_service
        self.tasks = {}
        self.subscribers = []

    async def broadcast_status(self, task_id: str):
        if task_id not in self.tasks:
            return
        payload = json.dumps({"task_id": task_id, "status": self.tasks[task_id].get("status")})
        for queue in list(self.subscribers):
            await queue.put(payload)

    async def run_task(self, task_id: str, text: str, lang: str):
        self.tasks[task_id] = {"status": "running", "text": text, "lang": lang}
        await self.broadcast_status(task_id)
        try:
            file_path, is_hit, cache_key = await self.tts_service.generate_audio(text, lang)
            self.tasks[task_id].update({
                "status": "completed",
                "file_path": file_path,
                "is_hit": is_hit,
                "cache_key": cache_key,
            })
        except Exception:
            self.tasks[task_id]["status"] = "failed"
        await self.broadcast_status(task_id)

    def submit_task(self, text: str, lang: str) -> str:
        task_id = hashlib.md5(
            f"{text}:{lang}:{asyncio.get_running_loop().time()}".encode()
        ).hexdigest()[:8]
        asyncio.create_task(self.run_task(task_id, text, lang))
        return task_id

    async def control_task(self, task_id: str, action: str) -> str:
        if task_id not in self.tasks:
            raise KeyError(task_id)

        current_status = self.tasks[task_id]["status"]
        if action == "pause" and current_status == "running":
            self.tasks[task_id]["status"] = "paused"
        elif action == "resume" and current_status == "paused":
            self.tasks[task_id]["status"] = "running"
        elif action == "cancel":
            self.tasks[task_id]["status"] = "cancelled"
        else:
            raise ValueError(
                f"Invalid action '{action}' for status '{current_status}'"
            )

        await self.broadcast_status(task_id)
        return self.tasks[task_id]["status"]


class AudioService:
    def __init__(self, audio_dir: str = "static/audio"):
        self.audio_dir = audio_dir
        os.makedirs(self.audio_dir, exist_ok=True)

        # Đọc API keys từ biến môi trường (provider nào có key thì provider đó chạy)
        self.gemini_api_key = os.getenv("GEMINI_API_KEY", "")
        self.groq_api_key = os.getenv("GROQ_API_KEY", "")
        self.openrouter_api_key = os.getenv("OPENROUTER_API_KEY", "")
        self.mistral_api_key = os.getenv("MISTRAL_API_KEY", "")
        self.deepseek_api_key = os.getenv("DEEPSEEK_API_KEY", "")
        self.mymemory_email = os.getenv("MYMEMORY_EMAIL", "")
        self._voice_cache = {}

    def _get_hash(self, text: str, target_lang: str) -> str:
        raw = f"{target_lang.lower().strip()}:{text.strip()}"
        return hashlib.md5(raw.encode("utf-8")).hexdigest()

    def _build_prompt(self, source_lang: str, target_lang: str) -> str:
        source_name = LANGUAGE_NAMES.get(source_lang.lower(), source_lang)
        target_name = LANGUAGE_NAMES.get(target_lang.lower(), target_lang)
        return (
            f"Bạn là chuyên gia dịch thuật thuyết minh di tích lịch sử - văn hóa. "
            f"Hãy dịch đoạn thuyết minh sau từ '{source_name}' sang '{target_name}' "
            f"với văn phong tự nhiên, trang trọng, hấp dẫn khách tham quan. "
            f"CHỈ trả về nội dung bản dịch, không thêm bất kỳ ghi chú nào."
        )

    def _split_chunks(self, text: str, max_length: int = 3500) -> list[str]:
        if len(text) <= max_length:
            return [text]

        sentences = re.split(r'(?<=[.!?。\n])\s+', text)
        chunks, current = [], ""
        for sentence in sentences:
            if len(current) + len(sentence) + 1 <= max_length:
                current += (" " if current else "") + sentence
            else:
                if current:
                    chunks.append(current)
                if len(sentence) > max_length:
                    for i in range(0, len(sentence), max_length):
                        chunks.append(sentence[i:i + max_length])
                    current = ""
                else:
                    current = sentence
        if current:
            chunks.append(current)
        return chunks

    # ---------------- 4 AI TRANSLATORS ----------------

    async def _ai_gemini(self, text: str, source_lang: str, target_lang: str) -> Optional[str]:
        if not self.gemini_api_key:
            return None
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={self.gemini_api_key}"
        payload = {
            "contents": [{"parts": [{"text": f"{self._build_prompt(source_lang, target_lang)}\n\n{text}"}]}]
        }
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, timeout=15) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return data["candidates"][0]["content"]["parts"][0]["text"].strip()
                    logger.warning("[Gemini] Translation request failed with status %s", resp.status)
        except Exception as e:
            logger.warning("[Gemini] Translation request failed (%s)", type(e).__name__)
        return None

    async def _ai_groq(self, text: str, source_lang: str, target_lang: str) -> Optional[str]:
        if not self.groq_api_key:
            return None
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {"Authorization": f"Bearer {self.groq_api_key}", "Content-Type": "application/json"}
        payload = {
            "model": "llama-3.3-70b-versatile",
            "messages": [
                {"role": "system", "content": self._build_prompt(source_lang, target_lang)},
                {"role": "user", "content": text},
            ],
            "temperature": 0.2,
        }
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, headers=headers, json=payload, timeout=15) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return data["choices"][0]["message"]["content"].strip()
                    logger.warning("[Groq] Translation request failed with status %s", resp.status)
        except Exception as e:
            logger.warning(f"[Groq] Lỗi dịch: {e}")
        return None

    async def _ai_openrouter(self, text: str, source_lang: str, target_lang: str) -> Optional[str]:
        if not self.openrouter_api_key:
            return None
        url = "https://openrouter.ai/api/v1/chat/completions"
        headers = {"Authorization": f"Bearer {self.openrouter_api_key}", "Content-Type": "application/json"}
        models = [
            "qwen/qwen-2.5-72b-instruct:free",
            "deepseek/deepseek-chat:free",
            "meta-llama/llama-3.3-70b-instruct:free",
        ]
        async with aiohttp.ClientSession() as session:
            for model in models:
                payload = {
                    "model": model,
                    "messages": [
                        {"role": "system", "content": self._build_prompt(source_lang, target_lang)},
                        {"role": "user", "content": text},
                    ],
                    "temperature": 0.2,
                }
                try:
                    async with session.post(url, headers=headers, json=payload, timeout=15) as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            if data.get("choices"):
                                return data["choices"][0]["message"]["content"].strip()
                        else:
                            logger.warning(
                                "[OpenRouter - %s] Translation request failed with status %s",
                                model,
                                resp.status,
                            )
                except Exception as e:
                    logger.warning(f"[OpenRouter - {model}] Lỗi dịch: {e}")
        return None

    async def _ai_mistral(self, text: str, source_lang: str, target_lang: str) -> Optional[str]:
        if not self.mistral_api_key:
            return None
        url = "https://api.mistral.ai/v1/chat/completions"
        headers = {"Authorization": f"Bearer {self.mistral_api_key}", "Content-Type": "application/json"}
        payload = {
            "model": "mistral-small-latest",
            "messages": [
                {"role": "system", "content": self._build_prompt(source_lang, target_lang)},
                {"role": "user", "content": text},
            ],
            "temperature": 0.2,
        }
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, headers=headers, json=payload, timeout=15) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return data["choices"][0]["message"]["content"].strip()
                    logger.warning("[Mistral] Translation request failed with status %s", resp.status)
        except Exception as e:
            logger.warning(f"[Mistral] Lỗi dịch: {e}")
        return None

    async def _ai_deepseek(self, text: str, source_lang: str, target_lang: str) -> Optional[str]:
        if not self.deepseek_api_key:
            return None
        url = "https://api.deepseek.com/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.deepseek_api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": "deepseek-chat",
            "messages": [
                {"role": "system", "content": self._build_prompt(source_lang, target_lang)},
                {"role": "user", "content": text},
            ],
            "temperature": 0.2,
        }
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, headers=headers, json=payload, timeout=15) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return data["choices"][0]["message"]["content"].strip()
                    logger.warning("[DeepSeek] Translation request failed with status %s", resp.status)
        except Exception as e:
            logger.warning("[DeepSeek] Translation request failed (%s)", type(e).__name__)
        return None

    # ---------------- 4 FREE FALLBACK TRANSLATORS ----------------

    async def _google_gtx_direct(self, chunk: str, source_lang: str, target_lang: str) -> Optional[str]:
        url = "https://translate.googleapis.com/translate_a/single"
        source_code = TRANSLATION_LANGUAGE_MAP.get(source_lang.lower(), source_lang)
        target_code = TRANSLATION_LANGUAGE_MAP.get(target_lang.lower(), target_lang)
        params = {"client": "gtx", "sl": source_code, "tl": target_code, "dt": "t", "q": chunk}
        for attempt in range(3):
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(url, params=params, timeout=8) as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            return "".join(part[0] for part in data[0] if part[0])
                        if resp.status not in {429, 500, 502, 503, 504, 520}:
                            logger.warning("[Google GTX Direct] Translation failed with status %s", resp.status)
                            return None
                        logger.warning(
                            "[Google GTX Direct] Temporary failure %s (attempt %s/3)",
                            resp.status,
                            attempt + 1,
                        )
            except Exception as e:
                logger.warning("[Google GTX Direct] Request failed (attempt %s/3): %s", attempt + 1, type(e).__name__)
            if attempt < 2:
                await asyncio.sleep(0.5 * (attempt + 1))
        return None

    def _deep_translator_fallback(self, chunk: str, source_lang: str, target_lang: str) -> str:
        source_code = TRANSLATION_LANGUAGE_MAP.get(source_lang.lower(), source_lang)
        target_code = TRANSLATION_LANGUAGE_MAP.get(target_lang.lower(), target_lang)
        # 1. GoogleTranslator
        try:
            res = GoogleTranslator(source=source_code, target=target_code).translate(chunk)
            if res:
                return res
        except Exception as e:
            logger.warning(f"[GoogleTranslator] Limit/Lỗi: {e}")

        # 2. MyMemoryTranslator (chia nhỏ 450 ký tự)
        try:
            mm_src = MYMEMORY_LANG_MAP.get(source_lang.lower(), source_code)
            mm_tgt = MYMEMORY_LANG_MAP.get(target_lang.lower(), target_code)
            parts = []
            for sc in self._split_chunks(chunk, max_length=450):
                tr = MyMemoryTranslator(
                    source=mm_src,
                    target=mm_tgt,
                    email=self.mymemory_email if self.mymemory_email else None,
                )
                parts.append(tr.translate(sc))
            res = " ".join(filter(None, parts))
            if res:
                return res
        except Exception as e:
            logger.warning(f"[MyMemoryTranslator] Lỗi: {e}")

        # 3. LibreTranslator
        for mirror in ["https://translate.argosopentech.com/", "https://libretranslate.de/"]:
            try:
                src = "vi" if source_lang == "auto" else source_lang
                res = LibreTranslator(
                    source=src, target=target_code, base_url=mirror, use_free_api=True
                ).translate(chunk)
                if res:
                    return res
            except Exception as e:
                logger.warning(f"[LibreTranslator - {mirror}] Lỗi: {e}")

        raise RuntimeError("Tất cả các công cụ dịch AI và miễn phí đều đang quá tải.")

    # ---------------- PUBLIC METHODS ----------------

    async def translate_text(self, text: str, target_lang: str, source_lang: str = "vi") -> str:
        if not text or not text.strip():
            raise ValueError("Nội dung thuyết minh không được để trống.")

        target_lang = target_lang.lower().strip()
        source_lang = source_lang.lower().strip()

        if source_lang == target_lang:
            return text

        cache_key = self._get_hash(text, f"{source_lang}_{target_lang}")
        if cache_key in _TRANSLATION_CACHE:
            return _TRANSLATION_CACHE[cache_key]

        # Thử dịch qua các AI trước
        for ai_func in (
            self._ai_gemini,
            self._ai_groq,
            self._ai_openrouter,
            self._ai_mistral,
            self._ai_deepseek,
        ):
            result = await ai_func(text, source_lang, target_lang)
            if result:
                _TRANSLATION_CACHE[cache_key] = result
                return result

        # Fallback sang 4 cổng miễn phí
        chunks = self._split_chunks(text, max_length=3500)
        translated_chunks = []
        for chunk in chunks:
            gtx = await self._google_gtx_direct(chunk, source_lang, target_lang)
            if gtx:
                translated_chunks.append(gtx)
            else:
                fb = await asyncio.to_thread(
                    self._deep_translator_fallback, chunk, source_lang, target_lang
                )
                translated_chunks.append(fb)

        final_text = " ".join(translated_chunks)
        _TRANSLATION_CACHE[cache_key] = final_text
        return final_text

    async def generate_audio(
        self, text: str, target_lang: str = "vi", source_lang: str = "vi"
    ) -> Tuple[str, str]:
        """
        Dịch văn bản thuyết minh và tạo file âm thanh MP3.
        Trả về: (translated_text, audio_file_path)
        """
        translated_text = await self.translate_text(text, target_lang=target_lang, source_lang=source_lang)

        file_hash = self._get_hash(translated_text, target_lang)
        filename = f"{target_lang}_{file_hash}.mp3"
        filepath = os.path.join(self.audio_dir, filename)

        # Nếu file âm thanh đã tồn tại trên ổ cứng thì dùng lại ngay
        if not os.path.exists(filepath):
            voice = await _resolve_voice(target_lang, self._voice_cache)
            communicate = edge_tts.Communicate(translated_text, voice)
            await communicate.save(filepath)

        return translated_text, f"/static/audio/{filename}"