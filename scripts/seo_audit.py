#!/usr/bin/env python3
"""Audit a finished article folder.

Usage:
    python scripts/seo_audit.py articles/YYYY-MM-DD-slug/

Standard library only. Includes a tiny manual YAML-frontmatter parser so
PyYAML is not required.

Reports per-check PASS / WARN / FAIL on:
  - frontmatter completeness
  - title length (50-60)
  - meta description length (140-160)
  - slug format (lowercase, hyphenated, <=60)
  - H1 count (==1)
  - H2 count (>=3)
  - word count vs reading_time_minutes sanity
  - primary keyword present in first 100 words of body
  - Key Takeaways block present
  - FAQ section present with at least 2 Q/A pairs
  - json-ld fenced block present
  - banned phrases found (count per phrase)
  - schema.json file present
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from company_config import load_banned_phrases, load_config  # noqa: E402

# Single source: standards/banned-phrases.txt + config/company.yaml
# voice.banned_phrases (company-specific additions).
BANNED_PHRASES = load_banned_phrases(load_config(strict=False))


def banned_hits(text: str, phrase: str) -> list[str]:
    """Occurrences of a banned phrase, each as a short context snippet.

    Case-insensitive. An edge of the phrase that is a word character must
    sit on a word boundary, so "gate" flags "gate" but not "navigate" or
    "investigate", and "just" doesn't flag "adjust". An edge that is a
    space or punctuation (e.g. the deliberate trailing space in
    "the world of ") matches exactly as written, as before.
    """
    pre = r"(?<!\w)" if re.match(r"\w", phrase) else ""
    post = r"(?!\w)" if re.search(r"\w$", phrase) else ""
    out = []
    for m in re.finditer(pre + re.escape(phrase) + post, text, flags=re.IGNORECASE):
        s, e = max(0, m.start() - 40), min(len(text), m.end() + 40)
        out.append(" ".join(text[s:e].split()))
    return out

REQUIRED_FRONTMATTER = [
    "title",
    "slug",
    "author",
    "publish_date",
    "meta_description",
    "primary_keyword",
    "canonical_url",
]


class Auditor:
    def __init__(self) -> None:
        self.passes: list[str] = []
        self.warnings: list[str] = []
        self.failures: list[str] = []

    def ok(self, msg: str) -> None:
        self.passes.append(msg)

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)

    def fail(self, msg: str) -> None:
        self.failures.append(msg)

    def report(self) -> int:
        for line in self.passes:
            print(f"PASS  {line}")
        for line in self.warnings:
            print(f"WARN  {line}")
        for line in self.failures:
            print(f"FAIL  {line}")
        print()
        print(
            f"RESULT: {len(self.passes)} pass / {len(self.warnings)} warn / "
            f"{len(self.failures)} fail"
        )
        return 1 if self.failures else 0


# --------- tiny YAML frontmatter parser (no PyYAML dependency) -----------

def parse_frontmatter(text: str) -> tuple[dict, str]:
    """Return (frontmatter_dict, body) given a markdown file's full text.

    Supports the subset of YAML we use:
      - key: "string"
      - key: 'string'
      - key: bareword
      - key: [item1, item2]   (inline list)
      - key:                   (block list)
          - item1
          - item2
    """
    if not text.startswith("---\n") and not text.startswith("---\r\n"):
        return {}, text
    # find closing fence
    nl = "\n"
    end = text.find(f"{nl}---{nl}", 4)
    if end == -1:
        end = text.find(f"{nl}---\r\n", 4)
    if end == -1:
        return {}, text
    block = text[4:end]
    body = text[end + len(f"{nl}---{nl}") :]

    fm: dict = {}
    lines = block.splitlines()
    i = 0
    while i < len(lines):
        raw = lines[i]
        line = raw.rstrip()
        if not line.strip() or line.lstrip().startswith("#"):
            i += 1
            continue
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$", line)
        if not m:
            i += 1
            continue
        key, val = m.group(1), m.group(2).strip()
        if val == "":
            # could be a block list
            items: list = []
            j = i + 1
            while j < len(lines):
                sub = lines[j]
                if not sub.strip():
                    j += 1
                    continue
                ms = re.match(r"^\s+-\s*(.*)$", sub)
                if not ms:
                    break
                items.append(_unquote(ms.group(1).strip()))
                j += 1
            fm[key] = items
            i = j
            continue
        if val.startswith("[") and val.endswith("]"):
            inner = val[1:-1].strip()
            fm[key] = (
                [_unquote(x.strip()) for x in inner.split(",") if x.strip()]
                if inner
                else []
            )
        else:
            fm[key] = _unquote(val)
        i += 1
    return fm, body


def _unquote(s: str) -> str:
    if (s.startswith('"') and s.endswith('"')) or (s.startswith("'") and s.endswith("'")):
        return s[1:-1]
    return s


# ------------------ checks ----------------------------------------------

def count_words(text: str) -> int:
    return len(re.findall(r"\b\w+\b", text))


def first_n_words(text: str, n: int) -> str:
    words = re.findall(r"\b\w+\b", text)
    return " ".join(words[:n])


def strip_jsonld_fences(body: str) -> str:
    return re.sub(r"```json-ld[\s\S]*?```", "", body, flags=re.IGNORECASE)


def strip_html_comments(body: str) -> str:
    return re.sub(r"<!--[\s\S]*?-->", "", body)


def audit(folder: Path) -> int:
    a = Auditor()

    if not folder.is_dir():
        a.fail(f"Folder does not exist: {folder}")
        return a.report()

    article_path = folder / "article.md"
    schema_path = folder / "schema.json"

    if not article_path.is_file():
        a.fail(f"Missing {article_path.name}")
        return a.report()
    a.ok("article.md present")

    if schema_path.is_file():
        a.ok("schema.json present")
    else:
        a.warn("schema.json not found — Phase 5 may not have run")

    raw = article_path.read_text(encoding="utf-8")
    fm, body = parse_frontmatter(raw)

    # frontmatter completeness
    for key in REQUIRED_FRONTMATTER:
        v = fm.get(key)
        if not v or (isinstance(v, str) and not v.strip()):
            a.fail(f"Frontmatter missing or empty: {key}")
        else:
            a.ok(f"Frontmatter has {key}")

    title = str(fm.get("title", ""))
    if title:
        n = len(title)
        if 50 <= n <= 60:
            a.ok(f"Title length: {n} chars (target 50–60)")
        else:
            a.warn(f"Title length: {n} chars (target 50–60)")

    md = str(fm.get("meta_description", ""))
    if md:
        n = len(md)
        if 140 <= n <= 160:
            a.ok(f"Meta description length: {n} chars (target 140–160)")
        else:
            a.warn(f"Meta description length: {n} chars (target 140–160)")

    slug = str(fm.get("slug", ""))
    if slug:
        if re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug) and len(slug) <= 60:
            a.ok(f"Slug format OK ({slug!r})")
        else:
            a.fail(f"Slug must be lowercase, hyphenated, ≤60 chars (got {slug!r})")

    primary_kw = str(fm.get("primary_keyword", "")).lower().strip()

    # body-level checks
    body_clean = strip_html_comments(strip_jsonld_fences(body))

    h1 = re.findall(r"^#\s+\S", body_clean, flags=re.MULTILINE)
    if len(h1) == 1:
        a.ok("Exactly one H1.")
    else:
        a.fail(f"Expected exactly one H1, found {len(h1)}.")

    h2s = re.findall(r"^##\s+\S", body_clean, flags=re.MULTILINE)
    if len(h2s) >= 3:
        a.ok(f"H2 count: {len(h2s)} (target ≥ 3)")
    else:
        a.warn(f"H2 count: {len(h2s)} (target ≥ 3)")

    wc = count_words(body_clean)
    a.ok(f"Word count (body): {wc}")
    rt = fm.get("reading_time_minutes")
    if isinstance(rt, str) and rt.isdigit():
        rt = int(rt)
    if isinstance(rt, int) and rt > 0:
        expected = max(1, round(wc / 230))
        if abs(rt - expected) <= 2:
            a.ok(f"reading_time_minutes={rt} matches body word count ≈ {expected}")
        else:
            a.warn(
                f"reading_time_minutes={rt} but word count suggests ≈ {expected} (230 wpm)"
            )

    if primary_kw:
        intro = first_n_words(body_clean, 100).lower()
        # Also match a hyphen-stripped variant: the tokenizer drops hyphens, so
        # "ai-first sales operating model" becomes "ai first sales operating model"
        # in the joined output. Compare both forms.
        intro_no_hyphen = intro.replace("-", " ")
        kw_no_hyphen = primary_kw.replace("-", " ")
        if primary_kw in intro or kw_no_hyphen in intro_no_hyphen:
            a.ok(f"Primary keyword in first 100 words: {primary_kw!r}")
        else:
            a.fail(
                f"Primary keyword {primary_kw!r} NOT found in first 100 words of body."
            )

    if re.search(r"^##\s+key takeaways", body_clean, flags=re.IGNORECASE | re.MULTILINE):
        a.ok("Key Takeaways block present.")
    else:
        a.fail("Key Takeaways block missing (expected `## Key Takeaways`).")

    faq_match = re.search(
        r"^##\s+frequently asked questions\s*$",
        body_clean,
        flags=re.IGNORECASE | re.MULTILINE,
    )
    if not faq_match:
        a.fail("FAQ section missing (expected `## Frequently Asked Questions`).")
    else:
        faq_block = body_clean[faq_match.end() :]
        next_h2 = re.search(r"^##\s+\S", faq_block, flags=re.MULTILINE)
        if next_h2:
            faq_block = faq_block[: next_h2.start()]
        q_count = len(re.findall(r"^###\s+\S", faq_block, flags=re.MULTILINE))
        if q_count >= 2:
            a.ok(f"FAQ section has {q_count} Q/A pairs.")
        else:
            a.fail(f"FAQ section has only {q_count} Q/A pair(s); need ≥ 2.")

    if re.search(r"```json-ld[\s\S]*?```", body, flags=re.IGNORECASE):
        a.ok("json-ld fenced block present in article.md")
    else:
        a.fail("json-ld fenced block missing from article.md")

    # banned phrases
    hits = [(p, banned_hits(body_clean, p)) for p in BANNED_PHRASES]
    hits = [(p, found) for p, found in hits if found]
    if hits:
        for p, found in hits:
            # Quote where each hit sits: the Editor has to find it to fix it.
            where = "; ".join(f"…{c}…" for c in found[:3])
            a.fail(f"Banned phrase found ({len(found)}×): {p!r} — {where}")
    else:
        a.ok("No banned phrases found.")

    return a.report()


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python scripts/seo_audit.py articles/YYYY-MM-DD-slug/", file=sys.stderr)
        return 2
    return audit(Path(sys.argv[1]))


if __name__ == "__main__":
    sys.exit(main())
