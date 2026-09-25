# Roadmap — B2B Content Engine (working name)

> **Living document.** This is the single source of truth for where this project is going, what has been decided, what has been built, and what's next. Claude updates it at the end of every working session (see [Session log](#session-log)). When resuming work in a new chat: read this file first.

Last updated: **2026-09-25** (Session 18)

---

## 1. Vision

Turn the EverWorker Blog Agent System (this repo) into a **configurable, agentic web application** that any B2B company running HubSpot (CRM + CMS) can use to go from *keyword/topic idea → researched, outlined, written, edited, schema'd, header-designed article → human review → published HubSpot draft/live post* — with a clean UI over every stage and a human approval gate before publish.

Three objectives (stated 2026-09-14):

1. **Configurable per company.** Point the system at any B2B company (always HubSpot CRM + CMS) and it does this work for them. No EverWorker hardcodes anywhere in the engine.
2. **A Configurator agent.** An agent you invoke that sets the system up for a new company: interviews you, researches the company, populates config + context, validates HubSpot access.
3. **An agentic web application.** Side-nav app with screens for Target Keywords, Content Strategy (4 invocation modes), Production (Work + Review), Articles library, and Admin — running the agent pipeline server-side with live status.

---

## 2. Decisions log

Every architectural decision made so far, with date and rationale. New decisions get appended here.

