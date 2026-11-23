from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from pymongo.errors import DuplicateKeyError

from business.site_service import SiteService
from data import site_repository
from data.site_repository import SiteRepository, has_valid_mp3_data, narration_status


def test_missing_or_legacy_status_never_publishes_automatically():
    assert narration_status({}, has_audio=True) == "ready"
    assert narration_status({}, has_audio=False) == "not_ready"
    assert narration_status({"narration_status": "draft"}, has_audio=True) == "ready"
    assert narration_status({"narration_status": "draft"}, has_audio=False) == "not_ready"
    assert narration_status({"is_hidden": True}, has_audio=True) == "hidden"
    assert narration_status({"narration_status": "ready"}, has_audio=False) == "not_ready"


def test_mp3_validation_requires_a_valid_mpeg_frame():
    assert has_valid_mp3_data(bytes.fromhex("FFFB9064"))
    assert not has_valid_mp3_data(b"not an mp3")
    assert not has_valid_mp3_data(b"ID3")


@pytest.mark.asyncio
async def test_new_narration_upsert_sets_status_only_once(monkeypatch):
    translations = SimpleNamespace(
        find_one=AsyncMock(return_value=None),
        update_one=AsyncMock(),
    )
    monkeypatch.setattr(
        site_repository,
        "db",
        SimpleNamespace(translations=translations),
    )

    await SiteRepository().save_narration(
        "test-site",
        "vi",
        "Source text",
        "Translated description",
        datetime.now(timezone.utc),
    )

    update = translations.update_one.await_args.args[1]
    assert update["$set"]["narration_status"] == "not_ready"
    assert "narration_status" not in update["$setOnInsert"]


@pytest.mark.asyncio
async def test_unhiding_legacy_draft_restores_not_ready(monkeypatch):
    record = {
        "site_code": "test-site",
        "lang": "vi",
        "is_hidden": True,
        "narration_status": "hidden",
        "status_before_hidden": "draft",
    }
    translations = SimpleNamespace(
        find_one=AsyncMock(return_value=record),
        update_one=AsyncMock(return_value=SimpleNamespace(matched_count=1)),
    )
    monkeypatch.setattr(
        site_repository,
        "db",
        SimpleNamespace(translations=translations),
    )

    assert await SiteRepository().set_narration_hidden("test-site", "vi", False)
    update = translations.update_one.await_args.args[1]
    assert update["$set"]["narration_status"] == "not_ready"


@pytest.mark.asyncio
async def test_unhiding_legacy_record_with_audio_restores_ready_not_published(monkeypatch):
    record = {
        "site_code": "test-site",
        "lang": "vi",
        "is_hidden": True,
        "narration_status": "hidden",
        "audio_asset_id": "legacy-audio",
    }
    translations = SimpleNamespace(
        find_one=AsyncMock(return_value=record),
        update_one=AsyncMock(return_value=SimpleNamespace(matched_count=1)),
    )
    monkeypatch.setattr(
        site_repository,
        "db",
        SimpleNamespace(translations=translations),
    )
    repo = SiteRepository()
    repo.get_ready_audio_asset_ids = AsyncMock(return_value={"legacy-audio"})

    assert await repo.set_narration_hidden("test-site", "vi", False)
    update = translations.update_one.await_args.args[1]
    assert update["$set"]["narration_status"] == "ready"


@pytest.mark.asyncio
async def test_editing_published_narration_keeps_public_snapshot(monkeypatch):
    published_record = {
        "site_code": "test-site",
        "lang": "vi",
        "source_text": "Approved source",
        "description": "Approved narration",
        "audio_asset_id": "approved-audio",
        "audio_url": "/api/audio/files/approved-audio",
        "narration_status": "published",
    }
    translations = SimpleNamespace(
        find_one=AsyncMock(return_value=published_record),
        update_one=AsyncMock(),
    )
    monkeypatch.setattr(
        site_repository,
        "db",
        SimpleNamespace(translations=translations),
    )

    await SiteRepository().save_narration(
        "test-site",
        "vi",
        "New source",
        "New unreviewed narration",
        datetime.now(timezone.utc),
    )

    update = translations.update_one.await_args.args[1]
    assert update["$set"]["narration_status"] == "not_ready"
    assert update["$set"]["audio_asset_id"] is None
    assert update["$set"]["published_version"] == {
        "source_text": "Approved source",
        "description": "Approved narration",
        "audio_asset_id": "approved-audio",
        "audio_url": "/api/audio/files/approved-audio",
        "updated_at": None,
        "narration_status": "published",
    }


@pytest.mark.asyncio
async def test_publishing_new_narration_promotes_it_and_clears_snapshot(monkeypatch):
    translations = SimpleNamespace(
        find_one=AsyncMock(return_value={"site_code": "test-site", "lang": "vi"}),
        update_one=AsyncMock(return_value=SimpleNamespace(matched_count=1)),
    )
    monkeypatch.setattr(
        site_repository,
        "db",
        SimpleNamespace(translations=translations),
    )

    assert await SiteRepository().set_narration_status("test-site", "vi", "published")

    update = translations.update_one.await_args.args[1]
    assert update["$set"]["narration_status"] == "published"
    assert "published_version" in update["$unset"]


