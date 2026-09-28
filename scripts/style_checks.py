"""Machine-checked AI-cadence detectors for scripts/seo_audit.py.

standards/quality-bar.md already bans these patterns ("Not X. Y." in any
form, restating a conclusion three or more times, hedging, drumroll
rhythm), but only a judgment pass enforced them, and drafts kept shipping
with them. Each detector here is deterministic and returns the offending
text, so a failing gate tells the Editor exactly what to rewrite.

Standard library only (like the rest of scripts/).
"""
from __future__ import annotations

import re
import statistics
from dataclasses import dataclass, field

# ---- thresholds (per article unless noted) ---------------------------------
MIN_CONTRAST_CAP = 3          # "not X, but Y" family: allowed max(3, one per WORDS_PER_CONTRAST words)
WORDS_PER_CONTRAST = 600      # — a writer uses it for emphasis; drafts used it as the default sentence
REPEAT_MIN_COPIES = 3         # the same claim three times = the doc doesn't trust the reader
REPEAT_OVERLAP = 0.6          # shared content words / smaller sentence's content words
REPEAT_MIN_SHARED = 6         # ...and at least this many shared content words
MAX_HEDGES_PER_1K = 4.0       # voice guide: assertive and unhedged
MIN_HEDGES_TO_FLAG = 6
MAX_TRIADS_PER_1K = 6.0       # WARN only — lists of three are often legitimate in technical prose
MIN_SENTENCE_CV = 0.45        # WARN only — stdev/mean of prose sentence lengths
MAX_SIGNPOST_OPENERS = 3      # WARN only — "That's why…", "This is also why…"

_CONTRAST = [
    # "not X, but Y" / "not X, rather Y" (but not "not only … but also")
    re.compile(r"\bnot\s+(?!only\b)[^.;:!?\n]{1,60}?,\s*(?:but|rather)\b", re.I),
    # trailing "…, not X" / "…; not X" / "… — not X", incl. headings like "A Feature, Not a Bug"
    re.compile(r"(?:[,;]|\s[—–])\s*(?:and\s+)?not\s+(?!only\b)\w", re.I),
    # "X isn't Y. It's Z." / "It doesn't do Y. It does Z."
    re.compile(
        r"\b(?:isn't|isn’t|is not|aren't|aren’t|are not|wasn't|wasn’t|was not|doesn't|doesn’t|does not|didn't|didn’t|did not)\b"
        r"[^.!?\n]{1,80}[.;]\s+(?:it|they|that|this)(?:'s|’s|\s+is|\s+are|\s+was|\s+does|\s+did)\b",
        re.I,
    ),
    re.compile(r"\bnot because\b", re.I),
]

_HEDGES = re.compile(
    r"\b(?:typically|usually|often|sometimes|generally|tends? to|in (?:most|many|some) cases|"
    r"arguably|perhaps|potentially|relatively|fairly|somewhat|largely|likely)\b",
    re.I,
)

_TRIAD = re.compile(r"\b[\w’'-]+(?: [\w’'-]+){0,3}, [\w’'-]+(?: [\w’'-]+){0,3},? (?:and|or) [\w’'-]+", re.I)

_SIGNPOST = re.compile(
    r"^(?:this is (?:also )?(?:why|what|how|the)|that(?:'s|’s| is) (?:why|what|how|the)|here(?:'s|’s) (?:why|what|how))\b",
    re.I,
)

# Invented scenarios ("Picture a domain with roughly 400…"). A real example
# comes from context/case-studies/ or a cited incident in the research notes.
_HYPOTHETICAL = re.compile(
    r"\b(?:picture|imagine)\s+(?:a|an|your|this|that|the|you(?:'re|’re| are))\b"
    r"|\bsuppose\s+(?:that|a|an|your|you)\b"
    r"|\blet(?:'s|’s| us) say\b"
    r"|\bhypothetical(?:ly)?\b",
    re.I,
)

_STOP = set(
    """
    about above after again against also although among another because been before being below between
    both could does doing down during each either every from further have having here into itself just
    more most much must never only other over same should since some such than that their them then
    there these they this those through under until upon very what when where which while whom whose
    will with within without would your yours make makes made first second
    """.split()
)


@dataclass
class Finding:
    level: str          # "fail" | "warn"
    message: str
    snippets: list[str] = field(default_factory=list)


def _snip(text: str, start: int, end: int, pad: int = 40) -> str:
    s, e = max(0, start - pad), min(len(text), end + pad)
    return " ".join(text[s:e].split())


def prose_blocks(body: str) -> tuple[list[str], list[str]]:
    """(paragraph-like blocks incl. list items and headings, prose-only paragraphs)."""
    body = re.sub(r"```[\s\S]*?```", "", body)
    blocks, prose = [], []
    for raw in re.split(r"\n\s*\n", body):
        lines = [ln for ln in raw.strip().splitlines() if ln.strip() and not ln.lstrip().startswith("|")]
        if not lines:
            continue
        text = " ".join(re.sub(r"^\s*(?:[-*+]|\d+\.)\s+", "", ln) for ln in lines)
        text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)  # links → anchor text
        text = re.sub(r"[*_`]", "", text).strip()
        if not text:
            continue
        blocks.append(text.lstrip("# ").strip())
        first = lines[0].lstrip()
        if not first.startswith(("#", "-", "*", "+", ">")) and not re.match(r"\d+\.\s", first):
            prose.append(text)
    return blocks, prose


def sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+(?=[A-Z\"“(\[])", text) if s.strip()]


