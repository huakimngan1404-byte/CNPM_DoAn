import os
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from motor.motor_asyncio import AsyncIOMotorClient

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Translation configuration
TRANSLATION_MAX_RETRIES = int(os.getenv("TRANSLATION_MAX_RETRIES", "3"))
TRANSLATION_RETRY_DELAY = int(os.getenv("TRANSLATION_RETRY_DELAY", "2"))
TRANSLATION_TIMEOUT = int(os.getenv("TRANSLATION_TIMEOUT", "30"))

MONGO_URI = (
    os.getenv("MONGO_URI")
    or os.getenv("MONGODB_URI")
    or os.getenv("MONGO_URL")
    or "mongodb://localhost:27017"
)
client = AsyncIOMotorClient(MONGO_URI)
db = client[os.getenv("MONGO_DATABASE", "district1_historical_db")]
AUDIO_PUBLIC_BASE_URL = (
    os.getenv("AUDIO_PUBLIC_BASE_URL")
    or os.getenv("RENDER_EXTERNAL_URL")
    or "http://localhost:8001"
).rstrip("/")

app = FastAPI(title="System Presentation - Audio & TTS Module")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("static/audio", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

from presentation.audio_router import router as audio_router

@app.on_event("startup")
async def startup_event():
    """Log configuration on startup"""
    logger.info(f"[Startup] Translation Config - MaxRetries={TRANSLATION_MAX_RETRIES}, RetryDelay={TRANSLATION_RETRY_DELAY}s, Timeout={TRANSLATION_TIMEOUT}s")

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

# Gắn prefix="/api" để khớp với yêu cầu gọi từ site-service
app.include_router(audio_router, prefix="/api")

@app.get("/")
def root():
    return {"message": "Audio Module System is running successfully!"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)