from fastapi import APIRouter, Query
from business.audio_service import AudioService

router = APIRouter(prefix="/api/audio")
service = AudioService()

@router.get("/{site_code}")
async def get_audio(site_code: str, lang: str = Query("vi")):
    return await service.get_audio_for_site(site_code, lang)