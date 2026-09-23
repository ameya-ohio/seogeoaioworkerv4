# EverWorker Blog Agent System — Architecture

> **⚠️ Partially historical (2026-09-14).** This deep-dive predates two large
> changes: (1) the company-config refactor — nothing is EverWorker-specific
> anymore; identity/brand/voice live in `config/company.yaml` (see
> `config/README.md`), and (2) the monorepo + headless pipeline service —
> `packages/engine` (Mongo data layer, gates, script bridge) and
> `apps/worker` (Claude Agent SDK worker that runs the six phases from
> `agents/*.md` with state in MongoDB; see `apps/worker/README.md`).
> `roadmap.md` is the living plan. The phase-by-phase pipeline description
> below is still accurate; brand/config specifics are not.

A comprehensive architecture reference for the multi-agent blog production system at this repository root and its three companion tools.

This document explains **what the system is**, **how it is structured**, **how each phase works**, **how the pieces connect**, **what design decisions shaped it**, and **how to operate it end-to-end**.

It is the document to read after [`README.md`](README.md) (overview) and before [`CLAUDE.md`](CLAUDE.md) (the runtime orchestrator instructions Claude reads automatically).

---

## 1. What this system is

The repository is a **content production system for EverWorker's blog**, built around a multi-agent pipeline that takes a topic request from a human and produces a fully-formatted, SEO/GEO/AIO-optimized blog article published as a draft on HubSpot.

It is not a single program. It is **four coordinated executables**:

| Executable | Role | Lives at |
|---|---|---|
| **Production system** (Claude orchestrated) | Produces the article markdown + schema + header from a topic | repo root (`CLAUDE.md`, `agents/`, `standards/`, `scripts/`, `templates/`, `articles/`) |
| **`blogheaderimagegen/`** | Generates the 1200×600 hero PNG from the article frontmatter | sibling folder |
| **`blogsagent/`** | Publishes the article markdown to HubSpot as draft or published | sibling folder |
| **`blogscraper/`** | Ingests competitor blog content for research input | sibling folder |

The production system is the brain. The other three are tools the production system (or the user) invokes at specific phases.

---

## 2. Repository layout

```
seogeoaioworkerv2/
├── ARCHITECTURE.md              ← this file
├── CLAUDE.md                    ← master orchestrator Claude reads automatically
├── README.md                    ← human intro
│
├── agents/                      ← per-phase agent specifications (markdown briefs)
│   ├── researcher.md            ← Phase 1
│   ├── strategist.md            ← Phase 2
│   ├── writer.md                ← Phase 3
│   ├── editor.md                ← Phase 4
│   ├── schema-builder.md        ← Phase 5
│   └── header-designer.md       ← Phase 6
│
├── standards/                   ← editorial + technical bars every article must meet
│   ├── seo-checklist.md
│   ├── geo-checklist.md
│   ├── aio-checklist.md
│   ├── schema-spec.md           ← JSON-LD reference + example @graph
│   └── quality-bar.md           ← banned phrases, voice rules, fact-check rules
│
├── scripts/                     ← stdlib-only utilities used by agents
│   ├── new_article.py           ← scaffolds a YYYY-MM-DD-slug/ folder
│   ├── validate_schema.py       ← validates a JSON-LD @graph file
│   └── seo_audit.py             ← runs pass/warn/fail checklist on a finished article folder
│
├── templates/                   ← blank skeletons the scaffolder copies
│   ├── article-template.md      ← frontmatter + body skeleton + json-ld fence + edit-summary comment
│   └── schema-template.json     ← base @graph skeleton
│
├── context/                     ← EverWorker proprietary inputs (populated by the user over time)
│   ├── brand/                   ← voice, positioning, taglines, do's and don'ts
│   ├── sales/                   ← ICP, objections, value props, battle cards, PDFs
│   ├── marketing/               ← keyword list, persona docs, internal-link map
│   ├── finance/                 ← pricing, ROI numbers, financial talking points
│   └── author-style/            ← author bio, sample writing, voice guide
│
├── articles/                    ← outputs: one subfolder per article
│   └── 2026-04-29-how-to-build-ai-first-sales-operating-model/
│       ├── article.md           ← frontmatter + body + embedded JSON-LD + edit summary
│       ├── schema.json          ← validated @graph (single source of truth)
│       ├── meta.json            ← title/slug/keywords/canonical (compact convenience)
│       ├── research-notes.md    ← Phase 1 output
│       ├── outline.md           ← Phase 2 output
│       ├── header.html          ← Phase 6 output (Gilroy + brand-color HTML)
│       └── header.png           ← Phase 6 output (1200×600 logical, 2400×1200 actual at 2× DPI)
│
├── blogheaderimagegen/          ← header generator (Playwright headless)
├── blogsagent/                  ← HubSpot publisher
└── blogscraper/                 ← competitor scraper
```

