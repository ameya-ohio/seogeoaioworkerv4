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
MAX_SENTENCE_WORDS = 30       # WARN only — operator register: one claim per sentence
# Argument over evidence (D57): the article reasons; statistics support it.
MIN_STAT_CAP = 6              # FAIL above max(6, one statistic sentence per WORDS_PER_STAT words)
WORDS_PER_STAT = 300
MAX_STATS_PER_PARAGRAPH = 2   # FAIL: a third statistic in one paragraph is a stat parade
MAX_EVIDENCE_OPENERS = 1      # WARN: sections that open on a statistic or a source instead of their point
EVIDENCE_FORMATS = {"stats-data", "original-research"}  # the numbers are the point; limits off

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
    # "hypothetical" only as a scenario being set up — "real, not hypothetical" denies one.
    r"|\bhypothetically\b"
    r"|\b(?:a|an|this|our|the following)\s+hypothetical\b"
    r"|\bhypothetical\s+(?:scenario|example|case|organization|organisation|company|domain|hospital|enterprise|attacker|environment|network|team)\b",
    re.I,
)

# The article commenting on other writing (D59): "most of what's written about
# it hasn't caught up", "unlike the top-ranking guides". The angle may be built
# against the field's coverage; the article states its own view and never
# refers to what other articles say or miss.
_META_COMMENTARY = re.compile(
    r"\b(?:most|much|little|some) of what(?:'s|’s| is| has been| gets)? (?:been )?(?:written|published|said)\b"
    r"|\bwhat(?:'s|’s| is| has been) (?:been )?written (?:about|on)\b"
    r"|\b(?:most|many|existing|other|typical|competing|popular|standard)\s+"
    r"(?:guides|articles|blog posts|posts|explainers|write-ups|writeups|glossar(?:y|ies)(?: pages| entries)?|vendor pages|listicles)\b"
    r"|\b(?:the )?(?:current|existing|prevailing|popular) (?:discourse|coverage|literature on)\b"
    r"|\btop[- ](?:ranking|ranked|\d+|ten) (?:results|pages|articles|guides|posts)\b"
    r"|\b(?:search results|the serp|serps)\b"
    r"|\b(?:nobody|no one|few|none of them)\s+(?:else\s+)?(?:is\s+)?(?:writes?|writing|talks?|talking|explains?|explaining|covers?|covering)\s+(?:about\s+)?(?:this|it|that)\b",
    re.I,
)

_FAQ_FILLER = re.compile(r"\b(?:actual(?:ly)?|really|exactly|truly|even|honestly|literally)\b", re.I)
_DEFINITION = re.compile(
    r"\*\*([^*\n]{2,60})\*\*\s*(?:\([^)\n]{1,40}\)\s*)?(?:is|are|refers to|means|describes)\s+(?:a|an|the|when|how)\b",
    re.I,
)
MAX_DEFINITIONS = 2
MAX_HEADING_ECHOES = 2  # WARN: sections whose first sentence restates their own heading
TAKEAWAY_OVERLAP = 0.6
TAKEAWAY_MIN_SHARED = 5
KEY_TAKEAWAYS = 3       # default: exactly three bullets; a format can override it (standards/formats.json, D49)
FAQ_ANSWER_WORDS = (40, 60)   # WARN outside — People Also Ask / AI-citation length (D49)
FAQ_ECHO_OVERLAP = 0.75       # FAIL: an FAQ question that restates a body H2 (D49)
MAX_PARAGRAPH_WORDS = 60      # WARN only — one claim per paragraph (D48); the intro is exempt (D44)

