# Blog Agent System — Master Orchestrator

This repository is a company-configurable **Blog Agent System**. The company it currently writes for (name, domain, author, brand, HubSpot IDs, voice) is defined in **`config/company.yaml`** — read it at the start of every run; nothing company-specific is hardcoded in the engine. When the user asks for an article to be written, run the six-phase pipeline below.

> Sibling tool: [`blogsagent/`](blogsagent/) is the publisher that ships finished `article.md` files to HubSpot. It is a separate concern. This system *produces* the markdown; `blogsagent/` *publishes* it.

---

## When to invoke

Recognize any of these patterns as a request to run the full pipeline:

- "Write an article about **\<topic\>**"
- "Write an article using this outline: **\<outline\>**"
- "Write an article about **\<topic\>**, target keyword **\<kw\>**"
- "Generate a blog post on **\<topic\>**"
- "Draft a piece on **\<topic\>** for the blog"
- "Create a long-form post about **\<topic\>**" (or any clear variant)

If the user gives a partial spec (topic only, no keyword), proceed and let the Strategist phase choose the keyword from research.

---

## Pre-flight: create the article folder FIRST

Before any phase runs, do these in order:

0. Read **`config/company.yaml`** (company identity, blog URLs, author, brand, voice rules). Every phase below implicitly gets it as an input — the Writer fills `author`/`author_bio_url` frontmatter from it, the Editor applies its `voice.*` rules, the Schema Builder fills Organization/Person/breadcrumb/locale values from it.
1. Derive a **slug** from the topic (lowercase, hyphenated, ≤ 60 chars). If a target keyword was given, prefer that.
2. Compute today's date as `YYYY-MM-DD`.
3. Create the folder `articles/YYYY-MM-DD-slug/`. Either run:
   ```bash
   python scripts/new_article.py "<slug>"
   ```
   …which scaffolds `article.md`, `meta.json`, `research-notes.md`, and `outline.md` from the template, **or** create the folder + empty stub files manually if the script is unavailable.
4. Tell the user the folder path before starting Phase 1.

The article folder is the single source of truth for the run. **Every phase reads from and writes to that folder.** Do not let phase outputs live in your head — persist them.

---

## The six-phase pipeline

Run phases strictly in order. Do not skip. If a phase fails its gate condition, fix and re-run that phase before advancing.

### Phase 1 — Researcher

- **Sub-agent spec:** `agents/researcher.md`
- **Inputs to load:**
  - The user's prompt (topic, outline, any keywords)
  - `agents/researcher.md`
- **Action:** Conduct deep, multi-source web research. Use `WebSearch` and `WebFetch` extensively. Minimum **8 distinct sources**, biased toward primary/authoritative.
- **Output:** `articles/YYYY-MM-DD-slug/research-notes.md`, in the exact section format specified in `agents/researcher.md`.
- **Gate:** Research notes file exists, contains all required sections, has ≥ 8 cited sources, and includes at least one named statistic, one named entity, and one explicit content gap.

### Phase 2 — Strategist

- **Sub-agent spec:** `agents/strategist.md`
- **Inputs to load:**
  - `agents/strategist.md`
  - `articles/YYYY-MM-DD-slug/research-notes.md`
  - **All files in** `standards/` (`seo-checklist.md`, `geo-checklist.md`, `aio-checklist.md`, `schema-spec.md`, `quality-bar.md`)
  - Relevant `context/` folders: `context/brand/`, `context/marketing/`, `context/sales/`. Skip empty folders silently and proceed with sensible defaults.
- **Action:** Convert research into a winning angle and a detailed outline. Decide keywords, intent, word-count target, GEO/AIO angle, target entities, FAQ candidates, citations, internal-link opportunities, hook strategy, and CTA.
- **Output:** `articles/YYYY-MM-DD-slug/outline.md`.
- **Gate:** Outline exists; primary keyword chosen; FAQ section has 3–7 candidate questions; H2/H3 outline contains at least 4 H2 sections; all entities and citations to use are listed by name with sources.

### Phase 3 — Writer

- **Sub-agent spec:** `agents/writer.md`
- **Inputs to load:**
  - `agents/writer.md`
  - `articles/YYYY-MM-DD-slug/outline.md`
  - `articles/YYYY-MM-DD-slug/research-notes.md`
  - `context/author-style/` (or default voice rules from `agents/writer.md` if empty)
  - `context/brand/` (or skip if empty)
