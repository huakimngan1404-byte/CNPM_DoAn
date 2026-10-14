import os
import json
import urllib.request
from gtts import gTTS
from data.audio_repository import AudioRepository

class AudioService:
    def __init__(self):
        self.repo = AudioRepository()
        os.makedirs("static/audio", exist_ok=True)
        self.api_key = os.getenv("GEMINI_API_KEY", "").strip()
        
        self.supported_languages = {
            "vi": {"name": "Tiếng Việt", "gtts_code": "vi"},
            "en": {"name": "English", "gtts_code": "en"},
            "zh": {"name": "Chinese", "gtts_code": "zh-CN"},
            "ja": {"name": "Japanese", "gtts_code": "ja"},
            "fr": {"name": "French", "gtts_code": "fr"}
        }

    async def get_audio_for_site(self, site_name: str, lang: str):
        if lang not in self.supported_languages:
            lang = "vi"
            
        lang_info = self.supported_languages[lang]
        lang_name = lang_info["name"]
        gtts_code = lang_info["gtts_code"]

        existing_data = await self.repo.get_audio_info(site_name, lang)
        if existing_data:
            return existing_data

        generated_text = ""
        
        # LỚP 1: Thử gọi Google AI
        try:
            if not self.api_key:
                raise Exception("Thiếu API Key")
                
            prompt = f"Viết một đoạn thuyết minh du lịch khoảng 50 từ về '{site_name}'. Bắt buộc viết bằng {lang_name}."
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={self.api_key}"
            
            data = json.dumps({"contents": [{"parts": [{"text": prompt}]}]}).encode('utf-8')
            req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
            
            with urllib.request.urlopen(req) as response:
                result = json.loads(response.read().decode('utf-8'))
                generated_text = result['candidates'][0]['content']['parts'][0]['text']
        except Exception as e:
            print(f"LỖI AI: {e} -> Kích hoạt văn bản dự phòng.")
            # LỚP 2: Kế hoạch dự phòng (Luôn luôn có text để tạo MP3)
            if lang == "en":
                generated_text = f"Welcome to {site_name}. This is a famous historical landmark in Ho Chi Minh City, offering a rich history and beautiful architecture. We hope you enjoy your visit!"
            else:
                generated_text = f"Chào mừng bạn đến với {site_name}. Đây là một di tích lịch sử nổi tiếng tại Thành phố Hồ Chí Minh. Chúc bạn có một chuyến tham quan vui vẻ!"

        # Dùng thư viện gTTS chuyển chữ thành âm thanh
        file_name = f"{site_name.replace(' ', '_')}_{lang}.mp3"
        file_path = f"static/audio/{file_name}"
        
        tts = gTTS(text=generated_text, lang=gtts_code)
        tts.save(file_path)

        # Lưu lại vào cơ sở dữ liệu
        audio_url = f"http://localhost:8001/static/audio/{file_name}"
        new_data = {
            "text": generated_text,
            "url": audio_url
        }
        # await self.repo.save_new_audio(site_name, lang, new_data)

        return new_data