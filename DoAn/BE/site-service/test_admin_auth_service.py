import base64
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from business.admin_auth_service import (
    ADMIN_DOCUMENT_ID,
    AdminAuthService,
    _hash_password,
    _verify_password,
)
from presentation import auth_router


class FakeAccounts:
    def __init__(self, account=None):
        self.account = deepcopy(account)

    async def find_one(self, query):
        if self.account and self.account.get("_id") == query.get("_id"):
            return deepcopy(self.account)
        return None

    async def insert_one(self, account):
        self.account = deepcopy(account)

    async def update_one(self, query, update):
        if not self.account or self.account.get("_id") != query.get("_id"):
            return SimpleNamespace(matched_count=0, modified_count=0)

        for field, expected in query.items():
            if field == "_id":
                continue
            if isinstance(expected, dict) and "$exists" in expected:
                if (field in self.account) != expected["$exists"]:
                    return SimpleNamespace(matched_count=0, modified_count=0)
            elif self.account.get(field) != expected:
                return SimpleNamespace(matched_count=0, modified_count=0)

        for field, value in update.get("$set", {}).items():
            self.account[field] = value
        for field in update.get("$unset", {}):
            self.account.pop(field, None)
        return SimpleNamespace(matched_count=1, modified_count=1)


def _token_secret():
    return base64.urlsafe_b64encode(b"test-token-secret-32-bytes-long!!").rstrip(b"=").decode("ascii")


@pytest.mark.asyncio
async def test_initial_account_stores_a_password_hash(monkeypatch):
    monkeypatch.setenv("ADMIN_INITIAL_USERNAME", "admin")
    monkeypatch.setenv("ADMIN_INITIAL_PASSWORD", "initial-password")
    service = AdminAuthService()
    service.accounts = FakeAccounts()

    await service.ensure_initial_account()

    assert service.accounts.account["_id"] == ADMIN_DOCUMENT_ID
    assert "password" not in service.accounts.account
    assert isinstance(service.accounts.account["password_changed_at"], datetime)
    assert _verify_password("initial-password", service.accounts.account)
    assert not _verify_password("wrong-password", service.accounts.account)


@pytest.mark.asyncio
async def test_legacy_plaintext_password_is_upgraded_on_successful_login():
    service = AdminAuthService()
    service.accounts = FakeAccounts({
        "_id": ADMIN_DOCUMENT_ID,
        "username": "admin",
        "password": "legacy-password",
        "token_secret": _token_secret(),
    })
    existing_session = service._create_session(service.accounts.account)

    session = await service.login("admin", "legacy-password")

    assert "password" not in service.accounts.account
    assert isinstance(service.accounts.account["password_changed_at"], datetime)
    assert _verify_password("legacy-password", service.accounts.account)
    assert await service.authenticate(existing_session["access_token"]) == {
        "username": "admin",
        "must_change_password": False,
    }
    assert await service.authenticate(session["access_token"]) == {
        "username": "admin",
        "must_change_password": False,
    }


@pytest.mark.asyncio
async def test_wrong_legacy_password_does_not_upgrade_account():
    service = AdminAuthService()
    service.accounts = FakeAccounts({
        "_id": ADMIN_DOCUMENT_ID,
        "username": "admin",
        "password": "legacy-password",
        "token_secret": _token_secret(),
    })

    with pytest.raises(ValueError, match="Tên đăng nhập hoặc mật khẩu không đúng"):
        await service.login("admin", "wrong-password")

    assert service.accounts.account["password"] == "legacy-password"
    assert "password_hash" not in service.accounts.account


@pytest.mark.asyncio
async def test_updating_credentials_replaces_password_with_hash_and_keeps_hmac_login():
    service = AdminAuthService()
    service.accounts = FakeAccounts({
        "_id": ADMIN_DOCUMENT_ID,
        "username": "admin",
        "password_hash": _hash_password("current-password"),
        "token_secret": _token_secret(),
    })

    session = await service.update_credentials(
        "current-password",
        "new-admin",
        "new-password",
    )

    assert service.accounts.account["username"] == "new-admin"
    assert "password" not in service.accounts.account
    assert _verify_password("new-password", service.accounts.account)
    assert service.accounts.account["password_changed_at"].tzinfo == timezone.utc
    assert session["must_change_password"] is False
    assert await service.authenticate(session["access_token"]) == {
        "username": "new-admin",
        "must_change_password": False,
    }


@pytest.mark.asyncio
async def test_login_requires_password_change_after_24_hours():
    service = AdminAuthService()
    service.accounts = FakeAccounts({
        "_id": ADMIN_DOCUMENT_ID,
        "username": "admin",
        "password_hash": _hash_password("current-password"),
        "password_changed_at": datetime.now(timezone.utc) - timedelta(hours=24, seconds=1),
        "token_secret": _token_secret(),
    })

    session = await service.login("admin", "current-password")

    assert session["must_change_password"] is True
    assert await service.authenticate(session["access_token"]) == {
        "username": "admin",
        "must_change_password": True,
    }


@pytest.mark.asyncio
async def test_new_password_must_differ_from_current_password():
    service = AdminAuthService()
    service.accounts = FakeAccounts({
        "_id": ADMIN_DOCUMENT_ID,
        "username": "admin",
        "password_hash": _hash_password("current-password"),
        "password_changed_at": datetime.now(timezone.utc) - timedelta(hours=25),
        "token_secret": _token_secret(),
    })

    with pytest.raises(ValueError, match="Mật khẩu mới phải khác"):
        await service.update_credentials(
            "current-password",
            "admin",
            "current-password",
        )


@pytest.mark.asyncio
async def test_expired_password_blocks_admin_but_allows_authenticated_change_flow(monkeypatch):
    async def authenticate(_token):
        return {"username": "admin", "must_change_password": True}

    monkeypatch.setattr(auth_router.service, "authenticate", authenticate)

    account = await auth_router.require_authenticated_admin("Bearer valid-token")
    assert account["must_change_password"] is True

    with pytest.raises(HTTPException) as error:
        await auth_router.require_admin(account)
    assert error.value.status_code == 403
