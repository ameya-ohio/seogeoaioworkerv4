"""Read frontmatter from a finalized article folder produced by the
multi-agent blog production system at the seogeoaioworkerv2 root.

Used when the header generator runs as Phase 6 of the article pipeline.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import frontmatter


@dataclass
class ArticleMeta:
    title: str
    primary_keyword: str | None
    meta_description: str | None
    category: str | None
    article_md_path: Path


def read_article_meta(folder: Path) -> ArticleMeta:
    """Parse `<folder>/article.md` frontmatter and return key fields."""
    article_path = folder / "article.md"
    if not article_path.is_file():
        raise FileNotFoundError(f"No article.md in {folder}")
    post = frontmatter.load(article_path)
    meta = post.metadata or {}
    title = str(meta.get("title", "")).strip()
    if not title:
        raise ValueError(f"article.md has no `title` in frontmatter: {article_path}")
    return ArticleMeta(
        title=title,
        primary_keyword=(str(meta["primary_keyword"]).strip() if meta.get("primary_keyword") else None),
        meta_description=(str(meta["meta_description"]).strip() if meta.get("meta_description") else None),
        category=(str(meta["category"]).strip() if meta.get("category") else None),
        article_md_path=article_path,
    )
