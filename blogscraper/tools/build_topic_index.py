#!/usr/bin/env python3
"""Build a topic / keyword index from a scraped blog corpus.

Reads `manifest.json` produced by the scraper, walks every saved article,
runs TF-IDF on 1-grams + 2-grams + 3-grams, clusters slug patterns, and
emits two artifacts alongside the manifest:

  topic_index.json   — machine-readable corpus index
  topic_index.md     — human-readable scannable report

Standard library only.

Usage:
    python tools/build_topic_index.py path/to/manifest.json
    python tools/build_topic_index.py artisan.co/blog/manifest.json
"""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import math
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path


# ---- stopwords ------------------------------------------------------------

STOPWORDS = frozenset("""
a about above after again against all am an and any are aren as at be because
been before being below between both but by can cannot could couldn did didn
do does doesn doing don down during each else few for from further get gets
getting got had hadn has hasn have haven having he her here hers herself him
himself his how i if in into is isn it its itself just like ll ma me might
more most mustn my myself need needn no nor not now o of off on once only
or other our ours ourselves out over own re really s same shan she should
shouldn so some such t than that the their theirs them themselves then there
these they thing things this those through to too under until up ve very was
wasn we well were weren what when where which while who whom why will with
won would wouldn y you your yours yourself yourselves also even however many
much one ones two three even though across around basically actually really
upon another must may might without within above whether any anyone something
someone everyone anything nothing everything via per said going make made
makes use uses used using take takes took taken give gives gave given
including include includes included things stuff way ways thing things lot
lots better best worse worst etc say says go goes going gone done come comes
came still already right left back next first second third last fourth fifth
let lets needs got though anyway anyhow nonetheless plus minus etcetera
yeah okay maybe sure ok also know knows knew known see saw seen think
thinks thought wants wanting wanted look looks looked find finds found
working works worked work try tries tried using used use put puts get gets
got getting set sets setting let lets looks wanted thought
""".split())


# ---- tokenization ---------------------------------------------------------

_MD_LINK = re.compile(r"\[([^\]]*)\]\([^)]+\)")
_MD_FORMATTING = re.compile(r"[*_~`#>]+")
_URL = re.compile(r"https?://\S+")
_HTML_TAG = re.compile(r"<[^>]+>")
_TOKEN = re.compile(r"[a-z][a-z0-9'-]{2,}")


def clean_text(text: str) -> str:
    text = _URL.sub(" ", text)
    text = _MD_LINK.sub(r"\1", text)
    text = _HTML_TAG.sub(" ", text)
    text = _MD_FORMATTING.sub(" ", text)
    text = text.lower()
    return text


def tokenize(text: str) -> list[str]:
    return _TOKEN.findall(clean_text(text))


def ngrams(tokens: list[str], n: int) -> list[str]:
    """Generate n-grams. Filter:

    - 1-grams: drop stopwords; require length ≥ 4.
    - 2/3-grams: never start or end with a stopword; require ≥ 1 non-stopword.
    """
    out: list[str] = []
    if n == 1:
        for t in tokens:
            if t in STOPWORDS:
                continue
            if len(t) < 4:
                continue
            if t.isdigit():
                continue
            out.append(t)
        return out
    L = len(tokens)
    for i in range(L - n + 1):
        gram = tokens[i : i + n]
        if gram[0] in STOPWORDS or gram[-1] in STOPWORDS:
            continue
        if all(g in STOPWORDS for g in gram):
            continue
        if any(g.isdigit() for g in gram):
            continue
        out.append(" ".join(gram))
    return out


# ---- frontmatter ----------------------------------------------------------

def parse_frontmatter(text: str) -> tuple[dict, str]:
    if not (text.startswith("---\n") or text.startswith("---\r\n")):
        return {}, text
    end = text.find("\n---\n", 4)
    if end < 0:
        return {}, text
    block = text[4:end]
    body = text[end + 5 :]
    fm: dict = {}
    for line in block.splitlines():
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$", line)
        if not m:
            continue
        k, v = m.group(1), m.group(2).strip()
        if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
            v = v[1:-1]
        fm[k] = v
    return fm, body


