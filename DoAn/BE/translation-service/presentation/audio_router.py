import os
import hashlib
import asyncio
import logging
import re
import sys
import types
import base64
import binascii
import hmac
import json
import time
from fastapi import APIRouter, Depends, Header, Request, Response, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from business.audio_service import TTSService, AudioTaskManager
from business.site_translation_service import SiteTranslationError, SiteTranslationService
from data.audio_repository import AudioRepository

try:
    import main as main_module
except ImportError:
    main_module = None

logger = logging.getLogger(__name__)

if main_module is None:
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    if project_root not in sys.path:
        sys.path.insert(0, project_root)
    try:
        import main as main_module
    except ImportError:
        main_module = types.SimpleNamespace(
            db=None,
            AUDIO_PUBLIC_BASE_URL="http://localhost:8001",
            TRANSLATION_MAX_RETRIES=3,
            TRANSLATION_RETRY_DELAY=2,
            TRANSLATION_TIMEOUT=30,
        )

# Keep a module-level reference for compatibility with tests and runtime code that patch
# `presentation.audio_router.main.db` or call `main.db[...]` during route execution.
main = main_module

router = APIRouter(prefix="/audio", tags=["Audio System"])

tts_service = TTSService(cache_dir="static/audio")
task_manager = AudioTaskManager(tts_service)

def _get_main_config():
    global main_module
    if main_module is None or not hasattr(main_module, "db") and not hasattr(main_module, "AUDIO_PUBLIC_BASE_URL"):
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        if project_root not in sys.path:
            sys.path.insert(0, project_root)
        try:
            import importlib
            module_name = "main"
            if module_name not in sys.modules:
                importlib.import_module(module_name)
            main_module = sys.modules[module_name]
        except ImportError:
            main_module = types.SimpleNamespace(
                db=None,
                AUDIO_PUBLIC_BASE_URL="http://localhost:8001",
                TRANSLATION_MAX_RETRIES=3,
                TRANSLATION_RETRY_DELAY=2,
                TRANSLATION_TIMEOUT=30,
            )
    main = main_module
    return main_module


