"""Head-to-head competitor checks for scripts/seo_audit.py.

standards/quality-bar.md → *Competitor handling*: a head-to-head vendor is
never the opening hook, never a Key Takeaways stat, never the subject of an
FAQ answer, and never a cited source. It is named only factually, at most
once per vendor outside a comparison or tool-list article. The vendor list
is config/company.yaml → competitors.head_to_head:

    competitors:
      head_to_head:
        - name: SpecterOps
          domains: [specterops.io]            # whole host (+ subdomains)
          url_prefixes: [github.com/SpecterOps]  # host + path prefix
          names: [SpecterOps, BloodHound]     # matched as whole words

Standard library only (like the rest of scripts/).
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from urllib.parse import urlparse

from style_checks import Finding, sentences

# article_type values under which vendors may be named per-entry.
COMPARISON_TYPES = {"comparison", "tool-list"}

# Sentence reads as the vendor being the source of a claim.
_ATTRIBUTION = re.compile(
    r"\b(?:according to|comes? from|came from|reported|estimates?|estimated|"
    r"found that|survey(?:ed)?|study|studies|research(?:ers)?|data from|writing in|"
    r"wrote|told|said|says|notes? that|cited)\b",
    re.I,
)
# A number that is not a bare year: 22 million, 40%, 10,000, 3.5x.
_QUANT = re.compile(r"\b(?!(?:19|20)\d\d\b)\d[\d,.]*\s*(?:%|percent|x\b|million|billion|thousand)?", re.I)
_MD_LINK = re.compile(r"\[([^\]]+)\]\(([^)\s]+)[^)]*\)")
_BARE_URL = re.compile(r"(?<!\()https?://[^\s)>\]]+")


@dataclass
class Competitor:
    name: str
    domains: list[str]
    url_prefixes: list[str]
    names: list[str]

    def name_pattern(self) -> re.Pattern | None:
        terms = sorted({n for n in self.names if n}, key=len, reverse=True)
        if not terms:
            return None
        alts = "|".join(re.escape(t) for t in terms)
        return re.compile(rf"(?<!\w)(?:{alts})(?!\w)", re.I)

    def owns_url(self, url: str) -> bool:
        host, path = _host_path(url)
        if not host:
            return False
        if any(host == d or host.endswith("." + d) for d in self.domains):
            return True
        full = f"{host}{path}".lower()
        return any(full.startswith(p) for p in self.url_prefixes)


def _norm_host(h: str) -> str:
    return h.lower().strip().removeprefix("www.")


def _host_path(url: str) -> tuple[str, str]:
    u = url.strip()
    if not re.match(r"^[a-z]+://", u, re.I):
        u = "https://" + u
    try:
        p = urlparse(u)
    except ValueError:
        return "", ""
    return _norm_host(p.hostname or ""), p.path or ""


def _as_list(v) -> list[str]:
    if v is None:
        return []
    if isinstance(v, str):
        return [x.strip() for x in v.split(",") if x.strip()]
    return [str(x).strip() for x in v if str(x).strip()]


def load_competitors(cfg: dict) -> list[Competitor]:
    """competitors.head_to_head from a parsed company.yaml (empty if absent)."""
    raw = ((cfg or {}).get("competitors") or {}).get("head_to_head") or []
    out = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        prefixes = []
        for p in _as_list(entry.get("url_prefixes")):
            host, path = _host_path(p)
            if host:
                prefixes.append(f"{host}{path}".lower().rstrip("/"))
        out.append(
            Competitor(
                name=str(entry.get("name") or "").strip() or "unnamed",
                domains=[_norm_host(d) for d in _as_list(entry.get("domains"))],
                url_prefixes=prefixes,
                names=_as_list(entry.get("names")),
            )
        )
    return out


# ---- article sections -------------------------------------------------------

def _h2_section(body: str, heading_re: str) -> str:
    m = re.search(rf"^##\s+{heading_re}\s*$", body, flags=re.I | re.M)
    if not m:
        return ""
    rest = body[m.end():]
    nxt = re.search(r"^##\s+\S", rest, flags=re.M)
    return rest[: nxt.start()] if nxt else rest


def intro(body: str) -> str:
    """Text between the H1 and the first H2."""
    h1 = re.search(r"^#\s+\S.*$", body, flags=re.M)
    start = h1.end() if h1 else 0
    nxt = re.search(r"^##\s+\S", body[start:], flags=re.M)
    return body[start: start + nxt.start()] if nxt else body[start:]


def _plain(text: str) -> str:
    text = _MD_LINK.sub(r"\1", text)
    return re.sub(r"[*_`#>]", "", text)


def _hits(pattern: re.Pattern, text: str) -> list[str]:
    out = []
    plain = " ".join(_plain(text).split())
    for m in pattern.finditer(plain):
        s, e = max(0, m.start() - 40), min(len(plain), m.end() + 40)
        out.append(plain[s:e])
    return out


def _body_sentences(body: str) -> list[str]:
    """Sentences with markdown links left in place (to see what they cite)."""
    out = []
    for block in re.split(r"\n\s*\n", body):
        lines = [ln for ln in block.strip().splitlines() if ln.strip()]
        if not lines:
            continue
        text = " ".join(re.sub(r"^\s*(?:[-*+]|\d+\.|#+)\s+", "", ln) for ln in lines)
        out.extend(sentences(text))
    return out


def _links(text: str) -> list[str]:
    return [m.group(2) for m in _MD_LINK.finditer(text)] + _BARE_URL.findall(text)


def _citations(node) -> list:
    """Every entry under a `citation` key anywhere in the JSON-LD."""
    out = []
    if isinstance(node, dict):
        for k, v in node.items():
            if k == "citation":
                out.extend(v if isinstance(v, list) else [v])
            else:
                out.extend(_citations(v))
    elif isinstance(node, list):
        for v in node:
            out.extend(_citations(v))
    return out


def _strings(node) -> list[str]:
    if isinstance(node, str):
        return [node]
    if isinstance(node, dict):
        return [s for v in node.values() for s in _strings(v)]
    if isinstance(node, list):
        return [s for v in node for s in _strings(v)]
    return []


def parse_jsonld(raw_body: str, schema_text: str | None) -> object | None:
    m = re.search(r"```json-ld\s*([\s\S]*?)```", raw_body, flags=re.I)
    for text in ([m.group(1)] if m else []) + ([schema_text] if schema_text else []):
        try:
            return json.loads(text)
        except (json.JSONDecodeError, TypeError):
            continue
    return None


# ---- the check -----------------------------------------------------------------

def run_all(
    body: str,
    competitors: list[Competitor],
    *,
    article_type: str = "",
    jsonld: object | None = None,
) -> list[Finding]:
    """Findings for a cleaned article body (no json-ld fence, no comments)."""
    findings: list[Finding] = []
    comparison = article_type.strip().lower() in COMPARISON_TYPES
    sections = {
        "intro": intro(body),
        "Key Takeaways": _h2_section(body, r"key takeaways"),
        "FAQ": _h2_section(body, r"frequently asked questions"),
    }
    body_sents = _body_sentences(body)
    cites = _citations(jsonld) if jsonld is not None else []

    for c in competitors:
        pat = c.name_pattern()
        label = f"head-to-head competitor {c.name}"

        # 1. Their URLs, anywhere in the body or the JSON-LD citation array.
        linked = sorted({u for u in _links(body) if c.owns_url(u)})
        if linked:
            findings.append(Finding("fail", f"Competitor: {label} linked in the body (never a source)", linked))
        cited = []
        for entry in cites:
            texts = _strings(entry)
            if any(c.owns_url(t) for t in texts if re.match(r"^(?:https?://|www\.)", t)) or (
                pat and any(pat.search(t) for t in texts)
            ):
                shown = [entry.get(k) for k in ("name", "url")] if isinstance(entry, dict) else []
                cited.append(" — ".join(str(t) for t in shown if t) or " / ".join(texts[:3])[:140])
        if cited:
            findings.append(Finding("fail", f"Competitor: {label} in the JSON-LD citation array", cited))

        if not pat:
            continue

        # 2. Named in the hook, the Key Takeaways, or the FAQ.
        for where, text in sections.items():
            hits = _hits(pat, text)
            if hits:
                findings.append(Finding("fail", f"Competitor: {label} named in the {where}", hits))

        # 3. Used as a source in the body: an attribution sentence, or a
        #    sentence pairing the vendor with a link and a number.
        named = [s for s in body_sents if pat.search(_plain(s))]
        sourced = [
            s for s in named
            if _ATTRIBUTION.search(_plain(s)) or (_MD_LINK.search(s) and _QUANT.search(_plain(s)))
        ]
        if sourced:
            findings.append(
                Finding("fail", f"Competitor: {label} used as a source", [" ".join(_plain(s).split())[:200] for s in sourced])
            )
        linked_named = [s for s in named if s not in sourced and _MD_LINK.search(s)]
        if linked_named and not comparison:
            findings.append(
                Finding(
                    "warn",
                    f"Competitor: {label} named next to a link — check the link isn't sourcing a claim about or from them",
                    [" ".join(_plain(s).split())[:200] for s in linked_named],
                )
            )

        # 4. More than one mention outside a comparison/tool-list article.
        if not comparison and len(named) > 1:
            findings.append(
                Finding(
                    "warn",
                    f"Competitor: {label} named in {len(named)} sentences (max 1 outside article_type: comparison/tool-list)",
                    [" ".join(_plain(s).split())[:120] for s in named],
                )
            )
    return findings
