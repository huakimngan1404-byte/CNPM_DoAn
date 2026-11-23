from fastapi.testclient import TestClient

import presentation.site_router as site_router
from main import app, fastapi_app
from presentation.auth_router import require_admin


def test_http_auth_error_keeps_cors_headers():
    client = TestClient(app, raise_server_exceptions=False)

    response = client.get(
        "/api/sites/admin",
        headers={"Origin": "https://admin.example"},
    )

    assert response.status_code == 401
    assert response.headers["access-control-allow-origin"] == "*"
    assert response.json()["detail"] == "Vui lòng đăng nhập quản trị."


def test_unhandled_server_error_keeps_cors_headers(monkeypatch):
    async def fail_to_add_site(_document):
        raise RuntimeError("simulated database failure")

    monkeypatch.setitem(fastapi_app.dependency_overrides, require_admin, lambda: "admin")
    monkeypatch.setattr(site_router.service, "add_site", fail_to_add_site)
    client = TestClient(app, raise_server_exceptions=False)

    response = client.post(
        "/api/sites/",
        headers={"Origin": "https://admin.example"},
        json={
            "code": "test-site",
            "name": "Test Site",
            "lat": 10.0,
            "lng": 106.0,
            "address": "Test address",
            "category": "Test",
            "description": "",
            "is_active": True,
        },
    )

    assert response.status_code == 500
    assert response.headers["access-control-allow-origin"] == "*"