| # | Date | Decision | Choice | Rationale |
|---|------|----------|--------|-----------|
| D1 | 2026-09-14 | Tenancy | **Single-company instances, multi-ready** | One deployment = one company (one config, one HubSpot token, one DB). Every record carries `company_id` from day one so a multi-workspace app later is a feature, not a rewrite. |
| D2 | 2026-09-14 | Agent runtime | **Claude Agent SDK service** | Backend service runs the existing `agents/*.md` specs headlessly via the Agent SDK. Web app queues jobs, streams status, supports batch. Specs port over almost directly. |
| D3 | 2026-09-14 | Data layer | **MongoDB + object storage** | Mongo as system of record (keywords, pipeline state, article markdown lives in documents, config). Binaries (header PNGs) go to a Railway bucket. |
| D4 | 2026-09-14 | Keyword data source | **SEO data API (DataForSEO)** | Real volume/difficulty/SERP data, pay-per-call, no seat license. Agent combines it with competitor-gap analysis from `blogscraper/`. |
| D5 | 2026-09-14 | Users & auth | **Single operator, auth-light** | V1 ships behind a simple password/magic-link gate. Real accounts/roles later; nothing throwaway. |
| D6 | 2026-09-14 | Build order | **Configurability first, then web app** | Phase 0 extracts every EverWorker hardcode + Phase 1 builds the Configurator agent (usable in Claude Code immediately). Web app is then built on an already-portable engine. |
| D7 | 2026-09-14 | Review editor | **Markdown editor + live preview** | Source-faithful: what you edit is exactly what's stored/published. Frontmatter-aware, side-by-side preview. No lossy HTML↔MD round-trips. WYSIWYG is a possible later upgrade. |
| D8 | 2026-09-14 | Hosting | **Railway** | Web app + agent worker + Mongo + bucket as Railway services. One Railway project per company instance matches D1. Railway MCP already wired into Claude Code. |
| D9 | 2026-09-14 | Web stack (by convention) | **Next.js + TypeScript + Tailwind + shadcn/ui** | Conventional default for this shape of app; pairs naturally with the TypeScript Agent SDK service. |
| D10 | 2026-09-14 | Claude Code flow stays alive | **Dual-mode engine** | The repo remains directly usable via `CLAUDE.md` in Claude Code even after the web app exists. Same specs, same standards, two frontends (terminal + web). |
| D11 | 2026-09-14 | Worker workspace model | **Mongo canonical, folder as scratch** | Agents keep reading/writing `articles/<folder>/` files exactly as the specs say; the worker rebuilds that folder from Mongo artifacts before running and persists outputs back after each phase. Any worker can resume any run; specs stay unchanged. |
| D12 | 2026-09-14 | Quality checks in worker | **Subprocess the canonical Python scripts** | `seo_audit.py` / `validate_schema.py` stay the single source of truth (terminal mode uses them too); the worker shells out and parses PASS/WARN/FAIL into structured stored reports. The deploy image needs Python for header gen anyway — no logic fork. |
| D13 | 2026-09-14 | Per-phase model selection | **Env-driven, default `claude-sonnet-5`** | `PHASE_MODEL_DEFAULT` / `PHASE_MODEL_<PHASE>` env vars; per-phase token usage + cost recorded on `runs.phaseResults[].usage`, so bumping Writer/Editor to Opus later is a data-driven config change. **Superseded by D26/Phase 10.1:** Mongo settings (UI-editable) become the source of truth; env vars demote to bootstrap fallback. |
| D14 | 2026-09-14 | Monorepo tooling | **npm workspaces** | Node 22 + npm 10 already on the machine; no extra toolchain. `packages/engine` (shared TS lib) + `apps/worker` + `apps/web` placeholder; engine spec dirs stay at repo root so terminal mode keeps working (D10). |
| D15 | 2026-09-14 | Local dev Mongo | **mongodb-memory-server with persistent dbPath** | No mongod/Docker on this machine. `scripts/dev_mongo.mjs` (`npm run dev:mongo`) serves :27017 with data persisted in `outputs/dev-mongo/` — web app + worker defaults point there. Prod stays Railway Mongo. |
| D16 | 2026-09-14 | Chat tab v1 | **Smart intake, not a conversational agent** | The Chat tab parses the NL request (topic + trailing `target keyword "…"`) and queues the run. Resolves the §8 open question for v1; a real conversational agent can replace the parser without touching the pipeline side. |
| D17 | 2026-09-14 | Web stack details | **Next 16 App Router, Tailwind v4, hand-rolled UI kit** | Server components read Mongo via the engine DAL; mutations are server actions; SSE route tails `events`. shadcn-style primitives hand-written in `components/ui.tsx` (no CLI codegen dependency). Auth gate = APP_PASSWORD-derived HMAC cookie (D5). |
| D18 | 2026-09-15 | Phase 8 attribution fidelity | **Contact source props now, event-level later** | Nightly sync uses contact-level source properties (original/latest source, first/last page seen, referrer) — works on any HubSpot tier, cheap to sync. Reporting schema keeps a per-contact `touches[]` shape so event-level web-events/attribution data can slot in later without rework. |
| D19 | 2026-09-15 | AI visibility surfaces (Phase 9) | **ChatGPT, Perplexity, Google AI (AI Overviews + Gemini), Claude** | All four tracked. ~~Via their own APIs~~ **Amended by D24:** same four engines, queried through DataForSEO's AI Optimization API. |
| D20 | 2026-09-15 | Post-deploy phase order | **Numeric: 4 → 5 → 6 → 7 → 8 → 9** | Keyword agent and competitive module get built before the Saporo optimization window opens, so Content Strategy is fully functional when the 30/60/90 clock starts. The combined deploy (2.8 + web) and the 1.4 Saporo closeout still come first. **Amended by D29:** Phase 10 inserts before the optimization window → 4→5→6→10→7→8→9. |
| D21 | 2026-09-15 | Keyword markets | **One primary market per company (v1)** | `company.yaml` gains `market: {location_code, language_code}`, set by the Configurator; every DataForSEO call uses it. Keyword metrics are stored keyed by market anyway, so a multi-market list later is additive, not a migration. |
| D22 | 2026-09-15 | Keyword prioritization | **Composite score + human override** | Stored priority score blending Google volume, AI search volume, inverse difficulty, and agent-scored relevance-to-ICP (0–100 with a one-line rationale). Sortable everywhere; a human override sticks and is never recomputed over. |
| D23 | 2026-09-15 | Visibility tracking scope | **One tracked-phrase list; published keywords auto-added** | A single phrase list drives BOTH Google SERP and LLM visibility; every published article's primary keyword is auto-added (before/after lift comes free). Each SERP snapshot records company AND competitor positions + AI Overview presence from the same response. |
| D24 | 2026-09-15 | LLM query gateway | **DataForSEO AI Optimization API (amends D19)** | Same four engines via one vendor/key/bill: LLM Responses API (ChatGPT, Claude, Gemini, Perplexity), LLM Mentions API (brand/competitor mention tracking + AI search volume), LLM Scraper API (real ChatGPT/Gemini search-mode results). Direct vendor APIs remain a spot-check option. |
| D25 | 2026-09-15 | Agent invocation route | **Direct Messages API by default; Agent SDK only where tools are needed** | Tool-less phases (strategist, writer, editor, schema-builder generation, keyword scoring) become single-shot Messages API calls with inputs inlined — the worker already does the file I/O — cutting the Agent SDK's agentic overhead (system prompt, tool defs, loop turns). SDK stays for researcher (WebSearch/WebFetch) and configurator (interactive); header-designer shrinks to a small direct call (pattern choice) + worker-run CLI. |
| D26 | 2026-09-15 | Default model matrix | **Cost-lean tiers (supersedes D13's uniform default)** | Haiku 4.5 → schema-builder, header-designer (mechanical, script-validated). Sonnet 5 → keyword-researcher, topic-cluster-generator, researcher, strategist, writer, editor (the cluster agent's bulk fan-out sub-calls run on the cheap tier). Opus 5 → configurator (once per company, high stakes). Quality risk covered by D27 escalation; writer/strategist upgrades only if 7.4 data says so. |
| D27 | 2026-09-15 | Gate-retry escalation | **Retry on the next model tier up** | A failed gate retries with GATE FEEDBACK on the next tier (Haiku→Sonnet→Opus). Cheap defaults stay safe: the strong model is only paid for when needed. Escalations logged per phase so 7.4 can spot chronically under-modeled agents. |
| D28 | 2026-09-15 | Batch processing | **Standard default, Economy selectable per enqueue** | Every enqueue point (Chat, Select multi-send, re-runs) offers Standard (live, streaming) or Economy (Message Batches API, 50% discount, async ≤24h). Select-tab batch sends suggest Economy; Admin sets the instance default. |
| D29 | 2026-09-15 | Phase 10 ordering (amends D20) | **4 → 5 → 6 → 10 → 7 → 8 → 9** | Phase 10 is exactly the tooling 7.4's optimization needs — routing, caching, batch mode, cost dashboard exist before the 30/60/90 clock starts. |
| D30 | 2026-09-15 | Research agents | **Two complementary agents** | `keyword-researcher` (demand-driven: DataForSEO volumes/difficulty/competitor gaps → scored keywords) + `topic-cluster-generator` (theme-driven: prompt fan-out → persistent themes → hub-and-spoke architecture + prioritized spoke briefs; spec at `agents/topic-cluster-generator.md`). **Themes are the planning unit; sub-queries are diagnostic only** (~95% zero-volume, 66% one-off across runs). Both share the 4.1 DataForSEO client; observed fan-out uses Gemini Search grounding (`webSearchQueries`) when a key is present, simulated 8-type generation otherwise. |
| D31 | 2026-09-15 | Cluster content model | **Hub = routing page; spokes default 800–2,000 words; no thin pages** | Amends the original pillar model (encyclopedic 3,500–4,500-word pillar) and retires SERP-median word-count targets wherever a spoke brief exists. Evidence (Indig/AirOps): 500–2,000-word posts outperformed 5,000-word guides; 26–50% sub-query coverage beat 100%; position 1 still cited 58% vs 14% at position 10 (so SERP rank keeps mattering, pointed at themes). Hard rule: never one page per sub-query. |
| D32 | 2026-09-15 | Keyword targets | **Human-shaped queries only; sub-queries never become keyword targets** | First live article's primary keyword was a fan-out sub-query string ("privileged access management pam active directory healthcare") that the Editor gate then forced into the lede — a build bug violating the cluster spec's own guardrail. Briefs gain `primary_query_target` (a natural query a person would type, volume-validated once 4.1 Labs endpoints exist, human-editable in the library); the accept flow uses it. Sub-queries shape headings and passages only. |
| D33 | 2026-09-15 | Article structure | **Briefs are coverage contracts, not outlines; Strategist owns narrative; declarative H2s** | The brief's question-phrased H2 outline (spec §9) + D31 precedence produced a FAQ-stack with no thesis, flattening the research's genuinely good discourse analysis. Brief H2 entries become **required passages** (must exist, answer-first, survive extraction); the Strategist builds a thesis-driven narrative arc (concede→pivot open, problem→solution→action, crystallized close — the real Saporo shape) with **declarative H2s; question form only in the FAQ block**. Answer-first first-sentences under every H2 keep the GEO/AIO value. |
| D34 | 2026-09-15 | Citation integrity | **Hard live-verification gate on every cited claim** | The first live article attributed SpecterOps stats to a Quest product page that doesn't contain them (competitor URL, claim nowhere on page), and the Editor's "verification" was circular (article vs research-notes). New code step: fetch every cited URL, cheap-model support check per claim ("quote the supporting passage or NO"), verdicts stored + shown in Review. Unverified claims are cut or replaced; **if verified sources drop below 3, research re-runs**. A stat may only be cited to the page that states it. |
| D35 | 2026-09-15 | Internal links | **Must resolve at gate time; planned siblings are pending-links, not hyperlinks** | First live article shipped 3 links to cluster siblings that don't exist yet (future 404s). Gate step: every internal-domain link must resolve against the articles collection (published/HubSpot URL) or a live HTTP check. Planned cluster siblings are mentioned without hyperlinks and stored as `pendingLinks` on the article doc; Phase 5 backfills them when the sibling publishes. |
| D37 | 2026-09-16 | Citation convergence | **Auto-prune + 3–5 claim budget (amends D34's mechanics, not its bar)** | The strict gate made research a lottery: ~25–30 attributed claims per notes meant one failed verdict anywhere re-ran the whole phase ("fix one, new one fails" observed live). Two changes (Ameya): (1) **auto-prune** — when ≥3 sources survive verification, failing claims are CUT deterministically from the notes (stat/quote bullets deleted, key-claim lines replaced with do-not-cite markers, unreachable sources annotated, never renumbered) instead of re-running research; removals recorded on the report (`pruned`) — D34's "cut or replaced", performed by code. Research still re-runs when verified sources drop below 3. (2) **Claim budget**: researcher attributes 3–5 load-bearing claims total (gate ceiling 8); other sources are background, verified for reachability only. |
| D38 | 2026-09-21 | Competitive corpus storage | **Parsed topic index on the scrape doc; files in the bucket; images off by default** | The scrape doc carries the parsed `topic_index.json` (≈230 KB for a 225-post corpus; on-doc copy trimmed above 4 MB) so the UI and 6.3 digests read one Mongo doc; the raw corpus (manifest, both indexes, every `blog_text/*.md`, scrape.log) lives in storage under `competitive/<scrapeId>/`. Header images are dead weight for gap analysis — opt-in only. Digest consumers exclude the company's own domains, and the digest is marked internal evidence: never citable by the Researcher (D34 stays clean). |
| D39 | 2026-09-25 | Content-plan storage | **New `plans` + `plan_items`, never `clusters`/`themes`** | Reuse fails on five counts, one fatal: `claimClusterRun` matches ANY `clusters` doc with `status:"queued"` regardless of shape, so an imported map would be claimed and run through all nine LLM stages, and `replaceThemes` would delete its themes. Also: `enqueueArticlePipeline` resolves a brief 1:1 by theme name (a map has ~6 articles per subtopic, so only the first would resolve); a map is three levels deep and a cluster is two; `ClusterHub` is one hub per cluster where a map has 5–6; and `ThemeDoc` demands fan-out artifacts (stability, breadth, subQueries) that would be fabricated 84 times. `ArticleDoc.brief` becomes a discriminated union whose cluster arm has an OPTIONAL `source`, so existing docs need no migration and the three production read sites (`workspace.ts:98`, `phases.ts:94`, `cli.ts:438`) are untouched. |
| D40 | 2026-09-25 | Plan slugs | **Reserved and disambiguated at IMPORT, never at enqueue** | `slugify` truncates at 60 chars, which on long sibling titles kills the distinguishing tail (`…-for-healthcare` vs `…-for-financial-services` collapse to the same slug). Plan titles over budget shed filler from the LEFT instead; collisions then disambiguate in three deterministic tiers ending in the workbook's own id, which is unique by construction so the algorithm always terminates. A collision with an EXISTING article is reported, never auto-suffixed — two near-identical URLs is a canonical mess. The property that matters: a collision surfaces in a UI with the operator watching, not as a `SlugTakenError` thrown by the scheduler 300 articles into a multi-week cadence. |
| D41 | 2026-09-25 | Routing pages | **Pillar pages and hubs are first-class, briefed differently, and link DOWN** | `SpokeBrief.internalLinks` gains `children?`, because `{hub, siblings}` cannot express a routing page's own direction. A routing page's required passages are one per child (define, 2–3 sentences, point onward); its band is 1,400–2,000 (pillar) or 1,000–1,600 (hub) — still inside D31, never the retired encyclopedic 3,500–4,500 pillar. Specs amended: `agents/strategist.md` §1.5/§4/§12, `agents/writer.md`. `standards/schema-spec.md` gained CollectionPage + ItemList blocks BEFORE those types were stamped on any article — stamping a type the Schema Builder has no spec for means it improvises or drops it silently. |
| D42 | 2026-09-25 | Cadence scheduler | **Fifth worker loop; the schedule doc's own claim IS the leader election; idempotency lives on the plan item** | Not platform cron (a second deployable that drifts out of sync, with a cold container and a fresh config load per tick) and not `setInterval` (overlaps a slow tick, skips the graceful drain). No leader-election machinery either: the resource needing mutual exclusion is one document, and `findOneAndUpdate` already provides that — the `claimRun` idiom. Each enqueue is a compare-and-set on the ITEM's status, so a duplicated tick finds fewer candidates and a missed one leaves them for the next fire; there is no "did fire #37 run?" bookkeeping to get wrong. `review` unblocks children, not `approved`: requiring approval stalls a 504-article plan behind human approval of 16 pillar pages, which is a human-gated schedule, not the automatic one that was asked for. A throttled fire is **lost, not owed** — deferring accumulates a backlog that dumps the moment review clears, exactly the runaway the cap exists to prevent. `RunDoc` and `claimRun` are untouched: the tick only ever enqueues ready items in sequence order, so plain FIFO is already a valid execution order. |
| D43 | 2026-09-25 | Plan sibling links | **Canonical-URL predictor for same-plan siblings + a strict Phase 5 re-check** | Under "generate to review only" nothing reaches `published`, and `blogsagent` is Mongo-blind, so `LiveLinkChecker` would strip EVERY hub↔spoke link in a 504-article plan — deleting the point of a hub-and-spoke architecture. Resolution gains a third path: a same-`planId` sibling that is already produced AND whose reserved slug reconstructs the link through `blog.canonical_pattern`. Sound only because the sequencing guarantees the hub reaches `review` before the spoke is written — §6 and §8 of the plan are one design. Fails closed without a pattern. **Obligation:** Phase 5.1 must re-verify `article.deferredLinks` strictly before publishing. |
| D36 | 2026-09-15 | Author voice | **context/author-style/ seeded from the two canonical Saporo posts** | The Writer ran on generic defaults because author-style was empty; output read machine-written. Style spec + verbatim exemplars + anti-pattern list built from "Compliance is a starting point…" and "Identity is the new attack surface…" (chosen over full-blog scrape: tighter signal). Voice DNA: declarative H2s, concede-then-pivot openings, short emphatic sentences ("This work is necessary."), assertive/unhedged, we/you address, thesis-crystallizing closes, no question headings, no keyword repetition. |

---

## 3. Current state (what exists today)

Inventory as of Session 1 — this is the engine the web app gets built on:

- **6-phase pipeline** orchestrated by [CLAUDE.md](CLAUDE.md): Researcher → Strategist → Writer → Editor → Schema Builder → Header Designer. Specs in `agents/`, gates enforced between phases.
- **Standards** in `standards/` (SEO, GEO, AIO checklists, schema spec, quality bar with banned phrases).
- **Scripts** in `scripts/` (`new_article.py` scaffold, `validate_schema.py`, `seo_audit.py` — 21-check audit). Stdlib-only.
- **Context system** in `context/` (brand / sales / marketing / finance / author-style) — glob-read by agents, empty folders fall back to defaults.
- **`blogsagent/`** — HubSpot CMS Blogs v3 publisher (markdown → styled HTML + JSON-LD in `headHtml`, draft/live states, ID caching).
- **`blogheaderimagegen/`** — 1200×600 hero generator, 5 patterns, headless Playwright, brand constants hardcoded in `lib/brand.py`.
- **`blogscraper/`** — competitor blog crawler + TF-IDF topic indexer (artisan.co corpus already scraped).
- **14 shipped articles** in `articles/` (pillar + companions cluster, all published as HubSpot drafts, 0 audit failures).

### Known EverWorker hardcodes (Phase 0 hit list) — ✅ all extracted in Session 2

| Location | What's hardcoded |
|---|---|
| `blogheaderimagegen/lib/brand.py` | Brand colors, Gilroy font paths (`~/Documents/pmmadvertisingcreative/...`), both logo SVGs inline |
| `blogsagent/md_to_hubspot/html_builder.py` | Gilroy/black `.ew-post` CSS wrap |
| `blogsagent/.env` + `.config_cache.json` | HubSpot token, blog `content_group_id`, `blog_author_id` (per-company already, but undocumented as config surface) |
| `CLAUDE.md`, `README.md`, agent specs | "EverWorker" naming, `everworker.ai` canonical URLs |
| `standards/quality-bar.md` | Brand-specific ToV bans (zero em-dashes, "AI-powered" ban, etc.) mixed in with generic quality rules |
| `templates/schema-template.json` + `standards/schema-spec.md` | Organization node, publisher, author defaults |
| `scripts/seo_audit.py` | Banned-phrase list duplicated from quality bar |
| `context/` | EverWorker sales PDFs, marketing cluster plan |

---

## 4. Target architecture

```
┌────────────────────────── Railway project (one per company) ──────────────────────────┐
│                                                                                       │
│  ┌─────────────┐     ┌──────────────────────┐     ┌─────────────┐    ┌────────────┐  │
│  │  Next.js     │────▶│  API (Next routes /  │────▶│  MongoDB    │    │  Bucket    │  │
│  │  web app     │◀────│  server actions)     │◀────│  (system of │    │  (header   │  │
│  │  (UI)        │ SSE │                      │     │   record)   │    │   PNGs,    │  │
│  └─────────────┘     └─────────┬────────────┘     └─────────────┘    │   assets)  │  │
│                                 │ job queue                           └────────────┘  │
│                      ┌──────────▼────────────┐                                        │
│                      │  Agent worker service │──▶ Anthropic API (Agent SDK)           │
│                      │  (Claude Agent SDK,   │──▶ Web search (research)               │
│                      │   runs the 6 phases   │──▶ DataForSEO (keyword agent)          │
│                      │   from agents/*.md)   │──▶ HubSpot API (publish)               │
│                      └───────────────────────┘                                        │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

- **Engine specs stay markdown.** `agents/`, `standards/`, `templates/` remain markdown/JSON files — editable in the Admin screen, consumed by both Claude Code (terminal mode) and the Agent SDK worker (web mode).
- **Company config** is a single declarative surface (`config/company.yaml` + `config/brand-assets/`) that every component reads. The Configurator agent writes it.
- **Pipeline state machine** per article: `queued → research → outline → write → edit → schema → design → review → approved → publishing → published` (+ `failed`, `paused`). Each stage's artifact is persisted to Mongo as it completes.

### Core Mongo collections (draft)

| Collection | Holds |
|---|---|
| `companies` | Company config snapshot, HubSpot IDs, brand tokens (single doc in v1, keyed by `company_id` per D1) |
| `keywords` | Keyword/topic library: text, source (`chat` / `csv` / `agent`), volume, difficulty, priority, status (`idea → queued → in_production → in_review → published → archived`), cluster/pillar links |
| `articles` | One doc per article run: slug, stage, all markdown artifacts (research-notes, outline, draft, edited draft), meta, schema JSON, audit results, HubSpot post id/url, timestamps |
| `runs` / `events` | Pipeline job execution log + streamed status events (powers the Work tab) |
| `settings` | Auth secret, API key references, feature flags |

---

## 5. The web app — screen map

Side navigation (top to bottom):

### 5.1 Target Keywords
The keyword/topic library as a first-class screen. Sortable, filterable table: keyword, source, Google volume, AI search volume, difficulty, search intent, composite priority score (D22, human-overridable), status, linked article. Bulk actions (prioritize, archive, send to pipeline, refresh metrics).

### 5.2 Content Strategy — 4 invocation modes (horizontal tabs)
| Tab | What it does |
|---|---|
| **Chat** (default) | Natural-language invocation with tooltips mirroring README "How to invoke" patterns ("Write an article about X…", outline paste, target keyword). Kicks off pipeline runs. |
| **Upload Keywords** | CSV upload → parsed, deduped against library → rows land in `keywords` with source=`csv` → user confirms which to queue. |
| **Research** (was "Use Agent") | The research workspace (Phase 4): (a) run either agent (D30) — **Keyword Researcher** (demand-driven keywords) or **Topic & Cluster Generator** (themes → hub-and-spoke architecture → spoke briefs, reviewed in a theme table + cluster view) — watch progress, accept/reject outputs into the library; (b) manual research tools — run Keywords For Site / Related / Suggestions / Ideas / competitor lookups (DataForSEO Labs) directly, browse results in tables, select → append to library. |
| **Select** | The staging table: multi-select keywords/topics/ideas from the library → "Send to pipeline" for batch production. Sortable/filterable, shows current stage per row. |

### 5.3 Production (Research → Outlines → Drafts → Publish)
| Tab | What it does |
|---|---|
| **Work** | Live board of everything in flight, grouped/filterable by stage (`research / outline / write / edit / schema / design / review / publish`). Click a stage filter to see its queue. Streams agent status in real time. |
| **Review** | Article-by-article review UX. Default view = **edited draft** (the thing awaiting approval) in a **markdown editor + live preview** (D7). Sidebar switches to research notes, outline, first draft, audit report, header image. Actions: save edits, request re-run of a phase, **Approve for publish**. |

### 5.4 Articles
Library browser over everything ever produced: navigate article "folders", open any artifact (article, research, outline, schema, header), read rendered or raw. Status + HubSpot link when published.

### 5.5 Admin (horizontal tabs)
| Tab | What it does |
|---|---|
| **Standards** | View/edit the `standards/*.md` files directly as markdown. |
| **Templates** | View/edit `templates/article-template.md` + schema template; add new templates. |
| **Context** | Manage `context/` folders (brand, sales, marketing, finance, author-style) — upload/edit docs, see what's empty. |
| **Agents** | View/edit the `agents/*.md` phase specs. |
| **Competitive** | Run `blogscraper/` against a competitor URL, browse scraped corpora + topic indexes, feed gaps into the keyword agent. |
| **Company Setup** | The Configurator surface in the web app: config values, brand assets, HubSpot connection status, re-run Configurator. |
| **Models** (Phase 10) | Per-agent model dropdown (all eight agents, fed from the model registry), invocation route per agent, instance batch-mode default, caching status, and the cost dashboard: per-phase/per-article spend, escalation counts, cache-hit savings. |

### 5.6 Reporting (Phase 8+, new side-nav item) — horizontal tabs
| Tab | What it shows |
|---|---|
| **Awareness** | One monthly time-series chart: **articles published is the always-on base series**; toggleable overlay series — website traffic, blog traffic, organic-search traffic, AI-referral traffic, referral traffic. |
| **Pipeline** | Deals **sourced** (a contact associated with the deal has a qualifying touchpoint: organic search or a blog article) vs deals **influenced** (a contact at the deal's associated account has a qualifying touchpoint). |
| **Cohorts** | Touched vs untouched deal cohorts compared on stage→stage conversion (survivorship-correct), stage velocity (mean days), deal counts + furthest-stage-reached. |
| **Leads & Accounts** | Sortable/filterable tables of contacts and of accounts with touchpoints by source (organic search / blog / AI referrals) + toggleable time-series charts. |
| **Search Visibility** (Phase 9) | Google SERP positions AND AI-engine share-of-voice, company vs competitors, on the shared tracked-phrase list (D23); lift over time with published-article overlay; phrase + competitor config. |

---

## 6. Build phases

Checkboxes get ticked as sessions complete work. **Bold** = the active phase.

### Phase 0 — Company configurability (engine portability) — ✅ DONE (Session 2, full-article E2E deferred to 1.4)
Goal: zero EverWorker hardcodes; the engine runs for any company from one config surface.

- [x] 0.1 Design `config/company.yaml` schema: identity (name, domain, blog base URL, canonical pattern), brand (colors, font files, logo SVGs), voice/ToV overrides (company-specific banned phrases, style rules), HubSpot (env-ref'd token, `content_group_id`, `blog_author_id`), author (name, bio, `sameAs` URLs), schema Organization details
- [x] 0.2 `config/brand-assets/` convention (fonts dir, logos dir) + loader (`scripts/company_config.py`, stdlib-only; `COMPANY_CONFIG` env var overrides the path)
- [x] 0.3 Refactor `blogheaderimagegen/lib/brand.py` to read config + assets (fallback: system font stack when no licensed font provided; text wordmark when no logo SVG; decorative glows derived from accent colors)
- [x] 0.4 Refactor `blogsagent` (html_builder styles + client IDs + author name) to read config
- [x] 0.5 Split `standards/quality-bar.md`: generic machine-checked list now in `standards/banned-phrases.txt` (single source for `seo_audit.py`); brand ToV (em-dash ban, "AI-powered" ban) moved to `config/company.yaml` `voice.*`
- [x] 0.6 Parameterize `templates/schema-template.json` (config-key-annotated placeholders), `standards/schema-spec.md` examples (fictional Example Co / example.com)
- [x] 0.7 De-brand `CLAUDE.md` + agent specs + standards + context/README + tool READMEs (company values read from config)
- [x] 0.8 Acceptance test (smoke-level): fictional "Acme Robotics" config via `COMPANY_CONFIG` → header gen (all 5 patterns, fallback font + wordmark), publisher dry-run (config styles/author), audit banned-phrase merge — `grep -ri everworker` over all outputs clean; EverWorker output verified byte-identical pre/post refactor. **Full write-an-article-as-second-company E2E folded into Phase 1.4 (real onboarding).**

### Phase 1 — Configurator agent — ✅ built; 1.4 closeout parked until after 2.8
Goal: "Configure this for company X" is a single agent invocation.

- [x] 1.1 `agents/configurator.md` spec + `/configure-company` Claude Code skill (`.claude/skills/configure-company/SKILL.md`)
- [x] 1.2 Flow: interview (company URL, blog URL, HubSpot token, author) → web-research the company (positioning, ICP, voice — pattern: sdr-library-builder skill) → write `company.yaml` → seed `context/brand|sales|marketing/` docs → validate HubSpot (resolve + cache blog/author IDs, list existing posts) → brand-asset checklist (fonts/logos to drop in) → optional smoke-test article. HubSpot step backed by new `scripts/validate_hubspot.py` (stdlib-only; tested green against live EverWorker portal)
- [x] 1.3 Re-run safety: idempotent, diffs shown before overwrite — spec'd (marker-owned context seeds, config diffs, never-delete rule); proven for real in 1.4
- [ ] 1.4 Onboard company #2 for real using only the agent — **run 2026-09-14 for Saporo (saporo.io) via `/configure-company`:** config written (EverWorker backed up to `config-everworker/`), 5 context docs seeded, brand assets cleared/checklisted, EverWorker context PDFs + cluster plan removed by Ameya, header smoke test passed (all 5 patterns in Saporo brand; wordmark + fallback-font degradation verified; stat-highlight confirmed stat-titles-only by design). **Remaining steps below are deliberately DEFERRED until after the Railway deploy (Phase 2.8)** — decided 2026-09-14:
  - [ ] (post-deploy) Set `SAPORO_HUBSPOT_TOKEN` → `python3 scripts/validate_hubspot.py` green → write resolved `content_group_id`/`blog_author_id` into `company.yaml`
  - [ ] (post-deploy) `config/brand-assets/logos/` — official mark at https://framerusercontent.com/images/H8RAlrLpCdNeHTGDRQy2IUeGNs.svg (129×129, monochrome black paths) → save as `logo-light-bg.svg` + white-recolored `logo-dark-bg.svg` (fill swap). Until then: text wordmark
  - [ ] (post-deploy) `config/brand-assets/fonts/` — Inter (free, OFL, https://rsms.me/inter/): drop in `Inter-Regular/Medium/SemiBold/Bold/ExtraBold/Black` `.ttf`. Until then: fallback stack
  - [ ] (post-deploy) Review 5 seeded context docs, delete marker lines to take ownership. Four Saporo-cited market stats (80% / 90% / 94% / 292 days) need primary sources before any article cites them
  - [ ] (post-deploy) Replace `organization.logo_url` (currently the site's 180×180 touch icon) with an official square logo
  - [ ] (post-deploy) Smoke-test article through all six phases — closes 1.4 and the full-article E2E deferred from 0.8

### Phase 2 — Data layer + pipeline service — ✅ built (2.1–2.7, Session 4); 2.8 deliberately DEFERRED until after Phase 3 (decided 2026-09-14)
Goal: the engine runs headless on a server with state in Mongo.

- [x] 2.1 Repo restructure into monorepo (`apps/web` placeholder, `apps/worker`, `packages/engine`; npm workspaces per D14; engine spec dirs stay at root so terminal mode keeps working — existing tools untouched)
- [x] 2.2 Mongo schemas + data-access layer (`packages/engine`: articles/runs/events/keywords/companies/settings collections per §4, typed DAL, indexes incl. unique `{companyId, slug}` and `{runId, seq}`)
- [x] 2.3 Agent worker: Claude Agent SDK service running the 6 phases from `agents/*.md` (spec = system prompt, `settingSources: []` so CLAUDE.md is NOT loaded — the worker is the orchestrator); per-phase gates enforced in code (`gates.ts`, from the CLAUDE.md gate conditions + real shipped-artifact formats); gate failure re-runs the phase with GATE FEEDBACK appended (max 2 attempts); artifacts persisted per stage (D11); WebSearch/WebFetch enabled for Researcher, Bash only for Schema Builder + Header Designer
- [x] 2.4 Canonical checks as worker steps per D12: `seo_audit.py` after Edit (json-ld/schema failures excluded — they're Phase 5's) and again after Design (final, stored on the article doc), `validate_schema.py` after Schema; PASS/WARN/FAIL parsed into structured `ScriptReport`s
- [x] 2.5 Job queue: lease-claim via `findOneAndUpdate`, heartbeat, expired-lease reclaim, retry with resume-from-failing-phase (completed phases never re-run), `WORKER_CONCURRENCY` cap, graceful SIGTERM; append-only `events` stream with per-run seq (SSE primitive for Phase 3)
- [x] 2.6 Header generation in worker: Design phase runs the `blogheaderimagegen` CLI (venv python locally / `HEADERGEN_PYTHON` venv in the Docker image), PNG + HTML uploaded via storage adapter (local dir dev / S3-compatible Railway bucket)
- [x] 2.7 Importer: `import-articles` CLI backfills `articles/` folders into Mongo (idempotent, `--update`/`--dry-run`/`--audit`; verified against the real corpus: 15 folders incl. the one-shot 2026-05-05 article). Run it against the real Railway Mongo after 2.8.
- [ ] 2.8 Deploy skeleton to Railway (worker + Mongo + bucket) — **artifacts ready** (root `Dockerfile`: Node 22 + Python + Playwright Chromium; `railway.json`; `.env.example`; `.dockerignore`); **DEFERRED (Ameya, 2026-09-14): build Phase 3 (web app) first, deploy the whole thing to Railway after.** The two prerequisites move with it: (a) Anthropic auth for live agent runs (`ANTHROPIC_API_KEY` or `claude login`), (b) Railway provisioning approval (billable). At deploy time: set `ANTHROPIC_API_KEY`, map Mongo URL, bucket S3 vars; run the importer; live-smoke one enqueued article.
  - Verification status: 18 tests green — gates/parser units, queue lifecycle on mongodb-memory-server, full 6-phase pipeline E2E (fake agents, REAL python gates), importer on the real corpus. SDK invoker live-smoked: spawns/streams/errors correctly, but local run blocked on auth (CLI OAuth expired, no `ANTHROPIC_API_KEY` in env) — works either way once a key is set.

### Phase 3 — Web app shell + core screens — ✅ built (Session 5); deploy rides with 2.8
Goal: the five-screen app from §5, wired to real data.

- [x] 3.1 Next.js app scaffold (`apps/web`: Next 16 + Tailwind v4, D17), side nav shell, auth-light gate (D5: APP_PASSWORD → HMAC cookie; unset = open for dev), local dev Mongo story solved (D15). Railway deploy moved to the combined post-Phase-3 deploy with 2.8.
- [x] 3.2 Target Keywords screen: status-filter chips with counts, search, inline add, selection + bulk actions (send to pipeline / prioritize / mark queued / archive / unarchive), linked-article column
- [x] 3.3 Content Strategy › Chat tab: NL invocation → queued pipeline run (smart-intake parser per D16 — topic + trailing `target keyword "…"` picked up), example-prompt panel mirroring the README invocation patterns
- [x] 3.4 Content Strategy › Upload Keywords tab: client-side CSV parse (papaparse; keyword/volume/difficulty/priority headers or headerless), dedupe against the library, confirm table → source=csv, status=idea
- [x] 3.5 Content Strategy › Select tab: staging table (idea/queued keywords) → multi-select → batch send to pipeline (article + run per keyword, keyword → in_production with articleId link). Use Agent tab is an explicit Phase-4 placeholder.
- [x] 3.6 Production › Work tab: live board grouped by stage with stage-filter chips, per-card run status (attempt, phase, cost), recent-activity event feed; `/api/events` SSE tail of the events collection triggers throttled server-data refreshes. (Verified live with enqueue events; streaming from a real worker run exercises at the 2.8 deploy.)
- [x] 3.7 Production › Review tab: queue list + per-article review page — markdown editor with live preview (D7), sidebar tabs (research / outline / first draft / audit + schema-validation reports / header image / run history incl. gate problems + per-phase cost), Save, Approve-for-publish (review-stage only, blocked while dirty), re-run-from-phase (blocked while a run is active)
- [x] 3.8 Articles library: stage filters, audit status, HubSpot link column, per-article artifact browser (rendered article / research / outline / schema / meta / header)
- [x] 3.9 Admin: Standards / Templates / Agents / Context file editors over the real repo files (path-contained, save-guard confirm) + read-only Company tab (company.yaml). Web edits and terminal mode read the same files (D10).
  - Verification: web app typechecks + production build green; full flow clicked through in the browser against dev Mongo seeded by the importer (14 imported articles) — chat enqueue → Work board card + event feed, keyword add → select → send-to-pipeline → run queued, review editor + header image served via `/api/storage`, admin editor on `standards/quality-bar.md`. Engine/worker suites still green (18 tests).

### Phase 4 — Keyword & topic research: two agents + research workspace
Goal: strategic research through **two complementary agents** (D30) — the **Keyword Researcher** (demand-driven: volumes, difficulty, competitor gaps from DataForSEO) and the **Topic & Cluster Generator** (theme-driven: prompt fan-out → persistent themes → hub-and-spoke architecture + spoke briefs; spec: [agents/topic-cluster-generator.md](agents/topic-cluster-generator.md)) — plus manual tools, all feeding one prioritized library. Docs: [Labs Google overview](https://docs.dataforseo.com/v3/dataforseo_labs/google/overview/), [AI keyword volume live](https://docs.dataforseo.com/v3/ai_optimization/ai_keyword_data/keywords_search_volume/live/).

**4A — Shared infrastructure**
- [ ] 4.1 DataForSEO client in `packages/engine`: auth, per-call cost logging (shared budget ledger with Phase 9), sandbox mode for tests, rate limiting (2,000/min, ≤30 concurrent). **Client core landed with 4C (Session 11):** `packages/engine/src/dataforseo.ts` — basic auth, sandbox host switch, serialized rate limiting, `api_costs` Mongo ledger, and the 4C endpoint slice (SERP Google Organic Live Advanced incl. PAA + AI Overview flag; AI Optimization LLM Responses Live per engine). Remaining: the Labs Google endpoint families below + AI keyword volume. Endpoint coverage, all Live-method **Labs Google**:
  - *Keyword research:* Keywords For Site, Related Keywords, Keyword Suggestions, Keyword Ideas, Keyword Overview (volume/CPC/competition/SERP metrics), Bulk Keyword Difficulty, Search Intent, Historical Keyword Data
  - *Market analysis:* Categories For Domain, Keywords For Categories, Domain Metrics By Categories, Top Searches
  - *Competitor research:* Ranked Keywords, Competitors Domain, SERP Competitors, Domain Intersection, Domain Rank Overview, Relevant Pages, Bulk Traffic Estimation
  - *AI volume:* AI Optimization → AI Keyword Data → `keywords_search_volume/live` (`ai_search_volume` + 12-month trend, ≤1,000 keywords/call)
- [ ] 4.2 Primary market (D21): `company.yaml` `market: {location_code, language_code}` — Configurator sets it; all keyword calls use it; metrics stored keyed by market. *(Read side landed with 4C: `marketFromConfig()` reads it with a 2840/"en" default; Configurator write-side + metric keying remain.)*
- [ ] 4.3 Keyword enrichment: append Google volume, difficulty, CPC/competition, search intent, AI search volume (+ both 12-month trends) onto library keywords; on-demand refresh (UI bulk action) + refresh-on-stale during agent runs
- [ ] 4.4 Composite priority score (D22): blend of Google volume, AI volume, inverse difficulty, agent relevance-to-ICP (0–100 + one-line rationale); human override sticks; score visible/sortable in Target Keywords + Select tables

**4B — Agent option 1: Keyword Researcher (demand-driven)**
- [ ] 4.5 `agents/keyword-researcher.md` spec: seed from company config + context + own-domain footprint (Keywords For Site, Ranked Keywords) + competitor gap analysis (Competitors Domain, Domain Intersection, blogscraper topic indexes) → expand (Suggestions / Ideas / Related) → enrich (4.3) → dedupe against library + published articles → score (4.4) → land in library as status=idea with rationale

**4C — Agent option 2: Topic & Cluster Generator (theme-driven, D30/D31)**
- [x] 4.6 Spec v1 committed at `agents/topic-cluster-generator.md` (Session 9): seed → entity/term map + 6–8 realistic prompts → fan-out (8 sub-query types, K=5 varied runs) → theme clustering (stability/breadth, core ≥0.6 / secondary 0.3–0.59 / noise <0.3) → question mining → SERP + AI-surface validation → gap map → 45-point prioritization → hub/spoke architecture → spoke briefs. Evidence basis documented in the spec's "Design rationale." (CLAUDE.md file-map entry lands with the build wiring.)
- [x] 4.7 Fan-out engine in the worker (Session 11): prompt conversion + sub-query generation across the 8 types, K=5 varied runs (rotating framings), every sub-query logged {promptId, run, type, source}. **Observed mode** when `GEMINI_API_KEY` is present (`GeminiFanoutObserver`: Search grounding → `webSearchQueries`, tagged `observed:gemini`, types classified in one cheap call); **simulated mode** otherwise. Direct Messages API route (D25, fetch-based `AnthropicLlmClient`); bulk generation on `CLUSTER_FANOUT_MODEL` (default Haiku 4.5, D26). Generations persist progressively per prompt
- [x] 4.8 Theme clustering + scoring (Session 11): LLM groups by underlying need (indexes only); code computes `stability = distinct runs ÷ K`, `breadth = distinct types`, tiers per thresholds (`packages/engine/src/cluster/scoring.ts`) — the model is never trusted with the math
  - **Build directive honored:** 23 engine tests (stability/tiering/45-point math/architecture rules/parsers/output schema) + a full 9-stage worker E2E with a fake LLM and real math/gates ran green before any API spend
- [x] 4.9 Validation inputs (Session 11): PAA mining + SERP checks (top-5 format/depth/freshness/gaps analysis) via the 4.1 client slice; AI-surface checks via LLM Responses (chat_gpt + gemini) per D24, observations recorded per-surface on the theme. **Degrades honestly:** without DataForSEO creds validation records `skipped`, questions fall back to LLM proposals labeled `simulated`, and openness is forced to neutral 3 with a "no AI-surface data" rationale (never fabricated). Cost guards: `CLUSTER_MAX_VALIDATIONS` (default 5), 1–2 SERP checks per theme
- [x] 4.10 Gap map (Session 11): themes vs the content inventory (`articles` collection — titles/slugs/HubSpot URLs) → owned(0)/buried(3)/missing(5) + non-blog/off-site flags; unmapped themes default to missing. (HubSpot-posts side of the inventory still rides on the Phase 5 status sync / open question)
- [x] 4.11 Prioritization + architecture (Session 11): 45-point score computed in code from LLM-judged decisiveness/right-to-win/openness (one-line rationales) + code-derived gap and stability; `rightToWin ≤ 2` ⇒ `awarenessPlay` flag. Architecture hard rules enforced in code with one feedback retry (no noise spokes, no single-sub-query pages, sections need real parent spokes, ≥1 spoke); hub stored as routing page (title + 2–3-sentence theme summaries); sibling links restricted to code-computed vocabulary-overlap candidates
- [x] 4.12 Pipeline integration (Session 11): `clusters` + `themes` + `cluster_events` + `api_costs` collections; cluster runs are lease-claimed jobs (same pattern as `runs`) with stage-level resume; final output assembled into the spec's JSON schema and gated by `validateClusterOutput`. `cluster-accept` (CLI) / `acceptSpokeBrief` land briefs in the library (status `idea`, source `agent`, linked clusterId/themeId, priority = theme score); **send-to-pipeline passes the brief to the Strategist**: `enqueueArticlePipeline({themeId})` stamps `article.brief`, the workspace writes `brief.md`, the outline prompt + `agents/strategist.md` §4 + `standards/seo-checklist.md` word-count item all yield to the brief's length band (D31), hub articles get routing-page treatment. Web Select-tab send passes `themeId` automatically. Worker CLI: `cluster-enqueue/status/show/events/accept`

**4D — Research workspace UI + cost**
- [ ] 4.13 Research tab (§5.2): agent picker (**Keyword Researcher | Topic & Cluster Generator**) + manual mode (user runs Keywords For Site / Related / Suggestions / Ideas / competitor lookups directly; results in sortable tables; multi-select → append to library). Cluster runs get a dedicated review UI: theme table (tier / stability / scores / gap / architecture), hub-and-spoke view, spoke-brief cards with accept/reject into the library. **Cluster half SHIPPED (Session 12):** Research tab (replaces "Use Agent") with the Topic & Cluster Generator launcher, live cluster-runs table, and the full run/review page — 9-stage progress strip, live SSE event feed (`/api/cluster-events`), theme table with tier/stability/breadth/gap/score/architecture + awareness-play/question-mined flags, hub card, ranked spoke-brief cards with **Accept → library / Accept & queue article / Dismiss-Restore** (accept-and-queue attaches the brief per 4.12). Remaining: manual DataForSEO tools (needs 4A) and the Keyword Researcher picker option (needs 4B)
- [ ] 4.14 Cost controls: per-call cost ledger in Mongo **(ledger shipped with 4C: `api_costs`, verified live in sandbox)**, monthly DataForSEO budget cap in settings, spend surfaced in the UI; fan-out re-runs rate-limited to quarterly per seed (spec guardrail — theme drift is slow, query churn is noise)

### Phase 4Q — Article quality hardening — ✅ DONE (Sessions 15–16, acceptance-tested)
Goal: the four defect classes from the first live batch review (Session 14) can never recur: stuffed keywords, thesis-free FAQ-stack structure, unverified/hallucinated citations, dead internal links. Decisions D32–D37. **Acceptance evidence (Session 16): all four articles re-ran through the hardened pipeline and landed in Review — body question-H2s 8/9/2 → 0, every citation live-verified (10–12 sources/article), internal-link 404s 3 → 0, natural query keywords, audits 21/0/0.**

- [x] 4Q.1 **Keyword targeting (D32):** `SpokeBrief` + spec §9 gain `primary_query_target` — a natural query a person would type, generated at brief time with 2–3 alternates; `acceptSpokeBrief` uses it for the library keyword (sub-queries never leak into `targetKeyword` — enforce in code, not convention); human-editable in the keyword library before send; wire volume validation via DataForSEO when 4.1's Labs endpoints land. Editor/audit "keyword in first 100 words" checks reworded to require **natural** inclusion (no contorted ledes).
- [x] 4Q.2 **Narrative structure (D33):** amend `agents/topic-cluster-generator.md` §9 (H2 outline → "required passages": each must exist somewhere in the article, answer-first, extraction-survivable), `agents/strategist.md` (outline must open with an explicit **thesis statement** carried from the research's discourse analysis — outline gate checks for it; declarative H2s; question form only in FAQ; Saporo arc: concede→pivot open, problem→solution→action, thesis-crystallizing close), `agents/writer.md` (write an essay with extractable passages, not an answer farm), `standards/geo-checklist.md` (answer-first passages under declarative H2s replace question-shaped-header pressure). Re-check `standards/aio-checklist.md` for the same pressure.
- [x] 4Q.3 **Citation verification step (D34, hard gate):** new worker code step after research — parse every claim + URL from `research-notes.md`, fetch each URL, cheap-tier support check per claim (quote the supporting passage or NO); verdicts stored on the article doc (`citationChecks`) + surfaced in the Review sidebar; unverified claims cut or replaced; **< 3 verified sources → research re-runs with the failed-verification feedback**; re-verify at edit for every URL cited in the body. `agents/researcher.md` hardening: a stat may only be cited to the page that states it (never org A's research via org B's marketing page — the SpecterOps/Quest failure), every claim carries a verbatim supporting quote, paywalled/unfetchable → marked unverifiable and unusable for body claims.
- [x] 4Q.4 **Internal-link validation (D35):** gate step at edit/design — every internal-domain link resolves against the articles collection (published + HubSpot URL) or a live HTTP check, else the gate fails. Brief sibling/hub links that aren't published yet render as plain mentions and land in `pendingLinks` on the article doc; Phase 5 backfills them on sibling publish.
- [x] 4Q.5 **Author voice (D36):** build `context/author-style/` from the two canonical posts — style spec (voice DNA from Session 14), verbatim exemplar passages, anti-pattern list (no question H2s, no keyword repetition, no hedging, no AI-listicle cadence); Writer + Editor specs point at it explicitly.
- [x] 4Q.6 **Baseline re-run (Session 16):** baselines snapshotted on each article doc (`baseline` field), all three re-run through the hardened pipeline + Ameya's "attack path analysis" from the app. Diff vs baseline: titles/keywords natural (e.g. "privileged access management healthcare" replacing the stuffed string), body question-H2s 8/9/2 → **0**, citations unverified → **10–12 live-verified per article** (PAM: 2 auto-pruned), internal links 3 future-404s → **0 missing**, audits stayed 21/0/0 — proving the mechanical audits were never the quality bar; the truth/voice layers were the difference. Gate catches observed live during the run: writer-added unverified MITRE link (stripped), article self-link future-404 (de-linked), claim-budget trims, prune of two unsupportable superlatives.

### Phase 4P — Content plans + cadence (operator-authored plans, produced unattended)
Goal: hand the system a spreadsheet of planned articles and have it produce them in dependency-correct priority order, on a cadence, unattended. Decisions D39–D43. Built Session 18; **live verification deliberately held pending Ameya's go-ahead.**

- [x] 4P.1 Engine types + collections: `plans` / `plan_items` / `plan_events` / `schedules`, the `ArticleBrief` discriminated union (migration-free), `SpokeBrief.internalLinks.children`
- [x] 4P.2 Dependency-free workbook reader — `plan/zip.ts` + `plan/xlsx.ts`. `exceljs` was installed, flagged by `npm audit` (vulnerable `uuid`, only fix a breaking downgrade) and removed; Node's `zlib` plus ~100 lines of ZIP container parsing replaced it. Engine dependencies unchanged, `npm audit` clean. ZIP64/encrypted archives and a renamed `.xls` fail loudly
- [x] 4P.3 Column + facet mapping with alias auto-detection and operator override (`plan/mapping.ts`), so a differently-shaped map needs no code change
- [x] 4P.4 Row normalization + taxonomy extraction, joined BY NAME (the only columns an arbitrary map is guaranteed to have)
- [x] 4P.5 Import-time slug reservation (D40) and D32 query-target derivation, with `needsQueryTarget` surfaced for human repair
- [x] 4P.6 Deterministic brief synthesis: length band from Format × Page Role, evidence as REQUIREMENTS only, links from the tree, rendered through the existing `renderBriefMarkdown`
- [x] 4P.7 LLM brief enrichment (`agents/plan-brief-enricher.md`, cheap tier, fourth worker queue). D34 enforced in CODE (`plan/parse.ts`): any figure, date or URL in evidence is rejected, as is a proprietary claim outside the concept list or a link outside the plan. One retry with feedback, then the deterministic brief stands — an item is producible in every state
- [x] 4P.8 Sequencing: the plan's own priority rule plus a parent-promotion pass; every promotion reported so an operator sees where structure overrode priority
- [x] 4P.9 Scheduler (D42): `schedule/tick.ts` + fifth worker loop, reconcile sweep, hard brakes (consecutive failures, budget, volume) and soft brakes (in-flight, review queue, weekly cap), item-level retry backoff, slug-conflict parking, `--dry-run`
- [x] 4P.10 Web: Content Plans side-nav item, upload → mapping/report review → commit, board (progress, in-production, "Needs you" with subtree sizes), cadence form with a real projection, 504-row articles table with per-row escapes, `/api/plan-events` SSE
- [x] 4P.11 Spec amendments: `agents/strategist.md`, `agents/writer.md`, `standards/schema-spec.md` (CollectionPage + ItemList)
- [ ] 4P.12 **HELD — live verification.** Import the real workbook, enrichment on one pillar, `schedule-tick --dry-run` over a simulated fortnight, then wave 0 only (16 pillar pages, `WORKER_CONCURRENCY=1`) and read them before widening scope
- [ ] 4P.13 **HELD — link predictor (D43)** + `recordPublished`. Only meaningful once 4P.12 has produced hub pages
- [ ] 4P.14 Deferred: real demand data on plan items (needs 4A DataForSEO Labs); the workbook itself says volume/KD must be layered in before final sequencing

### Phase 5 — Publish integration (HubSpot in the UI)
Goal: Approve → published draft → go-live, all from the Review tab.

- [ ] 5.1 Port `blogsagent` publish flow into worker (including the /tmp adapter logic: strip json-ld fence + edit summary, inject schemas into frontmatter)
- [ ] 5.2 Hero image upload to HubSpot Files API → set `featuredImage` (closes the known manual-upload gap)
- [ ] 5.3 Approve action → HubSpot draft; Go-live action → `state: PUBLISHED`; scheduled publishing (per-week drip) optional
- [ ] 5.4 Status sync back (post id, url, state) into `articles` + keyword library

### Phase 6 — Competitive module — ✅ DONE (Session 17; 6.3's keyword-agent half rides with 4B)
Goal: blogscraper becomes a UI feature feeding strategy.

- [x] 6.1 Scraper as worker job (URL in → corpus + topic index in bucket/Mongo) — third lease-claimed queue (`scrapes` + `scrape_events`, same claim/heartbeat/stage-resume semantics as clusters); runner shells out to `blogscraper/scrape_blog.py` (workspace `outputs/scrapes/<id>/`, blogscraper's own manifest gives same-machine resume; missing workspace on retry → honest re-crawl) then `tools/build_topic_index.py`; parsed `topic_index.json` stored on the scrape doc (D38), corpus + indexes uploaded under `competitive/<scrapeId>/`; CLI `scrape-enqueue/status/events/import` (`scrape-import` backfills an existing corpus folder — artisan.co's 225 articles imported); Dockerfile ships a `/opt/scraper-venv` (`SCRAPER_PYTHON`); live-smoked through the real queue (saporo.io, 3 articles, sitemap discovery, no browser needed on the Framer site)
- [x] 6.2 Admin › Competitive UI: run form (URL + browser mode + max-articles + images toggle) → land on the run view; live runs table + 3-stage progress strip + `/api/scrape-events` SSE; detail view browses corpus stats, content-mix chips, top-topics table, posts table, raw files via `/api/storage` (prefix allowlist widened to `competitive/`); verified in the browser against the imported artisan corpus + the live saporo run
- [x] 6.3 Wire topic indexes into ~~Keyword Research agent +~~ Researcher phase as gap-analysis input — `buildCompetitorGapDigest` (engine) renders the freshest succeeded scrape per domain into one compact digest; the pipeline materializes it as `articles/<folder>/competitor-gaps.md` (researcher prompt + `agents/researcher.md` §10 point at it, explicitly non-citable), and the cluster agent's gap-map stage inlines the same digest beside the own-content inventory; own domains excluded via `ownDomainsFromConfig` (a scrape of the company's own blog never masquerades as competitor coverage). The Keyword Researcher consumes the same digest when 4B builds it.

### Phase 7 — Saporo live run + optimization (the 30/60/90 window)
Goal: the engine runs for Saporo in staging and gets measurably better and cheaper across a 30/60/90-day optimization cadence.

- [ ] 7.1 First real production batch for Saporo: keywords → pipeline → review → publish. Capture the optimization baseline: per-phase cost/usage, gate-retry rates, audit WARN/FAIL rates, size of Ameya's review edits per article
- [ ] 7.2 Optimize content writing + research: tune `agents/*.md` specs and `context/` docs from real Saporo output (research source quality + depth, outline sharpness, voice adherence); each review cycle, feed the human edit patterns back into specs/context so the next batch needs fewer edits
- [ ] 7.3 Optimize the header image pipeline: Saporo-brand pattern quality, auto-pick accuracy on real titles, new patterns if Saporo's title shapes demand them; real logo SVGs + Inter font files in place (finishes the 1.4 asset items)
- [ ] 7.4 Optimize model usage + cost efficiency using the Phase 10 tooling (built before this window, D29): right-size the model matrix from real per-phase cost/quality data + escalation counts, trim spec/prompt token overhead, tune caching and Economy-mode usage, set per-article budget caps (closes the §8 budget-cap open question)

### Phase 8 — Reporting & ROI
Goal: prove awareness + pipeline impact from HubSpot data. "Reporting" joins the side nav (§5.6).

- [ ] 8.1 Reporting backend: **Python nightly sync keyed on HubSpot IDs** → Mongo reporting collections (published posts ↔ `articles`, traffic analytics by source, contacts, companies, deals + associations, deal-stage timestamps). Idempotent upserts, historical backfill first run, then nightly cron (Railway cron/worker schedule)
- [ ] 8.2 Attribution model (D18): touchpoint = qualifying contact-level source signal — original/latest source ∈ {organic search, referral, AI referral} or a blog URL in first/last page seen. AI-referral classification via referrer/source domain list (chatgpt.com, perplexity.ai, gemini.google.com, claude.ai, copilot.microsoft.com, …) wherever HubSpot's native AI-source category isn't present. Store per-contact `touches[]` so event-level data can slot in later without rework
- [ ] 8.3 Awareness tab: single monthly time-series chart — articles published always on as the base series; toggleable overlays: website traffic, blog traffic, organic-search traffic, AI-referral traffic, referral traffic
- [ ] 8.4 Pipeline tab: **deals sourced** (a contact associated with the deal has a qualifying touchpoint) and **deals influenced** (a contact associated with the deal's associated account has a qualifying touchpoint); counts + amounts, filterable by period/pipeline
- [ ] 8.5 Cohort comparison: **Cohort 1** = deals with any qualifying touch (blog OR organic search OR AI referral OR referral) on a contact-on-deal OR a contact at the deal's associated account OR the associated account itself; **Cohort 2** = deals with none. Compare: stage→stage conversion rates with **survivorship-correct denominators** (a stage's conversion only counts deals that exited that stage or closed — deals still open in the stage are excluded), stage velocity (mean days per stage), deal counts, furthest-stage-reached distribution
- [ ] 8.6 Leads & Accounts tab: contacts table + accounts table, each filterable by touchpoint source (organic search / blog / AI referrals), sortable/filterable; toggleable time-series of newly touched contacts/accounts per month
- [ ] 8.7 Reporting UI shell: side-nav item + tabs (Awareness / Pipeline / Cohorts / Leads & Accounts), one shared toggleable-series time-series chart component

### Phase 9 — Search visibility: Google SERP + AI/LLM
Goal: measure the company's visibility in BOTH Google search and AI engines, vs competitors, on the tracked-phrase list — and show the lift. Docs: [SERP API](https://docs.dataforseo.com/v3/serp/overview/), [AI Optimization API](https://docs.dataforseo.com/v3/ai_optimization/overview/).

- [ ] 9.1 Tracked-phrase list (D23): one list drives both surfaces; every published article's primary keyword auto-added at publish; manual add/remove; competitor list alongside (seeded from Configurator research + Labs Competitors Domain)
- [ ] 9.2 **Google SERP tracking** — DataForSEO SERP API, Google Organic (Advanced format): per phrase per cadence, one snapshot records company position, every competitor's position, AI Overview presence/content, People Also Ask, featured snippets. Standard (task) method for scheduled runs, Live only for on-demand UI checks
- [ ] 9.3 **AI/LLM visibility** — DataForSEO AI Optimization API (D24): LLM Responses API across ChatGPT / Claude / Gemini / Perplexity per phrase (detect brand vs competitor mentions + citations → share-of-voice per phrase/engine/run); LLM Mentions API for brand + competitor mention metrics and AI search volume; LLM Scraper API for real ChatGPT/Gemini search-mode results where deeper fidelity is needed
- [ ] 9.4 Backend: Mongo collections (`tracked_phrases`, `competitors`, `serp_snapshots`, `llm_snapshots`, `visibility_scores` time series); scheduled runs (default weekly, cadence per phrase priority) as worker jobs
- [ ] 9.5 Reporting UI — the **Search Visibility** tab under Reporting (§5.6): rank-over-time + share-of-voice vs competitors, per-phrase/per-surface drilldown, published-article overlay (visibility before/after the article shipped)
- [ ] 9.6 Config UI: manage tracked phrases + competitor list
- [ ] 9.7 Cost optimization: Standard-method tasks over Live wherever async is fine, batching, cadence by phrase priority, snapshot caching; per-call costs into the shared DataForSEO budget ledger (4.7)
- [ ] 9.8 Evaluate HubSpot's native AEO metrics as a corroborating source (portal-dependent; the HubSpot MCP already exposes AEO metrics/prompts endpoints)

### Phase 10 — Model routing, prompt caching, batch processing
Goal: the right model for the right job, configurable in the Admin UI, with caching and batch discounts working by default. This is the tooling Phase 7.4's optimization consumes — it runs **before** the Phase 7 window (D29).

- [ ] 10.1 Model registry + routing config in `packages/engine`: known-models list with pricing metadata (Fable 5.1 `claude-fable-5-1`, Opus 5 `claude-opus-5`, Sonnet 5 `claude-sonnet-5`, Haiku 4.5 `claude-haiku-4-5-20251001`); per-agent routing stored in Mongo `settings` (UI-editable, source of truth), D13's env vars demoted to bootstrap fallback. Covers all nine agents: configurator, keyword-researcher, topic-cluster-generator, researcher, strategist, writer, editor, schema-builder, header-designer
- [ ] 10.2 Default matrix applied (D26, cost-lean): Haiku 4.5 → schema-builder, header-designer · Sonnet 5 → keyword-researcher, topic-cluster-generator, researcher, strategist, writer, editor · Opus 5 → configurator
- [x] 10.3 Invocation routes (D25) — **pipeline half built 2026-09-25** (`apps/worker/src/directRunner.ts`: strategist/writer/editor/schema/design as single streaming Messages API calls, adaptive thinking at `PHASE_EFFORT_<PHASE>` (default high), inputs inlined, stable reference material cached, `<file>` output protocol; schema embed + header CLI moved worker-side; `PHASE_ROUTE_<PHASE>=agent` rollback; route + estimated cost on every phase result; E2E through real gates + python checks). Keyword relevance scoring rides with 4B. Original scope: refactor tool-less phases (strategist, writer, editor, schema-builder generation, keyword relevance scoring) onto direct **Messages API** single-shot calls with worker-side file I/O; Agent SDK retained for researcher (WebSearch/WebFetch) and configurator (interactive); header-designer → small direct call for pattern choice + worker-run CLI. Route + model recorded on every phase result. **Evidence (S13):** the cluster runner already uses this route — its Sonnet stages complete in ~20 s vs minutes for equivalent Agent SDK phases; this is the main per-article latency lever (research's live web depth stays, by design). **Carry-over from the S12 live smoke:** direct calls must send `thinking: {type: "disabled"}` (or an effort-tuned adaptive config) — Claude 5 default adaptive thinking can consume the entire max_tokens budget and return zero text (see `apps/worker/src/llm.ts`)
- [ ] 10.4 Prompt caching default-on for all direct Messages API calls: `cache_control` breakpoints on the stable prefix (agent spec + standards + context docs), per-article content after the breakpoint; cache-hit rates + savings logged. (Agent SDK calls already cache automatically.) Caveat noted: Batch API requests don't guarantee cache hits — acceptable, the 50% batch discount dominates
- [ ] 10.5 Gate-retry escalation (D27): failed gate → retry on the next tier up (Haiku→Sonnet→Opus) with GATE FEEDBACK; escalation events logged per phase for 7.4 analysis
- [ ] 10.6 Economy batch mode (D28): Message Batches API (50% discount, async ≤24h) as a selectable processing mode at every enqueue point (Chat, Select multi-send, re-runs); Standard (live streaming) stays default; batch submit/poll loop in the worker; Admin-set instance default
- [ ] 10.7 Admin › **Models** tab (§5.5): per-agent model dropdowns from the registry, invocation-route display, instance batch default, caching status, cost dashboard (per-phase/per-article spend from `runs.phaseResults[].usage`, escalation counts, cache-hit savings)
- [ ] 10.8 Configurator nuance: in terminal mode (Claude Code skill) the model is the session's model — routing applies to its web/worker path only

### Later / parked
- Multi-tenant workspace mode (D1 makes this a feature-flag away)
- Team accounts, roles, approval audit trail (D5 follow-on)
- WYSIWYG editor toggle on Review (D7 follow-on)
- Rank-tracking telemetry for published articles (GSC integration)
- Notifications (email/Slack when an article hits Review)
- Article revision history in Review editor

---

## 7. Rollout plan

**Staging first.** Ameya builds, tests, and iterates in a staging environment before any production handoff.

1. **Staging deploy** — GitHub repo (the repo is not under git yet: `git init` + push to GitHub is part of this step) + one Railway project: web + worker services, Railway MongoDB (volume-backed), Railway bucket for header assets, and all API keys (Anthropic, HubSpot, DataForSEO) as Railway service variables. This is the combined Phase 2.8 + web deploy already queued as the next build session.
2. **Saporo HubSpot integration** — set `SAPORO_HUBSPOT_TOKEN`, run the 1.4 post-deploy closeout (validate + resolve HubSpot IDs, logo + Inter font files, context-doc review, smoke-test article through all six phases).
3. **Feature completion in staging** — Phases **4 → 5 → 6 → 10** (D20 as amended by D29), so Content Strategy (keyword agent), publishing from the UI, the competitive module, AND the model-routing/caching/batch cost tooling are all functional before the optimization window opens.
4. **Optimize 30/60/90** — Phase 7 runs as a 30/60/90-day optimization cadence on real Saporo production volume (writing/research quality, header pipeline, model cost).
5. **Reporting & visibility** — Phases 8 and 9 built during/after the optimization window, so the ROI story is measurable from staging data.

**Production handoff — phase TBD.** At a to-be-decided point in the build, staging pauses and the system hands off for the production push:

| Owner | Handoff scope |
|---|---|
| **Kyle** | Integration of the system with the **GTM AI OS** |
| **Jag** | Integration of the system's **reporting requirements with the database** |

Still open (tracked in §8): which phase boundary triggers the handoff, and whether Railway remains the production runtime or the system migrates into the GTM AI OS stack (which drives how portable the Docker images must stay).

---

## 8. Open questions

To be decided in the session where they become load-bearing:

| Question | Decide by |
|---|---|
| Product name — the web shell ships with the placeholder "Content Engine" (S5); rename is one string in `apps/web` (`layout.tsx` metadata + sidenav) when decided | Before public use |
| ~~Per-phase model selection + cost budget per article~~ **Decided (S4, D13):** env-driven per-phase models, default Sonnet, cost/usage recorded per phase for data-driven tuning. Budget caps (max cost per article) still open — closes at Phase 7.4 with real cost data. | ~~Phase 2.3~~ partial |
| Anthropic/DataForSEO/HubSpot key management per instance — leaning Railway service env vars for v1 (matches D5 auth-light); confirm at deploy | Phase 2.8 |
| Content-inventory source per company — feeds internal linking AND the cluster agent's gap map (4.10): scrape own blog vs HubSpot API listing of existing posts | Phase 4.10 / 5 |
| Gemini API key at deploy for observed fan-out (`webSearchQueries` grounding) — or ship simulated-only first and add the key later? | Phase 4.7 |
| Keyword→article mapping: strict 1:1 or keyword clusters per article | Phase 4.2 |
| ~~Licensed fonts per company — upload flow vs fallback default~~ **Decided (S2):** font files declared per-weight in `company.yaml`, dropped into `config/brand-assets/fonts/`; missing files degrade to the CSS fallback stack. Web-app upload flow comes with Admin › Company Setup. | ~~Phase 0.3~~ done |
| ~~Does Chat tab talk to a real conversational agent or is it a smart intake form in v1~~ **Decided (S5, D16):** smart intake for v1; a conversational agent is a drop-in follow-on. | ~~Phase 3.3~~ done |
| Production handoff point — after which phase does staging pause for the Kyle (GTM AI OS) / Jag (reporting DB) handoff? | During the Phase 7 window |
| Production infra after handoff: Railway stays vs migrates into the GTM AI OS stack (drives how portable the Docker images must stay) | At handoff |
| Phase 8: source of deal-stage timestamps for velocity/conversion math — deal property history API vs HubSpot's calculated `hs_date_entered_<stage>` / `hs_v2_date_entered_*` properties | Phase 8.1 |
| Phase 8: does the Saporo portal tier expose the traffic-analytics API breakdowns the Awareness tab needs (sessions by source incl. AI referral), or does traffic come from a different source (e.g., GA4)? | Phase 8.1 |
| Composite priority score: exact weights/formula for the D22 blend (Google volume vs AI volume vs difficulty vs relevance) — tune on real Saporo data | Phase 4.4 |
| DataForSEO monthly budget cap value + default Live-vs-Standard split per feature | Phase 4.7 / 9.7 |
| Extended (1-hour) prompt-cache TTL for long batch runs — worth the premium over the 5-min default? | Phase 10.4 |

---

## 9. Session log

Newest first. Each session appends: what was decided, what was built, what's next.

### Session 18 — 2026-09-25 (Phase 4P — content plans + cadence, built; live run HELD)
**Done:** Phase 4P.1–4P.11 (above). 319 tests green (294 engine + 25 worker), all three workspaces typecheck, web builds. Decisions D39–D43 recorded.

**Found while building — three would have hit the real workbook, not just the fixture:**
- A blank header (`#`, the real Pillar Summary's ID column) normalizes to `""`, which is a substring of every alias — so the partial-match pass bound column 0 every time and starved every real column. Blank headers are now skipped, with a value-shape fallback that recognizes an ID column by its contents.
- Short aliases matched inside real words: `"no"` matched inside `whyAcmeCanOwnIt`, making the differentiation angle the pillar id. Fuzzy matching now needs 4+ characters; short aliases still match exactly.
- `"Why <Company> Can Own It"` is company-specific; matched on the invariant tail `canownit` instead.
- `exceljs` was installed and immediately flagged by `npm audit`; replaced with a dependency-free reader (the plan pre-authorized this fallback). Engine deps unchanged, audit clean.

**Verified against the real 504-row map during planning (read-only):** 504 unique slugs under the existing `slugify` (17 truncate at 60 chars); the workbook's own sequencing rule leaves 9 cluster articles ordered before their hub, which parent-promotion fixes; waves 16/45/39/31/33/215/125.

**Cost reality, from Session 13 actuals (~$8 and ~32 min per article at concurrency 1):** the full 504 is roughly $4,000 and ~11 days of compute. That is why scope filters, `maxTotalArticles`, `maxCostUsd` and the wave-0 gate exist.

**Next up:** 4P.12 is HELD pending Ameya's explicit go-ahead — importing the real workbook, any enrichment spend, and switching the cadence on. Then 4P.13 (link predictor + `recordPublished`), which needs produced hub pages to be meaningful.

### Session 17 — 2026-09-21 (Phase 6 — competitive module, built + verified; new chat)
**Done (6.1–6.3 complete; Ameya pulled Phase 6 ahead of the still-queued Railway deploy):**
- **Engine:** `scrapes` + `scrape_events` collections with the cluster queue's exact lease/heartbeat/stage-resume semantics (`dal/scrapes.ts`); `scrape/types.ts` keeps `topic_index.json`'s snake_case shape verbatim (the stored doc always mirrors the file in storage); `competitors.ts` — `buildCompetitorGapDigest` (freshest succeeded scrape per domain → one compact markdown digest, size-capped, explicitly non-citable) + `ownDomainsFromConfig` (D38 own-domain exclusion).
- **Worker:** third queue (`scrapeQueue`) beside pipeline + cluster (`--scrape-only` joins the flag family); `scrapeRunner` spawns blogscraper (crawl → `outputs/scrapes/<id>/`, line-streamed into the event feed) then the stdlib topic indexer, persists index + counts on the doc, uploads corpus to `competitive/<scrapeId>/`; workspace-missing-on-retry resets to a full re-crawl instead of lying about resume. CLI: `scrape-enqueue/status/events/import`. `SCRAPER_PYTHON` resolution (local venv → python3; Docker adds `/opt/scraper-venv` + `COPY blogscraper`, corpora dockerignored).
- **6.3 wiring:** pipeline materializes `competitor-gaps.md` (rebuilt every run, like brief.md) and the research prompt + `agents/researcher.md` §10 consume it for the Content Gaps section only; cluster gap-map stage inlines the same digest beside the content inventory.
- **Web:** Admin › **Competitive** tab — scrape form, live runs table (SSE `/api/scrape-events`), detail view with 3-stage strip, corpus stats + crawl counts, content-mix chips, top-topics + posts tables, raw-file links (`/api/storage` allowlist now `articles/` + `competitive/`, text types added).
- **Verified:** 78 tests green (engine 64: queue lifecycle, digest, own-domain exclusion, domain parsing; worker 14 incl. a scrape E2E on the fake-crawler/REAL-`build_topic_index.py` pattern, requeue-then-fail path, import path, 6.3 materialization + prompt gating). Real-data proof: artisan.co corpus (225 posts) imported through `scrape-import` (229 files in storage, 60 topics), then a **live scrape through the actual queue** (saporo.io capped at 3 — sitemap discovery, 22-event stream, 6 files stored); browser walkthrough of both list + detail views; live digest check shows artisan.co only (own saporo.io corpus correctly excluded).
- **Ops notes:** the web app's `getDb()` handle is cached on `globalThis` — a dev server started before an engine schema change serves `db.<newCollection> === undefined` until restarted (hit live; restart fixed). blogscraper's log lands at the domain root, up to two levels above a nested blog path (`/resources/blog`) — runner checks all three candidates now.

**Next up (Session 18):** the combined Railway deploy (2.8 + web) — image now needs the scraper venv layer verified in an actual container build — then the §Session-12 queue (1.4 Saporo closeout, Phase 4A/4B/4D remainder, 4.14 caps). At 4B, point the Keyword Researcher at `buildCompetitorGapDigest` (the 6.3 remainder).

### Session 16 — 2026-09-21 (4Q.6 complete — Phase 4Q closed; same chat as Sessions 11–15)
**Done:**
- **All four articles landed in Review through the hardened pipeline** (attack-path Sep 16, PAM Sep 17, Kerberos + identity Sep 21 after the 5-day gap). 4Q.6 acceptance diff vs baseline: body question-H2s 8/9/2 → 0 (FAQ questions intact by design), citations unverified → 10–12 live-verified per article, internal-link future-404s 3 → 0, stuffed keywords → natural queries, audits unchanged at 21/0/0 — confirming mechanical audits measure the checklist while the 4Q truth/voice layers measure what Ameya's review actually found. Phase 4Q marked DONE.
- **Two more live-fire fixes:** (1) body-citation check flagged the author's LinkedIn bio as an "unverified source" — plumbing links (bio/sameAs/Wikipedia/Wikidata) and frontmatter/json-ld/comments are now exempt from D34's evidence check (regression-tested); (2) the worker died to a dev-Mongo network blip (`PoolClearedOnNetworkError` unhandled) — process-level unhandledRejection/uncaughtException guards added; two subsequent blips were logged and survived. D35 also correctly caught an article linking its own unpublished URL (future refinement noted: self-canonical links could be exempt at publish).
- **Ops lessons recorded:** killing a `tsx` parent leaves its node child alive (a zombie pre-D37 worker kept claiming runs until killed by child PID); surgical requeue (`fromStage` + attempt reset) recovers crashed runs without re-paying completed phases; monitors need gate-failure detail in the projection or in-phase retries look like silence.
- Worker stopped; queue empty; all four articles + Ameya's acceptance await human review in Production → Review.

**Next up (Session 17):** the combined Railway deploy (2.8 + web) — hardening from this session makes the worker deploy-ready (crash guards, resumable runs) — then the §Session-12 queue (1.4 Saporo closeout, Phase 4A/4B/4D remainder, 4.14 caps).

### Session 15 — 2026-09-16 (Phase 4Q build: 4Q.1–4Q.5 shipped, 4Q.6 acceptance re-run started)
**Done:**
- **4Q.1 (D32):** `SpokeBrief.primaryQueryTarget` (+ alternates) through spec §9, brief prompt, parser (rejects >7-word sub-query-shaped targets with retry feedback), markdown renderer, output schema, and `acceptSpokeBrief` — the library keyword is now the natural query, never a sub-query, enforced in code and tested. Editor spec: keyword inclusion must read naturally; contorted ledes get rewritten. Brief cards in the Research UI show the target query.
- **4Q.2 (D33):** `## Thesis` is now a **gated** outline section (code check: `outlineGate`); strategist spec rewritten — brief = coverage contract, Strategist owns the narrative, declarative H2s (questions only in FAQ), Saporo arc; writer spec: essay-not-answer-farm; AIO checklist's question-header item now points at the FAQ block instead of body H2s; brief markdown renders "Required passages".
- **4Q.3 (D34):** `packages/engine/src/citations.ts` — parser for numbered sources + per-source key claims/quotes + stat/quote references, report builder, gate wiring: research gate hard-fails on any unsupported/unreachable claim and re-runs research below **3 verified sources**; edit gate re-checks every body-cited external URL against the verified set (deterministic). Worker `quality.ts`: `LiveCitationVerifier` — fetches each source URL (15s timeout, HTML→text), one cheap-tier call per source judging all its claims ("quote the supporting passage or NO"), reports persisted to `articles.citationChecks` and rendered in the Review sidebar audit tab. Researcher spec hardened (cite-the-stating-page, verbatim supporting quote required, machine-verification notice).
- **4Q.4 (D35):** `LiveLinkChecker` — internal links resolve against the articles collection (published/HubSpot URL) or a live HTTP check; drafts report as "exists but not published — pending link"; edit gate hard-fails unresolved links with de-link feedback. `enqueueArticlePipeline` stamps `pendingLinks` (hub + siblings) from the brief for Phase 5 backfill. Reports on `articles.linkChecks` + Review sidebar.
- **4Q.5 (D36):** `context/author-style/saporo-voice.md` — arc (concede→pivot, problem→solution→action, thesis-crystallizing close), sentence rhythm, assertive voice, declarative-H2 rule, evidence style, anti-pattern list; built from the two canonical posts with short attributed exemplar quotes.
- **Verification:** 56 tests green (engine 48: citation parsing incl. a Session-14 SpecterOps/Quest replay, gate hard-fail paths, thesis gate, D32 accept-flow; worker 8: LiveCitationVerifier with fake pages + fake judge catching the exact mis-attribution failure, LiveLinkChecker draft/live/ghost paths, pipeline + cluster E2Es on the new deps). All workspaces build; web production build green.
- **4Q.6 started:** baselines snapshotted onto each article doc (`baseline` field), the three articles retargeted to natural queries ("privileged access management healthcare" / "identity-based attacks in healthcare" / "kerberos attack mitigation"), briefs backfilled with targets + re-rendered as coverage contracts, re-runs queued from research on the hardened pipeline. Diff vs baseline = the acceptance test.

- **Live-fire fix during 4Q.6:** the first hardened research runs produced dramatically better citations (12 verified sources, 27/29 claims supported, SpecterOps stats now cited to real SpecterOps pages) but two true Microsoft claims failed as "verifier returned no verdict" — the judge's verdict array came back object-wrapped and the parser only accepted a bare array, burning gate attempts on a false negative. Fixed (accept any array wrapping + one judge retry + regression test); lesson recorded: **verification-layer parse failures must never count against the researcher's claims.**

- **D37 shipped mid-4Q.6 (Ameya):** auto-prune (`pruneUnverifiedCitations` in engine, wired into the research code step) + the 3–5 claim budget (researcher spec rewrite: Key claim lines only on the sources backing the load-bearing statistics; gate ceiling 8 attributed claims). Rationale observed live: strict verification × 25–30 claims = phase-retry lottery. Also: importer now skips in-progress scaffold folders (empty title) — a mid-pipeline folder in `articles/` broke the corpus test. All four active runs (the 3 re-runs + Ameya's "attack path analysis" enqueued from the app) bumped to maxAttempts 4 and processing under the updated pipeline. 59 tests green.

**Next up:** finish 4Q.6 (review the re-run diff), then the combined Railway deploy (2.8 + web) and the §Session-12 queue.

### Session 14 — 2026-09-15 (first article quality review → hardening plan; same chat as Sessions 11–13)
**Done:**
- **Ameya reviewed live article #1 (PAM) and found four defect classes.** Verdict: on-page GEO/AIO mechanics strong (answer-first passages, schema graph, FAQ mirroring, right length), but (1) primary keyword was a stuffed machine string forcing a contorted lede; (2) whole article reads machine-written — question-H2 FAQ-stack, no narrative thesis, despite the research notes containing a genuinely good discourse analysis ("three camps, no source combines them") that the outline flattened; (3) SpecterOps stats cited to a Quest product page that doesn't contain the claims (competitor URL, schema listing Quest as publisher) — research-stage hallucination, and the editor fact-check is circular (article vs notes, never vs the live source); (4) three internal links to cluster siblings that don't exist yet (future 404s).
- **Root causes traced** (each to a component): (1) `acceptSpokeBrief` used the top fan-out sub-query as the keyword — a build bug violating the cluster spec's own "sub-queries are not keyword targets" guardrail, then the editor gate amplified it; (2) empty `context/author-style/` + spec §9's question-phrased-H2 mandate + D31 precedence wiring + GEO-checklist header pressure; (3) zero live verification anywhere in the pipeline; (4) brief sibling links are planned pages, and no link validation exists.
- **Saporo voice DNA extracted** from the two posts Ameya designated canonical ("Compliance is a starting point…", "Identity is the new attack surface…"): declarative H2s, concede-then-pivot openings, problem→solution→action arc, short emphatic sentences, assertive/unhedged, we/you address, thesis-crystallizing closes, no question headings, no keyword repetition.
- **Decisions D32–D36** (keyword targets human-shaped; briefs = coverage contracts + Strategist owns narrative with declarative H2s; hard live citation-verification gate with **< 3 verified sources → research re-runs**; internal links must resolve with pending-links for unpublished siblings; author-style from the two canonical posts only). **Phase 4Q — Article quality hardening** added as a blocking phase: no further article batches until it ships.
- **Batch disposition (Ameya):** the 3 batch articles stay in Review untouched as the 7.1 quality baseline; after 4Q, all three re-run through the fixed pipeline and the diff is 4Q's acceptance test.

**Next up (Session 15): Phase 4Q.1–4Q.6 FIRST**, then the combined Railway deploy (2.8 + web) and the rest of the §Session-12 queue.

### Session 13 — 2026-09-15 (first live article batch + latency profile; same chat as Sessions 11–12)
**Done:**
- **The 4.12/4D accept→queue flow used in production for the first time:** Ameya accepted 3 spoke briefs from the cluster review UI ("Accept & queue article") — PAM for AD/hybrid (37/45), identity-based attacks in healthcare (36/45), Kerberos mitigation (30/45). Each article carries its brief (verified `brief: YES` on all three docs), so the Strategist gets the D31 length band + H2 vocabulary as first-class input.
- **Queue hygiene before first live spend:** the runs collection held 3 stale queued runs (two Session-5 web-verification test enqueues from Sept 14 + one Chat-tab test from earlier Sept 15). Decision (Ameya): process only the 3 brief-backed articles — the stale runs were **canceled** (reversible: articles remain at stage `queued`, re-enqueue anytime from Review/Select). Lesson: test enqueues against a live-keyed worker are latent spend; the `--cluster-only`/`--pipeline-only` flags (S12) plus this cancel pass are the guard.
- **First-ever live article pipeline batch started** (everything before ran fake-agent E2E; Session 4's live smoke stopped at auth). Full worker mode (both queues), `WORKER_CONCURRENCY=1` deliberately — first live run should surface problems serially, not three at once. Per-phase time/cost land on `runs.phaseResults[].usage` for the 7.1 baseline.

**Article latency profile (documented for 7.4/10.3 — why an article takes ~10–25 min):**
- **Research is the long pole (~5–12 min):** a live Agent SDK session with WebSearch/WebFetch — dozens of search→fetch→read→synthesize turns to produce ≥8-source notes with named stats/entities. This depth IS the no-fabrication guardrail (every later claim must trace to these notes); don't optimize it away.
- **Write + edit are heavy generation (few min each):** full 1,400–2,000-word draft, then the Editor walks every SEO/GEO/AIO checklist item and rewrites in place — tens of thousands of output tokens at ~50–100 tok/s is minutes of pure generation before tool round-trips.
- **Gates multiply worst-case:** a failed gate re-runs the whole phase with feedback (max 2 attempts) — the 10-min article becomes the 25-min article. Design also boots headless Chromium for the header render.
- **Levers, all already roadmapped:** (a) **10.3/D25** — tool-less phases (strategist/writer/editor/schema) move to single-shot Messages API calls, stripping agentic overhead (evidence: the cluster runner already works this way and its Sonnet stages ran ~20 s each); (b) **10.4** prompt caching on the stable spec/standards prefix; (c) **`WORKER_CONCURRENCY=N`** — per-article time unchanged, batch wall-clock ÷ N; raise it once the first live batch proves clean. Latency is otherwise an accepted property: articles end at human review, so the queue is a batch system with no downstream SLA.

**First live article actuals (PAM article, all gates first-attempt, audit 21/0/0, total 31.2 min / $8.33):** research 4.8 min · 40 turns · $1.16 (Sonnet) → outline 2.3 min · $0.31 (Sonnet) → write 7.7 min · $2.75 (Opus) → edit 11.5 min · $3.20 (Opus) → schema 4.3 min · $0.81 (Sonnet) → design 0.5 min · $0.10 (Sonnet). Findings: **Opus write+edit = $5.95 of $8.33** (the D26/10.7 routing lever is where the money is); **edit outruns write** — the checklist walk, not drafting, is the time sink (prime 10.3 direct-call candidate); research's 4.8 min sits at the fast end of the predicted 5–12 band.

**Batch complete — all three in review:** PAM 31.2 min / $8.33 · identity-based attacks 37.3 min / $8.69 · Kerberos 27.2 min / $6.98 — **$24.00 total**, every gate first-attempt, audit 21/0/0 on all three (the edit-stage warning on the Kerberos article resolved by design). ~32 min/article average at concurrency 1. These three ARE the 4Q.6 baseline (see Session 14: quality defects found on human review despite clean mechanical audits — the audits measure the checklist, not truth or voice, which is exactly what 4Q adds).

**Next up:** superseded by Session 14 — Phase 4Q first, then the Railway deploy.

### Session 12 — 2026-09-15 (live cluster smoke + 4D cluster review UI; same chat as Session 11)
**Done:**
- **First live cluster run succeeded end-to-end** (seed "preemptive identity security", Saporo config, simulated fan-out, DataForSEO sandbox): 8 prompts × K=5 → 527 logged sub-queries → **10 themes** (7 core + 2 question-mined + 1 noise-tier folded) → hub + **3 spoke briefs**, output-schema gate clean. Design decisions visibly working: top-scoring theme (vendor comparison, 41/45) correctly routed **non_blog**, HIPAA theme flagged awareness play, question-mined themes carry honest 0.00 stability. Totals: 61 LLM calls, ~438k in / ~164k out tokens (incl. the failures below), 8 sandbox calls in the `api_costs` ledger at $0.
- **Three real bugs found live and fixed (each test-covered):** (1) Claude 5 **adaptive thinking** consumed the entire 16k max_tokens on hard prompts → API returns zero text blocks; direct Messages API calls now send `thinking: {type: "disabled"}` (probe-verified) and an empty-text response throws with stop_reason + thinking_tokens. (2) Clustering over the full 527-entry log blew the output ceiling → clustering now runs over **unique sub-query texts** (annotated with runs/types), expanded back to full generation sets so stability math is unchanged. (3) DataForSEO **sandbox returns canned dummy data** (pizza PAA for an identity seed) which the prompt presented as real — Sonnet rightly refused twice and the empty answer was punished as a parse failure; sandbox content is now never used as evidence (one integration ping per endpoint, content discarded, validation recorded as sandbox-skipped) and an explicitly empty questions list is a valid answer.
- **Ops hardening:** `start --cluster-only` / `--pipeline-only` worker flags (kept 3 stale queued article runs from claiming live spend); parse failures now log response head/tail; failed cluster runs proven resumable by attempt-counter reset (expansion+fan-out, then clustering, were never re-paid).
- **4D cluster half shipped** (see 4.13): Research tab + run/review page with live SSE, theme table, hub, brief accept/queue/dismiss. Verified in the browser against the real run. Deferred: manual DataForSEO tools (4A), Keyword Researcher option (4B), budget caps (4.14).
- `.env` created locally (Anthropic + DataForSEO sandbox creds); DATAFORSEO_SANDBOX=1 set. Engine 37 + worker 5 tests green; web + worker + engine typecheck clean.

**Next up (Session 13 — build plan unchanged):** the combined Railway deploy (2.8 + web), importer against prod Mongo, live end-to-end article run, then the 1.4 Saporo closeout, then Phase 4 remainder (4A Labs endpoints, 4B keyword-researcher, 4.13 manual tools, 4.14 caps). First **non-sandbox** cluster validation run (real SERP/PAA + AI-surface data) once DataForSEO billing is approved.

### Session 11 — 2026-09-15 (Phase 4C build)
**Done (4.7–4.12 complete — the Topic & Cluster Generator runs headless):**
- **Engine** (`packages/engine/src/cluster/` + `dal/clusters.ts`): cluster domain types mirroring the spec's output schema; deterministic scoring module (stability, breadth, tier thresholds, gap points, the 45-point composite, awareness-play flag, architecture hard-rule validator, D31 length-band normalizer); tolerant LLM-JSON parsers per stage; output-schema validator + assembler; `renderBriefMarkdown`; new collections `clusters` / `themes` / `cluster_events` / `api_costs` with indexes; cluster job queue (lease-claim/heartbeat/retry-with-stage-resume, per-cluster event stream); `acceptSpokeBrief`; `enqueueArticlePipeline` gained `themeId` → stamps `article.brief`.
- **DataForSEO client core** (fronting 4.1): auth, sandbox host, serialized rate limiting, Mongo cost ledger, SERP Google Organic Live Advanced (organic top-N + PAA + AI Overview flag) and AI Optimization LLM Responses Live (answer + cited URLs/domains per engine). `marketFromConfig()` reads D21's `market:` block (default 2840/en).
- **Worker**: fetch-based `AnthropicLlmClient` (direct Messages API, D25) + `GeminiFanoutObserver` (Search grounding, observed mode); nine-stage `clusterRunner` with the spec as system prompt for every call, LLM judgment confined to grouping/scoring rationales/architecture proposals while all math and gates run in code; parse-failure and hard-rule feedback retries; graceful degradation without DataForSEO (validation `skipped`, simulated-labeled questions, neutral openness); `startClusterQueue` beside the pipeline queue under one signal handler; CLI `cluster-enqueue/status/show/events/accept [--enqueue]`; `brief.md` materialized into the article workspace; Strategist outline prompt carries the D31 override when a brief exists. Models per D26: `CLUSTER_MODEL` (Sonnet) + `CLUSTER_FANOUT_MODEL` (Haiku), env-driven until Phase 10 moves routing to Mongo settings.
- **D31 reconciliation**: `agents/strategist.md` (inputs + §4 word count) and `standards/seo-checklist.md` now defer to the brief's length band; hub = routing page. CLAUDE.md file map + spec status header + worker README + `.env.example` updated. Web Select-tab send-to-pipeline passes `themeId`.
- **Verified:** build directive honored — deterministic tests written first. 41 tests green (engine 36: scoring/tiering/parsers/schema/architecture rules + cluster queue lifecycle + accept/enqueue integration on mongodb-memory-server; worker 5 incl. a full 9-stage cluster E2E with fake LLM + real math/gates: simulated fan-out at K=5, question-mined themes, forced-neutral openness, architecture retry after hard-rule feedback, D31 band snap, sibling filtering, output-schema gate, brief→Strategist handoff). All workspaces typecheck; web production build green. No live API spend.

**Next up (Session 12 — build plan unchanged):** the combined Railway deploy (2.8 + web), importer against prod Mongo, live end-to-end article run, then the deferred 1.4 Saporo closeout, then the rest of Phase 4 (4A Labs endpoints, 4B keyword-researcher, 4D research workspace UI incl. the cluster review UI). First live cluster smoke (real Sonnet/Haiku + optional Gemini key + DataForSEO sandbox) can ride along after the deploy.

### Session 10 — 2026-09-15 (roadmap planning + spec commit)
**Done:**
- **Phase 4 restructured into two research agents** (D30): 4A shared DataForSEO infrastructure (unchanged), 4B **Keyword Researcher** (demand-driven, as before, minus cluster suggestions — clustering moved to its sibling), 4C **Topic & Cluster Generator** (theme-driven), 4D workspace UI with an agent picker + cluster review UI (theme table, hub-and-spoke view, spoke-brief cards).
- **Ameya's full instruction set committed verbatim** as `agents/topic-cluster-generator.md` (spec v1 + evidence appendix): seed → entity/term map + realistic prompts → 8-type fan-out at K=5 runs (observed via Gemini `webSearchQueries` grounding when a key exists, simulated otherwise) → theme clustering with stability/breadth tiers → question mining → SERP + AI-surface validation → gap map vs content inventory → 45-point prioritization → hub/spoke architecture → answer-first spoke briefs.
- **D31 amends the engine's own cluster model:** hub = routing page (retires the encyclopedic 3,500–4,500-word pillar), spokes default 800–2,000 words, SERP-median word-count targets yield to brief length bands (4.12 reconciles `standards/seo-checklist.md` + `agents/strategist.md`), never one page per sub-query. Grounded in the Indig/AirOps data (500–2,000-word posts beat 5,000-word guides; 26–50% coverage beats 100%; position 1 cited 58% vs 14% at position 10).
- Ripple updates: D26 + Phase 10.1/10.2 now cover nine agents (topic-cluster-generator on Sonnet, bulk fan-out sub-calls on the cheap tier), §5.2 Research tab shows the agent picker, content-inventory open question broadened to serve the gap map, new open question on the Gemini key at deploy.
- Build directive added under 4.8: unit-test the fan-out engine + clustering (stability scoring, tiering thresholds, output schema) with fake generations before any API spend — the Phase-2 fake-agents/real-gates pattern.

**Next up (Session 11 — build plan unchanged):** the combined Railway deploy (2.8 + web), importer against prod Mongo, live end-to-end article run, then the deferred 1.4 Saporo closeout, then Phase 4.

### Session 9 — 2026-09-15 (bug fix)
**Done:**
- **Admin editor stale-content bug fixed** (found by Ameya reviewing Phase 3): clicking a second file in any Admin file tab (Standards/Templates/Agents/Context) kept showing the first file's content, falsely flagged "unsaved", and Save would have overwritten the newly selected file with the stale text. Cause: `AdminEditor` seeds textarea state with `useState(initialContent)`, and Next client-side nav reuses the mounted component, so state never resets. Fix: `key={area/file}` on `<AdminEditor>` so React remounts per file. Same latent bug pre-fixed in the Review editor (`key={slug}` on `<ReviewEditor>`). Verified in the browser (Context README→positioning, Agents editor→writer).
- `.claude/launch.json`: `autoPort: true` so a second session's dev server doesn't fight over port 3000.

### Session 8 — 2026-09-15 (roadmap planning, no code)
**Done:**
- **Phase 10 added** — model routing, prompt caching, batch processing (10.1–10.8): per-agent model registry + Mongo-backed routing over all eight agents (configurator, keyword-researcher, researcher, strategist, writer, editor, schema-builder, header-designer), Admin › **Models** tab with per-agent dropdowns + cost dashboard, prompt caching default-on, gate-retry model escalation, Economy batch mode via the Message Batches API.
- Key architectural framing settled with Ameya: "Messages API by default" = **direct Messages API single-shot calls for tool-less phases** (worker does file I/O; kills the Agent SDK's agentic token overhead), Agent SDK retained only where tools are needed (researcher, configurator).
- Decisions **D25** (invocation routes), **D26** (cost-lean default matrix: Haiku for schema/header, Sonnet for the middle, Opus for configurator), **D27** (escalate model tier on gate retry), **D28** (Standard default + selectable Economy batch mode), **D29** (order now 4→5→6→10→7→8→9, amending D20). D13 marked superseded (env vars → bootstrap fallback). §5.5 gains the Models tab; 7.4 rewritten to consume Phase 10's tooling; rollout step 3 updated.

**Next up (Session 9 — build plan unchanged):** the combined Railway deploy (2.8 + web), importer against prod Mongo, live end-to-end article run, then the deferred 1.4 Saporo closeout, then Phase 4.

### Session 7 — 2026-09-15 (roadmap planning, no code)
**Done:**
- **Phase 4 rewritten in detail** with Ameya: DataForSEO **Labs Google** endpoint coverage by family (keyword research / market analysis / competitor research — Keywords For Site, Related, Suggestions, Ideas, Overview, Bulk Difficulty, Search Intent, Ranked Keywords, Competitors Domain, Domain Intersection, and the rest), plus AI Keyword Data `keywords_search_volume/live` for AI search volume; keyword enrichment + composite priority score; agent flow; Content Strategy › **Research** tab (renamed from "Use Agent") housing both agent-driven and manual user research (4.1–4.7).
- **Phase 9 retitled "Search visibility: Google SERP + AI/LLM"** — now explicitly covers traditional Google SERP tracking (SERP API, Advanced format: company + competitor positions, AI Overview, PAA, snippets from one snapshot) alongside LLM visibility via the AI Optimization API (LLM Responses / LLM Mentions / LLM Scraper) (9.1–9.8).
- Endpoint names verified against the live DataForSEO docs (Labs Google overview, AI Optimization overview, SERP overview, AI keyword volume live).
- Decisions **D21** (one primary market per company for v1), **D22** (composite priority score + sticky human override), **D23** (one tracked-phrase list, published article keywords auto-added), **D24** (DataForSEO as the LLM gateway, amending D19). Screen map updated: §5.1 enrichment columns, §5.2 Research tab, §5.6 Search Visibility tab. New §8 open questions: score weights, DataForSEO budget cap + Live/Standard split.

**Next up (Session 8 — build plan unchanged):** the combined Railway deploy (2.8 + web), importer against prod Mongo, live end-to-end article run, then the deferred 1.4 Saporo closeout, then Phase 4 per D20.

### Session 6 — 2026-09-15 (roadmap planning, no code)
**Done:**
- Roadmap extended with Ameya: **Phase 7** (Saporo live run + 30/60/90 optimization: content/research quality, header pipeline, model cost), **Phase 8** (Reporting & ROI: Python nightly HubSpot sync keyed on HubSpot IDs, Awareness / Pipeline / Cohorts / Leads & Accounts tabs, survivorship-correct cohort math), **Phase 9** (AI-search visibility vs competitors: visibility agent, tracking backend, lift reporting, phrase/competitor config UI, token-cost optimization, DataForSEO + HubSpot AEO evaluation).
- **§5.6 Reporting** added to the screen map (new side-nav item, five tabs incl. AI Visibility).
- **§7 Rollout plan** added: staging (GitHub + Railway + Railway Mongo volume + env-var API keys — note repo still needs `git init`) → Saporo HubSpot integration → Phases 4→5→6 → 30/60/90 optimize → 8/9; production handoff at a TBD phase to **Kyle** (GTM AI OS integration) and **Jag** (reporting-requirements/database integration). Open questions renumbered to §8, session log to §9.
- Decisions **D18** (attribution: contact source props now, event-level `touches[]` later), **D19** (track ChatGPT, Perplexity, Google AI Overviews + Gemini, Claude), **D20** (numeric phase order 4→9 after the deploy). New §8 open questions: handoff phase, post-handoff infra, deal-stage timestamp source, traffic-analytics availability on Saporo's portal tier.

**Next up (Session 7 — unchanged plan, renumbered):** the combined Railway deploy (2.8 + web), importer against prod Mongo, live end-to-end article run, then the deferred 1.4 Saporo closeout, then Phase 4 per D20.

### Session 5 — 2026-09-14
**Done (Phase 3 complete, 3.1–3.9):**
- `apps/web` — Next 16 + React 19 + Tailwind v4 (D17), five-screen shell per §5: Target Keywords, Content Strategy (Chat / Upload / Agent-placeholder / Select), Production (Work / Review), Articles, Admin. Auth-light gate (D5): APP_PASSWORD-derived HMAC cookie, login page, gate open when unset.
- Engine addition: `pipelineOps.ts` — shared `slugify` + `enqueueArticlePipeline` + `enqueueRerun` (worker CLI refactored onto it; web Chat/Select/Keywords and the Review re-run use the same op).
- Server architecture: RSC reads via the engine DAL (singleton Mongo in `lib/db.ts`, company.yaml synced on boot), mutations as server actions (auth/pipeline/keywords/content/admin), plain-JSON `Ui*` mappers for client components, `/api/events` SSE tail of `events` (Work board live-refresh), `/api/storage/…` serving header PNGs through the storage adapter (works for local + S3).
- Local dev (D15): `scripts/dev_mongo.mjs` — persistent mongodb-memory-server on :27017 (`outputs/dev-mongo/`), `npm run dev:mongo` / `dev:web`; `.claude/launch.json` for the in-app preview.
- Decisions D15–D17 (dev Mongo, Chat-tab smart intake resolving part of §8, web stack details). Product name still open — "Content Engine" placeholder shipped.
- Verified in the browser against seeded dev Mongo (importer: 14 articles): chat enqueue parsed topic+keyword and queued a run; keyword add → select → send-to-pipeline queued a second; Work board + event feed live; review editor with preview/audit/header tabs; admin editor on real standards files. Typecheck + production build + all 18 engine/worker tests green.

**Next up (Session 6):** the combined deploy (2.8 + web): provision Railway (worker + web + Mongo + bucket; billable — with Ameya), `ANTHROPIC_API_KEY`, env wiring, web Dockerfile or Railpack config, importer against prod Mongo, live end-to-end article run, then the deferred 1.4 Saporo closeout. Candidate polish afterwards: real conversational Chat (D16 follow-on), WYSIWYG toggle (D7 follow-on), Phase 4 keyword agent.

### Session 4 — 2026-09-14
**Done (Phase 2.1–2.7 + 2.8 prep):**
- **Monorepo** (2.1, D14): npm workspaces — `packages/engine`, `apps/worker`, `apps/web` placeholder; root `package.json`/`tsconfig.base.json`/`.gitignore`. Engine spec dirs stay at root; terminal mode untouched.
- **`packages/engine`** (2.2): typed Mongo collections + DAL (articles/runs/events/keywords/companies/settings, indexes incl. unique slug + event seq), stage state machine (`queued → …six work stages… → review → approved → publishing → published` + failed/paused), company.yaml loader (TS mirror of `company_config.py`), frontmatter/markdown helpers, PASS/WARN/FAIL script-output parser, storage adapter (local + S3-compatible), code-enforced phase gates built from the CLAUDE.md gate conditions and the real spec output formats (`### H2:` outline markers, research section headings).
- **`apps/worker`** (2.3–2.7): Agent SDK invoker (spec markdown = system prompt; `settingSources: []` deliberately keeps CLAUDE.md out — worker is the orchestrator; `bypassPermissions`; per-phase allowedTools, Bash only for Schema/Design), pipeline runner with gate-feedback phase retries, lease/heartbeat job queue with resume-from-failing-phase, per-run event stream, `seo_audit`/`validate_schema` subprocess steps (D12; edit gate excludes json-ld checks — those belong to Phase 5), design-phase header upload to storage, `import-articles` backfill CLI, plus `enqueue`/`status`/`events` CLI.
- **Deploy prep** (2.8): root `Dockerfile` (node:22-slim + python3 venv + Playwright Chromium + fontconfig), `railway.json`, `.dockerignore`, `.env.example`, `apps/worker/README.md`; `ARCHITECTURE.md` marked partially-historical pointing at the new structure; CLAUDE.md file map updated.
- **Verified:** 18 tests green — gate/parser units; queue lifecycle (claim, lease expiry reclaim, retry-then-fail, event seq) on mongodb-memory-server; **full 6-phase pipeline E2E** with fake agents but real gates + real Python checks (lands in `review`, artifacts + audit + schema validation + header in Mongo/storage, gate-retry path incl. GATE FEEDBACK prompt); importer against the real 15-folder corpus (idempotent). Live SDK smoke: spawn/stream/error paths correct; actual agent execution needs auth (local CLI OAuth expired — set `ANTHROPIC_API_KEY` or `claude login`).

**Next up (Session 5) — reordered by Ameya (2026-09-14): Phase 3 (web app) BEFORE the Railway deploy.** 2.8 and its two prerequisites (Anthropic auth: `ANTHROPIC_API_KEY` or `claude login`; Railway provisioning approval — billable) are parked until Phase 3 is built; then one combined deploy (web + worker + Mongo + bucket), importer against prod Mongo, live article smoke, and the deferred 1.4 Saporo closeout. Note for Phase 3 dev: no local `mongod`/Docker on this machine — decide the local-dev Mongo story at 3.1 (options: `mongodb-memory-server` for dev, brew-installed mongod, or point dev at the future Railway Mongo).

### Session 3 — 2026-09-14
**Done (Phase 1.1–1.3):**
- `agents/configurator.md` — Configurator agent spec: single-batch interview (URL required, everything else defaulted/researched), verbatim web research (sdr-library-builder pattern), full `company.yaml` proposal with approval gate + parse check, marker-owned `context/` seeding (brand positioning/voice, sales ICP/value-props, marketing content-strategy), brand-asset checklist (no self-downloading of assets), HubSpot validation, completion-report format, re-run safety rules.
- `.claude/skills/configure-company/SKILL.md` — the `/configure-company` skill; thin invocation wrapper over the spec (AskUserQuestion batching, approval gates, done-criteria).
- `scripts/validate_hubspot.py` — stdlib-only validator: token check, content_group_id verify/resolve (candidate listing on ambiguity), blog_author_id verify/resolve by `author.name`, recent-post listing. PASS/WARN/FAIL + ACTION lines, exit 0/1. **Tested live: EverWorker portal all-green (blog 104001906678, author 245720213752, 100 posts visible).**
- `scripts/company_config.py` — added `__main__` parse check (`python3 scripts/company_config.py` → JSON dump, exit 0/1); referenced by the spec/skill as the yaml gate.
- `CLAUDE.md` file map updated (configurator, new scripts).

**Done (Phase 1.4 dress rehearsal, same session):** Onboarded **Saporo** (saporo.io, Lausanne — Preemptive Identity Exposure Management) via `/configure-company`. Interview (no HubSpot token yet → `SAPORO_HUBSPOT_TOKEN` pending; author reuse; brand extracted from site; voice empty) → web research (homepage, product/overview, about/company, blog + live post, LinkedIn; Framer site: accents #0099FF/#F14138, Inter, logo SVG located, canonical `saporo.io/resources/blog/{slug}` verified) → approval → `company.yaml` written + parse-checked → 5 marker-owned context seeds (brand positioning/voice, sales icp/value-props, marketing content-strategy) → EverWorker preserved in `config-everworker/` (loads via COMPANY_CONFIG), stale logos/fonts/`.config_cache.json` cleared. Validator correctly reports pending token. Re-run safety held: user-authored context PDFs untouched (Ameya then removed the EverWorker PDFs + cluster plan himself). Header smoke test passed: all 5 patterns rendered in Saporo brand (blue #0099FF accents, wordmark + fallback-font degradation both correct, dynamic year, no EverWorker leakage); stat-highlight confirmed by-design stat-titles-only (auto-picker guards it).

**Next up (Session 4):** **Phase 2 — data layer + pipeline service, through the Railway deploy (2.8).** The remaining 1.4 closeout items (Saporo HubSpot token/validation, logo + Inter files, context review, org logo URL, smoke-test article = the 0.8 E2E) are deliberately deferred until after that deploy — itemized as `(post-deploy)` checkboxes under 1.4.

### Session 2 — 2026-09-14
**Done (Phase 0 complete):**
- Built the config surface: `config/company.yaml` (identity, blog, author, organization, HubSpot IDs, brand colors/font/logos, voice rules) + `config/brand-assets/` (Gilroy TTFs copied from `~/Library/Fonts` — the old `~/Documents/pmmadvertisingcreative/` source no longer exists on this machine; both logo SVGs extracted out of code) + `config/README.md`.
- `scripts/company_config.py`: stdlib-only loader (YAML-subset parser, `cfg_get`, `brand_assets_dir`, `load_banned_phrases`), `COMPANY_CONFIG` env override; consumed by `seo_audit.py`, `blogheaderimagegen`, `blogsagent`.
- `standards/banned-phrases.txt` is now the single machine-checked list (+ per-company `voice.banned_phrases`); EverWorker ToV (em-dash ban, AI-powered/best-in-class/supercharge) codified in company.yaml voice.
- Refactors: `blogheaderimagegen` (config brand, logo-file/wordmark + font/fallback degradation, accent-derived glows, dynamic year), `blogsagent` (config styles, author, HubSpot IDs with cache/API fallback, token env name from config).
- De-branded: CLAUDE.md (config is now pre-flight step 0), all 6 agent specs, seo/geo checklists, quality bar, schema spec (Example Co examples), schema/article templates, context/README, README, QUICKSTART, tool READMEs, sample post.
- Verified: shipped-article audit still 21 pass/0 fail; EverWorker header PNG byte-identical pre/post refactor; fictional Acme Robotics run (headers all 5 patterns, publisher dry-run, phrase merge) fully de-branded.
- Note: `ARCHITECTURE.md` deliberately NOT updated (historical deep-dive; several sections now stale — brand.py, font paths, quality-bar description). Rewrite lands with the Phase 2 monorepo restructure.

**Next up (Session 3):** Phase 1 — `agents/configurator.md` + `/configure-company` skill (1.1–1.2).

### Session 1 — 2026-09-14
**Done:**
- Full repo review (pipeline, standards, tools, 14-article cluster, hardcode inventory).
- Decisions D1–D10 made with Ameya (see [Decisions log](#2-decisions-log)).
- This roadmap created.

**Next up (Session 2):**
- Phase 0.1–0.2: design `config/company.yaml` schema + brand-assets convention, review with Ameya.
- Then start the refactors (0.3–0.7).
