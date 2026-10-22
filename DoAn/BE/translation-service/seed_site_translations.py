import argparse
import asyncio

from fastapi import HTTPException

import main
from presentation.audio_router import get_site_translation

DEFAULT_LANGUAGES = ("en", "zh", "ja", "ko")
SUPPORTED_LANGUAGES = ("en", "zh", "ja", "ko")


async def seed_site(site_code: str, languages: list[str]) -> int:
    failures = 0
    try:
        for lang in languages:
            try:
                result = await get_site_translation(site_code, lang)
            except HTTPException as exc:
                failures += 1
                print(f"FAILED {site_code} [{lang}]: {exc.detail}")
                continue

            print(
                f"OK {site_code} [{lang}] "
                f"translation_cache={result['translation_cache']} "
                f"audio_cache={result['audio_cache']}"
            )
            print(f"  audio_url: {result['audio_url']}")
    finally:
        main.client.close()

    return failures


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate and save translations and audio for one site."
    )
    parser.add_argument(
        "--site-code",
        required=True,
        help="Site code, for example ben-nha-rong.",
    )
    parser.add_argument(
        "--languages",
        nargs="+",
        choices=SUPPORTED_LANGUAGES,
        default=list(DEFAULT_LANGUAGES),
        help="Target languages (default: en zh ja ko).",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    failed_count = asyncio.run(seed_site(args.site_code, args.languages))
    raise SystemExit(1 if failed_count else 0)
