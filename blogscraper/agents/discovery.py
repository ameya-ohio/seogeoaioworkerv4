"""Discovery agent — enumerate every article URL on a blog.

Strategy (in order):
  1. Sitemap discovery — robots.txt Sitemap: directives + common paths.
  2. HTML pagination crawl — fetch the index, follow ?page= / /page/N variants.
  3. Browser mode — Playwright; scroll-and-click "Load more" until URL set is stable.

The result is a deduped set of absolute URLs that look like article pages.
"""
from __future__ import annotations

import asyncio
import logging
import xml.etree.ElementTree as ET
from dataclasses import dataclass

import httpx
from bs4 import BeautifulSoup

from utils.robots import RobotsChecker
from utils.urls import (
    BlogTarget,
    article_url_filter,
    looks_like_pagination,
    normalize_url,
)


log = logging.getLogger(__name__)


SITEMAP_NS = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}

COMMON_SITEMAP_PATHS = (
    "/sitemap.xml",
    "/sitemap_index.xml",
    "/sitemap-index.xml",
    "/blog-sitemap.xml",
    "/sitemap-blog.xml",
    "/wp-sitemap.xml",
    "/wp-sitemap-posts-post-1.xml",
)

# Heuristic caps so we never run away.
MAX_PAGINATION_PAGES = 50
MAX_BROWSER_SCROLL_ITERATIONS = 40
MAX_SITEMAP_FILES = 50


@dataclass
class DiscoveryResult:
    urls: list[str]
    source: str  # "sitemap" / "html" / "browser"