The structure separates **agent definitions** (`agents/`) from **bars they must meet** (`standards/`) from **inputs** (`context/`) from **outputs** (`articles/`). Tools that *do* work (`scripts/`, `blogsagent/`, etc.) are separate from instructions that *describe* work (`agents/`, `standards/`).

---

## 3. The four executables

### 3.1 The production system (Claude-orchestrated)

The "executable" here is **Claude reading `CLAUDE.md` and running the 6 phases**. There is no Python wrapper; the orchestration is the LLM following the runbook in `CLAUDE.md`.

**How it triggers:** the user types something like "Write an article about X" or "Write an article using this outline." `CLAUDE.md` defines the trigger patterns explicitly so the system recognizes the request.

**What it does:**
1. Derives a slug from the topic.
2. Calls `scripts/new_article.py "<slug>"` to scaffold `articles/YYYY-MM-DD-slug/`.
3. Runs the 6 phases in order (see Section 4).
4. Calls `blogheaderimagegen/` for the header (Phase 6).
5. Runs the audit (`scripts/seo_audit.py`).
6. Reports a summary to the user.

**Why orchestrated by Claude rather than scripted:** the work inside each phase (research, strategic decisions, writing, editing) is irreducibly judgment-heavy. Wrapping it in a Python orchestrator would either be a thin shell over LLM calls or would over-constrain the work. Letting Claude follow a runbook is the cleaner pattern.

### 3.2 `blogheaderimagegen/` — header generator

Self-contained Python CLI that takes an article folder or explicit `--title` and produces a 1200×600 PNG hero image plus its source HTML.

**How it works:**
- `lib/brand.py` holds the EverWorker brand constants (colors, logo SVGs, Gilroy font loader that base64-embeds the woff files so the HTML is portable).
- `lib/patterns.py` holds 5 design pattern templates tuned for 2:1 aspect (clean-light, contrarian, stat-highlight, question-hook, report-cover) plus an `auto_pick` heuristic.
- `lib/article.py` reads frontmatter from an article folder via `python-frontmatter`.
- `lib/render.py` opens the generated HTML in headless Chromium via Playwright and screenshots the `#ad` element at 2× DPI.
- `generate_header.py` is the CLI that ties it together.

**Why headless Playwright rather than html2canvas:** the existing `pmmadvertisingcreative/` system uses html2canvas which requires a human click in a browser. The production system needs to be scriptable — Playwright element-screenshot is fully headless, no human in the loop, identical pixel output every run.

**Why base64-embedded fonts:** Gilroy is a paid font that lives on the user's machine at `~/Documents/pmmadvertisingcreative/brandassets/gilroy_font copy/`. Embedding the woff files as base64 in the HTML means the rendered PNG always uses Gilroy regardless of where the HTML opens, and the HTML stays portable.

### 3.3 `blogsagent/` — HubSpot publisher

Self-contained Python CLI that takes a markdown file (frontmatter + body + optional JSON-LD schemas) and publishes it to HubSpot CMS Blogs v3.

**How it works:**
- `md_to_hubspot/parser.py` reads YAML frontmatter via `python-frontmatter`. Required fields: `title`, `slug`, `meta_description`. Optional: `schemas` (a YAML list of JSON-LD dicts).
- `md_to_hubspot/html_builder.py` converts the markdown body to HTML using `mistune`, wraps it in a `<div class="ew-post">` with Gilroy + black inline styles, downgrades stray `<h1>` to `<h2>`, adds `target="_blank" rel="noopener"` to external links. Each schema from frontmatter becomes a `<script type="application/ld+json">` block in `headHtml`.
- `md_to_hubspot/hubspot_client.py` posts to `POST /cms/v3/blogs/posts` with the verified field names (`name`, `slug`, `metaDescription`, `postBody`, `headHtml`, `contentGroupId`, `blogAuthorId`, `state`, `publishImmediately`). On first run it resolves the blog ID and author ID via API and caches them to `.config_cache.json`.
- `md_to_hubspot/main.py` is the CLI: `python -m md_to_hubspot.main path/to/article.md [--draft | --no-images | --dry-run]`.

**Why a separate tool from the production system:** publishing is a destructive operation against a production HubSpot instance. Keeping it as a separate CLI with its own venv and `.env` token isolates the side-effect surface. It also lets the publisher be reused for other content sources (hand-written articles, drafts edited outside the pipeline, etc.).

