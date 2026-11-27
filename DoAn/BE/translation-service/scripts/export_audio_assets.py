import asyncio
import os
import re
import tempfile
from pathlib import Path

from motor.motor_asyncio import AsyncIOMotorClient


_ASSET_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]+$")


async def export_audio_assets(output_dir: Path) -> tuple[int, int]:
    mongo_uri = os.getenv("MONGO_URI") or os.getenv("MONGODB_URI")
    if not mongo_uri:
        raise RuntimeError("Set MONGODB_URI before exporting audio.")

    database_name = os.getenv("MONGO_DATABASE", "district1_historical_db")
    output_dir.mkdir(parents=True, exist_ok=True)
    client = AsyncIOMotorClient(mongo_uri)
    exported_count = 0
    skipped_count = 0

    try:
        collection = client[database_name]["audio_assets"]
        cursor = collection.find(
            {"data": {"$type": "binData"}},
            {"_id": 1, "data": 1, "content_type": 1},
        )
        async for asset in cursor:
            asset_id = asset.get("_id")
            audio_data = asset.get("data")
            content_type = asset.get("content_type", "audio/mpeg")

            if not isinstance(asset_id, str) or not _ASSET_ID_PATTERN.fullmatch(asset_id):
                raise ValueError("Found an audio asset with an invalid ID.")
            if not isinstance(audio_data, (bytes, bytearray, memoryview)) or not audio_data:
                raise ValueError(f"Audio asset {asset_id} has invalid data.")
            if (
                not isinstance(content_type, str)
                or content_type.split(";", 1)[0].strip().lower()
                not in {"audio/mpeg", "audio/mp3"}
            ):
                raise ValueError(f"Audio asset {asset_id} is not an MP3.")

            output_path = output_dir / f"{asset_id}.mp3"
            audio_bytes = bytes(audio_data)
            if output_path.exists():
                if output_path.read_bytes() != audio_bytes:
                    raise FileExistsError(
                        f"Refusing to overwrite different audio: {output_path}"
                    )
                skipped_count += 1
                continue

            temp_fd, temp_path = tempfile.mkstemp(
                dir=output_dir,
                prefix=f".{asset_id}.",
                suffix=".tmp",
            )
            try:
                with os.fdopen(temp_fd, "wb") as audio_file:
                    audio_file.write(audio_bytes)
                os.replace(temp_path, output_path)
            finally:
                if os.path.exists(temp_path):
                    os.remove(temp_path)
            exported_count += 1
    finally:
        client.close()

    print(
        f"Exported {exported_count} audio asset(s); "
        f"skipped {skipped_count} existing file(s) in {output_dir}"
    )
    return exported_count, skipped_count


if __name__ == "__main__":
    destination = Path(os.getenv("AUDIO_EXPORT_DIR", "/app/FolderA"))
    asyncio.run(export_audio_assets(destination))
