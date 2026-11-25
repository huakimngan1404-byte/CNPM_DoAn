from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from data.audio_repository import AudioRepository


def make_repository(existing=None):
    translations = SimpleNamespace(
        find_one=AsyncMock(return_value=existing),
        update_one=AsyncMock(),
    )
    database = {
        "sites": object(),
        "translations": translations,
        "audio_assets": object(),
    }
    return AudioRepository(database), translations


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("audio_asset_id", "audio_url", "expected_status"),
    [
        (None, None, "not_ready"),
        ("ready-audio", "/api/audio/files/ready-audio", "ready"),
    ],
)
async def test_saved_translation_is_not_published_without_admin_approval(
    audio_asset_id,
    audio_url,
    expected_status,
):
    repository, translations = make_repository()

    await repository.save_translation(
        "test-site",
        "en",
        "Source text",
        "Translated narration",
        audio_asset_id,
        audio_url,
        datetime.now(timezone.utc),
    )

    update = translations.update_one.await_args.args[1]
    assert update["$set"]["narration_status"] == expected_status
    assert "draft" not in update["$set"].values()
    assert update["$set"]["narration_status"] != "published"


@pytest.mark.asyncio
async def test_new_translation_keeps_approved_version_until_new_content_is_published():
    approved_version = {
        "source_text": "Approved source",
        "description": "Approved narration",
        "audio_asset_id": "approved-audio",
        "audio_url": "/api/audio/files/approved-audio",
        "updated_at": None,
        "narration_status": "published",
    }
    existing = {
        **approved_version,
        "site_code": "test-site",
        "lang": "en",
        "narration_status": "published",
    }
    repository, translations = make_repository(existing)

    await repository.save_translation(
        "test-site",
        "en",
        "New source",
        "New unreviewed narration",
        "new-audio",
        "/api/audio/files/new-audio",
        datetime.now(timezone.utc),
    )

    update = translations.update_one.await_args.args[1]
    assert update["$set"]["narration_status"] == "ready"
    assert update["$set"]["published_version"] == approved_version


@pytest.mark.asyncio
async def test_failed_audio_regeneration_does_not_remove_published_narration():
    approved_version = {
        "source_text": "Approved source",
        "description": "Approved narration",
        "audio_asset_id": "approved-audio",
        "audio_url": "/api/audio/files/approved-audio",
        "updated_at": None,
        "narration_status": "published",
    }
    repository, translations = make_repository({
        **approved_version,
        "site_code": "test-site",
        "lang": "en",
        "narration_status": "published",
    })

    await repository.save_translation(
        "test-site",
        "en",
        "Updated source",
        "Approved narration",
        None,
        None,
        datetime.now(timezone.utc),
    )

    update = translations.update_one.await_args.args[1]
    assert update["$set"]["narration_status"] == "not_ready"
    assert update["$set"]["published_version"] == approved_version
    assert update["$set"]["audio_asset_id"] is None


@pytest.mark.asyncio
async def test_cached_legacy_audio_is_ready():
    translations = SimpleNamespace(
        find_one=AsyncMock(return_value={"_id": "translation-id"}),
        update_one=AsyncMock(),
    )
    repository = AudioRepository({
        "sites": object(),
        "translations": translations,
        "audio_assets": object(),
    })

    await repository.update_translation_audio(
        "translation-id",
        "legacy-audio",
        "/api/audio/files/legacy-audio",
    )

    update = translations.update_one.await_args.args[1]
    assert update["$set"]["narration_status"] == "ready"