- **Action:** Write the full article in markdown, following the outline section-by-section in the brand/author voice. Embed inline citations naturally. Write FAQ section verbatim using strategist's questions. Fill YAML frontmatter completely.
- **Output:** `articles/YYYY-MM-DD-slug/article.md` (full draft). Also update `meta.json` with title/slug/meta_description/keywords/canonical.
- **Gate:** `article.md` exists with complete frontmatter; H1 present; "Key Takeaways" block present near the top; FAQ section present; no fabricated sources (every cited claim must trace to `research-notes.md`).

### Phase 4 — Editor

- **Sub-agent spec:** `agents/editor.md`
- **Inputs to load:**
  - `agents/editor.md`
  - `standards/quality-bar.md`
  - `standards/seo-checklist.md`
  - `standards/geo-checklist.md`
  - `standards/aio-checklist.md`
  - The current `article.md`
- **Action:** Walk every checklist item explicitly (pass/fail/notes). Edit `article.md` in place to fix all failures. Strip every banned phrase. Verify every citation traces back to `research-notes.md`. Append an HTML-comment edit summary to the bottom of `article.md`.
- **Output:** Updated `articles/YYYY-MM-DD-slug/article.md` + edit summary as `<!-- EDIT SUMMARY: ... -->`.
- **Gate:** Zero banned phrases; all checklist items pass or have a documented justified exception; meta description 140–160 chars; title 50–60 chars; primary keyword present in first 100 words.

### Phase 5 — Schema Builder

- **Sub-agent spec:** `agents/schema-builder.md`
- **Inputs to load:**
  - `agents/schema-builder.md`
  - `standards/schema-spec.md`
  - `templates/schema-template.json`
  - The finalized `article.md` (frontmatter + body + FAQ + defined terms + citations)
- **Action:** Produce a complete `@graph` covering BlogPosting, Person, Organization, BreadcrumbList, FAQPage, WebPage (with `speakable`), ImageObject, DefinedTerm entries, `mentions` (with `sameAs` to Wikipedia/Wikidata where available), and `citation`. Save to `schema.json`. Validate. Embed final JSON in `article.md` inside a fenced ```json-ld block at the end (above any edit-summary comment is fine).
- **Validation:**
  ```bash
  python scripts/validate_schema.py articles/YYYY-MM-DD-slug/schema.json
  ```
  Fix and re-run until exit code 0.
- **Gate:** `schema.json` validates; the same JSON is embedded in `article.md`; FAQPage `mainEntity` mirrors the article's FAQ section verbatim.

### Phase 6 — Header Designer

- **Sub-agent spec:** `agents/header-designer.md`
- **Tool:** the `blogheaderimagegen/` Python package at the repo root (sibling to `blogsagent/` and `blogscraper/`).
- **Inputs:**
  - `agents/header-designer.md`
  - The finalized `article.md` frontmatter (`title`, `primary_keyword`, `meta_description`, `category`).
- **Action:** Generate a 1200×600 hero image for the post in the company brand (font, colors, and logo from `config/company.yaml` + `config/brand-assets/`). The CLI auto-picks a pattern from five (clean-light / contrarian / stat-highlight / question-hook / report-cover) based on title shape; override with `--pattern <name>` when the agent has reason. Headless Chromium element-screenshot at 2× DPI.
  ```bash
  blogheaderimagegen/.venv/bin/python blogheaderimagegen/generate_header.py \
    --from-article articles/YYYY-MM-DD-slug/ \
    --pattern auto
  ```
  After generation, update the article's frontmatter: set `hero_image: "header.png"` and write a short, accurate `hero_image_alt`.
- **Output:** `articles/YYYY-MM-DD-slug/header.html` and `articles/YYYY-MM-DD-slug/header.png`.
- **Gate:** `header.png` exists; `hero_image` is set in `article.md` frontmatter; PNG opens.

---

## Final deliverable check

After Phase 6, run:

```bash
python scripts/seo_audit.py articles/YYYY-MM-DD-slug/
```

Report the audit results to the user. If any item is `FAIL`, fix and re-run the appropriate phase (usually Editor). If `WARN`, surface and let the user decide.

Then summarize for the user:
- Folder path
- Title, slug, primary keyword
- Word count, reading time
- Number of citations and entities
- Any open warnings

---

## Guardrails (apply throughout)

- **Always create the article folder FIRST.** Never start Phase 1 without it.
- **Never skip phases.** Even short articles run the full pipeline.
- **Never fabricate** statistics, quotes, or sources. Every fact in the article must trace to `research-notes.md`. If research did not surface a needed source, go back to Phase 1 and search again rather than inventing one.
- **Empty context folder ≠ failure.** If `context/brand/` is empty, log it and proceed with sensible defaults from `agents/writer.md` and `standards/quality-bar.md`. Do the same for sales/marketing/finance/author-style.
- **Author Style default** (until `context/author-style/` is populated): clear, expert, balanced — neither overly casual nor stiff. Confident voice, second-person where natural, short paragraphs (2–4 sentences), concrete examples. Avoid AI clichés (banned-phrases list lives in `standards/quality-bar.md`).
- **Cite sources inline:** in `research-notes.md` use markdown footnote-style or numbered citations with full URLs; in `article.md` body use natural attribution ("According to a 2025 Stanford study…") plus a citation in the JSON-LD `citation` array.
- **Do not auto-publish.** This system produces the article folder. Publishing to HubSpot is `blogsagent/`'s job and runs separately, on user request.
- **Stop and ask** only if the user's request is genuinely ambiguous about *what topic* to cover. Otherwise, proceed.

---

## File map (for your own re-orientation)

```
agents/
  researcher.md       Phase 1 spec
  strategist.md       Phase 2 spec
  writer.md           Phase 3 spec
  editor.md           Phase 4 spec
  schema-builder.md   Phase 5 spec
  header-designer.md  Phase 6 spec (1200×600 hero image)
  configurator.md     Company onboarding agent (not a pipeline phase;
                      invoked via the /configure-company skill)
  plan-brief-enricher.md
                      Sharpens one imported content-plan row into a full spoke
                      brief (not a pipeline phase; runs on the plan queue in
                      apps/worker). May describe evidence, never supply it.
  topic-cluster-generator.md
                      Theme-driven research agent (not a pipeline phase; D30/D31):
                      seed → prompt fan-out → themes → hub/spoke architecture →
                      spoke briefs. Runs headless in apps/worker (cluster queue);
                      accepted briefs land in the keyword library and ride into
                      the pipeline as a first-class Strategist input (brief.md)

