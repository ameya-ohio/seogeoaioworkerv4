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
4. Decide the page's **facets** (D45): page role (`pillar`/`hub`/`cluster`), article type (a format in **`standards/formats.json`**), search intent, funnel. Take them from the user's request or a plan row; otherwise choose them from the topic and confirm them in the Strategist's `## Page Facets`. Write `articles/YYYY-MM-DD-slug/page.md` with the facets, the rules they resolve to in formats.json (length band, Key Takeaways count, FAQ range, schema types, the funnel's CTA from `config/company.yaml` → `ctas`), and the format guide from `templates/formats/<slug>.md` (`generic.md` if none). The worker does this step itself; in terminal mode you do it. Every phase reads page.md. For a plan page, add its **link inventory** (D53): the parent, grandparent and sibling pages with their full `/learn/` URLs and what each covers. Links follow `standards/quality-bar.md` → *Internal linking*. Then write `research-brief.md` (D60): the facets, what the page must cover (the brief's required passages, else the format's), the brief's evidence requirements and company position, the neighbouring pages under *Owned by other pages*, the research playbook for the format's `researchMode` (`templates/research/<mode>.md`), and the matching sections of `templates/research/modifiers.md` (Role, Funnel, Intent).
5. Tell the user the folder path before starting Phase 1.

The article folder is the single source of truth for the run. **Every phase reads from and writes to that folder.** Do not let phase outputs live in your head — persist them.

---

## The six-phase pipeline

Run phases strictly in order. Do not skip. If a phase fails its gate condition, fix and re-run that phase before advancing.

### Phase 1 — Researcher

- **Sub-agent spec:** `agents/researcher.md`
- **Inputs to load:**
  - The user's prompt (topic, outline, any keywords)
  - `agents/researcher.md`
  - `articles/YYYY-MM-DD-slug/research-brief.md` (D60): what this page is researching **for**. The playbook it carries (the "quiver", one per research mode: procedure, mechanism, catalog, comparison, measurement, argument, data, pillar, commercial) says what to gather.
  - `page.md` and `brief.md` (when present)
