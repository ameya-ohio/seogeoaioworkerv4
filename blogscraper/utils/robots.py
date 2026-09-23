"""robots.txt loader & checker (async, with caching).

Uses the stdlib `urllib.robotparser` for evaluation; the network fetch is async
via httpx so the orchestrator's event loop isn't blocked.
"""
from __future__ import annotations

import logging
from urllib.robotparser import RobotFileParser

import httpx


log = logging.getLogger(__name__)


class RobotsChecker:
    """Async, cached per-host robots.txt evaluator.

    Usage:
        checker = RobotsChecker("BlogScraper/1.0")
        async with httpx.AsyncClient() as client:
            ok = await checker.allowed(client, "https://example.com/blog/foo")
    """

    def __init__(self, user_agent: str) -> None:
        self._user_agent = user_agent
        self._cache: dict[str, RobotFileParser | None] = {}
        self._sitemaps: dict[str, list[str]] = {}

    async def _load(self, client: httpx.AsyncClient, base_url: str) -> RobotFileParser | None:
        if base_url in self._cache:
            return self._cache[base_url]
        robots_url = base_url.rstrip("/") + "/robots.txt"
        rp = RobotFileParser()
        try:
            r = await client.get(
                robots_url,
                follow_redirects=True,
                timeout=15.0,
                headers={"User-Agent": self._user_agent},
            )
        except (httpx.HTTPError, OSError) as e:
            log.warning("robots.txt fetch failed for %s: %s — assuming allow-all", robots_url, e)
            self._cache[base_url] = None
            self._sitemaps[base_url] = []
            return None
        if r.status_code >= 400:
            log.info("robots.txt at %s returned %s — assuming allow-all", robots_url, r.status_code)
            self._cache[base_url] = None
            self._sitemaps[base_url] = []
            return None
        try:
            rp.parse(r.text.splitlines())
        except Exception as e:  # noqa: BLE001 — defensive
            log.warning("robots.txt parse failed for %s: %s — assuming allow-all", robots_url, e)
            self._cache[base_url] = None
            self._sitemaps[base_url] = []
            return None
        # Capture Sitemap: directives so the discovery agent can use them later.
        sitemaps: list[str] = []
        for line in r.text.splitlines():
            stripped = line.strip()
            if stripped.lower().startswith("sitemap:"):
                value = stripped.split(":", 1)[1].strip()
                if value:
                    sitemaps.append(value)
        self._cache[base_url] = rp
        self._sitemaps[base_url] = sitemaps
        log.info("loaded robots.txt for %s (%d sitemap directive(s))", base_url, len(sitemaps))
        return rp

    async def allowed(self, client: httpx.AsyncClient, url: str) -> bool:
        from urllib.parse import urlparse

        parsed = urlparse(url)
        base = f"{parsed.scheme}://{parsed.netloc}"
        rp = await self._load(client, base)
        if rp is None:
            return True
        return rp.can_fetch(self._user_agent, url)

    async def sitemaps_for(self, client: httpx.AsyncClient, base_url: str) -> list[str]:
        await self._load(client, base_url)
        return list(self._sitemaps.get(base_url, []))
