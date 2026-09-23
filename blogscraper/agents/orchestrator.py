"""Orchestrator — coordinates Discovery, Extraction, Download.

Responsibilities:
  - Output-folder layout per spec: <domain>/<blog_path>/{blog_text,blog_images}/, manifest.json.
  - Concurrency control (semaphore=5) and per-request jitter (0.5-1.0s).
  - Resume: skip URLs already in the manifest.
  - Per-article error isolation: one failure doesn't kill the run.
  - Final summary: discovered / scraped / failed / images downloaded.
"""
from __future__ import annotations

import asyncio
import json
import logging
import random
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import aiofiles
import httpx

from agents.discovery import DiscoveryAgent
from agents.download import DownloadAgent
from agents.extraction import BrowserPool, ExtractionAgent
from utils.robots import RobotsChecker
from utils.slugs import slug_from_url_with_fallback
from utils.urls import BlogTarget


log = logging.getLogger(__name__)


USER_AGENT = "BlogScraper/1.0 (+contact: configure in README)"


@dataclass
class ManifestEntry:
    url: str
    title: str
    text_path: str | None
    image_path: str | None
    image_url: str | None
    published: str | None
    date_scraped: str
    status: str  # "ok" | "partial" | "failed"
    error: str | None = None


@dataclass
class RunSummary:
    target: str
    output_dir: str
    discovered: int = 0
    scraped_ok: int = 0
    scraped_partial: int = 0
    scraped_failed: int = 0
    images_downloaded: int = 0
    skipped_already_done: int = 0
    discovery_source: str = ""
    discovered_urls: list[str] = field(default_factory=list)