# ---- slug clustering ------------------------------------------------------

# Keywords are checked in order; first match wins.
SLUG_CLUSTERS = [
    ("alternatives & roundups", ["alternatives", "roundup"]),
    ("vs / comparisons",        ["vs"]),
    ("reviews",                  ["review"]),
    ("definitional (what is X)", ["what-is", "what-are"]),
    ("how-to",                   ["how-to", "how-do", "how-can"]),
    ("templates & examples",     ["template", "templates", "example", "examples", "subject-line", "subject-lines"]),
    ("tools & software",         ["tools", "software", "platforms", "apps"]),
    ("metrics & data",           ["metrics", "kpis", "data", "stats", "benchmark", "benchmarks"]),
    ("pipeline & forecasting",   ["pipeline", "forecasting", "forecast"]),
    ("prospecting & lead gen",   ["prospecting", "leads", "lead", "leadgen", "lead-generation", "lead-nurturing", "intent"]),
    ("cold outreach & email",    ["cold", "email", "emails", "outreach", "deliverability", "domain", "domains"]),
    ("events & sponsorship",     ["event", "events", "sponsorship", "webinar", "trade-show"]),
    ("SDR / BDR",                ["sdr", "bdr", "sdrs", "bdrs"]),
    ("sales process",            ["sales", "selling", "deal", "deals", "quota", "discovery"]),
    ("marketing",                ["marketing", "demand-gen", "demand-generation", "abm"]),
    ("AI & automation",          ["ai", "automation", "agent", "agents", "agentic", "ai-worker", "ai-workers"]),
]


def slug_cluster(slug: str) -> str:
    parts = slug.lower().split("-")
    joined = "-".join(parts)
    for label, tokens in SLUG_CLUSTERS:
        for token in tokens:
            # Match either as a path component or as a substring of the slug.
            if "-" in token:
                if token in joined:
                    return label
            else:
                if token in parts:
                    return label
    return "other"


# ---- main pipeline --------------------------------------------------------

def load_corpus(manifest_path: Path) -> list[dict]:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    base = manifest_path.parent
    articles_meta = manifest.get("articles", [])
    docs: list[dict] = []
    for entry in articles_meta:
        text_rel = entry.get("text_path")
        if not text_rel:
            continue
        text_path = base / text_rel
        if not text_path.is_file():
            continue
        raw = text_path.read_text(encoding="utf-8")
        fm, body = parse_frontmatter(raw)
        url = fm.get("url") or entry.get("url", "")
        title = fm.get("title") or entry.get("title", "")
        slug = url.rstrip("/").rsplit("/", 1)[-1] if url else text_path.stem
        docs.append(
            {
                "url": url,
                "title": title,
                "slug": slug,
                "body": body,
                "text_path": str(text_rel),
                "image_path": entry.get("image_path"),
            }
        )
    return docs


