#!/usr/bin/env python3
"""Validate a JSON-LD @graph file produced by the Schema Builder.

Usage:
    python scripts/validate_schema.py path/to/schema.json

Exits 0 on PASS, 1 on FAIL. Standard library only.

Checks performed:
  - File parses as JSON.
  - Top-level has @context (string or list) and @graph (list).
  - Every @graph entry has @type (string or list) and @id (string).
  - Required nodes are present: the main entity (the Article family —
    BlogPosting, Article, TechArticle, OpinionNewsArticle, ScholarlyArticle — or
    Service / SoftwareApplication for product-fact formats), Person,
    Organization, BreadcrumbList, WebPage (or CollectionPage), ImageObject.
    FAQPage is required only when the sibling article.md has an FAQ section
    (D49: some formats carry none). DefinedTerm is warned if missing.
  - The article node has: headline, author, datePublished, image, publisher,
    mainEntityOfPage.
  - No Review / AggregateRating about a head-to-head competitor (D51).
  - FAQPage has mainEntity (list of Question), each Question has name and
    acceptedAnswer (Answer with text).
  - Person has name; sameAs is recommended (warn if missing).
  - WebPage has speakable (recommended; warn if missing).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any


ARTICLE_FAMILY = ("BlogPosting", "Article", "TechArticle", "NewsArticle", "OpinionNewsArticle", "ScholarlyArticle")
MAIN_ENTITY = ARTICLE_FAMILY + ("Service", "SoftwareApplication")

REQUIRED_GRAPH_TYPES = (
    MAIN_ENTITY,  # any one
    ("Person",),
    ("Organization",),
    ("BreadcrumbList",),
    ("WebPage", "CollectionPage"),
    ("ImageObject",),
)


def _article_has_faq(schema_path: Path) -> bool | None:
    """True/False from the sibling article.md; None when there is no article to read."""
    article = schema_path.parent / "article.md"
    if not article.is_file():
        return None
    import re

    return bool(re.search(r"^##\s+frequently asked questions\s*$", article.read_text(encoding="utf-8"), re.I | re.M))


def _competitor_names() -> list[str]:
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from company_config import load_config  # noqa: E402
        from competitor_checks import load_competitors  # noqa: E402

        return [n for c in load_competitors(load_config(strict=False)) for n in (c.names or [c.name])]
    except Exception:  # noqa: BLE001 — a missing config just skips the check
        return []


class Report:
    def __init__(self) -> None:
        self.failures: list[str] = []
        self.warnings: list[str] = []
        self.passes: list[str] = []

    def fail(self, msg: str) -> None:
        self.failures.append(msg)

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)

    def ok(self, msg: str) -> None:
        self.passes.append(msg)

    def print_and_exit(self) -> int:
        for line in self.passes:
            print(f"PASS  {line}")
        for line in self.warnings:
            print(f"WARN  {line}")
        for line in self.failures:
            print(f"FAIL  {line}")
        print()
        if self.failures:
            print(f"RESULT: FAIL — {len(self.failures)} failure(s), {len(self.warnings)} warning(s)")
            return 1
        print(f"RESULT: PASS — {len(self.warnings)} warning(s)")
        return 0


def _types(node: dict[str, Any]) -> list[str]:
    t = node.get("@type")
    if isinstance(t, str):
        return [t]
    if isinstance(t, list):
        return [x for x in t if isinstance(x, str)]
    return []


def _has_type(node: dict[str, Any], wanted: tuple[str, ...]) -> bool:
    return any(t in wanted for t in _types(node))


def _find_first(graph: list, wanted: tuple[str, ...]) -> dict | None:
    for node in graph:
        if isinstance(node, dict) and _has_type(node, wanted):
            return node
    return None


def _find_all(graph: list, wanted: tuple[str, ...]) -> list[dict]:
    return [n for n in graph if isinstance(n, dict) and _has_type(n, wanted)]


def validate(path: Path) -> int:
    r = Report()

    if not path.is_file():
        r.fail(f"File not found: {path}")
        return r.print_and_exit()

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        r.fail(f"Not valid JSON: {e}")
        return r.print_and_exit()

    if not isinstance(data, dict):
        r.fail("Top level must be a JSON object.")
        return r.print_and_exit()

    if "@context" not in data:
        r.fail("Missing top-level `@context`.")
    else:
        r.ok("@context present.")

    graph = data.get("@graph")
    if not isinstance(graph, list):
        r.fail("Missing or non-list top-level `@graph`.")
        return r.print_and_exit()
    r.ok(f"@graph present with {len(graph)} node(s).")

    # Per-node basic checks
    for i, node in enumerate(graph):
        if not isinstance(node, dict):
            r.fail(f"@graph[{i}] is not an object.")
            continue
        if not _types(node):
            r.fail(f"@graph[{i}] missing @type.")
        if not isinstance(node.get("@id"), str) or not node["@id"]:
            r.fail(f"@graph[{i}] missing or non-string @id.")

    # Required types
    for wanted in REQUIRED_GRAPH_TYPES:
        if _find_first(graph, wanted):
            r.ok(f"Found required type: {' or '.join(wanted)}")
        else:
            r.fail(f"Missing required type: {' or '.join(wanted)}")

    has_faq = _article_has_faq(path)
    if has_faq is False:
        r.ok("article.md has no FAQ section — FAQPage not required (D49).")
    elif _find_first(graph, ("FAQPage",)):
        r.ok("Found required type: FAQPage")
    else:
        r.fail("Missing required type: FAQPage" + (" (article.md has an FAQ section)" if has_faq else ""))

    # D51: never Review / AggregateRating schema about a competitor.
    names = [n.lower() for n in _competitor_names()]
    if names:
        for node in graph:
            if not isinstance(node, dict):
                continue
            rated = []
            if _has_type(node, ("Review", "AggregateRating")):
                rated.append(node)
            for key in ("review", "aggregateRating"):
                v = node.get(key)
                if v:
                    rated.append(node)
            for n in rated:
                blob = json.dumps(n).lower()
                hit = next((c for c in names if c in blob), None)
                if hit:
                    r.fail(f"Review/AggregateRating schema about a head-to-head competitor ({hit}) — never rate a competitor (D51).")

    if not _find_all(graph, ("DefinedTerm",)):
        r.warn("No DefinedTerm nodes found. Add at least one if the article defines a key term.")

    # Article-family required props
    bp = _find_first(graph, ARTICLE_FAMILY)
    if bp:
        kind = _types(bp)[0]
        for prop in ("headline", "author", "datePublished", "image", "publisher", "mainEntityOfPage"):
            if prop not in bp:
                r.fail(f"{kind} missing required property: {prop}")
            else:
                r.ok(f"{kind} has {prop}.")
        if "description" not in bp:
            r.warn(f"{kind} has no `description`. Add the meta description.")
        if "wordCount" not in bp:
            r.warn(f"{kind} has no `wordCount`.")
        if "keywords" not in bp:
            r.warn(f"{kind} has no `keywords`.")

    # FAQPage required structure
    faq = _find_first(graph, ("FAQPage",))
    if faq:
        main = faq.get("mainEntity")
        if not isinstance(main, list) or not main:
            r.fail("FAQPage.mainEntity must be a non-empty list of Question.")
        else:
            for j, q in enumerate(main):
                if not isinstance(q, dict) or "Question" not in _types(q):
                    r.fail(f"FAQPage.mainEntity[{j}] is not a Question.")
                    continue
                if not q.get("name"):
                    r.fail(f"FAQPage.mainEntity[{j}].name is missing.")
                ans = q.get("acceptedAnswer")
                if not isinstance(ans, dict) or "Answer" not in _types(ans):
                    r.fail(f"FAQPage.mainEntity[{j}].acceptedAnswer must be of type Answer.")
                elif not ans.get("text"):
                    r.fail(f"FAQPage.mainEntity[{j}].acceptedAnswer.text is missing.")
            r.ok(f"FAQPage has {len(main)} Question(s).")

    # Person sameAs warning
    person = _find_first(graph, ("Person",))
    if person:
        if not person.get("name"):
            r.fail("Person missing `name`.")
        if not person.get("sameAs"):
            r.warn("Person has no `sameAs`. Add LinkedIn / Twitter / personal site URLs.")

    # WebPage speakable warning
    web = _find_first(graph, ("WebPage",))
    if web and "speakable" not in web:
        r.warn("WebPage has no `speakable`. Add a SpeakableSpecification pointing at the Key Takeaways.")

    return r.print_and_exit()


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python scripts/validate_schema.py path/to/schema.json", file=sys.stderr)
        return 2
    return validate(Path(sys.argv[1]))


if __name__ == "__main__":
    sys.exit(main())
