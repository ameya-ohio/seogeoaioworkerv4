#!/usr/bin/env python3
"""Scaffold a new article folder.

Usage:
    python scripts/new_article.py "my-article-slug"

Creates:
    articles/YYYY-MM-DD-slug/
        article.md          (from templates/article-template.md, with title placeholder)
        meta.json           (with the slug filled in)
        research-notes.md   (empty stub)
        outline.md          (empty stub)

Prints the new folder path on success.
Standard library only.
"""
from __future__ import annotations

import datetime as _dt
import json
import re
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent


def slugify(raw: str) -> str:
    s = raw.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-{2,}", "-", s)
    s = s.strip("-")
    if not s:
        raise SystemExit("Slug cannot be empty after normalization.")
    if len(s) > 60:
        s = s[:60].rstrip("-")
    return s


def main() -> int:
    if len(sys.argv) != 2:
        print('Usage: python scripts/new_article.py "my-article-slug"', file=sys.stderr)
        return 2

    slug = slugify(sys.argv[1])
    today = _dt.date.today().isoformat()
    folder = REPO_ROOT / "articles" / f"{today}-{slug}"

    if folder.exists():
        print(f"Folder already exists: {folder}", file=sys.stderr)
        return 1

    folder.mkdir(parents=True)

    # article.md from template (or minimal fallback)
    template = REPO_ROOT / "templates" / "article-template.md"
    if template.is_file():
        body = template.read_text(encoding="utf-8")
    else:
        body = (
            "---\n"
            'title: ""\n'
            f'slug: "{slug}"\n'
            'author: ""\n'
            f'publish_date: "{today}"\n'
            f'modified_date: "{today}"\n'
            'meta_description: ""\n'
            'primary_keyword: ""\n'
            "secondary_keywords: []\n"
            'canonical_url: ""\n'
            "---\n\n"
            "# [H1 Title]\n"
        )

    body = body.replace('slug: ""', f'slug: "{slug}"')
    body = body.replace('publish_date: ""', f'publish_date: "{today}"')
    body = body.replace('modified_date: ""', f'modified_date: "{today}"')

    (folder / "article.md").write_text(body, encoding="utf-8")

    # meta.json
    meta = {
        "title": "",
        "slug": slug,
        "meta_description": "",
        "primary_keyword": "",
        "secondary_keywords": [],
        "canonical_url": "",
        "publish_date": today,
        "modified_date": today,
    }
    (folder / "meta.json").write_text(
        json.dumps(meta, indent=2) + "\n", encoding="utf-8"
    )

    # empty stubs
    (folder / "research-notes.md").write_text(
        f"# Research Notes: {slug}\n\n_(populated by Phase 1 — Researcher)_\n",
        encoding="utf-8",
    )
    (folder / "outline.md").write_text(
        f"# Strategy & Outline: {slug}\n\n_(populated by Phase 2 — Strategist)_\n",
        encoding="utf-8",
    )

    print(folder)
    return 0


if __name__ == "__main__":
    sys.exit(main())
