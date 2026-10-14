from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from presentation.audio_router import router
import os

app = FastAPI(title="Translation Service API")

# Bắt buộc: Tạo thư mục chứa file MP3 trước khi app chạy để không bị lỗi
os.makedirs("static/audio", exist_ok=True)

# Bắt buộc: Mở quyền truy cập public cho thư mục static
app.mount("/static", StaticFiles(directory="static"), name="static")

app.include_router(router)