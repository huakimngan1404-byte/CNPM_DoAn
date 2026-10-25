import base64
import binascii
import hashlib
import hmac
import json
import os
import secrets
import time

from pymongo.errors import DuplicateKeyError

from data.site_repository import db


TOKEN_LIFETIME_SECONDS = 12 * 60 * 60
ADMIN_DOCUMENT_ID = "primary"


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


class AdminAuthService:
    def __init__(self):
        self.accounts = db.admin_accounts

    async def ensure_initial_account(self):
        account = await self.accounts.find_one({"_id": ADMIN_DOCUMENT_ID})
        if account:
            return

        username = os.getenv("ADMIN_INITIAL_USERNAME", "").strip()
        password = os.getenv("ADMIN_INITIAL_PASSWORD", "")
        if not username or not password:
            return

        try:
            await self.accounts.insert_one({
                "_id": ADMIN_DOCUMENT_ID,
                "username": username,
                "display_name": username,
                "password": password,
                "token_secret": _encode(secrets.token_bytes(32)),
            })
        except DuplicateKeyError:
            return

    async def login(self, username: str, password: str):
        await self.ensure_initial_account()
        account = await self.accounts.find_one({"_id": ADMIN_DOCUMENT_ID})
        if not account or account["username"] != username.strip():
            raise ValueError("Tên đăng nhập hoặc mật khẩu không đúng.")
        if account.get("password") != password:
            raise ValueError("Tên đăng nhập hoặc mật khẩu không đúng.")
        return self._create_session(account)

    async def update_credentials(
        self,
        current_password: str,
        username: str,
        new_password: str,
    ):
        account = await self.accounts.find_one({"_id": ADMIN_DOCUMENT_ID})
        if not account or account.get("password") != current_password:
            raise ValueError("Mật khẩu hiện tại không chính xác.")

        await self.accounts.update_one(
            {"_id": ADMIN_DOCUMENT_ID},
            {"$set": {
                "username": username.strip(),
                "display_name": username.strip(),
                "password": new_password,
                "token_secret": _encode(secrets.token_bytes(32)),
            }, "$unset": {"password_salt": "", "password_hash": ""}},
        )
        updated_account = await self.accounts.find_one({"_id": ADMIN_DOCUMENT_ID})
        return self._create_session(updated_account)

    async def authenticate(self, token: str):
        try:
            encoded_payload, signature = token.split(".", 1)
            payload = json.loads(_decode(encoded_payload))
            if not isinstance(payload, dict):
                return None
            account = await self.accounts.find_one({"_id": ADMIN_DOCUMENT_ID})
            if not account or account["username"] != payload.get("sub"):
                return None
            expected_signature = hmac.new(
                _decode(account["token_secret"]),
                encoded_payload.encode("ascii"),
                hashlib.sha256,
            ).digest()
            if not hmac.compare_digest(_decode(signature), expected_signature):
                return None
            if int(payload.get("exp", 0)) <= int(time.time()):
                return None
            return {"username": account["username"]}
        except (KeyError, TypeError, ValueError, UnicodeDecodeError, binascii.Error):
            return None

    @staticmethod
    def _create_session(account: dict):
        payload = _encode(json.dumps({
            "sub": account["username"],
            "exp": int(time.time()) + TOKEN_LIFETIME_SECONDS,
            "nonce": secrets.token_urlsafe(12),
        }, separators=(",", ":")).encode("utf-8"))
        signature = hmac.new(
            _decode(account["token_secret"]),
            payload.encode("ascii"),
            hashlib.sha256,
        ).digest()
        return {
            "access_token": f"{payload}.{_encode(signature)}",
            "token_type": "bearer",
            "username": account["username"],
            "display_name": account.get("display_name", account["username"]),
        }