# Hook moves in the intro (quality-bar "Hook-Shaped Intros"). The intro is drafted
# from the outline's Intro Strategy (the thesis); these are the performances that replace it.
_INTRO_HOOKS = re.compile(
    r"\bgo(?:es)? to die\b"
    r"|\b(?:that|this|the|those|these) (?:number|stat(?:istic)?|figure|finding|data point)s? "
    r"(?:should|ought to|deserves?|is worth|tells|says|matters)\b"
    r"|\bshould (?:reframe|reshape|change) (?:how|the way)\b"
    r"|\b(?:confuse|conflate|mix up) (?:the|those|these) two\b"
    r"|\b(?:they|these|the two|the terms?)\s+(?:aren't|aren’t|are not|isn't|isn’t|is not) the same (?:word|thing|term)\b"
    r"|\bwalk(?:s|ed)? (?:in(?:to)?|through) the front door\b",
    re.I,
)
# A statistic in the opening words of the first sentence = a stat hook. Bare years don't count.
_STAT_TOKEN = re.compile(r"(?:\$\d|\d+(?:[.,]\d+)?\s*(?:%|percent\b|x\b|:1\b)|\b(?!(?:19|20)\d\d\b)\d+(?:[.,]\d+)?\b)", re.I)
STAT_OPENER_WORDS = 6
# A statistic as a reader sees one: a percentage, money, a multiple or ratio, a
# count in millions, a comma-grouped count, "one in N". Bare numbers (Tier 0,
# event 4769, "three steps") aren't statistics.
_STATISTIC = re.compile(
    r"(?:[$€£]\s?\d|\b\d+(?:\.\d+)?\s*(?:%|percent\b)|\b\d+(?:\.\d+)?x\b|\b\d+:1\b"
    r"|\b\d[\d,.]*\s*(?:million|billion|trillion)\b|\b\d{1,3}(?:,\d{3})+\b|\b(?:one|\d+) in (?:every )?\d+\b)",
    re.I,
)
# A sentence that leads with its source: "According to…", "Verizon's 2026 DBIR recorded…".
_SOURCE_LEAD = re.compile(
    r"^(?:according to\b|per the\b|in (?:its|a|the) \d{4}\b)"
    r"|^[^.]{0,80}\b(?:report|survey|study|research|DBIR|analysis|advisory)\b[^.]{0,60}\b"
    r"(?:found|finds|recorded|records|reported|reports|shows|showed|estimated|estimates|counted|counts)\b",
    re.I,
)
# A source named in a heading ("The 2026 DBIR's…"); a leading verb ("Report what…") is an instruction.
_SOURCE_HEADING = re.compile(r"(?<!^)\b(?:report|survey|study)\b|\bDBIR\b", re.I)

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


def check_meta_commentary(blocks: list[str]) -> Finding | None:
    hits = [_snip(b, m.start(), m.end(), 50) for b in blocks for m in _META_COMMENTARY.finditer(b)]
    if not hits:
        return None
    return Finding(
        "fail",
        "Style: the article comments on other writing — state the article's own view; never say what "
        "other articles, guides or search results say or miss (D59)",
        hits,
    )


def split_sections(body: str) -> tuple[str, list[tuple[str, str]]]:
    """(text before the first H2, [(H2 heading, section text incl. H3s)])."""
    body = re.sub(r"```[\s\S]*?```", "", body)
    parts = re.split(r"^##\s+(?!#)(.+)$", body, flags=re.M)
    intro = re.sub(r"^#\s+.+$", "", parts[0], flags=re.M)  # drop the H1
    return intro, [(parts[i].strip(), parts[i + 1]) for i in range(1, len(parts) - 1, 2)]


def _plain(text: str) -> str:
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    return re.sub(r"[*_`>#]", "", text)


def check_faq_filler(sections: list[tuple[str, str]]) -> Finding | None:
    hits = []
    for heading, text in sections:
        if not re.match(r"frequently asked questions|faq", heading, re.I):
            continue
        for q in re.findall(r"^###\s+(.+)$", text, flags=re.M):
            if _FAQ_FILLER.search(q):
                hits.append(q.strip())
    if not hits:
        return None
    return Finding(
        "fail",
        "Style: FAQ questions with filler intensifiers ('actually', 'really', 'exactly'…) — ask them plainly",
        hits,
    )


def check_definitions(body: str) -> Finding | None:
    terms = []
    for m in _DEFINITION.finditer(body):
        term = m.group(1).strip()
        if term.lower() not in (t.lower() for t in terms):
            terms.append(term)
    if len(terms) <= MAX_DEFINITIONS:
        return None
    return Finding(
        "fail",
        f"Style: {len(terms)} formal '**X** is a…' definitions (max {MAX_DEFINITIONS}) — keep the one or two the "
        f"argument depends on, explain the rest in passing",
        terms,
    )


def check_takeaway_restatement(intro: str, sections: list[tuple[str, str]]) -> Finding | None:
    intro_sents = [s for s in sentences(" ".join(_plain(intro).split())) if len(_content_words(s)) >= TAKEAWAY_MIN_SHARED]
    hits = []
    for heading, text in sections:
        if not re.match(r"key takeaways", heading, re.I):
            continue
        for line in re.findall(r"^\s*(?:[-*+]|\d+\.)\s+(.+)$", text, flags=re.M):
            bullet = _content_words(_plain(line))
            for sent in intro_sents:
                intro_words = _content_words(sent)
                shared = len(bullet & intro_words)
                if shared >= TAKEAWAY_MIN_SHARED and shared / min(len(bullet), len(intro_words)) >= TAKEAWAY_OVERLAP:
                    hits.append(" ".join(_plain(line).split())[:140])
                    break
    if not hits:
        return None
    return Finding(
        "fail",
        "Style: Key Takeaways repeat the intro — give each takeaway a specific (a number, a mechanism, a control) "
        "instead of restating the thesis",
        hits,
    )


