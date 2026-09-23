"""Slug + filename helpers."""
from __future__ import annotations

import re
import unicodedata
from urllib.parse import urlparse


_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def slugify(text: str, max_len: int = 80) -> str:
    """Lowercase, hyphenated, ASCII-only slug. Empty string becomes 'untitled'."""
    if not text:
        return "untitled"
    norm = unicodedata.normalize("NFKD", text)
    norm = norm.encode("ascii", "ignore").decode("ascii")
    norm = norm.lower()
    norm = _NON_ALNUM.sub("-", norm).strip("-")
    if not norm:
        return "untitled"
    if len(norm) > max_len:
        norm = norm[:max_len].rstrip("-")
    return norm


def slug_from_url(url: str) -> str:
    """Last non-empty path segment, slugified. Falls back to 'untitled'."""
    path = urlparse(url).path
    parts = [p for p in path.split("/") if p]
    if not parts:
        return "untitled"
    return slugify(parts[-1])


def slug_from_url_with_fallback(url: str, title: str | None) -> str:
    """Prefer URL-derived slug; fall back to a title slug if URL slug is degenerate."""
    s = slug_from_url(url)
    if s and s != "untitled":
        return s
    if title:
        return slugify(title)
    return s


def safe_filename(slug: str, ext: str) -> str:
    """Combine slug + extension into a filesystem-safe name."""
    ext = ext.lstrip(".").lower() or "bin"
    return f"{slug}.{ext}"
