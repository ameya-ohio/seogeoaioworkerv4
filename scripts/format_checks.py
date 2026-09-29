"""Per-format structure checks for scripts/seo_audit.py (D45, M4).

Each format guide in templates/formats/ names the elements the format lives
or dies by: a How-to without numbered steps is a blog post, a Comparison
without a table high on the page loses the extraction. These checks look for
those elements by their shape in the markdown, so the Editor is told exactly
which one is missing.

Standard library only (like the rest of scripts/).
"""
from __future__ import annotations

import re

from style_checks import Finding, split_sections

_TABLE_ROW = re.compile(r"^\s*\|.+\|\s*$", re.M)
_TABLE_SEP = re.compile(r"^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$", re.M)
_NUMBERED = re.compile(r"^\s*\d+[.)]\s+\S", re.M)
_BULLET = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?\S", re.M)
_STEP_HEADING = re.compile(r"^#{2,3}\s+(?:step\s*\d+|\d+[.)]?\s)", re.I | re.M)
_YEAR = re.compile(r"\b(?:19|20)\d\d\b")
_NUMBER = re.compile(r"\b\d[\d,.]*\s*(?:%|percent|x\b|million|billion|thousand|k\b)?", re.I)


def _has_table(text: str) -> bool:
    return bool(_TABLE_SEP.search(text)) and len(_TABLE_ROW.findall(text)) >= 3


def _body_sections(body: str) -> list[tuple[str, str]]:
    _, sections = split_sections(body)
    return [(h, t) for h, t in sections if not re.match(r"key takeaways|frequently asked questions|faq", h, re.I)]


def _takeaway_bullets(body: str) -> list[str]:
    _, sections = split_sections(body)
    for h, t in sections:
        if re.match(r"key takeaways", h, re.I):
            return re.findall(r"^\s*(?:[-*+]|\d+\.)\s+(.+)$", t, re.M)
    return []


def check_steps(body: str) -> Finding | None:
    steps = len(_STEP_HEADING.findall(body))
    numbered = max((len(_NUMBERED.findall(t)) for _, t in _body_sections(body)), default=0)
    if steps >= 3 or numbered >= 3:
        return None
    return Finding(
        "fail",
        "Format: How-to Guide has no numbered steps — give each step its own numbered heading or a numbered list of at least 3 steps",
    )


def check_verify_section(body: str) -> Finding | None:
    if any(re.search(r"\b(verif|confirm|check|test)\w*", h, re.I) for h, _ in _body_sections(body)):
        return None
    return Finding("warn", "Format: How-to Guide has no section on how to verify it worked")


def check_table_high(body: str, label: str) -> Finding | None:
    sections = _body_sections(body)
    early = "\n".join(t for _, t in sections[:3])
    if _has_table(early):
        return None
    where = "anywhere" if not _has_table(body) else "in the first three sections"
    return Finding(
        "fail",
        f"Format: {label} has no comparison table {where} — put a real markdown table of substantive rows high on the page",
    )


def check_any_table(body: str, label: str, level: str = "fail") -> Finding | None:
    if _has_table(body):
        return None
    return Finding(level, f"Format: {label} has no table — this format's content belongs in a real markdown table")


def check_list_items(body: str, label: str, minimum: int) -> Finding | None:
    items = sum(len(_BULLET.findall(t)) for _, t in _body_sections(body))
    if items >= minimum:
        return None
    return Finding("fail", f"Format: {label} has {items} list items (need at least {minimum}) — the items are the page")


def check_stat_bullets(body: str) -> Finding | None:
    weak = [b for b in _takeaway_bullets(body) if not (_NUMBER.search(b) and _YEAR.search(b))]
    if not weak:
        return None
    return Finding(
        "fail",
        "Format: key statistics must each carry a number and a year (plus the source) — standalone and citable",
        [" ".join(b.split())[:100] for b in weak],
    )


def check_formulas(body: str) -> Finding | None:
    if re.search(r"(?:^|\s)=\s|\bformula\b", body, re.I):
        return None
    return Finding("fail", "Format: Metrics Guide gives no formula — every metric needs one")


def check_limitations(body: str, label: str) -> Finding | None:
    if re.search(r"\blimitation", body, re.I):
        return None
    return Finding("warn", f"Format: {label} has no limitations lines — every entry, the company's included, needs one")


def run_all(body: str, article_type: str) -> list[Finding]:
    """Findings for a cleaned body, by formats.json slug. Unknown slug = no checks."""
    t = article_type
    checks: list[Finding | None] = []
    if t == "how-to-guide":
        checks += [check_steps(body), check_verify_section(body)]
    elif t == "comparison-concept":
        checks += [check_table_high(body, "Comparison (Concept)")]
    elif t == "comparison-vendor":
        checks += [check_table_high(body, "Comparison (Vendor)")]
    elif t == "checklist":
        checks += [check_list_items(body, "Checklist", 10)]
    elif t == "best-practices":
        checks += [check_list_items(body, "Best Practices", 3)]
    elif t == "template":
        checks += [check_any_table(body, "Template")]
    elif t == "stats-data":
        checks += [check_stat_bullets(body), check_any_table(body, "Stats / Data", "warn")]
    elif t == "metrics-guide":
        checks += [check_formulas(body), check_any_table(body, "Metrics Guide", "warn")]
    elif t in ("tools-listicle", "alternatives"):
        label = "Tools Listicle" if t == "tools-listicle" else "Alternatives"
        checks += [check_any_table(body, label), check_limitations(body, label)]
    elif t == "examples":
        checks += [check_any_table(body, "Examples", "warn")]
    elif t == "assessment-guide":
        checks += [check_any_table(body, "Assessment Guide", "warn")]
    return [c for c in checks if c]