def _decode_admin_token_part(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


async def require_admin(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Vui lòng đăng nhập quản trị.")

    database = getattr(_get_main_config(), "db", None)
    if database is None:
        raise HTTPException(status_code=503, detail="Dịch vụ xác thực quản trị không khả dụng.")

    try:
        encoded_payload, signature = authorization[7:].strip().split(".", 1)
        payload = json.loads(_decode_admin_token_part(encoded_payload))
        account = await database["admin_accounts"].find_one({"_id": "primary"})
        if not isinstance(payload, dict) or not account:
            raise ValueError("Invalid admin session")
        if account.get("username") != payload.get("sub"):
            raise ValueError("Invalid admin session")
        expected_signature = hmac.new(
            _decode_admin_token_part(account["token_secret"]),
            encoded_payload.encode("ascii"),
            hashlib.sha256,
        ).digest()
        if not hmac.compare_digest(
            _decode_admin_token_part(signature),
            expected_signature,
        ):
            raise ValueError("Invalid admin session")
        if int(payload.get("exp", 0)) <= int(time.time()):
            raise ValueError("Expired admin session")
    except (
        KeyError,
        TypeError,
        ValueError,
        UnicodeDecodeError,
        binascii.Error,
        json.JSONDecodeError,
    ) as error:
        raise HTTPException(
            status_code=401,
            detail="Phiên đăng nhập không hợp lệ hoặc đã hết hạn.",
        ) from error

    return {"username": account["username"]}


async def translate_with_timeout(text: str, lang: str):
    """
    Wrap translation with timeout handling.
    TRANSLATION_TIMEOUT is the total timeout for the entire operation.
    """
    main = _get_main_config()
    try:
        return await asyncio.wait_for(
            tts_service.translate_text_async(text, lang),
            timeout=main.TRANSLATION_TIMEOUT
        )
    except asyncio.TimeoutError:
        logger.error(f"[Translation] Timeout after {main.TRANSLATION_TIMEOUT}s")
        raise

@router.post("/tts")
async def post_tts(text: str, lang: str = "vi", response: Response = None):
    """
    POST /audio/tts (Tier 2 API)
    - Text -> Edge-TTS -> stream MP3 trực tiếp
    - Disk cache: X-Cache: HIT/MISS
    - X-Static-Url: versioned URL cho SW cache
    """
    file_path, is_hit, _ = await tts_service.generate_audio(text, lang)
    audio_filename = os.path.basename(file_path)
    
    response.headers["X-Cache"] = "HIT" if is_hit else "MISS"
    response.headers["X-Static-Url"] = f"/static/audio/{audio_filename}"
    
    return FileResponse(file_path, media_type="audio/mpeg", filename=audio_filename)

@router.get("/pack-manifest")
async def get_pack_manifest(lang: str):
    return tts_service.get_pack_manifest(lang)

@router.api_route("/files/{asset_id}", methods=["GET", "HEAD"])
async def get_audio_file(asset_id: str, request: Request):
    config = _get_main_config()
    db = getattr(config, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="MongoDB is not configured")

    audio_asset = await AudioRepository(db).read_audio_asset(asset_id)
    if not audio_asset:
        raise HTTPException(status_code=404, detail="Audio file was not found")
    audio_data = audio_asset.get("data")
    if not isinstance(audio_data, bytes) or not audio_data:
        raise HTTPException(status_code=404, detail="Audio file is empty")

    content_type = audio_asset.get("content_type", "audio/mpeg")
    headers = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": str(len(audio_data)),
    }
    if request.method == "HEAD":
        return Response(media_type=content_type, headers=headers)

    byte_range = request.headers.get("range")
    if byte_range:
        match = re.fullmatch(r"bytes=(\d*)-(\d*)", byte_range.strip())
        if not match:
            raise HTTPException(
                status_code=416,
                detail="Requested audio byte range is invalid",
                headers={"Content-Range": f"bytes */{len(audio_data)}"},
            )

        range_start, range_end = match.groups()
        if range_start:
            start = int(range_start)
            end = int(range_end) if range_end else len(audio_data) - 1
        else:
            suffix_length = int(range_end or 0)
            start = max(0, len(audio_data) - suffix_length)
            end = len(audio_data) - 1
        if start >= len(audio_data) or end < start:
            raise HTTPException(
                status_code=416,
                detail="Requested audio byte range is not satisfiable",
                headers={"Content-Range": f"bytes */{len(audio_data)}"},
            )

        end = min(end, len(audio_data) - 1)
        audio_data = audio_data[start:end + 1]
        headers["Content-Range"] = f"bytes {start}-{end}/{len(audio_asset['data'])}"
        headers["Content-Length"] = str(len(audio_data))
        return Response(
            content=audio_data,
            status_code=206,
            media_type=content_type,
            headers=headers,
        )

    return Response(content=audio_data, media_type=content_type, headers=headers)


@router.get("/{site_code}", dependencies=[Depends(require_admin)])
async def get_site_translation(site_code: str, lang: str = "vi"):
    config = _get_main_config()
    db = getattr(config, "db", None)

    if db is None:
        raise HTTPException(
            status_code=500,
            detail="MongoDB is not configured",
        )
    service = SiteTranslationService(
        AudioRepository(db),
        tts_service,
        getattr(config, "AUDIO_PUBLIC_BASE_URL", "http://localhost:8001"),
        translate_with_timeout,
    )
    try:
        return await service.get_translation(site_code, lang)
    except SiteTranslationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

@router.get("/admin/audio-tasks/stream")
async def audio_tasks_stream(request: Request):
    """
    SSE real-time: GET /admin/audio-tasks/stream
    Cập nhật trạng thái tác vụ liên tục cho Frontend
    """
    q = asyncio.Queue()
    task_manager.subscribers.append(q)
    
    async def event_generator():
        try:
            while True:
                if await request.is_disconnected():
                    break
                data = await q.get()
                yield f"data: {data}\n\n"
        finally:
            if q in task_manager.subscribers:
                task_manager.subscribers.remove(q)
                
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.post("/admin/tasks/submit")
async def submit_audio_task(text: str, lang: str = "vi"):
    """Đưa task mới vào hàng đợi chạy nền"""
    task_id = task_manager.submit_task(text, lang)
    return {"task_id": task_id, "status": "queued"}

@router.post("/admin/tasks/{task_id}/control")
async def control_audio_task(task_id: str, action: str):
    """
    Điều khiển Frontend: Pause / Resume / Cancel
    Hỗ trợ chuyển đổi trạng thái: queued -> running -> paused -> completed/failed/cancelled
    """
    try:
        status = await task_manager.control_task(task_id, action)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Task not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"task_id": task_id, "status": status}