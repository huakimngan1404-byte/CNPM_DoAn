from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from presentation.site_router import router

app = FastAPI(title="District 1 Heritage Site Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)


@app.get("/health")
async def health_check():
    return {"status": "healthy"}