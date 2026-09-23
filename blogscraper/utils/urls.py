"""URL helpers — normalization, domain checks, blog-path matching."""
from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlparse, urlunparse, urljoin


@dataclass(frozen=True)
class BlogTarget:
    """The blog index URL parsed into useful pieces."""

    raw: str
    scheme: str
    netloc: str  # e.g. "www.artisan.co"
    domain_root: str  # e.g. "artisan.co"  (netloc with leading "www." stripped)
    path: str  # e.g. "/blog"
    base: str  # scheme://netloc

    @classmethod
    def parse(cls, url: str) -> "BlogTarget":
        u = urlparse(url.strip())
        if not u.scheme or not u.netloc:
            raise ValueError(f"Not a valid absolute URL: {url!r}")
        netloc = u.netloc.lower()
        domain_root = netloc[4:] if netloc.startswith("www.") else netloc
        path = u.path or "/"
        if path != "/" and path.endswith("/"):
            path = path.rstrip("/")
        return cls(
            raw=url,
            scheme=u.scheme,
            netloc=netloc,
            domain_root=domain_root,
            path=path,
            base=f"{u.scheme}://{netloc}",
        )


def normalize_url(href: str, base_url: str) -> str | None:
    """Resolve `href` against `base_url`, drop fragment, return absolute URL.

    Returns None for empty / mailto / tel / javascript / anchor-only hrefs.
    """
    if not href:
        return None
    href = href.strip()
    if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
        return None
    abs_url = urljoin(base_url, href)
    parsed = urlparse(abs_url)
    if parsed.scheme not in ("http", "https"):
        return None
    cleaned = parsed._replace(fragment="")
    # collapse trailing slash on non-root paths for dedup stability
    if cleaned.path != "/" and cleaned.path.endswith("/"):
        cleaned = cleaned._replace(path=cleaned.path.rstrip("/"))
    return urlunparse(cleaned)


def is_same_site(url: str, target: BlogTarget) -> bool:
    """True if `url` is on the same domain as the blog target.

    Treats `foo.com` and `www.foo.com` as the same site.
    """
    try:
        netloc = urlparse(url).netloc.lower()
    except ValueError:
        return False
    if not netloc:
        return False
    root = netloc[4:] if netloc.startswith("www.") else netloc
    return root == target.domain_root


def is_under_blog_path(url: str, target: BlogTarget) -> bool:
    """True if the URL's path lives under the blog's path prefix.

    For target `/blog`, matches `/blog/foo` and `/blog/foo/bar`, NOT `/blog`,
    NOT `/blog?page=2` (those are pagination, handled separately).
    """
    parsed = urlparse(url)
    path = parsed.path or "/"
    if path != "/" and path.endswith("/"):
        path = path.rstrip("/")
    if target.path == "/":
        # Whole-site blog (rare). Only require same-site, not sub-path.
        return path != "/"
    if path == target.path:
        return False
    prefix = target.path + "/"
    return path.startswith(prefix)


def looks_like_pagination(url: str, target: BlogTarget) -> bool:
    """True if URL looks like a pagination variant of the blog index."""
    parsed = urlparse(url)
    path = (parsed.path or "/").rstrip("/")
    qs = parsed.query or ""
    if path == target.path and ("page=" in qs or "p=" in qs):
        return True
    if target.path != "/" and path.startswith(target.path + "/page/"):
        return True
    return False


def article_url_filter(url: str, target: BlogTarget) -> bool:
    """Composite filter: same-site, under blog path, not pagination."""
    if not is_same_site(url, target):
        return False
    if looks_like_pagination(url, target):
        return False
    if not is_under_blog_path(url, target):
        return False
    parsed = urlparse(url)
    # Ignore tag/category/author archive pages (heuristic)
    path = parsed.path.lower()
    archive_tokens = ("/tag/", "/tags/", "/category/", "/categories/", "/author/", "/authors/")
    if any(t in path for t in archive_tokens):
        return False
    # Ignore feed / rss / file extensions on the path
    if path.endswith((".xml", ".rss", ".atom", ".json", ".pdf")):
        return False
    return True
