"""HubSpot CMS Blog Posts v3 client.

Field names below are verified against the live API (the public docs are
incomplete on `headHtml`).
"""
from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests


log = logging.getLogger(__name__)


DEFAULT_BASE_URL = "https://api.hubapi.com"
CACHE_FILENAME = ".config_cache.json"


class HubSpotError(RuntimeError):
    def __init__(self, message: str, status: int | None = None, body: Any = None) -> None:
        super().__init__(message)
        self.status = status
        self.body = body


@dataclass
class PostPayload:
    title: str
    slug: str
    meta_description: str
    post_body_html: str
    head_html: str
    html_title: str | None = None


class HubSpotClient:
    def __init__(
        self,
        token: str,
        *,
        base_url: str | None = None,
        cache_path: str | Path | None = None,
        author_name: str = "",
        content_group_id: str = "",
        blog_author_id: str = "",
    ) -> None:
        if not token:
            raise HubSpotError("HUBSPOT_TOKEN is empty.")
        self._token = token
        self._base_url = (base_url or os.getenv("HUBSPOT_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
        self._cache_path = Path(cache_path) if cache_path else Path.cwd() / CACHE_FILENAME
        self._author_name = author_name
        # From config/company.yaml; empty -> resolve via API (and cache).
        self._content_group_id = str(content_group_id or "")
        self._blog_author_id = str(blog_author_id or "")
        self._session = requests.Session()
        self._session.headers.update(
            {
                "Authorization": f"Bearer {self._token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            }
        )

    # ---- public surface --------------------------------------------------

    def resolve_blog_id(self) -> str:
        if self._content_group_id:
            return self._content_group_id
        cached = self._read_cache().get("content_group_id")
        if cached:
            return str(cached)

        blogs = self._get("/cms/v3/blog-settings/settings", params={"limit": 100}).get(
            "results", []
        )
        if not blogs:
            raise HubSpotError("No blogs found on this HubSpot account.")
        if len(blogs) > 1:
            listing = "\n".join(
                f"  - id={b['id']}  name={b.get('name')!r}  url={b.get('absoluteUrl')}"
                for b in blogs
            )
            raise HubSpotError(
                "Multiple blogs found; cannot auto-pick. Set `content_group_id` "
                f"in {self._cache_path.name}:\n{listing}"
            )
        chosen = str(blogs[0]["id"])
        self._update_cache(content_group_id=chosen)
        log.info("resolved blog id=%s (%r)", chosen, blogs[0].get("name"))
        return chosen

    def resolve_author_id(self) -> str:
        if self._blog_author_id:
            return self._blog_author_id
        cached = self._read_cache().get("blog_author_id")
        if cached:
            return str(cached)

        if not self._author_name:
            raise HubSpotError(
                "No blog_author_id configured and no author name to resolve. "
                "Set author.name (and optionally hubspot.blog_author_id) in "
                "config/company.yaml."
            )
        results = self._get(
            "/cms/v3/blogs/authors", params={"limit": 100}
        ).get("results", [])
        target = self._author_name.casefold().strip()
        matches = [
            a
            for a in results
            if (a.get("displayName") or a.get("fullName") or a.get("name") or "")
            .casefold()
            .strip()
            == target
        ]
        if not matches:
            raise HubSpotError(
                f"No HubSpot blog author matched name {self._author_name!r}. "
                "Create the author in HubSpot or set `blog_author_id` in the cache file."
            )
        if len(matches) > 1:
            listing = "\n".join(
                f"  - id={a['id']}  email={a.get('email')!r}  created={a.get('created')}"
                for a in matches
            )
            raise HubSpotError(
                f"Multiple authors named {self._author_name!r} found. "
                f"Set `blog_author_id` in {self._cache_path.name} to disambiguate:\n{listing}"
            )
        chosen = str(matches[0]["id"])
        self._update_cache(blog_author_id=chosen)
        log.info("resolved author id=%s (%r)", chosen, matches[0].get("displayName"))
        return chosen

    def create_post(
        self,
        payload: PostPayload,
        *,
        publish: bool = True,
    ) -> dict[str, Any]:
        body = {
            "name": payload.title,
            "slug": payload.slug,
            "metaDescription": payload.meta_description,
            "postBody": payload.post_body_html,
            "contentGroupId": self.resolve_blog_id(),
            "blogAuthorId": self.resolve_author_id(),
            "state": "PUBLISHED" if publish else "DRAFT",
        }
        if payload.head_html:
            body["headHtml"] = payload.head_html
        if payload.html_title:
            body["htmlTitle"] = payload.html_title
        if publish:
            body["publishImmediately"] = True

        log.info("POST /cms/v3/blogs/posts  title=%r  state=%s", payload.title, body["state"])
        return self._post("/cms/v3/blogs/posts", body)

    # ---- internals -------------------------------------------------------

    def _get(self, path: str, params: dict | None = None) -> dict:
        url = f"{self._base_url}{path}"
        r = self._session.get(url, params=params, timeout=30)
        return self._handle(r)

    def _post(self, path: str, body: dict) -> dict:
        url = f"{self._base_url}{path}"
        r = self._session.post(url, json=body, timeout=60)
        return self._handle(r)

    @staticmethod
    def _handle(r: requests.Response) -> dict:
        if r.status_code >= 400:
            try:
                detail = r.json()
            except ValueError:
                detail = r.text
            log.error("HubSpot API %s %s -> %s\n%s", r.request.method, r.request.url, r.status_code, detail)
            raise HubSpotError(
                f"HubSpot API error {r.status_code} on {r.request.method} {r.request.url}",
                status=r.status_code,
                body=detail,
            )
        if not r.content:
            return {}
        return r.json()

    def _read_cache(self) -> dict:
        if not self._cache_path.exists():
            return {}
        try:
            return json.loads(self._cache_path.read_text())
        except (OSError, ValueError):
            return {}

    def _update_cache(self, **kv: Any) -> None:
        data = self._read_cache()
        data.update(kv)
        self._cache_path.write_text(json.dumps(data, indent=2, sort_keys=True))
