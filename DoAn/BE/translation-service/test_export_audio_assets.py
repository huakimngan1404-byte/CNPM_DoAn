from unittest.mock import MagicMock

import pytest

from scripts import export_audio_assets as audio_export


class AsyncCursor:
    def __init__(self, documents):
        self.documents = iter(documents)

    def __aiter__(self):
        return self

    async def __anext__(self):
        try:
            return next(self.documents)
        except StopIteration:
            raise StopAsyncIteration


@pytest.mark.asyncio
async def test_export_audio_assets_copies_mongo_audio(monkeypatch, tmp_path):
    asset_id = f"vi_{'a' * 32}"
    collection = MagicMock()
    collection.find.return_value = AsyncCursor(
        [
            {
                "_id": asset_id,
                "data": b"audio-bytes",
                "content_type": "audio/mpeg",
            }
        ]
    )
    database = MagicMock()
    database.__getitem__.return_value = collection
    client = MagicMock()
    client.__getitem__.return_value = database

    monkeypatch.setattr(
        audio_export,
        "AsyncIOMotorClient",
        lambda uri: client,
    )
    monkeypatch.setenv("MONGO_URI", "mongodb://example.test")

    result = await audio_export.export_audio_assets(tmp_path)

    assert result == (1, 0)
    assert (tmp_path / f"{asset_id}.mp3").read_bytes() == b"audio-bytes"
    client.close.assert_called_once_with()


@pytest.mark.asyncio
async def test_export_audio_assets_does_not_overwrite_existing_file(
    monkeypatch,
    tmp_path,
):
    asset_id = f"vi_{'b' * 32}"
    existing_file = tmp_path / f"{asset_id}.mp3"
    existing_file.write_bytes(b"keep-this")

    collection = MagicMock()
    collection.find.return_value = AsyncCursor(
        [
            {
                "_id": asset_id,
                "data": b"different-audio",
                "content_type": "audio/mpeg",
            }
        ]
    )
    database = MagicMock()
    database.__getitem__.return_value = collection
    client = MagicMock()
    client.__getitem__.return_value = database

    monkeypatch.setattr(
        audio_export,
        "AsyncIOMotorClient",
        lambda uri: client,
    )
    monkeypatch.setenv("MONGO_URI", "mongodb://example.test")

    with pytest.raises(FileExistsError, match="Refusing to overwrite"):
        await audio_export.export_audio_assets(tmp_path)

    assert existing_file.read_bytes() == b"keep-this"
