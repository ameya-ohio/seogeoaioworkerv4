"""Convert parsed post markdown -> HubSpot-ready HTML.

Two outputs:
  - postBody  HTML (brand font/colors from config/company.yaml, no h1,
                external links open in new tab)
  - headHtml  HTML (one <script type="application/ld+json"> per JSON-LD schema)
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import mistune

_REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_REPO_ROOT / "scripts"))
from company_config import cfg_get, load_config  # noqa: E402

# Kept as ".ew-post" for continuity with already-published posts; the styles
# inside are config-driven.
POST_CSS_CLASS = "ew-post"

_DEFAULT_FALLBACK_STACK = (
    "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
)


def _style_block() -> str:
    cfg = load_config()
    family = cfg_get(cfg, "brand.font.family", "") or ""
    fallback = cfg_get(cfg, "brand.font.fallback_stack", _DEFAULT_FALLBACK_STACK)
    font_stack = f"'{family}',{fallback}" if family else fallback
    text = cfg_get(cfg, "brand.colors.body_text", "#000")
    c = POST_CSS_CLASS
    return (
        "<style>"
        f".{c}{{font-family:{font_stack};color:{text};line-height:1.65;font-size:17px;}}"
        f".{c} h2{{font-family:inherit;color:{text};margin-top:2em;margin-bottom:0.5em;"
        "line-height:1.25;}"
        f".{c} h3{{font-family:inherit;color:{text};margin-top:1.6em;margin-bottom:0.4em;"
        "line-height:1.3;}"
        f".{c} h4{{font-family:inherit;color:{text};margin-top:1.4em;margin-bottom:0.4em;}}"
        f".{c} p{{margin:0 0 1.1em 0;}}"
        f".{c} ul,.{c} ol{{margin:0 0 1.1em 1.5em;padding:0;}}"
        f".{c} li{{margin:0.25em 0;}}"
        f".{c} blockquote{{margin:1.2em 0;padding:0.6em 1em;border-left:3px solid {text};"
        f"background:#fafafa;color:{text};}}"
        f".{c} a{{color:{text};text-decoration:underline;}}"
        f".{c} code{{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;"
        "background:#f3f3f3;padding:0.1em 0.35em;border-radius:3px;font-size:0.92em;}"
        f".{c} pre{{background:#f6f6f6;padding:1em;border-radius:6px;overflow-x:auto;}}"
        f".{c} pre code{{background:transparent;padding:0;}}"
        f".{c} img{{max-width:100%;height:auto;}}"
        "</style>"
    )


def build_post_body_html(body_markdown: str) -> str:
    """Render markdown to HTML and wrap it in the brand style block.

    - Strips any stray top-level <h1> (downgrades to <h2>).
    - Rewrites external links to add target="_blank" rel="noopener".
    """
    renderer = mistune.HTMLRenderer(escape=False)
    md = mistune.create_markdown(renderer=renderer, plugins=["strikethrough", "table", "url"])
    html = md(body_markdown)

    html = _downgrade_h1(html)
    html = _annotate_external_links(html)

    return f'{_style_block()}<div class="{POST_CSS_CLASS}">{html}</div>'


def build_head_html(schemas: list[dict[str, Any]]) -> str:
    """Build a <script>-tagged JSON-LD blob for HubSpot's `headHtml` field."""
    if not schemas:
        return ""
    parts: list[str] = []
    for schema in schemas:
        payload = json.dumps(schema, ensure_ascii=False, separators=(",", ":"))
        # Escape </script> sequences inside JSON to keep the script tag valid.
        payload = payload.replace("</", "<\\/")
        parts.append(f'<script type="application/ld+json">{payload}</script>')
    return "\n".join(parts)


_H1_OPEN_RE = re.compile(r"<h1(\s[^>]*)?>", re.IGNORECASE)
_H1_CLOSE_RE = re.compile(r"</h1>", re.IGNORECASE)


def _downgrade_h1(html: str) -> str:
    html = _H1_OPEN_RE.sub(lambda m: "<h2" + (m.group(1) or "") + ">", html)
    html = _H1_CLOSE_RE.sub("</h2>", html)
    return html


_LINK_RE = re.compile(r'<a\s+([^>]*?)href="([^"]+)"([^>]*)>', re.IGNORECASE)


def _annotate_external_links(html: str) -> str:
    def repl(m: re.Match[str]) -> str:
        pre = m.group(1).strip()
        href = m.group(2)
        post = m.group(3).strip()
        attrs_blob = (pre + " " + post).lower()

        if _is_external(href) and "target=" not in attrs_blob:
            extra = ' target="_blank" rel="noopener"'
        else:
            extra = ""

        rebuilt = "<a"
        if pre:
            rebuilt += " " + pre
        rebuilt += f' href="{href}"'
        if post:
            rebuilt += " " + post
        rebuilt += extra + ">"
        return rebuilt

    return _LINK_RE.sub(repl, html)


def _is_external(href: str) -> bool:
    if not href:
        return False
    if href.startswith(("#", "/", "mailto:", "tel:")):
        return False
    parsed = urlparse(href)
    return bool(parsed.scheme in ("http", "https") and parsed.netloc)
