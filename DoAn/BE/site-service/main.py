from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from business.admin_auth_service import AdminAuthService
from presentation.auth_router import router as auth_router
from presentation.site_router import language_router, listen_router, narration_router, router, service as site_service, visitor_router

app = FastAPI(title="District 1 Heritage Site Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)
app.include_router(auth_router)
app.include_router(visitor_router)
app.include_router(listen_router)
app.include_router(language_router)
app.include_router(narration_router)


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


@app.on_event("startup")
async def initialize_admin_account():
    await AdminAuthService().ensure_initial_account()
    await site_service.ensure_language_catalog_seeded()