**HubSpot environment quirks the client encodes:**
- EU instance (`pat-eu1-...` token), but the API host is still `api.hubapi.com`.
- Three blogs exist; defaults to `104001906678` (AI Workers demystified). Cached in `.config_cache.json` after first resolve.
- Two duplicate "Ameya Deshmukh" author records exist with the same email; defaults to `245720213752` (older record, confirmed active). Documented in memory under `project_everworker_hubspot.md`.
- `headHtml` is a real field on the v3 blog post object even though the public docs are sparse on it — verified by inspecting a live post.

### 3.4 `blogscraper/` — competitor scraper

Self-contained Python CLI that takes a blog index URL and produces a clean folder of markdown + hero images + a manifest for every article on that blog.

**How it works:**
- `agents/discovery.py` finds article URLs in three strategies, in order: (1) sitemap discovery via robots.txt directives and common paths, (2) HTML pagination crawl, (3) Playwright browser mode with scroll + "Load more" click loop.
- `agents/extraction.py` extracts title (via `og:title`), body (via `trafilatura.extract` to markdown), hero image (via `og:image` → `twitter:image` → `<article> <img>` → first wide img → first img), and publish date (via `article:published_time` → `<time datetime>`).
- `agents/download.py` downloads hero images with 3 retries + exponential backoff, picks file extension from `Content-Type` first then URL.
- `agents/orchestrator.py` enforces `asyncio.Semaphore(5)` concurrency, 0.5–1.0s per-task jitter, robots.txt preflight, per-article error isolation, and resume via manifest.json.
- `tools/build_topic_index.py` runs after a scrape: reads every markdown, runs TF-IDF on 1–3 grams, clusters slugs by URL pattern, emits `topic_index.json` + `topic_index.md`.

**Why a separate tool:** the production system's Researcher phase calls `WebSearch` and `WebFetch` for live research, but for **competitor corpus analysis** (mapping what artisan.co or any other source publishes on a topic) a full crawl gives much richer input. `blogscraper/` is purpose-built for that.

**Why an explicit scraper rather than Apify/etc.:** runs on the user's machine with no external SaaS dependency; the manifest + topic_index outputs feed directly back into the production system as Researcher inputs.

---

## 4. The 6-phase article production pipeline

This is the core flow. Every article runs all 6 phases in order, no skipping, with gate conditions between phases.

### Phase 1 — Researcher

**Spec:** `agents/researcher.md`.

**Inputs:** user prompt + (optional) topic/keyword + tools (`WebSearch`, `WebFetch`).

**Process:**
1. Parse the user's request for topic, outline, keywords, audience hints.
2. Map the topic landscape via 3–5 broad searches.
3. Identify the top 10 ranking pages for the target keyword; document each one's angle and what it misses.
4. Find authoritative primary sources (research, gov data, peer-reviewed studies, official docs).
5. Map what AI engines (Google AI Overviews, Perplexity, ChatGPT) currently surface for adjacent queries.
6. List key entities (people, orgs, products, concepts) with Wikipedia/Wikidata URLs.
7. Capture every citable statistic, quote, case study with full provenance.
8. Document debates and counterpoints.
9. Mine PAA / Reddit / Quora for questions people are actually asking.
10. Identify content gaps — what is missing that this article could own.

**Output:** `research-notes.md` in the article folder, in the exact 11-section structure spec'd in `agents/researcher.md`.

**Gate:** notes exist; ≥ 8 cited sources; at least one named stat, one named entity, one content gap.

**Why so structured:** the Strategist (Phase 2) consumes this output directly. If Phase 1 is unstructured, Phase 2 can't make sharp decisions. The 11-section template is the contract between Phase 1 and Phase 2.

### Phase 2 — Strategist

**Spec:** `agents/strategist.md`.

**Inputs:** `research-notes.md` + all `standards/*.md` + relevant `context/` folders.

**Decisions made (with reasoning):**
1. **Angle.** One-sentence "Unlike [the SERP], this article does [X] by [Y]" wedge.
2. **Keywords.** Primary + 3–7 secondary.
3. **Search intent.** informational / commercial / transactional / navigational.
4. **Word count target.** Based on SERP median; ±15% allowed per `standards/seo-checklist.md`.
5. **GEO/AIO tactics.** 3+ concrete tactics this article will use (direct-answer-first paragraphs, quotable sentences, definition sentences, etc.).
6. **Target entities.** Named entities for the `mentions` schema array.
7. **FAQ candidates.** 3–7 questions for the FAQPage schema.
8. **Internal link opportunities.** Real URLs or placeholders.
9. **External citations to use.** Specific sources from Phase 1 to embed inline.
10. **Quotable sound bites.** 3–5 sentences the article should contain.
11. **Hook strategy.** Specific scene / counterintuitive claim / sharp number / direct question.
12. **Closing/CTA.** One specific next step.
13. **H2/H3 outline.** Full section-by-section outline with word-count budgets per section.