@pytest.mark.asyncio
async def test_public_narration_rejects_legacy_status_and_uses_approved_snapshot():
    repo = SiteRepository()
    repo.get_site_by_code = AsyncMock(return_value={"code": "test-site"})
    repo.get_language = AsyncMock(return_value={"_id": "vi", "is_active": True})
    repo.has_valid_narration_audio = AsyncMock(return_value=True)

    repo.get_narration = AsyncMock(return_value={
        "description": "Legacy narration",
        "audio_asset_id": "legacy-audio",
        "audio_url": "/api/audio/files/legacy-audio",
    })
    assert await repo.get_public_narration("test-site", "vi") is None

    approved_snapshot = {
        "description": "Approved narration",
        "audio_asset_id": "approved-audio",
        "audio_url": "/api/audio/files/approved-audio",
        "narration_status": "published",
    }
    repo.get_narration = AsyncMock(return_value={
        "description": "New unreviewed narration",
        "audio_asset_id": None,
        "narration_status": "ready",
        "published_version": approved_snapshot,
    })
    result = await repo.get_public_narration("test-site", "vi")
    assert result["description"] == "Approved narration"

    repo.has_valid_narration_audio = AsyncMock(return_value=False)
    assert await repo.get_public_narration("test-site", "vi") is None


@pytest.mark.asyncio
async def test_set_narration_status_rejects_draft():
    with pytest.raises(ValueError, match="không hợp lệ"):
        await SiteService().set_narration_status("test-site", "vi", "draft")


@pytest.mark.asyncio
async def test_mark_narration_ready_requires_valid_audio():
    repo = SimpleNamespace(
        get_narration=AsyncMock(return_value={
            "description": "Narration",
            "audio_asset_id": "test-audio",
        }),
        has_valid_narration_audio=AsyncMock(return_value=True),
        set_narration_status=AsyncMock(return_value=True),
    )
    service = SiteService()
    service.repo = repo

    await service.mark_narration_ready("test-site", "vi")

    repo.set_narration_status.assert_awaited_once_with("test-site", "vi", "ready")


@pytest.mark.asyncio
async def test_mark_narration_ready_rejects_invalid_audio():
    repo = SimpleNamespace(
        get_narration=AsyncMock(return_value={"description": "Narration"}),
        has_valid_narration_audio=AsyncMock(return_value=False),
        set_narration_status=AsyncMock(return_value=True),
    )
    service = SiteService()
    service.repo = repo

    with pytest.raises(ValueError, match="MP3 hợp lệ"):
        await service.mark_narration_ready("test-site", "vi")

    repo.set_narration_status.assert_not_awaited()


@pytest.mark.asyncio
async def test_only_public_visitor_playback_is_recorded():
    repo = SimpleNamespace(
        get_public_narration=AsyncMock(return_value={"audio_url": "/api/audio/files/test"}),
        record_listen=AsyncMock(return_value=True),
    )
    service = SiteService()
    service.repo = repo

    assert await service.record_listen(
        "test-site", "vi", "android", "playback-1", "session-1", "admin_preview"
    ) is False
    assert await service.record_listen(
        "test-site", "vi", "android", "playback-1", "session-1", "visitor"
    ) is True
    repo.get_public_narration.assert_awaited_once_with("test-site", "vi")
    repo.record_listen.assert_awaited_once_with(
        "test-site", "vi", "android", "playback-1", "session-1", "visitor"
    )


@pytest.mark.asyncio
async def test_listen_events_with_same_playback_id_are_idempotent(monkeypatch):
    class ListeningEvents:
        def __init__(self):
            self.ids = set()
            self.documents = []

        async def insert_one(self, event):
            if event["_id"] in self.ids:
                raise DuplicateKeyError("duplicate playback id")
            self.ids.add(event["_id"])
            self.documents.append(event)

    events = ListeningEvents()
    monkeypatch.setattr(
        site_repository,
        "db",
        SimpleNamespace(listening_events=events),
    )
    repo = SiteRepository()

    first = await repo.record_listen(
        "test-site", "vi", "web", "playback-1", "session-1", "visitor"
    )
    duplicate = await repo.record_listen(
        "test-site", "vi", "web", "playback-1", "session-1", "visitor"
    )

    assert first is True
    assert duplicate is False
    assert len(events.documents) == 1


class AsyncCursor:
    def __init__(self, records):
        self.records = records

    def __aiter__(self):
        self.records = iter(self.records)
        return self

    async def __anext__(self):
        try:
            return next(self.records)
        except StopIteration:
            raise StopAsyncIteration

    def sort(self, *_args):
        return self


@pytest.mark.asyncio
async def test_listen_statistics_filter_by_visitor_source_and_device(monkeypatch):
    class ListeningEvents:
        def __init__(self):
            self.pipelines = []

        def aggregate(self, pipeline):
            self.pipelines.append(pipeline)
            records = (
                [{"_id": "09", "count": 2}]
                if len(self.pipelines) == 1
                else [{"_id": "test-site", "count": 2}]
            )
            return AsyncCursor(records)

    events = ListeningEvents()
    fake_db = SimpleNamespace(
        listening_events=events,
        sites=SimpleNamespace(
            find=lambda *_args: AsyncCursor([
                {"code": "test-site", "name": "Test site"},
            ])
        ),
    )
    monkeypatch.setattr(site_repository, "db", fake_db)
    repo = SiteRepository()

    await repo.get_listen_stats(
        datetime(2025, 1, 1, tzinfo=timezone.utc),
        datetime(2025, 1, 2, tzinfo=timezone.utc),
        "day",
        "ios",
    )

    for pipeline in events.pipelines:
        match = pipeline[0]["$match"]
        assert match["source"] == "visitor"
        assert match["device"] == "ios"
