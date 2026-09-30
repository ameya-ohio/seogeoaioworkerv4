"""Internal-link best practice for scripts/seo_audit.py (D53).

The page-local rules from standards/quality-bar.md → *Internal linking*.
Site-wide anchor collisions and link relevance need the database and a
judge, so the worker's link checker enforces those; everything here works
from the article (and its page.md link inventory) alone, in terminal mode too.

  FAIL  "See [X]" / "For …, see [X]" footnote links
  FAIL  generic anchors (here, this article, learn more, read more, click here…)
  FAIL  site-structure jargon in prose (hub page, pillar page, cluster article…)
  FAIL  a relative internal link (/learn/…) — use the full URL from page.md
  FAIL  the same page linked twice
  FAIL  one anchor used for two different pages
  WARN  an anchor outside 2–7 words
  WARN  an anchor that is the destination's full title (vary it)

Standard library only (like the rest of scripts/).
"""
from __future__ import annotations

import re
from pathlib import Path

from style_checks import Finding

_LINK = re.compile(r"\[([^\]]+)\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
_FOOTNOTE = re.compile(r"(?:^|[.;:!?]\s+|\(\s*)(?:for [^.]{0,120}?,\s*)?see(?: also)?\s+(?:the\s+)?\[", re.I)
_GENERIC = re.compile(
    r"^(?:here|click here|this|this article|this guide|this page|this post|learn more|read more|more|"
    r"this link|link|find out more|see more|details|our guide|the guide)$",
    re.I,
)
_JARGON = re.compile(
    # Only unambiguous site-structure phrases: "hub-and-spoke" networks and a
    # security "pillar" are ordinary prose.
    r"\b(?:hub page|subtopic hub|pillar page|cluster article|cluster page|spoke article|spoke page|sibling (?:article|page|spoke))s?\b",
    re.I,
)
_WORD = re.compile(r"[A-Za-z0-9’']+")


def _norm_url(u: str) -> str:
    return u.rstrip("/").lower()


def _norm_anchor(a: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", a.lower()).strip()


def inventory_titles(page_md: str) -> dict[str, tuple[str, str]]:
    """url → (title, query) from page.md's link inventory."""
    out: dict[str, tuple[str, str]] = {}
    for m in re.finditer(r"^- \*\*(.+?)\*\* — (https?://\S+)[^\n]*\n(?:\s+- Query: ([^\n]+))?", page_md, re.M):
        out[_norm_url(m.group(2))] = (m.group(1), (m.group(3) or "").strip())
    return out


def _is_internal(url: str, hosts: list[str]) -> bool:
    if url.startswith("/") and not url.startswith("//"):
        return True
    m = re.match(r"https?://([^/]+)", url)
    if not m:
        return False
    host = m.group(1).lower().removeprefix("www.")
    return any(host == h or host.endswith("." + h) for h in hosts)


def run_all(body: str, internal_hosts: list[str], page_md: str | None = None) -> list[Finding]:
    links = [(m.group(1).strip(), m.group(2).strip(), m.start()) for m in _LINK.finditer(body)]
    internal = [(a, u, i) for a, u, i in links if _is_internal(u, internal_hosts)]
    findings: list[Finding] = []

    footnotes = []
    for para in re.split(r"\n\s*\n", body):
        for m in _FOOTNOTE.finditer(para):
            footnotes.append(" ".join(para[max(0, m.start() - 40): m.end() + 60].split()))
    if footnotes:
        findings.append(Finding(
            "fail",
            "Links: 'see [X]' footnote links — write the link into the sentence with an anchor that says what the reader gets",
            footnotes,
        ))

    generic = [a for a, _, _ in links if _GENERIC.match(a.strip(" .,"))]
    if generic:
        findings.append(Finding("fail", "Links: generic anchor text — describe the destination", generic))

    prose = _LINK.sub(lambda m: m.group(1), body)
    jargon = sorted({m.group(0) for m in _JARGON.finditer(prose)})
    if jargon:
        findings.append(Finding(
            "fail",
            "Links: site-structure jargon in the prose — readers don't know what a hub or pillar is; describe the page instead",
            jargon,
        ))

    relative = [u for _, u, _ in internal if u.startswith("/")]
    if relative:
        findings.append(Finding("fail", "Links: relative internal links — use the full URL from page.md's link inventory", relative))

    seen: dict[str, int] = {}
    for _, u, _ in internal:
        seen[_norm_url(u)] = seen.get(_norm_url(u), 0) + 1
    dupes = [u for u, n in seen.items() if n > 1]
    if dupes:
        findings.append(Finding("fail", "Links: the same page linked more than once — link each target once, where it's most relevant", dupes))

    by_anchor: dict[str, set[str]] = {}
    for a, u, _ in internal:
        by_anchor.setdefault(_norm_anchor(a), set()).add(_norm_url(u))
    shared = [a for a, urls in by_anchor.items() if len(urls) > 1]
    if shared:
        findings.append(Finding("fail", "Links: one anchor used for different pages — each anchor names one destination", shared))

    lengths = [f"{len(_WORD.findall(a))} words: {a[:60]}" for a, _, _ in internal if not 2 <= len(_WORD.findall(a)) <= 7]
    if lengths:
        findings.append(Finding("warn", "Links: anchors outside 2–7 words — link the meaningful phrase", lengths))

    if page_md:
        titles = inventory_titles(page_md)
        # The page's own query is a fine anchor, even when the title is that query.
        verbatim = [
            a
            for a, u, _ in internal
            if (entry := titles.get(_norm_url(u)))
            and _norm_anchor(a) == _norm_anchor(entry[0])
            and _norm_anchor(a) != _norm_anchor(entry[1])
        ]
        if verbatim:
            findings.append(Finding(
                "warn",
                "Links: anchor is the destination's full title — vary it (its query, a natural variant, a partial match)",
                verbatim,
            ))
    return findings


def load_page_md(folder: Path) -> str | None:
    p = folder / "page.md"
    return p.read_text(encoding="utf-8") if p.is_file() else None
