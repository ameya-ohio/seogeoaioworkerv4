"""Parse a markdown post file with YAML frontmatter into a PostInput.

Expected file shape:

    ---
    title: "How to ..."
    slug: "how-to"
    meta_description: "Short SEO description, ~155 chars."
    html_title: "Optional SEO <title> override"          # optional
    schemas:
      - "@context": "https://schema.org"
        "@type": "Article"
        headline: "How to ..."
      - "@context": "https://schema.org"
        "@type": "FAQPage"
        mainEntity: [...]
    ---

    # First-level heading (will be stripped — HubSpot template renders the title)

    Body markdown here. [Internal link](/some-page). [External](https://example.com).

    ## Section heading

    ...
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import frontmatter


REQUIRED_FIELDS = ("title", "slug", "meta_description")


class ParseError(ValueError):
    """Raised when the input markdown file is malformed or missing fields."""


@dataclass
class PostInput:
    title: str
    slug: str
    meta_description: str
    body_markdown: str
    schemas: list[dict[str, Any]] = field(default_factory=list)
    html_title: str | None = None
    source_path: Path | None = None


def parse_markdown(path: str | Path) -> PostInput:
    p = Path(path)
    if not p.is_file():
        raise ParseError(f"Input file not found: {p}")

    post = frontmatter.load(p)
    meta = post.metadata or {}

    missing = [f for f in REQUIRED_FIELDS if not str(meta.get(f, "")).strip()]
    if missing:
        raise ParseError(
            f"Missing required frontmatter field(s): {', '.join(missing)}. "
            f"Required: {', '.join(REQUIRED_FIELDS)}."
        )

    schemas_raw = meta.get("schemas") or []
    if not isinstance(schemas_raw, list):
        raise ParseError("`schemas` must be a YAML list of JSON-LD objects.")
    schemas: list[dict[str, Any]] = []
    for i, s in enumerate(schemas_raw):
        if not isinstance(s, dict):
            raise ParseError(f"`schemas[{i}]` must be a mapping/object.")
        schemas.append(s)

    body = _strip_top_h1(post.content).strip()
    if not body:
        raise ParseError("Post body is empty after stripping the title heading.")

    return PostInput(
        title=str(meta["title"]).strip(),
        slug=_normalize_slug(str(meta["slug"])),
        meta_description=str(meta["meta_description"]).strip(),
        body_markdown=body,
        schemas=schemas,
        html_title=(str(meta["html_title"]).strip() if meta.get("html_title") else None),
        source_path=p,
    )


_H1_RE = re.compile(r"^\s*#\s+.+\n?", re.MULTILINE)


def _strip_top_h1(md: str) -> str:
    """Remove the first top-level (#) heading if it's near the top of the doc.

    HubSpot's blog template renders the post title separately, so a leading H1
    in the body would duplicate it. We only strip the first H1 we encounter
    in the first ~5 non-empty lines to avoid touching legitimate later usage.
    """
    lines = md.splitlines()
    seen_non_blank = 0
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            continue
        seen_non_blank += 1
        if stripped.startswith("# ") and not stripped.startswith("## "):
            del lines[i]
            return "\n".join(lines)
        if seen_non_blank >= 5:
            break
    return md


def _normalize_slug(slug: str) -> str:
    s = slug.strip().strip("/")
    if not s:
        raise ParseError("`slug` cannot be empty.")
    return s