**Output:** `outline.md` in the article folder.

**Gate:** outline exists with primary keyword chosen, 3–7 FAQ questions, ≥4 H2 sections, all entities + citations listed by name.

**Why so opinionated:** the Writer follows the outline mechanically. If the outline says "highlight X stat in this section, link to Y here, define term Z," the Writer does that. Strategist makes decisions so Writer doesn't have to.

### Phase 3 — Writer

**Spec:** `agents/writer.md`.

**Inputs:** `outline.md` + `research-notes.md` + `context/author-style/` (default voice rules if empty) + `context/brand/`.

**Process:** mechanical execution of the outline. Frontmatter complete. H1 = title. Hook intro (2–3 short paragraphs). `## Key Takeaways` block (3–6 standalone-citable bullets). H2/H3 sections in order, each with direct-answer-first paragraph and inline citations. FAQ section with H3 per question. Bold + define key terms inline (`**Term** is X`). Closing/CTA.

**Voice rules (defaults until `context/author-style/` is populated):**
- Confident, expert, helpful; not breezy, not stiff.
- Second person ("you") to reader.
- 2–4 sentence paragraphs.
- Active voice strongly preferred.
- Concrete > abstract. "$3.4B" > "billions."
- Vary sentence length.
- No AI clichés (banned list in `standards/quality-bar.md`).
- Every citation traces to `research-notes.md` (no fabrication).

**Output:** `article.md` with complete frontmatter + body + json-ld fence placeholder + edit-summary HTML comment placeholder. `meta.json` populated.

**Gate:** article.md exists; H1 + Key Takeaways + FAQ + closing present; every citation traceable.

### Phase 4 — Editor

**Spec:** `agents/editor.md`.

**Inputs:** all 5 `standards/*.md` + current `article.md` + (reference) `research-notes.md` and `outline.md`.

**Eight explicit audit passes:**
1. **Banned phrases.** Zero tolerance. Every match from `standards/quality-bar.md` rewritten (em-dashes, "delve," "AI-powered," "leverage," "synergy," etc.).
2. **Voice and clarity.** Per-paragraph: concrete subject, active verb, one idea, 2–4 sentences, varied length, earns its place.
3. **Structure.** Exactly one H1; H2/H3 hierarchy logical; Key Takeaways and FAQ present.
4. **SEO checklist.** Title 50–60 chars, meta description 140–160, slug format, primary keyword in first 100 words, ≥3 external links, ≥1 internal links, canonical URL.
5. **GEO checklist.** Direct factual answers, quotable sentences, definition sentences, author/publisher authority, entity richness ≥5, freshness signals.
6. **AIO checklist.** Question-shaped headers, FAQ verbatim mirrored to schema, speakable target identified, co-citation hygiene.
7. **Fact-check.** Every stat/quote/named study traces to `research-notes.md`. No exceptions.
8. **Frontmatter completeness.** Every field populated.

**Output:** updated `article.md` + appended `<!-- EDIT SUMMARY -->` HTML comment documenting what was checked, what was changed, and the final word/reading-time counts.

**Gate:** zero banned phrases; all checklist items pass or have documented justified exceptions; meta description 140–160; title 50–60; primary keyword in first 100 words.

### Phase 5 — Schema Builder

**Spec:** `agents/schema-builder.md`.

**Inputs:** `standards/schema-spec.md` + `templates/schema-template.json` + finalized `article.md` + `research-notes.md` + `outline.md`.

