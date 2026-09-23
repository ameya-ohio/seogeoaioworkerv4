#!/usr/bin/env python3
"""Validate HubSpot access for the configured company.

Standard library only. Reads config/company.yaml (COMPANY_CONFIG override
respected), takes the private-app token from the env var named by
``hubspot.token_env``, and checks:

  1. Token works (blog-settings endpoint answers).
  2. ``hubspot.content_group_id`` exists on the portal — or, when empty,
     resolves it (unique blog) / lists candidates (multiple blogs).
  3. ``hubspot.blog_author_id`` exists — or, when empty, resolves it by
     ``author.name`` / lists candidates on ambiguity.
  4. Read access to posts: lists the most recent posts on the blog.

Prints a PASS/WARN/FAIL report with ACTION lines naming the exact
company.yaml keys to fill in. Exit 0 = no FAIL lines, 1 = at least one.

Resolution logic mirrors blogsagent/md_to_hubspot/hubspot_client.py; IDs
resolved here belong in config/company.yaml (config over cache).
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from company_config import ConfigError, cfg_get, load_config  # noqa: E402

DEFAULT_BASE_URL = "https://api.hubapi.com"


class Report:
    def __init__(self) -> None:
        self.failed = False

    def line(self, status: str, msg: str) -> None:
        if status == "FAIL":
            self.failed = True
        print(f"{status:<4} {msg}")

    def action(self, msg: str) -> None:
        print(f"     ACTION: {msg}")


def api_get(token: str, base_url: str, path: str, params: dict | None = None) -> dict:
    url = f"{base_url}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def author_display_name(a: dict) -> str:
    return str(a.get("displayName") or a.get("fullName") or a.get("name") or "")


def main() -> int:
    rep = Report()
    try:
        cfg = load_config()
    except ConfigError as e:
        rep.line("FAIL", f"config: {e}")
        return 1
    company = cfg_get(cfg, "company.name", "?")
    print(f"HubSpot validation for: {company}\n")

    token_env = cfg_get(cfg, "hubspot.token_env", "HUBSPOT_TOKEN")
    token = os.environ.get(token_env, "")
    if not token:
        rep.line("FAIL", f"token: env var {token_env} is not set")
        rep.action(f"export {token_env}=<private-app token> (or put it in blogsagent/.env)")
        return 1
    base_url = os.environ.get("HUBSPOT_BASE_URL", DEFAULT_BASE_URL).rstrip("/")

    # 1+2 — token check + blog (content group) resolution
    try:
        blogs = api_get(token, base_url, "/cms/v3/blog-settings/settings", {"limit": 100}).get(
            "results", []
        )
    except urllib.error.HTTPError as e:
        rep.line("FAIL", f"token: HubSpot answered {e.code} on blog-settings")
        if e.code in (401, 403):
            rep.action(f"check the token in {token_env} and its scopes (CMS blog read/write)")
        return 1
    except urllib.error.URLError as e:
        rep.line("FAIL", f"network: cannot reach {base_url} ({e.reason})")
        return 1
    rep.line("PASS", f"token: valid ({token_env}), {len(blogs)} blog(s) on the portal")

    configured_blog = str(cfg_get(cfg, "hubspot.content_group_id", "") or "")
    blog_id = ""
    if configured_blog:
        match = next((b for b in blogs if str(b.get("id")) == configured_blog), None)
        if match:
            blog_id = configured_blog
            rep.line("PASS", f"blog: content_group_id={configured_blog} ({match.get('name')!r}, {match.get('absoluteUrl')})")
        else:
            rep.line("FAIL", f"blog: content_group_id={configured_blog} not found on this portal")
            for b in blogs:
                rep.action(f"candidate: id={b.get('id')} name={b.get('name')!r} url={b.get('absoluteUrl')}")
    elif len(blogs) == 1:
        blog_id = str(blogs[0]["id"])
        rep.line("WARN", f"blog: content_group_id empty; resolved to {blog_id} ({blogs[0].get('name')!r})")
        rep.action(f'set hubspot.content_group_id: "{blog_id}" in company.yaml')
    elif not blogs:
        rep.line("FAIL", "blog: no blogs exist on this portal")
    else:
        rep.line("FAIL", "blog: content_group_id empty and multiple blogs found — pick one")
        for b in blogs:
            rep.action(f"candidate: id={b.get('id')} name={b.get('name')!r} url={b.get('absoluteUrl')}")

    # 3 — author resolution
    try:
        authors = api_get(token, base_url, "/cms/v3/blogs/authors", {"limit": 100}).get(
            "results", []
        )
    except urllib.error.HTTPError as e:
        authors = []
        rep.line("FAIL", f"authors: HubSpot answered {e.code} on blogs/authors")
    configured_author = str(cfg_get(cfg, "hubspot.blog_author_id", "") or "")
    author_name = str(cfg_get(cfg, "author.name", "") or "")
    if configured_author:
        match = next((a for a in authors if str(a.get("id")) == configured_author), None)
        if match:
            rep.line("PASS", f"author: blog_author_id={configured_author} ({author_display_name(match)!r})")
        else:
            rep.line("FAIL", f"author: blog_author_id={configured_author} not found on this portal")
    elif author_name:
        target = author_name.casefold().strip()
        matches = [a for a in authors if author_display_name(a).casefold().strip() == target]
        if len(matches) == 1:
            rep.line("WARN", f"author: blog_author_id empty; resolved {author_name!r} to {matches[0]['id']}")
            rep.action(f'set hubspot.blog_author_id: "{matches[0]["id"]}" in company.yaml')
        elif not matches:
            rep.line("FAIL", f"author: no HubSpot blog author named {author_name!r}")
            rep.action("create the author in HubSpot (Settings > Website > Blog > Authors), then re-run")
        else:
            rep.line("FAIL", f"author: {len(matches)} authors named {author_name!r} — pick one")
            for a in matches:
                rep.action(f"candidate: id={a.get('id')} email={a.get('email')!r} created={a.get('created')}")
    else:
        rep.line("FAIL", "author: blog_author_id and author.name both empty in company.yaml")

    # 4 — post read access (proof of life; filtered to the blog when known)
    try:
        posts = api_get(token, base_url, "/cms/v3/blogs/posts", {"limit": 100}).get("results", [])
        if blog_id:
            posts = [p for p in posts if str(p.get("contentGroupId")) == blog_id]
        posts.sort(key=lambda p: str(p.get("updated") or ""), reverse=True)
        rep.line("PASS", f"posts: read access OK, {len(posts)} post(s) visible")
        for p in posts[:5]:
            rep.line("    ", f"  {p.get('state', '?'):<9} {p.get('slug')!r}  ({p.get('name')})")
    except urllib.error.HTTPError as e:
        rep.line("FAIL", f"posts: HubSpot answered {e.code} on blogs/posts")

    print()
    print("RESULT: " + ("FAIL — fix the lines above and re-run" if rep.failed else "OK"))
    return 1 if rep.failed else 0


if __name__ == "__main__":
    sys.exit(main())