class Orchestrator:
    def __init__(
        self,
        target: BlogTarget,
        *,
        output_dir: Path,
        use_browser: bool = False,
        no_images: bool = False,
        max_articles: int | None = None,
        concurrency: int = 5,
        jitter: tuple[float, float] = (0.5, 1.0),
    ) -> None:
        self._target = target
        self._output_root = output_dir
        # Per-spec layout: <output_root>/<domain>/<blog_path>/...
        rel_blog = target.path.lstrip("/") or "root"
        self._domain_dir = self._output_root / target.domain_root
        self._blog_dir = self._domain_dir / rel_blog
        self._text_dir = self._blog_dir / "blog_text"
        self._images_dir = self._blog_dir / "blog_images"
        self._manifest_path = self._blog_dir / "manifest.json"
        self._use_browser = use_browser
        self._no_images = no_images
        self._max_articles = max_articles
        self._concurrency = concurrency
        self._jitter = jitter

    # ---------------- public entry --------------------------------------

    async def run(self, *, dry_run: bool = False) -> RunSummary:
        self._blog_dir.mkdir(parents=True, exist_ok=True)
        self._text_dir.mkdir(parents=True, exist_ok=True)
        if not self._no_images:
            self._images_dir.mkdir(parents=True, exist_ok=True)

        existing_manifest = self._load_manifest()
        already_done_urls = {e["url"] for e in existing_manifest}

        async with httpx.AsyncClient(
            headers={"User-Agent": USER_AGENT},
            follow_redirects=True,
            timeout=30.0,
        ) as client:
            robots = RobotsChecker(USER_AGENT)
            if not await robots.allowed(client, self._target.raw):
                raise SystemExit(
                    f"robots.txt disallows BlogScraper from {self._target.raw}. Aborting."
                )

            discovery = DiscoveryAgent(
                client, self._target, robots,
                use_browser=self._use_browser, request_jitter=self._jitter,
            )
            log.info("=== discovery ===")
            disc = await discovery.discover()
            log.info("discovery source=%s urls=%d", disc.source, len(disc.urls))

            summary = RunSummary(
                target=self._target.raw,
                output_dir=str(self._blog_dir),
                discovered=len(disc.urls),
                discovery_source=disc.source,
                discovered_urls=disc.urls,
            )

            todo: list[str] = []
            for u in disc.urls:
                if u in already_done_urls:
                    summary.skipped_already_done += 1
                    continue
                todo.append(u)

            if self._max_articles is not None:
                todo = todo[: self._max_articles]

            if dry_run:
                log.info("=== dry run — no extraction or download ===")
                for u in todo:
                    print(u)
                return summary

            if not todo:
                log.info("nothing to do — all discovered URLs already in manifest.")
                return summary

            # Permission preflight: drop any URL robots.txt disallows.
            allowed_todo: list[str] = []
            for u in todo:
                if await robots.allowed(client, u):
                    allowed_todo.append(u)
                else:
                    log.warning("robots.txt disallows %s — skipping", u)
            todo = allowed_todo

            log.info("=== extraction & download — %d article(s) ===", len(todo))

            new_entries: list[ManifestEntry] = []
            sem = asyncio.Semaphore(self._concurrency)

            browser_pool: BrowserPool | None = None
            if self._use_browser:
                browser_pool = BrowserPool(user_agent=USER_AGENT)
                await browser_pool.__aenter__()

            extraction = ExtractionAgent(
                client, use_browser=self._use_browser, browser_pool=browser_pool
            )
            download = DownloadAgent(client)

            try:
                async def worker(url: str) -> ManifestEntry:
                    async with sem:
                        await asyncio.sleep(random.uniform(*self._jitter))
                        return await self._scrape_one(url, extraction, download)

                results = await asyncio.gather(
                    *(worker(u) for u in todo), return_exceptions=True
                )
            finally:
                if browser_pool is not None:
                    await browser_pool.__aexit__(None, None, None)

            for r in results:
                if isinstance(r, Exception):
                    log.error("worker raised: %s", r)
                    summary.scraped_failed += 1
                    continue
                entry = r
                new_entries.append(entry)
                if entry.status == "ok":
                    summary.scraped_ok += 1
                elif entry.status == "partial":
                    summary.scraped_partial += 1
                else:
                    summary.scraped_failed += 1
                if entry.image_path:
                    summary.images_downloaded += 1

            self._save_manifest(existing_manifest + [asdict(e) for e in new_entries])

        return summary

    # ---------------- per-article scraping -------------------------------

    async def _scrape_one(
        self,
        url: str,
        extraction: ExtractionAgent,
        download: DownloadAgent,
    ) -> ManifestEntry:
        now_iso = datetime.now(timezone.utc).isoformat()
        try:
            article = await extraction.extract(url)
        except Exception as e:  # noqa: BLE001
            log.exception("extraction crashed for %s", url)
            return ManifestEntry(
                url=url, title="", text_path=None, image_path=None,
                image_url=None, published=None, date_scraped=now_iso,
                status="failed", error=f"extraction: {e}",
            )

        if article is None or not article.body_md:
            return ManifestEntry(
                url=url, title="", text_path=None, image_path=None,
                image_url=None, published=None, date_scraped=now_iso,
                status="failed", error="extraction returned no body",
            )

        slug = slug_from_url_with_fallback(url, article.title)

        image_path: Path | None = None
        image_err: str | None = None
        if article.image_url and not self._no_images:
            try:
                dl = await download.download(article.image_url, self._images_dir, slug)
            except Exception as e:  # noqa: BLE001
                log.exception("download crashed for %s", article.image_url)
                image_err = f"download crashed: {e}"
                dl = None
            if dl and dl.saved_path:
                image_path = dl.saved_path
            elif dl:
                image_err = dl.error
        elif not article.image_url:
            image_err = "no image url found"

        text_path = await self._write_text(article, slug, image_path)

        status = "ok" if (image_path or self._no_images or not article.image_url) else "partial"

        return ManifestEntry(
            url=url,
            title=article.title,
            text_path=str(text_path.relative_to(self._blog_dir)) if text_path else None,
            image_path=str(image_path.relative_to(self._blog_dir)) if image_path else None,
            image_url=article.image_url,
            published=article.published_iso,
            date_scraped=now_iso,
            status=status,
            error=image_err if status != "ok" else None,
        )

    async def _write_text(self, article, slug: str, image_path: Path | None) -> Path:
        target = self._text_dir / f"{slug}.md"
        # Avoid overwriting an unrelated file with the same slug.
        n = 2
        while target.exists():
            target = self._text_dir / f"{slug}-{n}.md"
            n += 1
        image_filename = image_path.name if image_path else ""
        front = (
            "---\n"
            f"title: {_yaml_str(article.title)}\n"
            f"url: {_yaml_str(article.url)}\n"
            f"published: {_yaml_str(article.published_iso or '')}\n"
            f"image_filename: {_yaml_str(image_filename)}\n"
            "---\n\n"
        )
        async with aiofiles.open(target, "w", encoding="utf-8") as f:
            await f.write(front)
            await f.write(article.body_md.rstrip() + "\n")
        return target

    # ---------------- manifest -------------------------------------------

    def _load_manifest(self) -> list[dict]:
        if not self._manifest_path.is_file():
            return []
        try:
            data = json.loads(self._manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            log.warning("manifest parse failed: %s — starting fresh", e)
            return []
        if isinstance(data, dict) and "articles" in data:
            return list(data["articles"])
        if isinstance(data, list):
            return data
        return []

    def _save_manifest(self, articles: list[dict]) -> None:
        payload = {
            "target": self._target.raw,
            "domain_root": self._target.domain_root,
            "blog_path": self._target.path,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "articles": articles,
        }
        self._manifest_path.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )


def _yaml_str(s: str) -> str:
    """Quote a YAML string safely (always wrap in double quotes, escape \\ and \")."""
    s = (s or "").replace("\\", "\\\\").replace('"', '\\"')
    return f'"{s}"'
