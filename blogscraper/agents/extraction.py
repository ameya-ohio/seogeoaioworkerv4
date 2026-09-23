"""Extraction agent — title, body, header image, publish date for one URL.

Primary text extractor: trafilatura (markdown output).
Metadata extraction: BeautifulSoup over the raw HTML for og:image / og:title /
publication date.

In `--use-browser` mode, the HTML is fetched via Playwright so JS-rendered
content is materialized before extraction.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx
import trafilatura
from bs4 import BeautifulSoup

from utils.urls import normalize_url


log = logging.getLogger(__name__)


@dataclass
class ExtractedArticle:
    url: str
    title: str
    body_md: str
    image_url: str | None
    published_iso: str | None  # ISO 8601 if found, else None


class ExtractionAgent:
    def __init__(
        self,
        client: httpx.AsyncClient,
        *,
        use_browser: bool = False,
        browser_pool: "BrowserPool | None" = None,
    ) -> None:
        self._client = client
        self._use_browser = use_browser
        self._browser_pool = browser_pool

    async def extract(self, url: str) -> ExtractedArticle | None:
        html = await self._fetch_html(url)
        if not html:
            return None

        body_md = trafilatura.extract(
            html,
            url=url,
            output_format="markdown",
            include_links=True,
            include_images=False,
            favor_recall=True,
        )
        if not body_md or len(body_md.strip()) < 80:
            log.warning("extraction returned empty/short body for %s", url)
            body_md = body_md or ""

        soup = BeautifulSoup(html, "html.parser")
        title = self._pick_title(soup)
        image_url = self._pick_image(soup, url)
        published_iso = self._pick_date(soup)

        return ExtractedArticle(
            url=url,
            title=title,
            body_md=body_md.strip(),
            image_url=image_url,
            published_iso=published_iso,
        )

    async def _fetch_html(self, url: str) -> str | None:
        if self._use_browser and self._browser_pool is not None:
            try:
                return await self._browser_pool.fetch_html(url)
            except Exception as e:  # noqa: BLE001
                log.error("browser fetch failed for %s: %s", url, e)
                return None
        try:
            r = await self._client.get(url, follow_redirects=True, timeout=45.0)
        except (httpx.HTTPError, OSError) as e:
            log.error("http fetch failed for %s: %s", url, e)
            return None
        if r.status_code >= 400:
            log.error("http %s for %s", r.status_code, url)
            return None
        return r.text

    # ----------------- meta-tag pickers ----------------------------------

    @staticmethod
    def _pick_title(soup: BeautifulSoup) -> str:
        for prop, attr in (("og:title", "content"), ("twitter:title", "content")):
            tag = soup.find("meta", attrs={"property": prop}) or soup.find(
                "meta", attrs={"name": prop}
            )
            if tag and tag.get(attr):
                return tag[attr].strip()
        h1 = soup.find("h1")
        if h1 and h1.get_text(strip=True):
            return h1.get_text(strip=True)
        if soup.title and soup.title.get_text(strip=True):
            return soup.title.get_text(strip=True)
        return "Untitled"

    @staticmethod
    def _pick_image(soup: BeautifulSoup, page_url: str) -> str | None:
        # 1) og:image / twitter:image
        for prop in ("og:image", "og:image:secure_url", "twitter:image", "twitter:image:src"):
            tag = soup.find("meta", attrs={"property": prop}) or soup.find(
                "meta", attrs={"name": prop}
            )
            if tag and tag.get("content"):
                resolved = normalize_url(tag["content"], page_url)
                if resolved:
                    return resolved
        # 2) link rel=image_src
        link = soup.find("link", attrs={"rel": "image_src"})
        if link and link.get("href"):
            resolved = normalize_url(link["href"], page_url)
            if resolved:
                return resolved
        # 3) <article> first <img>
        article = soup.find("article")
        if article:
            img = article.find("img")
            if img:
                src = img.get("src") or img.get("data-src") or img.get("data-lazy-src")
                resolved = normalize_url(src, page_url) if src else None
                if resolved:
                    return resolved
        # 4) first <img> with width >= 600 (best-effort)
        for img in soup.find_all("img"):
            try:
                w = int(img.get("width", "0"))
            except (TypeError, ValueError):
                w = 0
            src = img.get("src") or img.get("data-src") or img.get("data-lazy-src")
            if src and w >= 600:
                resolved = normalize_url(src, page_url)
                if resolved:
                    return resolved
        # 5) first <img> at all
        img = soup.find("img")
        if img:
            src = img.get("src") or img.get("data-src") or img.get("data-lazy-src")
            if src:
                return normalize_url(src, page_url)
        return None

    @staticmethod
    def _pick_date(soup: BeautifulSoup) -> str | None:
        for prop in (
            "article:published_time",
            "og:article:published_time",
            "datePublished",
            "pubdate",
        ):
            tag = soup.find("meta", attrs={"property": prop}) or soup.find(
                "meta", attrs={"name": prop}
            )
            if tag and tag.get("content"):
                return ExtractionAgent._normalize_iso(tag["content"])
        time_tag = soup.find("time", attrs={"datetime": True})
        if time_tag:
            return ExtractionAgent._normalize_iso(time_tag["datetime"])
        return None

    @staticmethod
    def _normalize_iso(raw: str) -> str | None:
        raw = raw.strip()
        if not raw:
            return None
        # Accept fully-qualified ISO; otherwise parse a few common shapes.
        try:
            # Z suffix isn't supported by fromisoformat in 3.9; replace.
            cleaned = raw.replace("Z", "+00:00")
            dt = datetime.fromisoformat(cleaned)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.isoformat()
        except ValueError:
            return raw  # store as-is; consumers can choose to re-parse


# ---------------------- BrowserPool -------------------------------------

class BrowserPool:
    """Single shared Playwright browser, page-per-fetch.

    Created lazily on first fetch; closed via async context manager.
    """

    def __init__(self, user_agent: str) -> None:
        self._user_agent = user_agent
        self._pw = None
        self._browser = None
        self._context = None

    async def __aenter__(self) -> "BrowserPool":
        from playwright.async_api import async_playwright

        self._pw = await async_playwright().start()
        self._browser = await self._pw.chromium.launch(headless=True)
        self._context = await self._browser.new_context(user_agent=self._user_agent)
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        try:
            if self._context:
                await self._context.close()
            if self._browser:
                await self._browser.close()
        finally:
            if self._pw:
                await self._pw.stop()

    async def fetch_html(self, url: str) -> str | None:
        if self._context is None:
            raise RuntimeError("BrowserPool used outside of async context manager.")
        page = await self._context.new_page()
        try:
            await page.goto(url, wait_until="networkidle", timeout=60_000)
            html = await page.content()
            return html
        finally:
            await page.close()