**Required `@graph` nodes (verified against `scripts/validate_schema.py`):**
- `BlogPosting` (headline, author, datePublished, image, publisher, mainEntityOfPage, keywords, wordCount, articleSection, inLanguage, mentions, citation).
- `Person` (author with sameAs to LinkedIn).
- `Organization` (EverWorker with logo as ImageObject + sameAs).
- `BreadcrumbList` (Home → Blog → Post).
- `WebSite` (parent).
- `FAQPage` (mainEntity = array of Question, each with Answer; **verbatim mirror of article's FAQ**).
- `WebPage` (with `speakable` SpeakableSpecification targeting `#key-takeaways`).
- `ImageObject` (hero PNG with width/height/caption).
- `DefinedTerm` (one per inline-defined term in the body).
- `mentions` array of `Thing`/`Person`/`Organization` with `sameAs` to Wikipedia/Wikidata where real.
- `citation` array of `CreativeWork`/`Article`/`Report` with name, url, author, datePublished, publisher.

**`@id` convention:** every node has a stable URL-based `@id` so references cross-link cleanly.

**Process:** build `schema.json`, validate via `python scripts/validate_schema.py`, fix and re-run until exit code 0, embed the same JSON into `article.md` inside a fenced ```json-ld block.

**Output:** `schema.json` (validated) + the same JSON embedded in `article.md` (byte-equivalent).

**Gate:** schema validates; FAQPage `mainEntity` matches article FAQ verbatim; embedded JSON matches `schema.json`.

### Phase 6 — Header Designer

**Spec:** `agents/header-designer.md`.

**Inputs:** finalized `article.md` (frontmatter only) + `blogheaderimagegen/` tool.

**Process:** invoke `blogheaderimagegen/generate_header.py --from-article articles/YYYY-MM-DD-slug/`. The CLI reads `title`, `primary_keyword`, `meta_description`, `category` from frontmatter, auto-picks a pattern from 5 (or accepts `--pattern <name>`), renders headless Chromium at 1200×600 logical / 2400×1200 actual (2× DPI), saves `header.html` + `header.png` into the article folder.

**Output:** `header.html` and `header.png` in the article folder.

**Gate:** header.png exists at 2400×1200, opens cleanly, `hero_image: "header.png"` set in article frontmatter.

### Final audit

After Phase 6: `python scripts/seo_audit.py articles/YYYY-MM-DD-slug/`. Reports pass/warn/fail across 20+ checks. Any FAIL routes back to the appropriate phase (usually Editor) for a fix.

---

## 5. The cluster threading model

Articles are produced as part of a **cluster** — a pillar article + N companion articles that link to each other and to the pillar.

**Pillar:** the encyclopedic article that owns the top-of-funnel keyword. Long-form (3,500–4,500 words). Links out to every companion article.

**Theme companions:** 3–4 per theme. Each one goes deep on one sub-topic the pillar touches. Links **up** to the pillar in the intro and closing. Links **across** to sibling articles in the same theme. Links **down** to placeholder articles if they exist as cluster expansion targets.

**Threading mechanisms:**

1. **Inline markdown links.** Natural-language anchors to `/blog/<sibling-slug>`. The orchestrator generates these during Phase 3 (Writer) based on Strategist decisions.
2. **Schema `isPartOf`.** Every companion article's BlogPosting has `"isPartOf": { "@id": "<pillar canonical>#article" }`. Search engines see the cluster relationship explicitly.
3. **Per-theme visual continuity.** All cluster articles use the same `clean-light` header pattern (or another consistent pattern per theme). Brand consistency reinforces topical coherence.
4. **Shared research baseline.** Each article's `research-notes.md` inherits macro context from the pillar's notes; the file links to the pillar's notes explicitly and only documents incremental research specific to the article's narrower angle.

**The cluster we shipped:** 14 articles total (pillar + 13 companions across themes A/B/C/D + 1 standalone follow-up on context engineering), 0 failed audits, all published as HubSpot drafts.

---

## 6. The publishing pipeline

The end-to-end flow from "user types a topic" to "draft live in HubSpot":

```
user types "Write an article about X"
        │
        ▼
   CLAUDE.md recognizes pattern
        │
        ▼
   scripts/new_article.py "<slug>"
        │
        ▼
   articles/YYYY-MM-DD-slug/   ← scaffold
        │
   ┌────┴────────────────────────┐
   │     6-PHASE PIPELINE        │
   │                             │
   │  Phase 1: Researcher        │
   │    └─→ research-notes.md    │
   │  Phase 2: Strategist        │
   │    └─→ outline.md           │
   │  Phase 3: Writer            │
   │    └─→ article.md (draft)   │
   │  Phase 4: Editor            │
   │    └─→ article.md (final)   │
   │  Phase 5: Schema Builder    │
   │    ├─→ schema.json          │
   │    └─→ article.md (+ JSON)  │
   │  Phase 6: Header Designer   │
   │    ├─→ header.html          │
   │    └─→ header.png           │
   └─────────────────────────────┘
        │
        ▼
   scripts/seo_audit.py  ← 21-check pass/warn/fail report
        │
        ▼
   /tmp/publish_cluster.py adapter:
     • read article.md + schema.json
     • strip ```json-ld block from body
     • strip <!-- EDIT SUMMARY --> comment
     • inject schema into frontmatter as `schemas: [<schema dict>]`
     • write publish-ready md to /tmp/cluster-publish/
        │
        ▼
   blogsagent/.venv/bin/python -m md_to_hubspot.main <md> --draft
        │
        ▼
   POST /cms/v3/blogs/posts
     • name, slug, metaDescription
     • postBody (Gilroy/black HTML wrap)
     • headHtml (<script type="application/ld+json">{full @graph}</script>)
     • contentGroupId (cached blog ID)
     • blogAuthorId (cached author ID)
     • state: DRAFT
        │
        ▼
   HubSpot returns id + url
        │
        ▼
   manifest.json updated with all post IDs
        │
        ▼
   User reviews in HubSpot UI; says "go live"
        │
        ▼
   PATCH /cms/v3/blogs/posts/{id}  body: {"state": "PUBLISHED"}
        │
        ▼
   article live at https://everworker.ai/blog/<slug>
```

**The adapter step exists** because `blogsagent/` expects schemas in YAML frontmatter (so it can render each as its own `<script>` tag in `headHtml`), but the production system stores schemas as a fenced ```json-ld block in the article body (so the human-readable markdown contains the schema for review). The adapter translates between the two formats without losing fidelity.

**The HubSpot environment is the EU instance.** Token prefix is `pat-eu1-...`. API host is still `api.hubapi.com` (not region-specific). Default blog is `104001906678` (AI Workers demystified). Default author is `245720213752` (older Ameya record, confirmed active despite being the older of two duplicates).

---

## 7. Brand and ToV enforcement

The brand system is the EverWorker spec from `~/Documents/pmmadvertisingcreative/LinkedIn-Ad-Designer-Everworker.md`. Three places enforce it:

### 7.1 Header generator brand constants

`blogheaderimagegen/lib/brand.py` hardcodes the brand colors (`#FF0D40` primary red, `#48FFBD` accent green, `#0E151D` dark, `#272B31` secondary dark, `#F8F8F8` light bg), the Gilroy font loader (base64-embeds the woff files from `~/Documents/pmmadvertisingcreative/brandassets/gilroy_font copy/`), and both logo SVGs inline (primary red for light bg, mono white for dark bg). The brand system has one source of truth on disk; this module mirrors it for self-containment.

### 7.2 Quality bar (banned phrases)

`standards/quality-bar.md` lists every banned phrase. The Editor (Phase 4) walks this list explicitly with zero tolerance. The audit script (`scripts/seo_audit.py`) also checks the list and fails on any match.

**Brand-specific bans (from EverWorker ToV, stricter than generic):**
- **Em-dashes anywhere.** Brand ToV requires zero. Use commas, semicolons, parens, or sentence splits.
- **"AI-powered."** Banned. Use "AI-driven" or "AI-executed" or just describe what the AI does.
- **"supercharge."** Banned.
- **Corporate fluff:** "leverage" (as verb), "synergy," "best-in-class," "robust solution," "seamless," "cutting-edge."
- **AI-cliché openers:** "In today's fast-paced world," "delve into," "navigate the complexities," "unlock the power of."

### 7.3 HubSpot post HTML wrap

`blogsagent/md_to_hubspot/html_builder.py` wraps every published post body in:

```html
<style>
.ew-post {
  font-family: 'Gilroy', -apple-system, ...;
  color: #000;
  line-height: 1.65;
  font-size: 17px;
}
.ew-post h2 { color: #000; ... }
.ew-post a { color: #000; text-decoration: underline; }
.ew-post blockquote { border-left: 3px solid #000; ... }
...
</style>
<div class="ew-post">
  <!-- mistune-rendered HTML here -->
</div>
```

So every post inherits Gilroy + black text + brand-consistent typography automatically, regardless of what the source markdown looks like.

### 7.4 Header generator pattern templates

Each of the 5 header patterns (`blogheaderimagegen/lib/patterns.py`) is hardcoded to use only brand colors. There is no way to accidentally pick an off-brand color in a generated header.

---

## 8. Key design decisions and rationales

| Decision | Alternative | Why we chose this |
|---|---|---|
| **YAML frontmatter** for article metadata | Custom format / JSON | Industry-standard; `python-frontmatter` parses it; humans can read and edit it |
| **`@graph`** in JSON-LD (single `<script>`) | Multiple separate `<script>` tags | Google recommends `@graph`; cleaner; lets nodes cross-reference via `@id` |
| **Markdown source of truth** | HTML / proprietary CMS | Diffable, versionable, portable, AI-native; renders cleanly via `mistune` |
| **Per-article folder** with all artifacts | Single article.md with everything inline | Schema lives separately, validatable; research/outline are reviewable independently; header sits alongside |
| **Headless Playwright** for header PNG | html2canvas | Scriptable; no human click; identical pixel output every run; reuses Chromium already installed for blogscraper |
| **Base64-embedded Gilroy fonts** | Link to Google Fonts / local file paths | Self-contained HTML; works in headless render; portable to any browser |
| **Standalone CLIs** (header + publisher + scraper) | One mega-CLI | Each tool has one job; each has its own venv; can be reused independently |
| **Adapter between production system and blogsagent** | Modify production format to match blogsagent | Production keeps human-readable JSON-LD fence in article.md; adapter does the conversion once at publish time |
| **`@id` for every node** | Implicit references | Cross-references resolve cleanly; nodes can reference each other via `{"@id": "..."}` |
| **Speakable target = Key Takeaways block** | Speakable on full intro | Key Takeaways is 5 bullets, each citable-standalone; AI engines extract this cleanly |
| **DefinedTerm for every bolded definition** | Skip DefinedTerm | Each defined term becomes a separate schema entity; helps with entity extraction and ranking |
| **`mentions` with Wikipedia `sameAs`** | Just names | Disambiguates entities; helps search engines build the knowledge graph |
| **Cache HubSpot IDs in `.config_cache.json`** | Re-resolve every run | Faster; avoids hitting the resolution endpoint on every publish; cache is gitignored so credentials stay local |
| **Default to `--draft` for publishing** | Publish live by default | Lets the user eyeball in HubSpot UI before going live; one-way decision (publish-then-unpublish is ugly); easy to flip via PATCH after review |
| **Tokenizer fix in `seo_audit.py`** for `AI-first` | Force keyword to be unhyphenated | Real fix: hyphen-strip both keyword and body when comparing |
| **`@graph` `isPartOf` linking to pillar** | Just internal link in body | Search engines see the explicit cluster relationship in structured data |

---

## 9. Operational runbook

### 9.1 First-time setup

```bash
cd ~/Documents/seogeoaioworkerv2
# Production system has no Python deps; Claude orchestrates.
# Set up each tool:
cd blogsagent && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && cd ..
cd blogheaderimagegen && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/python -m playwright install chromium && cd ..
cd blogscraper && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && cd ..

# Set HubSpot token:
echo "HUBSPOT_TOKEN=pat-eu1-..." > blogsagent/.env
echo "HUBSPOT_BASE_URL=https://api.hubapi.com" >> blogsagent/.env

# Pre-seed the HubSpot IDs (avoids first-run resolution):
cat > blogsagent/.config_cache.json <<EOF
{
  "blog_author_id": "245720213752",
  "content_group_id": "104001906678"
}
EOF
```

### 9.2 Write a new article

In Claude Code, in this repo, just type:

```
Write an article about <topic>
```

or

```
Write an article about <topic>, target keyword "<kw>"
```

Claude reads `CLAUDE.md`, scaffolds `articles/YYYY-MM-DD-<slug>/`, runs the 6 phases, generates the header, runs the audit, and reports a summary.

### 9.3 Publish a single article

```bash
cd blogsagent
.venv/bin/python -m md_to_hubspot.main /tmp/cluster-publish/<file>.md --draft
```

(The adapter step that prepares the file lives in the publish script — see Section 6.)

### 9.4 Publish a batch (the full cluster)

```bash
cd blogsagent
.venv/bin/python /tmp/publish_cluster.py
```

(Runs the adapter for each article folder and calls blogsagent. Writes manifest to `/tmp/cluster-publish/manifest.json`.)

### 9.5 Flip drafts to live

```bash
# Single article:
curl -X PATCH "https://api.hubapi.com/cms/v3/blogs/posts/<post_id>" \
  -H "Authorization: Bearer $HUBSPOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"state": "PUBLISHED"}'

# Batch: loop the IDs from manifest.json
```

### 9.6 Audit any article anytime

```bash
python scripts/seo_audit.py articles/<folder>/
```

Returns pass/warn/fail counts and per-check details.

### 9.7 Scrape a competitor blog

```bash
cd blogscraper
.venv/bin/python scrape_blog.py https://<competitor>/blog --use-browser
# Then:
python3 tools/build_topic_index.py <domain>/blog/manifest.json
```

Output: markdown files + images + manifest + topic index. Feed the topic index into the Researcher phase of a new article as gap-analysis input.

---

## 10. Extension points

### 10.1 Add a new design pattern to the header generator

Edit `blogheaderimagegen/lib/patterns.py`:
1. Write a `render_<name>(inp: HeaderInputs) -> str` function returning the inner HTML for `#ad`.
2. Add the function to `PATTERN_RENDERERS` and `PATTERN_NAMES`.
3. Optionally add a heuristic to `auto_pick` so the picker can select it automatically.

No other file changes needed.

### 10.2 Add a new agent phase

1. Write `agents/<name>.md` with the phase spec (mission, inputs, process, output, gate).
2. Update `CLAUDE.md` to add the phase to the pipeline (specify position, inputs, gate condition).
3. Optionally extend `scripts/seo_audit.py` if the new phase produces an output the audit should check.

### 10.3 Add a new standard

1. Write `standards/<name>.md` with the editorial bar.
2. Reference it from `agents/editor.md` so Phase 4 walks it explicitly.
3. Optionally encode it as a check in `scripts/seo_audit.py`.

### 10.4 Switch the publisher to a different CMS

`blogsagent/md_to_hubspot/hubspot_client.py` is HubSpot-specific but the body of `blogsagent/md_to_hubspot/parser.py` and `html_builder.py` are CMS-agnostic. Replace `hubspot_client.py` with a new client (e.g., `webflow_client.py`) that posts to the new CMS's API. The parser and HTML builder don't change.

### 10.5 Add image upload to the publisher

The current `blogsagent` does not upload hero PNGs to HubSpot. To add this:
1. Extend `hubspot_client.py` with an `upload_file()` method that POSTs to `/files/v3/files`.
2. In `main.py`, before creating the post, upload the hero PNG and capture the resulting `url`.
3. Pass that URL as `featuredImage` in the post body.

### 10.6 Add a new context folder

Drop documents into `context/<topic>/`. Update `agents/<phase>.md` to reference the new folder if a specific phase should consume it. Update `context/README.md` to document what belongs there.

---

## 11. What's working, what's not, what's next

### Working

- 14 articles produced + published as HubSpot drafts in this cluster, 0 audit failures across all 14, brand ToV compliance at 100% (zero em-dashes, zero banned phrases).
- Headers render pixel-perfect in 2 seconds via Playwright.
- Cluster threading is real: every companion article links up to the pillar, across to siblings, and the schema `isPartOf` reflects the relationship.
- The adapter between the production system and `blogsagent` worked without modification across 14 articles.
- Resume works on the publisher (re-running skips IDs already in the cluster manifest).

### Known limitations

- **Header images don't auto-upload to HubSpot.** They sit in the article folder; you upload manually in HubSpot UI. Extension point documented in Section 10.5.
- **No live SEO ranking telemetry.** The system produces articles; tracking how they rank is a separate concern not in scope.
- **No automated draft → published flow.** By design: drafts let you eyeball before going live. Going live is a one-line PATCH per ID.
- **Pattern auto-picker is heuristic, not semantic.** Reads title shape, not article body. Explicit `--pattern <name>` is the override.
- **`context/` folders are still mostly empty.** The system defaults work, but populating brand/sales/marketing/author-style folders meaningfully improves Writer and Strategist phases.

### Natural next moves

- Image upload for headers (see Section 10.5).
- A second header pattern set tuned for the cluster's tone (the cluster uses `clean-light` exclusively; adding `contrarian` for opinionated posts would create visual variety).
- Background scheduling: PATCH drafts to `SCHEDULED` with a `publishDate` so the cluster ships out one post per week rather than all at once.
- A small ranking-monitor script that pings the published canonical URLs weekly and reports rank for the primary keyword.

---

## Footnotes / source-of-truth pointers

- **Brand source of truth:** `~/Documents/pmmadvertisingcreative/LinkedIn-Ad-Designer-Everworker.md`. Colors, font, logo, ToV bans, design patterns. The header generator mirrors these for self-containment.
- **HubSpot environment quirks:** documented in `~/.claude/projects/-Users-ameyadeshmukh-Documents-linkedinadsagents-linkedinreportingagent/memory/project_everworker_hubspot.md`.
- **User identity:** `~/.claude/projects/-Users-ameyadeshmukh-Documents-linkedinadsagents-linkedinreportingagent/memory/user_role.md`.
- **EverWorker SDR AI Worker primary source PDFs:** `context/sales/` (AI-First Sales Operating Model, SDR AI Worker Solution Guide, Outbound Email Infrastructure Architecture, State of Cold Email in 2026, ICP Firmographic). These were the source material for the cluster.

Last updated: 2026-05-05.
