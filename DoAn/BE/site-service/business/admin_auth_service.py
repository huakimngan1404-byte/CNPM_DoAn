import base64
import binascii
import hashlib
import hmac
import json
import os
import secrets
import time
from datetime import datetime, timezone

from pymongo.errors import DuplicateKeyError

from data.site_repository import db


TOKEN_LIFETIME_SECONDS = 12 * 60 * 60
PASSWORD_MAX_AGE_SECONDS = 24 * 60 * 60
ADMIN_DOCUMENT_ID = "primary"
PASSWORD_HASH_ALGORITHM = "pbkdf2_sha256"
PASSWORD_HASH_ITERATIONS = 600_000
PASSWORD_HASH_SALT_BYTES = 16
PASSWORD_HASH_BYTES = 32


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _hash_password(password: str) -> str:
    salt = secrets.token_bytes(PASSWORD_HASH_SALT_BYTES)
    password_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PASSWORD_HASH_ITERATIONS,
        dklen=PASSWORD_HASH_BYTES,
    )
    return "$".join((
        PASSWORD_HASH_ALGORITHM,
        str(PASSWORD_HASH_ITERATIONS),
        _encode(salt),
        _encode(password_hash),
    ))


def _verify_password(password: str, account: dict) -> bool:
    stored_hash = account.get("password_hash")
    if isinstance(stored_hash, str):
        try:
            algorithm, iterations_value, encoded_salt, encoded_hash = stored_hash.split("$")
            if algorithm != PASSWORD_HASH_ALGORITHM:
                return False
            iterations = int(iterations_value)
            if iterations != PASSWORD_HASH_ITERATIONS:
                return False
            salt = _decode(encoded_salt)
            expected_hash = _decode(encoded_hash)
            if len(salt) != PASSWORD_HASH_SALT_BYTES or len(expected_hash) != PASSWORD_HASH_BYTES:
                return False
            actual_hash = hashlib.pbkdf2_hmac(
                "sha256",
                password.encode("utf-8"),
                salt,
                iterations,
                dklen=PASSWORD_HASH_BYTES,
            )
            return hmac.compare_digest(actual_hash, expected_hash)
        except (ValueError, UnicodeDecodeError, binascii.Error):
            return False

    if "password_hash" in account:
        return False
    legacy_password = account.get("password")
    return (
        isinstance(legacy_password, str)
        and hmac.compare_digest(
            legacy_password.encode("utf-8"),
            password.encode("utf-8"),
        )
    )


def _password_change_required(account: dict, now: datetime | None = None) -> bool:
    changed_at = account.get("password_changed_at")
    if not isinstance(changed_at, datetime):
        return True
    if changed_at.tzinfo is None:
        changed_at = changed_at.replace(tzinfo=timezone.utc)
    else:
        changed_at = changed_at.astimezone(timezone.utc)
    current_time = now or datetime.now(timezone.utc)
    return (current_time - changed_at).total_seconds() >= PASSWORD_MAX_AGE_SECONDS


class AdminAuthService:
    def __init__(self):
        self.accounts = db.admin_accounts

    async def ensure_initial_account(self):
        account = await self.accounts.find_one({"_id": ADMIN_DOCUMENT_ID})
        if account:
            if "password_changed_at" not in account:
                await self.accounts.update_one(
                    {"_id": ADMIN_DOCUMENT_ID, "password_changed_at": {"$exists": False}},
                    {"$set": {"password_changed_at": datetime.now(timezone.utc)}},
                )
            return

        username = os.getenv("ADMIN_INITIAL_USERNAME", "").strip()
        password = os.getenv("ADMIN_INITIAL_PASSWORD", "")
        if not username or not password:
            return

        try:
            now = datetime.now(timezone.utc)
            await self.accounts.insert_one({
                "_id": ADMIN_DOCUMENT_ID,
                "username": username,
                "display_name": username,
                "password_hash": _hash_password(password),
                "token_secret": _encode(secrets.token_bytes(32)),
                "password_changed_at": now,
            })
        except DuplicateKeyError:
            return

    async def login(self, username: str, password: str):
        await self.ensure_initial_account()
        account = await self.accounts.find_one({"_id": ADMIN_DOCUMENT_ID})
        if not account or account["username"] != username.strip():
            raise ValueError("Tên đăng nhập hoặc mật khẩu không đúng.")
        if not _verify_password(password, account):
            raise ValueError("Tên đăng nhập hoặc mật khẩu không đúng.")
        if "password_hash" not in account:
            password_hash = _hash_password(password)
            result = await self.accounts.update_one(
                {
                    "_id": ADMIN_DOCUMENT_ID,
                    "password": account.get("password"),
                    "password_hash": {"$exists": False},
                },
                {
                    "$set": {"password_hash": password_hash},
                    "$unset": {"password": "", "password_salt": ""},
                },
            )
            if result.modified_count:
                account = {**account, "password_hash": password_hash}
                account.pop("password", None)
                account.pop("password_salt", None)
            else:
                account = await self.accounts.find_one({"_id": ADMIN_DOCUMENT_ID})
                if (
                    not account
                    or account.get("username") != username.strip()
                    or not _verify_password(password, account)
                ):
                    raise ValueError("Tên đăng nhập hoặc mật khẩu không đúng.")
        elif "password" in account or "password_salt" in account:
            await self.accounts.update_one(
                {
                    "_id": ADMIN_DOCUMENT_ID,
                    "password_hash": account["password_hash"],
                },
                {"$unset": {"password": "", "password_salt": ""}},
            )
        return self._create_session(account)

    async def update_credentials(
        self,
        current_password: str,
        username: str,
        new_password: str,
    ):
        account = await self.accounts.find_one({"_id": ADMIN_DOCUMENT_ID})
        if not account or not _verify_password(current_password, account):
            raise ValueError("Mật khẩu hiện tại không chính xác.")
        if _verify_password(new_password, account):
            raise ValueError("Mật khẩu mới phải khác mật khẩu hiện tại.")

        await self.accounts.update_one(
            {"_id": ADMIN_DOCUMENT_ID},
            {"$set": {
                "username": username.strip(),
                "display_name": username.strip(),
                "password_hash": _hash_password(new_password),
                "token_secret": _encode(secrets.token_bytes(32)),
                "password_changed_at": datetime.now(timezone.utc),
            }, "$unset": {"password": "", "password_salt": ""}},
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
            return {
                "username": account["username"],
                "must_change_password": _password_change_required(account),
            }
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
            "must_change_password": _password_change_required(account),
        }
