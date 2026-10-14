from fastapi import FastAPI
from presentation.site_router import router

app = FastAPI()
app.include_router(router)