"""Company-number check for scripts/seo_audit.py (D51).

context/sales/proof-points.md lists the only company numbers an article may
cite, each with a methodology line and a Citable yes/no. A sentence that
names the company and carries a number is checked against it:

  - the number matches an entry marked `no`  → FAIL (not approved / no methodology)
  - the number matches no entry at all       → WARN (a case-study figure is fine; a
                                                product claim belongs in the table)

Standard library only (like the rest of scripts/).
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from style_checks import Finding, sentences

REPO_ROOT = Path(__file__).resolve().parent.parent
PROOF_POINTS = REPO_ROOT / "context" / "sales" / "proof-points.md"

# A figure that is not a bare year: 5.9M+, 64%, 1,900+, 107%, 1 hour, 1 billion.
_NUM = re.compile(
    r"(?<![\w.])(\d[\d,]*(?:\.\d+)?)(?:\s*(?:%|m\b|k\b|x\b|million|billion|thousand|hours?|minutes?))?\+?",
    re.I,
)
_YEAR = re.compile(r"^(?:19|20)\d\d$")


@dataclass
class ProofPoint:
    number: str
    claim: str
    citable: bool

    def key(self) -> str:
        m = _NUM.search(self.number)
        return _key(m) if m else ""


_UNITS = {"%": "%", "m": "million", "million": "million", "b": "billion", "billion": "billion",
          "k": "thousand", "thousand": "thousand", "x": "x", "hour": "hour", "hours": "hour",
          "minute": "minute", "minutes": "minute"}


def _key(m: re.Match) -> str:
    """Value + unit class, so "5.9M+" matches "5.9 million" and "1 hour" never matches "1 billion"."""
    n = m.group(1).replace(",", "")
    unit = (m.group(0)[len(m.group(1)):].strip().lower().rstrip("+")) or ""
    return f"{n}|{_UNITS.get(unit, '')}"


def load_proof_points(path: Path = PROOF_POINTS) -> list[ProofPoint] | None:
    if not path.is_file():
        return None
    out: list[ProofPoint] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 5 or cells[0].lower() in ("number", "") or set(cells[0]) <= set("-: "):
            continue
        out.append(ProofPoint(cells[0], cells[1], cells[4].lower().startswith("y")))
    return out


def run_all(body: str, company_names: list[str], points: list[ProofPoint] | None) -> list[Finding]:
    if not points or not company_names:
        return []
    names = re.compile(r"(?<!\w)(?:" + "|".join(re.escape(n) for n in company_names if n) + r")(?!\w)", re.I)
    by_key: dict[str, list[ProofPoint]] = {}
    for p in points:
        if p.key():
            by_key.setdefault(p.key(), []).append(p)
    blocked, unknown = [], []
    for s in sentences(" ".join(body.split())):
        if not names.search(s):
            continue
        for m in _NUM.finditer(s):
            k = _key(m)
            value, unit = k.split("|")
            # Years and bare single digits ("3 steps") aren't proof points. A
            # year is written without a comma, unit or "+": "1,900" is a count.
            is_year = _YEAR.match(value) and m.group(1) == value and not unit and not m.group(0).endswith("+")
            if is_year or (len(value.replace(".", "")) < 2 and not unit and not m.group(0).strip().endswith("+")):
                continue
            entries = by_key.get(k)
            if entries is None:
                unknown.append(f"{m.group(0).strip()}: {s[:110]}")
            elif not any(e.citable for e in entries):
                blocked.append(f"{m.group(0).strip()} ({entries[0].claim[:50]}): {s[:90]}")
    findings = []
    if blocked:
        findings.append(Finding(
            "fail",
            "Proof points: company numbers not yet approved (Citable: no in context/sales/proof-points.md — add the methodology first)",
            blocked,
        ))
    if unknown:
        findings.append(Finding(
            "warn",
            "Proof points: company numbers not in context/sales/proof-points.md — fine for a case-study figure; a product claim needs an entry",
            unknown,
        ))
    return findings
