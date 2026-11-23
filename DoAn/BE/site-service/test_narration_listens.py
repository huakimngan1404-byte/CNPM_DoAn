from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from pymongo.errors import DuplicateKeyError

from business.site_service import SiteService
from data import site_repository
from data.site_repository import SiteRepository, has_valid_mp3_data, narration_status


def test_narration_status_replaces_draft_with_not_ready():
    assert narration_status({}, has_audio=True) == "published"
    assert narration_status({}, has_audio=False) == "not_ready"
    assert narration_status({"narration_status": "draft"}, has_audio=False) == "not_ready"
    assert narration_status({"narration_status": "draft"}, has_audio=True) == "ready"
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
async def test_set_narration_status_rejects_draft():
    with pytest.raises(ValueError, match="không hợp lệ"):
        await SiteService().set_narration_status("test-site", "vi", "draft")


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