class DiscoveryAgent:
    def __init__(
        self,
        client: httpx.AsyncClient,
        target: BlogTarget,
        robots: RobotsChecker,
        *,
        use_browser: bool = False,
        request_jitter: tuple[float, float] = (0.5, 1.0),
    ) -> None:
        self._client = client
        self._target = target
        self._robots = robots
        self._use_browser = use_browser
        self._jitter = request_jitter

    async def discover(self) -> DiscoveryResult:
        # 1) sitemap path — cheap, polite
        sitemap_urls = await self._try_sitemaps()
        article_urls = sorted({u for u in sitemap_urls if article_url_filter(u, self._target)})
        if len(article_urls) >= 5 and not self._use_browser:
            log.info("discovery via sitemap: %d article URL(s)", len(article_urls))
            return DiscoveryResult(article_urls, "sitemap")

        # 2) browser mode (forced or fallback for JS-heavy sites)
        if self._use_browser:
            browser_urls = await self._discover_via_browser()
            merged = sorted(set(article_urls) | set(browser_urls))
            if merged:
                log.info("discovery via browser: %d URL(s) (sitemap contributed %d)",
                         len(merged), len(article_urls))
                return DiscoveryResult(merged, "browser")
            # fall through to HTML pagination if browser yielded nothing

        # 3) HTML pagination crawl
        html_urls = await self._discover_via_html_pagination()
        merged = sorted(set(article_urls) | set(html_urls))
        log.info("discovery via html pagination: %d URL(s) (sitemap contributed %d)",
                 len(merged), len(article_urls))
        if merged:
            return DiscoveryResult(merged, "html")

        # last resort: return whatever sitemap gave us, even if small
        return DiscoveryResult(article_urls, "sitemap")

    # ---------------- sitemaps -------------------------------------------

    async def _try_sitemaps(self) -> list[str]:
        candidates: list[str] = []
        try:
            from_robots = await self._robots.sitemaps_for(self._client, self._target.base)
        except Exception as e:  # noqa: BLE001
            log.warning("sitemap lookup via robots failed: %s", e)
            from_robots = []
        candidates.extend(from_robots)
        candidates.extend(self._target.base + p for p in COMMON_SITEMAP_PATHS)
        # de-dup, preserve order
        seen: set[str] = set()
        ordered: list[str] = []
        for c in candidates:
            if c not in seen:
                seen.add(c)
                ordered.append(c)

        urls: set[str] = set()
        visited: set[str] = set()

        async def fetch_and_parse(sm_url: str, depth: int) -> None:
            if sm_url in visited or len(visited) >= MAX_SITEMAP_FILES or depth > 3:
                return
            visited.add(sm_url)
            try:
                r = await self._client.get(sm_url, follow_redirects=True, timeout=30.0)
            except (httpx.HTTPError, OSError) as e:
                log.debug("sitemap fetch failed %s: %s", sm_url, e)
                return
            if r.status_code != 200 or not r.content:
                return
            ctype = (r.headers.get("content-type") or "").lower()
            text = r.text
            if not ("xml" in ctype or text.lstrip().startswith("<?xml") or text.lstrip().startswith("<urlset") or text.lstrip().startswith("<sitemapindex")):
                return
            try:
                root = ET.fromstring(text)
            except ET.ParseError as e:
                log.debug("sitemap parse failed %s: %s", sm_url, e)
                return
            tag = root.tag.split("}")[-1]
            if tag == "sitemapindex":
                children = [
                    loc.text.strip()
                    for loc in root.findall(".//sm:sitemap/sm:loc", SITEMAP_NS)
                    if loc.text
                ]
                # narrow to ones whose URL hints at blog/posts
                hinted = [c for c in children if any(t in c.lower() for t in ("blog", "post", "article"))]
                next_set = hinted or children
                for child in next_set[:MAX_SITEMAP_FILES]:
                    await fetch_and_parse(child, depth + 1)
            elif tag == "urlset":
                for loc in root.findall(".//sm:url/sm:loc", SITEMAP_NS):
                    if loc.text:
                        urls.add(loc.text.strip())

        for c in ordered:
            await fetch_and_parse(c, 0)
            if len(urls) >= 1000:
                break
        return sorted(urls)

    # ---------------- HTML pagination ------------------------------------

    async def _discover_via_html_pagination(self) -> list[str]:
        seen_pages: set[str] = set()
        article_urls: set[str] = set()
        pages_to_visit: list[str] = [self._target.raw]
        for n in range(2, MAX_PAGINATION_PAGES + 1):
            pages_to_visit.append(f"{self._target.base}{self._target.path}?page={n}")
            pages_to_visit.append(f"{self._target.base}{self._target.path}/page/{n}")

        for page_url in pages_to_visit:
            if page_url in seen_pages:
                continue
            seen_pages.add(page_url)
            try:
                r = await self._client.get(page_url, follow_redirects=True, timeout=30.0)
            except (httpx.HTTPError, OSError) as e:
                log.debug("page fetch failed %s: %s", page_url, e)
                continue
            if r.status_code != 200:
                continue
            soup = BeautifulSoup(r.text, "html.parser")
            new_count_before = len(article_urls)
            for a in soup.find_all("a", href=True):
                resolved = normalize_url(a.get("href"), page_url)
                if resolved and article_url_filter(resolved, self._target):
                    article_urls.add(resolved)
                if resolved and looks_like_pagination(resolved, self._target) and resolved not in seen_pages:
                    seen_pages.add(resolved)
                    pages_to_visit.append(resolved)
            if len(article_urls) == new_count_before and page_url != self._target.raw:
                # No new articles on this paginated page — likely past the end.
                break
            await asyncio.sleep(self._jitter[0])
        return sorted(article_urls)

    # ---------------- browser-based discovery ----------------------------

    async def _discover_via_browser(self) -> list[str]:
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            log.error(
                "Playwright is not installed. Run `pip install playwright` "
                "and `python -m playwright install chromium`."
            )
            return []

        article_urls: set[str] = set()
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            try:
                context = await browser.new_context(
                    user_agent="BlogScraper/1.0 (+contact: configure in README)"
                )
                page = await context.new_page()
                log.info("browser: navigating to %s", self._target.raw)
                await page.goto(self._target.raw, wait_until="networkidle", timeout=60_000)

                async def collect() -> int:
                    hrefs = await page.evaluate(
                        "() => Array.from(document.querySelectorAll('a[href]')).map(a => a.href)"
                    )
                    before = len(article_urls)
                    for h in hrefs:
                        n = normalize_url(h, self._target.raw)
                        if n and article_url_filter(n, self._target):
                            article_urls.add(n)
                    return len(article_urls) - before

                # Initial pass + iterative scrolling.
                await collect()
                stable_iters = 0
                for i in range(MAX_BROWSER_SCROLL_ITERATIONS):
                    await page.evaluate("() => window.scrollTo(0, document.body.scrollHeight)")
                    try:
                        await page.wait_for_load_state("networkidle", timeout=8000)
                    except Exception:  # noqa: BLE001
                        await page.wait_for_timeout(800)
                    # Try to click any "load more" / "show more" button.
                    clicked = False
                    for selector in (
                        'button:has-text("Load more")',
                        'button:has-text("Show more")',
                        'button:has-text("More posts")',
                        'a:has-text("Load more")',
                        'a:has-text("Show more")',
                    ):
                        try:
                            btn = await page.query_selector(selector)
                            if btn:
                                await btn.click(timeout=3000)
                                try:
                                    await page.wait_for_load_state("networkidle", timeout=8000)
                                except Exception:  # noqa: BLE001
                                    await page.wait_for_timeout(800)
                                clicked = True
                                break
                        except Exception:  # noqa: BLE001
                            pass
                    new_added = await collect()
                    log.debug("browser scroll %d: +%d (total %d)%s",
                              i + 1, new_added, len(article_urls),
                              " [clicked]" if clicked else "")
                    if new_added == 0 and not clicked:
                        stable_iters += 1
                        if stable_iters >= 3:
                            break
                    else:
                        stable_iters = 0
            finally:
                await browser.close()

        return sorted(article_urls)
