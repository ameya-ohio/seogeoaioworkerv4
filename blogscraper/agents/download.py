"""Download agent — fetch one image with retries, save with sanitized filename."""
from __future__ import annotations

import asyncio
import logging
import mimetypes
import random
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

import aiofiles
import httpx


log = logging.getLogger(__name__)


VALID_IMAGE_EXTS = {"jpg", "jpeg", "png", "webp", "avif", "gif", "svg"}

CONTENT_TYPE_TO_EXT = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
    "image/gif": "gif",
    "image/svg+xml": "svg",
}


@dataclass
class DownloadResult:
    url: str
    saved_path: Path | None
    error: str | None = None


class DownloadAgent:
    def __init__(
        self,
        client: httpx.AsyncClient,
        *,
        retries: int = 3,
        backoff_base: float = 0.8,
    ) -> None:
        self._client = client
        self._retries = retries
        self._backoff_base = backoff_base

    async def download(self, image_url: str, dest_dir: Path, slug: str) -> DownloadResult:
        last_err: str | None = None
        for attempt in range(1, self._retries + 1):
            try:
                async with self._client.stream(
                    "GET", image_url, follow_redirects=True, timeout=60.0
                ) as r:
                    if r.status_code >= 400:
                        last_err = f"http {r.status_code}"
                        log.warning(
                            "image fetch %s -> %s (attempt %d/%d)",
                            image_url, r.status_code, attempt, self._retries,
                        )
                    else:
                        ext = self._pick_extension(image_url, r.headers.get("content-type"))
                        if ext not in VALID_IMAGE_EXTS:
                            last_err = f"unrecognized image type: ext={ext!r} ctype={r.headers.get('content-type')!r}"
                            log.warning("%s for %s", last_err, image_url)
                        else:
                            dest_dir.mkdir(parents=True, exist_ok=True)
                            target = dest_dir / f"{slug}.{ext}"
                            async with aiofiles.open(target, "wb") as f:
                                async for chunk in r.aiter_bytes(chunk_size=64 * 1024):
                                    await f.write(chunk)
                            return DownloadResult(url=image_url, saved_path=target)
            except (httpx.HTTPError, OSError) as e:
                last_err = f"{type(e).__name__}: {e}"
                log.warning(
                    "image fetch error %s (attempt %d/%d): %s",
                    image_url, attempt, self._retries, last_err,
                )
            if attempt < self._retries:
                delay = self._backoff_base * (2 ** (attempt - 1)) + random.uniform(0, 0.4)
                await asyncio.sleep(delay)
        return DownloadResult(url=image_url, saved_path=None, error=last_err)

    @staticmethod
    def _pick_extension(url: str, content_type: str | None) -> str:
        # 1) Content-Type header (most reliable).
        if content_type:
            ctype = content_type.split(";")[0].strip().lower()
            if ctype in CONTENT_TYPE_TO_EXT:
                return CONTENT_TYPE_TO_EXT[ctype]
            guess = mimetypes.guess_extension(ctype) or ""
            if guess.lstrip(".").lower() in VALID_IMAGE_EXTS:
                return guess.lstrip(".").lower()
        # 2) URL path extension.
        path = urlparse(url).path.lower()
        if "." in path:
            ext = path.rsplit(".", 1)[-1]
            if ext in VALID_IMAGE_EXTS:
                return ext
        return "bin"  # caller treats as failure