def _content_words(sentence: str) -> set[str]:
    words = set()
    for w in re.findall(r"[a-z0-9][a-z0-9'-]+", sentence.lower()):
        w = w.strip("'-")
        if len(w) < 4 or w in _STOP:
            continue
        words.add(w[:-1] if w.endswith("s") and len(w) > 4 else w)
    return words


def contrast_cap(word_count: int) -> int:
    return max(MIN_CONTRAST_CAP, round(word_count / WORDS_PER_CONTRAST))


def check_contrasts(blocks: list[str], word_count: int) -> Finding | None:
    hits = []
    for block in blocks:
        for sent in sentences(block):
            for pat in _CONTRAST:
                m = pat.search(sent)
                if m:
                    hits.append(_snip(sent, m.start(), m.end()))
                    break
    cap = contrast_cap(word_count)
    if len(hits) <= cap:
        return None
    return Finding(
        "fail",
        f"Style: 'not X, but Y' contrast used {len(hits)}× (max {cap} for this length) — keep the strongest, "
        f"state the rest directly",
        hits,
    )


def check_repetition(blocks: list[str]) -> list[Finding]:
    # Questions (FAQ headings) ask; they don't restate a claim.
    sents = [s for b in blocks for s in sentences(b) if not s.rstrip().endswith("?")]
    words = [_content_words(s) for s in sents]
    idx = [i for i, w in enumerate(words) if len(w) >= REPEAT_MIN_SHARED]
    parent = {i: i for i in idx}

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for a_pos, a in enumerate(idx):
        for b in idx[a_pos + 1:]:
            shared = len(words[a] & words[b])
            if shared >= REPEAT_MIN_SHARED and shared / min(len(words[a]), len(words[b])) >= REPEAT_OVERLAP:
                parent[find(a)] = find(b)
    groups: dict[int, list[int]] = {}
    for i in idx:
        groups.setdefault(find(i), []).append(i)
    out = []
    for members in groups.values():
        if len(members) >= REPEAT_MIN_COPIES:
            snips = [" ".join(sents[i].split())[:140] for i in sorted(members)]
            out.append(
                Finding(
                    "fail",
                    f"Style: the same claim is stated {len(members)}× (max {REPEAT_MIN_COPIES - 1}) — "
                    f"keep it where it does the most work (intro or conclusion), cut or change the rest",
                    snips,
                )
            )
    return out


def check_hypotheticals(blocks: list[str]) -> Finding | None:
    hits = [_snip(b, m.start(), m.end(), 50) for b in blocks for m in _HYPOTHETICAL.finditer(b)]
    if not hits:
        return None
    return Finding(
        "fail",
        "Style: invented scenario — anchor the example on a case study from context/case-studies/ "
        "or a cited incident from the research notes, or cut it",
        hits,
    )


def check_hedges(prose: list[str], word_count: int) -> Finding | None:
    hits = []
    for block in prose:
        for m in _HEDGES.finditer(block):
            hits.append(_snip(block, m.start(), m.end(), 30))
    per_1k = len(hits) / max(word_count, 1) * 1000
    if len(hits) < MIN_HEDGES_TO_FLAG or per_1k <= MAX_HEDGES_PER_1K:
        return None
    return Finding(
        "fail",
        f"Style: {len(hits)} hedge words ({per_1k:.1f}/1k words, max {MAX_HEDGES_PER_1K:g}) — "
        f"assert what the evidence supports, qualify with a reason instead of a hedge",
        hits,
    )


def check_triads(prose: list[str], word_count: int) -> Finding | None:
    hits = []
    for block in prose:
        for m in _TRIAD.finditer(block):
            hits.append(_snip(block, m.start(), m.end(), 10))
    per_1k = len(hits) / max(word_count, 1) * 1000
    if per_1k <= MAX_TRIADS_PER_1K:
        return None
    return Finding("warn", f"Style: {len(hits)} lists-of-three in prose ({per_1k:.1f}/1k words) — vary the rhythm", hits)


def check_rhythm(prose: list[str]) -> Finding | None:
    lengths = [len(s.split()) for b in prose for s in sentences(b) if len(s.split()) >= 3]
    if len(lengths) < 20:
        return None
    cv = statistics.pstdev(lengths) / statistics.mean(lengths)
    if cv >= MIN_SENTENCE_CV:
        return None
    return Finding(
        "warn",
        f"Style: sentence lengths are uniform (variation {cv:.2f}, target ≥ {MIN_SENTENCE_CV:g}) — "
        f"mix short sentences with longer ones",
    )


def check_signposts(prose: list[str]) -> Finding | None:
    hits = [" ".join(b.split())[:80] for b in prose if _SIGNPOST.match(b)]
    if len(hits) <= MAX_SIGNPOST_OPENERS:
        return None
    return Finding(
        "warn",
        f"Style: {len(hits)} paragraphs open with a signpost ('That's why…', 'This is also why…') — start with the claim",
        hits,
    )


def run_all(body: str, word_count: int) -> list[Finding]:
    blocks, prose = prose_blocks(body)
    findings: list[Finding | None] = [
        check_contrasts(blocks, word_count),
        *check_repetition(blocks),
        check_hypotheticals(blocks),
        check_hedges(prose, word_count),
        check_triads(prose, word_count),
        check_rhythm(prose),
        check_signposts(prose),
    ]
    return [f for f in findings if f]


def format_finding(f: Finding, max_snippets: int = 8) -> str:
    if not f.snippets:
        return f.message
    shown = "; ".join(f"…{s}…" for s in f.snippets[:max_snippets])
    more = f" (+{len(f.snippets) - max_snippets} more)" if len(f.snippets) > max_snippets else ""
    return f"{f.message}: {shown}{more}"