def build_index(manifest_path: Path) -> tuple[dict, str]:
    docs = load_corpus(manifest_path)
    n_docs = len(docs)
    if n_docs == 0:
        raise SystemExit(f"No documents loaded from {manifest_path}")

    # Per-doc token + ngram counts
    per_doc_counts: list[Counter] = []
    word_counts: list[int] = []
    df = Counter()
    for d in docs:
        tokens = tokenize(d["body"])
        word_counts.append(len(tokens))
        all_grams = ngrams(tokens, 1) + ngrams(tokens, 2) + ngrams(tokens, 3)
        c = Counter(all_grams)
        per_doc_counts.append(c)
        # document frequency: count each unique gram once per doc
        for gram in c.keys():
            df[gram] += 1

    total_words = sum(word_counts)

    # IDF
    def idf(term: str) -> float:
        return math.log((1 + n_docs) / (1 + df[term])) + 1.0  # smoothed

    # Top topics across the corpus.
    # Restrict to ngrams that appear in 5..floor(n_docs*0.55) documents so we
    # avoid both noise and topics so generic they're meaningless.
    df_floor = max(5, n_docs // 45)
    df_ceiling = max(df_floor + 1, int(n_docs * 0.55))
    candidate_terms = [t for t, c in df.items() if df_floor <= c <= df_ceiling]

    # Score = sum_over_docs(tf) * idf * length_bonus.
    # Length bonus favors 2/3-grams over 1-grams when scores are close.
    total_count = Counter()
    for c in per_doc_counts:
        for term, cnt in c.items():
            total_count[term] += cnt

    def length_bonus(term: str) -> float:
        n = term.count(" ") + 1
        return 1.0 if n == 1 else (1.35 if n == 2 else 1.55)

    scored_topics = []
    for term in candidate_terms:
        score = total_count[term] * idf(term) * length_bonus(term)
        scored_topics.append((term, score, df[term], total_count[term]))
    scored_topics.sort(key=lambda x: x[1], reverse=True)

    # Suppress redundant unigrams/bigrams that are subsumed by a higher-ranked
    # multi-word term. For example, if "cold email" is #1, drop standalone
    # "cold" or "email" if they only show up because of "cold email" usage.
    # Simple rule: for each ngram in the keep list, if a higher-ranked ngram
    # contains it as a substring, demote it.
    kept_topics: list[tuple[str, float, int, int]] = []
    used_words: set[str] = set()
    for term, score, df_term, total in scored_topics:
        words = term.split()
        if len(words) == 1 and term in used_words:
            continue  # subsumed
        if len(words) > 1:
            for w in words:
                used_words.add(w)
        kept_topics.append((term, score, df_term, total))
        if len(kept_topics) >= 60:
            break

    # Per-article top keywords (TF-IDF)
    for i, d in enumerate(docs):
        c = per_doc_counts[i]
        tot = sum(c.values()) or 1
        scored = []
        for term, cnt in c.items():
            if df[term] < 2:  # ignore terms unique to this doc
                continue
            tf = cnt / tot
            score = tf * idf(term) * length_bonus(term)
            scored.append((term, score, cnt))
        scored.sort(key=lambda x: x[1], reverse=True)
        # de-dup like above (skip unigram if a higher-ranked multigram includes it)
        seen_words: set[str] = set()
        kept: list[str] = []
        for term, _score, _cnt in scored:
            words = term.split()
            if len(words) == 1 and term in seen_words:
                continue
            if len(words) > 1:
                for w in words:
                    seen_words.add(w)
            kept.append(term)
            if len(kept) >= 10:
                break
        d["word_count"] = word_counts[i]
        d["top_keywords"] = kept
        d["slug_cluster"] = slug_cluster(d["slug"])

    # Slug clusters
    cluster_to_articles: dict[str, list[str]] = defaultdict(list)
    for d in docs:
        cluster_to_articles[d["slug_cluster"]].append(d["slug"])

    # Top-topic article maps (for the report)
    topic_articles: list[dict] = []
    for term, score, df_term, total in kept_topics:
        # Rank docs by tf-idf for this specific term.
        rows = []
        term_words = term.split()
        for i, d in enumerate(docs):
            c = per_doc_counts[i]
            cnt = c.get(term, 0)
            if cnt == 0:
                continue
            tot = sum(c.values()) or 1
            tf = cnt / tot
            rows.append((d["slug"], d["title"], cnt, tf * idf(term)))
        rows.sort(key=lambda r: r[3], reverse=True)
        topic_articles.append(
            {
                "term": term,
                "df": df_term,
                "total_count": total,
                "score": round(score, 2),
                "sample_articles": [
                    {"slug": r[0], "title": r[1], "count": r[2]}
                    for r in rows[:6]
                ],
            }
        )

    output = {
        "corpus": {
            "manifest": str(manifest_path),
            "article_count": n_docs,
            "total_words": total_words,
            "avg_words_per_article": round(total_words / n_docs),
            "generated_at": _dt.datetime.now(_dt.timezone.utc).isoformat(),
        },
        "slug_clusters": [
            {
                "label": label,
                "count": len(slugs),
                "slugs": sorted(slugs),
            }
            for label, slugs in sorted(
                cluster_to_articles.items(), key=lambda kv: (-len(kv[1]), kv[0])
            )
        ],
        "top_topics": topic_articles,
        "articles": [
            {
                "url": d["url"],
                "title": d["title"],
                "slug": d["slug"],
                "word_count": d["word_count"],
                "top_keywords": d["top_keywords"],
                "slug_cluster": d["slug_cluster"],
                "text_path": d["text_path"],
                "image_path": d["image_path"],
            }
            for d in sorted(docs, key=lambda x: x["slug"])
        ],
    }

    md = build_markdown_report(output)
    return output, md


def build_markdown_report(idx: dict) -> str:
    lines: list[str] = []
    c = idx["corpus"]
    lines.append(f"# Topic & keyword index — {c['manifest']}")
    lines.append("")
    lines.append(
        f"_{c['article_count']} articles · {c['total_words']:,} words total · "
        f"{c['avg_words_per_article']:,} words/article on average · "
        f"generated {c['generated_at']}_"
    )
    lines.append("")

    # Slug clusters
    lines.append("## Slug clusters (URL pattern taxonomy)")
    lines.append("")
    lines.append("| Cluster | Articles |")
    lines.append("| --- | ---: |")
    for cl in idx["slug_clusters"]:
        lines.append(f"| {cl['label']} | {cl['count']} |")
    lines.append("")

    # Top topics
    lines.append("## Top corpus topics (TF-IDF, 1–3 grams)")
    lines.append("")
    lines.append("Sorted by `total_count × idf × length_bonus`. Terms appearing")
    lines.append("in fewer than 5 articles or more than 55% of articles are excluded.")
    lines.append("")
    lines.append("| Rank | Term | DF | Total mentions | Top articles |")
    lines.append("| ---: | --- | ---: | ---: | --- |")
    for rank, t in enumerate(idx["top_topics"][:50], 1):
        sample_titles = "; ".join(
            (a["title"] or a["slug"])[:60].rstrip()
            for a in t["sample_articles"][:3]
        )
        lines.append(
            f"| {rank} | **{t['term']}** | {t['df']} | {t['total_count']} | {sample_titles} |"
        )
    lines.append("")

    # Per-cluster article roll-up
    lines.append("## Articles by cluster")
    lines.append("")
    by_cluster: dict[str, list[dict]] = defaultdict(list)
    for a in idx["articles"]:
        by_cluster[a["slug_cluster"]].append(a)
    for cl in idx["slug_clusters"]:
        label = cl["label"]
        members = by_cluster.get(label, [])
        if not members:
            continue
        lines.append(f"### {label} ({len(members)})")
        lines.append("")
        for a in sorted(members, key=lambda x: x["slug"]):
            kw = ", ".join(a["top_keywords"][:6]) or "—"
            lines.append(f"- [{a['title'] or a['slug']}]({a['url']}) — {kw}")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    p = argparse.ArgumentParser(prog="build_topic_index")
    p.add_argument("manifest", type=Path, help="Path to manifest.json")
    p.add_argument(
        "--out-json", type=Path, default=None,
        help="Output JSON path (default: <manifest_dir>/topic_index.json).",
    )
    p.add_argument(
        "--out-md", type=Path, default=None,
        help="Output Markdown path (default: <manifest_dir>/topic_index.md).",
    )
    args = p.parse_args()

    manifest = args.manifest.resolve()
    if not manifest.is_file():
        print(f"manifest not found: {manifest}", file=sys.stderr)
        return 2

    out_json = args.out_json or (manifest.parent / "topic_index.json")
    out_md = args.out_md or (manifest.parent / "topic_index.md")

    idx, md = build_index(manifest)
    out_json.write_text(json.dumps(idx, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    out_md.write_text(md, encoding="utf-8")

    c = idx["corpus"]
    n_top = len(idx["top_topics"])
    n_clusters = len(idx["slug_clusters"])
    print(f"corpus:    {c['article_count']} articles, {c['total_words']:,} words")
    print(f"clusters:  {n_clusters}")
    print(f"topics:    {n_top}")
    print(f"json:      {out_json}")
    print(f"markdown:  {out_md}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