- **Action:** Research the material this page is built from (the playbook's *Subject Material*: the procedure and its commands, the mechanism, the example bank, the deciding dimensions, the measures), then form 2–3 **candidate positions** it supports and bank the evidence each needs, tagged by position. Use `WebSearch` and `WebFetch` extensively. Minimum **8 distinct sources**, biased toward primary documentation and standards. The Researcher doesn't write intro copy or pick the thesis.
- **Output:** `articles/YYYY-MM-DD-slug/research-notes.md`, in the exact section format specified in `agents/researcher.md`.
- **Gate:** Research notes file exists, contains all required sections (Subject Material and Candidate Positions included), has ≥ 8 cited sources, Subject Material is substantive, there are 2+ candidate positions, every banked statistic or quote is tagged `supports: P<n>` (or the notes say `None needed:`), and it includes one named entity and one explicit content gap. No head-to-head competitor is listed as a source, statistic or quote (their executives' bylines elsewhere included). Check it with:
  ```bash
  python3 scripts/competitor_checks.py --research articles/YYYY-MM-DD-slug/research-notes.md
  ```

### Phase 2 — Strategist

- **Sub-agent spec:** `agents/strategist.md`
- **Inputs to load:**
  - `agents/strategist.md`
  - `articles/YYYY-MM-DD-slug/research-notes.md`
  - **All files in** `standards/` (`seo-checklist.md`, `geo-checklist.md`, `aio-checklist.md`, `schema-spec.md`, `quality-bar.md`)
  - Relevant `context/` folders: `context/brand/`, `context/marketing/`, `context/sales/`, `context/case-studies/` (skip `README.md`, `_template.md`, and files marked `Permission: internal only`). Skip empty folders silently and proceed with sensible defaults.
- **Action:** Decide what the article argues, then plan how each section proves it (D60): the thesis (from the research's Candidate Positions), a 3–5 claim **Argument Spine** with each claim's proof, the angle as a claim about the subject, and 3–5 banked statistics assigned to spine claims. Every body H2 names the spine claim it advances (or the format requirement it serves), its claim, and its proof; procedure steps carry the exact `Action:`, and examples carry their `Specifics:`. Then keywords, intent, word count, GEO/AIO, entities, FAQ, internal links, the intro strategy (built from the thesis), and the CTA.
- **Output:** `articles/YYYY-MM-DD-slug/outline.md`.
- **Gate:** Outline exists; primary keyword chosen; FAQ count in page.md's range; at least 4 H2 sections; a real thesis; a 3–5 claim Argument Spine, every claim advanced by an H2 and at least half the body H2s advancing one; `Advances:` and `Claim:` on every body H2; each External Citation names the spine claim it supports (or is marked "mechanism"); procedure steps have an `Action:`, and an Examples page has 3+ examples with `Specifics:`, each advancing a spine claim.

### Phase 2.5 — Expert Interview (D59)

- **Sub-agent specs:** `agents/interviewer.md` (the interview), `agents/interview-refiner.md` (the outline rewrite)
- **Why:** research finds the open wedge; only the company's expert can say what they'd argue about it. Without this phase, drafts define the topic instead of arguing the title, string statistics together, and comment on other writing.
- **Inputs:** `outline.md`, `research-notes.md` (Topic Summary, Candidate Positions, Content Gaps, Debates), `context/case-studies/`, `context/sales/proof-points.md` (`Citable: yes` rows), `context/brand/positioning.md`, `context/sales/value-props.md`.
- **Action (terminal mode):** you are the interviewer. Run the beats in `agents/interviewer.md` with the user in this chat, one question per message: frame the wedge, offer 2–3 candidate angles to react to, get the thesis in their words and the strongest objection, validate or replace the real-world anchor (with its publishing boundary), ask what the product sees and which proof point (if any) fits, then play it back. If the user says skip, skip the phase. Save the transcript to `interview.md`, then apply `agents/interview-refiner.md`: write `pov.md` and rewrite `outline.md`.
- **Action (worker):** the run stops after the outline with status `awaiting_input`; the operator answers in the web app (Production → *Needs you*), and Finish (or Skip) requeues it. A plan or `config/company.yaml` → `pipeline.interview: skip` turns the stop off.
- **Output:** `interview.md`, `pov.md`, the revised `outline.md`.
- **Gate:** the revised outline still passes the Phase 2 gate, and `pov.md` has Thesis, Argument Spine (3–5 claims), Objection & Answer, Real-World Anchor, Company Role, Approved Quotes and Rejected. A skipped interview passes.

### Phase 3 — Writer

- **Sub-agent spec:** `agents/writer.md`
- **Inputs to load:**
  - `agents/writer.md`
  - `articles/YYYY-MM-DD-slug/outline.md`
  - `articles/YYYY-MM-DD-slug/research-notes.md`
  - `context/author-style/` (or default voice rules from `agents/writer.md` if empty)
  - `context/brand/` (or skip if empty)
  - the `context/case-studies/` file the outline's Real-World Anchor names (if any)
  - `articles/YYYY-MM-DD-slug/pov.md`, when the article was interviewed: the thesis, Argument Spine, anchor, company role and approved quotes the article is built on
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
- **Action:** Run `python scripts/seo_audit.py` on the draft first and fix every FAIL it reports (banned phrases and the machine-checked style limits in `standards/quality-bar.md` included), and apply `agents/technical-reviewer.md` to the draft (accuracy, plus the D60 substance kinds: steps with no action, generic examples, claims the section doesn't prove). Then walk every checklist item explicitly (pass/fail/notes). Edit `article.md` in place to fix all failures. Strip every banned phrase. Verify every citation traces back to `research-notes.md`. Append an HTML-comment edit summary to the bottom of `article.md`.
- **Output:** Updated `articles/YYYY-MM-DD-slug/article.md` + edit summary as `<!-- EDIT SUMMARY: ... -->`.
- **Gate:** Zero banned phrases; all checklist items pass or have a documented justified exception; meta description 140–160 chars; title 50–60 chars; primary keyword present in first 100 words.

### Phase 4.5 — HDCP (Human Driven Content Protocol)

- **Sub-agent spec:** `agents/hdcp.md` (the lean protocol, Opus 5.5)
- **Inputs:**
  - `article.md`, the edited draft and the fact boundary; its `primary_keyword` is the target keyword.
  - `page.md`, whose page role is the content role.
  - `hdcp-inputs.md`, written by the worker. It holds `cluster_context` (the hub URL, each linked page with the topic it owns, and the glossary from `context/glossary.md` when that exists), plus the technical review findings and the latest audit's failures and warnings.
  - `research-notes.md`, context only.
- **Action:** Step 1 diagnoses why this draft reads as generated. The diagnosis is prioritized and specific, and is written to the log first. Step 2 rewrites the draft to fix causes, not symptoms. Facts, links and the CTA are locked. Repetition is cut, and sections may be reordered. A topic that a sibling page owns gets summarized and linked. No new material is added.
- **Output:** the rewritten `article.md` and `hdcp.md`, a log with Diagnosis, Changes made, Cuts, Flags and Editor notes. `[HUMAN INPUT]` flags stay inline, and the export refuses while any remain.
- **Gate:** the article is intact (frontmatter, one H1, no editor notes in it), and the log has a Diagnosis, at least one change, and the Cuts, Flags and Editor notes sections. The model's judgment is the check; the edit gate does not run again.

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
- **Never fabricate** statistics, quotes, or sources. Every statistic, quote, dated event and named source in the article must trace to `research-notes.md` (the expert's own statements and story: to `interview.md`). Mechanism, practice and reasoning are written from expertise and need no citation. Use few statistics: the article argues, and evidence supports it (`standards/quality-bar.md` → *Argument over evidence*). If research did not surface a needed source, go back to Phase 1 and search again rather than inventing one.
- **Empty context folder ≠ failure.** If `context/brand/` is empty, log it and proceed with sensible defaults from `agents/writer.md` and `standards/quality-bar.md`. Do the same for sales/marketing/finance/author-style.
- **Author Style default** (until `context/author-style/` is populated): clear, expert, balanced — neither overly casual nor stiff. Confident voice, second-person where natural, short paragraphs (2–4 sentences), concrete examples. Avoid AI clichés (banned-phrases list lives in `standards/quality-bar.md`).
- **Cite sources inline:** in `research-notes.md` use markdown footnote-style or numbered citations with full URLs; in `article.md` body use natural attribution ("According to a 2025 Stanford study…") plus a citation in the JSON-LD `citation` array.
- **Do not auto-publish.** This system produces the article folder. Publishing to HubSpot is `blogsagent/`'s job and runs separately, on user request.
- **Stop and ask** only if the user's request is genuinely ambiguous about *what topic* to cover. Otherwise, proceed.
- **Never comment on other writing.** The article states its own view. It never says what other articles, guides or search results say or miss (the audit fails it).

---

## File map (for your own re-orientation)

```
agents/
  researcher.md       Phase 1 spec
  strategist.md       Phase 2 spec
  interviewer.md      Phase 2.5 spec: the expert interview (D59)
  interview-refiner.md
                      Phase 2.5 spec: pov.md + the outline rewritten from the answers
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
  technical-reviewer.md
                      Expert read of the Writer's draft (not a pipeline phase):
                      technical errors, contradictions, stale stats, vaguely
                      sourced numbers. The worker runs it before the Editor and
                      hands the findings over; in terminal mode, apply it to the
                      draft yourself at the start of Phase 4.
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
  formats.json        Format registry (D45): the 23 article types — length,
                      schema, header pattern, FAQ/takeaway rules, competitor
                      mode, sign-off, fact-sheet requirements, and the
                      research mode each one researches in (D60)

config/
  company.yaml        Single company config surface (identity, blog, author,
                      organization, HubSpot IDs, brand, voice) — see config/README.md
  brand-assets/       fonts/ + logos/ declared in company.yaml

context/              Company proprietary context (populate over time)
  brand/  sales/  marketing/  finance/  author-style/

templates/
  article-template.md     Frontmatter + body skeleton
  schema-template.json    Base @graph skeleton
  formats/<slug>.md       Writing guide per article type (D45); generic.md fallback
  research/<mode>.md      Research playbook per research mode (D60, the "quiver");
                          formats.json maps each article type to a mode.
                          research/modifiers.md adjusts by role, funnel, intent

scripts/
  new_article.py      Scaffold a new article folder
  validate_schema.py  Validate JSON-LD
  seo_audit.py        Audit a finished article folder
  company_config.py   Config loader (run directly = parse check)
  validate_hubspot.py Verify token + resolve blog/author IDs + list posts
  formats.py          Format registry loader (mirrors the engine)
  format_checks.py    Per-format required elements (steps, tables, formulas)
  proof_points.py     Company numbers must come from context/sales/proof-points.md

articles/             One subfolder per article (YYYY-MM-DD-slug)

Content plans      An operator-authored spreadsheet (a pillar map, a content
                   calendar) imported as `plans` + `plan_items`: every row
                   becomes a planned article with a reserved slug, a synthesized
                   spoke brief, and a production `sequence` that builds
                   bottom-up (D56): a subtopic's cluster articles before its
                   hub, a pillar's hubs before the pillar page. The operator
                   queues a subtopic or pillar for build from the Articles tab
                   (or a per-plan cadence produces them unattended), stopping at
                   `review`; each subtopic then goes live as one release (hub +
                   articles together) from the Releases tab. Worker CLI:
                   `plan-import`, `plan-status`, `plan-items`, `plan-enrich`,
                   `plan-resequence`, `build-queue`, `build-sweep`,
                   `schedule-create`, `schedule-resume`, `schedule-preview`,
                   `schedule-tick`.

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