standards/
  seo-checklist.md    Traditional SEO bar
  geo-checklist.md    Generative-engine optimization bar
  aio-checklist.md    AI-engine citation bar
  schema-spec.md      JSON-LD reference + example @graph
  quality-bar.md      Banned phrases, voice, fact-check

config/
  company.yaml        Single company config surface (identity, blog, author,
                      organization, HubSpot IDs, brand, voice) — see config/README.md
  brand-assets/       fonts/ + logos/ declared in company.yaml

context/              Company proprietary context (populate over time)
  brand/  sales/  marketing/  finance/  author-style/

templates/
  article-template.md     Frontmatter + body skeleton
  schema-template.json    Base @graph skeleton

scripts/
  new_article.py      Scaffold a new article folder
  validate_schema.py  Validate JSON-LD
  seo_audit.py        Audit a finished article folder
  company_config.py   Config loader (run directly = parse check)
  validate_hubspot.py Verify token + resolve blog/author IDs + list posts

articles/             One subfolder per article (YYYY-MM-DD-slug)

Content plans      An operator-authored spreadsheet (a pillar map, a content
                   calendar) imported as `plans` + `plan_items`: every row
                   becomes a planned article with a reserved slug, a synthesized
                   spoke brief, and a production `sequence` that puts a pillar
                   page before its hubs and a hub before its articles. A
                   per-plan cadence then produces them unattended, stopping at
                   `review`. Worker CLI: `plan-import`, `plan-status`,
                   `plan-items`, `plan-enrich`, `schedule-create`,
                   `schedule-resume`, `schedule-preview`, `schedule-tick`.

packages/engine/      TypeScript engine library for headless mode (Mongo
                      data layer, pipeline stages, code-enforced gates,
                      bridge to the Python scripts, storage adapter)
apps/worker/          Headless pipeline service (Claude Agent SDK): runs
                      these same six phases from agents/*.md with state in
                      MongoDB — see apps/worker/README.md. Terminal mode
                      (this file) and the worker are two frontends over the
                      same specs; changing agents/ or standards/ changes both.
apps/web/             Operator web app (Next.js): keyword library, strategy
                      tabs (chat/CSV/select), live production board + review
                      editor, articles library, admin editors — see
                      apps/web/README.md. Reads the same Mongo as the worker.
```

When in doubt, re-read this file.