def check_intro_hooks(intro: str) -> Finding | None:
    text = " ".join(_plain(intro).split())
    if not text:
        return None
    hits = [_snip(text, m.start(), m.end(), 50) for m in _INTRO_HOOKS.finditer(text)]
    first = next(iter(sentences(text)), "")
    if _STAT_TOKEN.search(" ".join(first.split()[:STAT_OPENER_WORDS])):
        hits.insert(0, f"opens on a statistic: {first[:120]}")
    if not hits:
        return None
    return Finding(
        "fail",
        "Style: hook-shaped intro — rebuild it from the outline's Intro Strategy: name the subject and state the "
        "problem the thesis answers first, then why it matters now, with any figure inside a claim",
        hits,
    )


def check_takeaway_count(
    sections: list[tuple[str, str]], rng: tuple[int, int] = (KEY_TAKEAWAYS, KEY_TAKEAWAYS)
) -> Finding | None:
    lo, hi = rng
    for heading, text in sections:
        if not re.match(r"key takeaways", heading, re.I):
            continue
        bullets = re.findall(r"^(?:[-*+]|\d+\.)\s+(.+)$", text, flags=re.M)
        if lo <= len(bullets) <= hi:
            return None
        want = f"exactly {lo}" if lo == hi else f"{lo}–{hi}"
        return Finding(
            "fail",
            f"Style: Key Takeaways has {len(bullets)} bullets ({want} for this format) — keep the strongest specifics",
            [" ".join(_plain(b).split())[:80] for b in bullets],
        )
    return None


def _faq_pairs(sections: list[tuple[str, str]]) -> list[tuple[str, str]]:
    for heading, text in sections:
        if re.match(r"frequently asked questions|faq", heading, re.I):
            parts = re.split(r"^###\s+(.+)$", text, flags=re.M)
            return [(parts[i].strip(), parts[i + 1]) for i in range(1, len(parts) - 1, 2)]
    return []


def check_faq_answer_length(sections: list[tuple[str, str]]) -> Finding | None:
    lo, hi = FAQ_ANSWER_WORDS
    hits = []
    for q, a in _faq_pairs(sections):
        n = len(" ".join(_plain(a).split()).split())
        if n and not lo <= n <= hi:
            hits.append(f"{n} words: {q[:90]}")
    if not hits:
        return None
    return Finding(
        "warn",
        f"Style: {len(hits)} FAQ answers outside {lo}–{hi} words — answer first, briefly; link out for depth",
        hits,
    )


def check_faq_repeats_h2(sections: list[tuple[str, str]]) -> Finding | None:
    """D49: a question already answered by a section doesn't belong in the FAQ."""
    headings = [
        h for h, _ in sections if not re.match(r"key takeaways|frequently asked questions|faq", h, re.I)
    ]
    hits = []
    for q, _ in _faq_pairs(sections):
        qw = _content_words(_plain(q))
        if len(qw) < 2:
            continue
        for h in headings:
            shared = qw & _content_words(_plain(h))
            if len(shared) >= 2 and len(shared) / len(qw) >= FAQ_ECHO_OVERLAP:
                hits.append(f"{q[:80]} ≈ ## {h[:60]}")
                break
    if not hits:
        return None
    return Finding(
        "fail",
        "Style: FAQ repeats a section heading — a question the body already answers doesn't belong in the FAQ",
        hits,
    )


def check_long_paragraphs(prose: list[str], intro: str) -> Finding | None:
    intro_plain = " ".join(_plain(intro).split())
    hits = []
    for b in prose:
        text = " ".join(b.split())
        if text and text in intro_plain:
            continue
        n = len(text.split())
        if n > MAX_PARAGRAPH_WORDS:
            hits.append(f"{n} words: {text[:90]}")
    if not hits:
        return None
    return Finding(
        "warn",
        f"Style: {len(hits)} paragraphs over {MAX_PARAGRAPH_WORDS} words — one claim per paragraph",
        hits,
    )


