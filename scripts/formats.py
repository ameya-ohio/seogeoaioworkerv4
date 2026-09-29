"""Format registry (D45) for the Python audit — mirrors packages/engine/src/formats.ts.

standards/formats.json is the single source of truth for Article Type. The
audit reads a page's facets from its frontmatter (page_role, article_type,
funnel — stamped by the worker) and asks this module what they resolve to:
how many Key Takeaways, what FAQ range, whether competitors are in vendor
mode. Precedence (D47/D49): page role > the format's own value > the funnel
rule > defaults.

Standard library only (like the rest of scripts/).
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
REGISTRY_PATH = REPO_ROOT / "standards" / "formats.json"
GENERIC = "generic"


@dataclass(frozen=True)
class Range:
    min: int
    max: int
    optional: bool = False


def _range(v: dict | None, fallback: Range) -> Range:
    if not v:
        return fallback
    return Range(int(v["min"]), int(v["max"]), bool(v.get("optional", False)))


def _key(v: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", v.lower().replace("&", "and"))


class Registry:
    def __init__(self, raw: dict):
        self.raw = raw
        defaults = raw.get("defaults", {})
        self.default_takeaways = _range(defaults.get("takeaways"), Range(3, 3))
        self.default_faq = _range(defaults.get("faq"), Range(3, 5, True))
        self.role_rules: dict = raw.get("roleRules", {})
        self.funnel_rules: dict = raw.get("funnelRules", {})
        self.formats: dict[str, dict] = {f["slug"]: f for f in raw.get("formats", [])}

    def format(self, slug: str | None) -> dict | None:
        return self.formats.get(slug or "")

    def resolve(self, raw_label: str) -> dict | None:
        """A format by slug, label or alias — exact after normalisation, never fuzzy."""
        k = _key(raw_label or "")
        if not k:
            return None
        for f in self.formats.values():
            names = [f["slug"], f.get("label", "")] + list(f.get("aliases", []))
            if any(_key(n) == k for n in names):
                return f
        return None

    def takeaways(self, slug: str | None) -> Range:
        f = self.format(slug)
        return _range(f.get("takeaways") if f else None, self.default_takeaways)

    def faq(self, slug: str | None, role: str | None, funnel: str | None) -> Range:
        role_rule = self.role_rules.get(role or "", {}).get("faq")
        if role_rule:
            return _range(role_rule, self.default_faq)
        f = self.format(slug)
        if f and f.get("faq"):
            return _range(f["faq"], self.default_faq)
        funnel_rule = self.funnel_rules.get(funnel or "", {}).get("faq")
        if funnel_rule:
            return _range(funnel_rule, self.default_faq)
        return self.default_faq

    def competitor_mode(self, slug: str | None) -> str:
        f = self.format(slug)
        return "vendor" if f and f.get("competitorMode") == "vendor" else "strict"

    def is_routing(self, role: str | None) -> bool:
        return bool(self.role_rules.get(role or "", {}).get("routing"))


_cached: Registry | None = None


def load_registry(path: Path | None = None) -> Registry | None:
    """The shipped registry, or None when the file is missing (pre-registry repos)."""
    global _cached
    if path is None and _cached is not None:
        return _cached
    p = path or REGISTRY_PATH
    if not p.is_file():
        return None
    reg = Registry(json.loads(p.read_text(encoding="utf-8")))
    if path is None:
        _cached = reg
    return reg


def article_type_slug(reg: Registry | None, value: str) -> str:
    """Frontmatter article_type → registry slug. Accepts a slug or a label;
    the Session 24 values comparison / tool-list map to their formats."""
    v = (value or "").strip()
    if not v:
        return ""
    legacy = {"comparison": "comparison-vendor", "tool-list": "tools-listicle", "toollist": "tools-listicle"}
    if _key(v) in {_key(k) for k in legacy}:
        return legacy[[k for k in legacy if _key(k) == _key(v)][0]]
    if reg is None:
        return v
    f = reg.format(v) or reg.resolve(v)
    return f["slug"] if f else v