def check_heading_echo(sections: list[tuple[str, str]]) -> Finding | None:
    hits = []
    for heading, text in sections:
        if re.match(r"key takeaways|frequently asked questions|faq", heading, re.I):
            continue
        head = _content_words(_plain(heading))
        if len(head) < 2:
            continue
        paras = [p for p in re.split(r"\n\s*\n", text) if p.strip() and not p.lstrip().startswith(("#", "|", "-", "*", ">"))]
        if not paras:
            continue
        first = next(iter(sentences(" ".join(_plain(paras[0]).split()))), "")
        if first and len(head & _content_words(first)) / len(head) >= 0.75:
            hits.append(f"{heading} → {first[:110]}")
    if len(hits) <= MAX_HEADING_ECHOES:
        return None
    return Finding(
        "warn",
        f"Style: {len(hits)} sections open by restating their own heading — argument sections should open with the "
        f"finding, the example, or the turn",
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


def check_long_sentences(prose: list[str]) -> Finding | None:
    hits = [f"{len(s.split())} words: {s[:110]}" for b in prose for s in sentences(b) if len(s.split()) > MAX_SENTENCE_WORDS]
    if not hits:
        return None
    return Finding(
        "warn",
        f"Style: {len(hits)} sentences over {MAX_SENTENCE_WORDS} words — split each into one claim per sentence",
        hits,
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


def stat_cap(word_count: int) -> int:
    return max(MIN_STAT_CAP, round(word_count / WORDS_PER_STAT))


def check_stat_density(blocks: list[str], word_count: int) -> Finding | None:
    hits = [s[:110] for b in blocks for s in sentences(b) if _STATISTIC.search(s)]
    cap = stat_cap(word_count)
    if len(hits) <= cap:
        return None
    return Finding(
        "fail",
        f"Evidence: {len(hits)} sentences carry a statistic (max {cap} at this length) — keep the few the "
        f"argument turns on and make the rest of the case by reasoning",
        hits,
    )


def check_stat_stacking(prose: list[str]) -> Finding | None:
    hits = []
    for b in prose:
        n = sum(1 for s in sentences(b) if _STATISTIC.search(s))
        if n > MAX_STATS_PER_PARAGRAPH:
            hits.append(f"{n} statistics: {' '.join(b.split())[:100]}")
    if not hits:
        return None
    return Finding(
        "fail",
        f"Evidence: {len(hits)} paragraphs stack more than {MAX_STATS_PER_PARAGRAPH} statistics — state the point, "
        f"keep the one figure that carries it",
        hits,
    )


def _first_prose_sentence(section: str) -> str:
    _, prose = prose_blocks(section)
    return (sentences(prose[0]) or [""])[0] if prose else ""


def check_evidence_openers(sections: list[tuple[str, str]]) -> Finding | None:
    hits = []
    for heading, text in sections:
        if re.match(r"(?:key takeaways|faq|frequently asked)", heading, re.I):
            continue
        first = _first_prose_sentence(text)
        if first and (_STATISTIC.search(first) or _SOURCE_LEAD.search(first)):
            hits.append(f"{heading[:50]}: {first[:90]}")
    if len(hits) <= MAX_EVIDENCE_OPENERS:
        return None
    return Finding(
        "warn",
        f"Evidence: {len(hits)} sections open on a statistic or a source — open with the section's point, "
        f"then bring in the evidence",
        hits,
    )


def check_source_headings(sections: list[tuple[str, str]]) -> Finding | None:
    hits = [h for h, _ in sections if _SOURCE_HEADING.search(h)]
    if not hits:
        return None
    return Finding(
        "warn",
        "Evidence: H2s built around a source — organize each section around a claim, not a report",
        hits,
    )


def run_all(
    body: str,
    word_count: int,
    *,
    takeaways: tuple[int, int] = (KEY_TAKEAWAYS, KEY_TAKEAWAYS),
    article_type: str = "",
) -> list[Finding]:
    blocks, prose = prose_blocks(body)
    intro, sections = split_sections(body)
    evidence = (
        []
        if article_type in EVIDENCE_FORMATS
        else [
            check_stat_density(blocks, word_count),
            check_stat_stacking(prose),
            check_evidence_openers(sections),
            check_source_headings(sections),
        ]
    )
    findings: list[Finding | None] = [
        check_faq_filler(sections),
        check_faq_answer_length(sections),
        check_faq_repeats_h2(sections),
        check_definitions(body),
        check_takeaway_restatement(intro, sections),
        check_takeaway_count(sections, takeaways),
        check_intro_hooks(intro),
        check_heading_echo(sections),
        check_contrasts(blocks, word_count),
        *check_repetition(blocks),
        check_hypotheticals(blocks),
        check_meta_commentary(blocks),
        check_hedges(prose, word_count),
        check_triads(prose, word_count),
        check_rhythm(prose),
        check_signposts(prose),
        check_long_sentences(prose),
        check_long_paragraphs(prose, intro),
        *evidence,
    ]
    return [f for f in findings if f]


def format_finding(f: Finding, max_snippets: int = 8) -> str:
    if not f.snippets:
        return f.message
    shown = "; ".join(f"…{s}…" for s in f.snippets[:max_snippets])
    more = f" (+{len(f.snippets) - max_snippets} more)" if len(f.snippets) > max_snippets else ""
    return f"{f.message}: {shown}{more}"
