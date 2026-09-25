# @blogagent/worker — headless pipeline service

The Agent SDK worker (roadmap Phase 2): runs the six-phase article pipeline
from `agents/*.md` headlessly, with state in MongoDB. The same specs,
standards, and Python checks as terminal mode (`CLAUDE.md`) — two frontends,
one engine (decision D10).

## How it works

```
enqueue → runs (queued) ──claim/lease──▶ worker
                                          │  per phase:
                                          │   1. materialize articles/<folder>/ from Mongo
                                          │   2. Agent SDK query(): agents/<phase>.md as system
                                          │      prompt, phase task prompt, per-phase tools
                                          │   3. code step: seo_audit.py / validate_schema.py
                                          │      (canonical Python checks, parsed + stored)
                                          │   4. gate (packages/engine gates.ts) — on failure,
                                          │      retry the phase with GATE FEEDBACK appended
                                          │   5. persist artifacts to Mongo, advance stage
                                          ▼
        research → outline → write → edit → schema → design → review
```

- **Mongo is the system of record**; the article folder is a scratch workspace
  the worker rebuilds from Mongo on resume (any worker can pick up any run).
- **Queue**: `runs` collection, claimed with `findOneAndUpdate` + lease.
  Expired leases are reclaimed (worker crash ⇒ another worker resumes from
  the failing phase, completed phases never re-run). Heartbeat extends the
  lease. `MAX_RUN_ATTEMPTS` bounds retries.
- **Events**: append-only `events` collection with a per-run `seq` — the
  polling/SSE primitive for the web app's Work tab (Phase 3).
- **Models per phase** (D13): `PHASE_MODEL_DEFAULT` / `PHASE_MODEL_<PHASE>`
  env vars; default `claude-sonnet-5` everywhere. Token usage + cost per
  phase land in `runs.phaseResults[].usage`.
- **Invocation routes** (D25, roadmap 10.3): research runs as an Agent SDK
  session (it needs WebSearch/WebFetch). The other five phases default to
  ONE streaming Messages API call each (`directRunner.ts`): the worker
  inlines every input the spec names, the spec is the system prompt (stable
  reference material behind a prompt-cache breakpoint), and the model
  returns files in a `<file name="…">` protocol that the worker writes.
  Schema: the model returns `schema.json` only; the worker embeds it in
  `article.md`. Design: the model picks pattern + alt text; the worker runs
  the header CLI. Gates are unchanged. `runs.phaseResults[].route` records
  the route; direct-phase `costUsd` is estimated from token counts. Roll a
  phase back with `PHASE_ROUTE_<PHASE>=agent`; tune with
  `PHASE_EFFORT_<PHASE>` (default `high`).
- **Binary storage** (D3): header PNG/HTML go to `STORAGE_DRIVER=local|s3`
  (Railway buckets are S3-compatible).

## Commands

```bash
node apps/worker/dist/cli.js start            # run the queue worker
node apps/worker/dist/cli.js enqueue --topic "…" [--keyword "…"]
node apps/worker/dist/cli.js import-articles [--dry-run] [--update] [--audit]
node apps/worker/dist/cli.js status
node apps/worker/dist/cli.js events --run <runId> [--follow]

# Topic & Cluster Generator (roadmap 4C — D30/D31)
node apps/worker/dist/cli.js cluster-enqueue --seed "ai sdr tools" [--k 5]
node apps/worker/dist/cli.js cluster-status [--id <clusterId>]
node apps/worker/dist/cli.js cluster-show --id <clusterId>       # output JSON
node apps/worker/dist/cli.js cluster-events --cluster <id> [--follow]
node apps/worker/dist/cli.js cluster-accept --cluster <id> --theme "Pricing and ROI" [--enqueue]

# Competitive module (roadmap Phase 6)
node apps/worker/dist/cli.js scrape-enqueue "https://www.competitor.com/blog" [--browser] [--max-articles N] [--images]
node apps/worker/dist/cli.js scrape-status [--id <scrapeId>]
node apps/worker/dist/cli.js scrape-events --scrape <id> [--follow]
node apps/worker/dist/cli.js scrape-import --dir blogscraper/artisan.co/blog --url "https://www.artisan.co/blog"
```

Dev mode: `npm run worker -- <command>` from the repo root (tsx, no build).

## Cluster runs (4C)

`start` also polls the `clusters` collection. A cluster run executes
`agents/topic-cluster-generator.md` as the system prompt over nine staged
**direct Messages API** calls (D25) — expansion → fan-out → clustering →
questions → validation → gap map → prioritization → architecture → briefs —
with the deterministic math (stability, tiers, the 45-point score, the
architecture hard rules, the output-schema gate) enforced in
`packages/engine/src/cluster/`. Stage outputs persist as they complete, so a
retry resumes at the failed stage.

- **Fan-out mode**: observed via Gemini Search grounding (`GEMINI_API_KEY`,
  captures `webSearchQueries`, tagged `observed:gemini`); simulated 8-type
  generation on the cheap tier otherwise (D26: `CLUSTER_FANOUT_MODEL`,
  default Haiku). `CLUSTER_FANOUT_K` varied runs per prompt (default 5).
- **Validation**: SERP + PAA + AI-surface checks via DataForSEO
  (`DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD`, `DATAFORSEO_SANDBOX=1` for the
  sandbox host) with per-call spend in the `api_costs` ledger; without
  credentials, validation is recorded as skipped and openness scores stay
  neutral. `CLUSTER_MAX_VALIDATIONS` caps validated themes per run.
- **Accepting briefs** (4.12): `cluster-accept` lands the spoke brief in the
  keyword library (status `idea`, linked to cluster + theme); send-to-pipeline
  (web Select tab or `--enqueue`) stamps the brief onto the article, the
  workspace materializes it as `brief.md`, and the Strategist takes its length
  band over the SERP-median rule (D31).

## Competitive scrapes (Phase 6)

`start` also polls the `scrapes` collection (disable with `--cluster-only` /
`--pipeline-only`; `--scrape-only` runs just this queue). A scrape run shells
out to `blogscraper/scrape_blog.py` (crawl → resumable corpus folder under
`outputs/scrapes/<id>/`), builds the TF-IDF topic index with
`blogscraper/tools/build_topic_index.py`, stores the parsed index on the
scrape doc, and uploads corpus + indexes to storage under
`competitive/<scrapeId>/`. Python resolution: `SCRAPER_PYTHON` env →
`blogscraper/.venv/bin/python` → `python3` (the Docker image sets
`/opt/scraper-venv`). `scrape-import` backfills an already-scraped folder
(e.g. the artisan.co corpus) without crawling.

The freshest succeeded scrape per competitor domain feeds gap analysis (6.3):
the pipeline materializes `competitor-gaps.md` into the article workspace for
the Researcher, and the cluster agent's gap-map stage reads the same digest.

## Environment

See `.env.example` at the repo root. Required to actually run agents:
`ANTHROPIC_API_KEY` (or a logged-in `claude` CLI on the same machine —
the SDK reuses its auth). `MONGODB_URI` defaults to localhost.

## Auth & keys

- The Agent SDK spawns the bundled Claude Code CLI; auth is `ANTHROPIC_API_KEY`
  env or the CLI's own login.
- The HubSpot token env var is named by `hubspot.token_env` in
  `config/company.yaml` (publishing itself is roadmap Phase 5).

## Deploy (Railway)

Root `Dockerfile` builds Node 22 + Python 3 + Playwright Chromium (header
generation) and starts the worker; the web app has its own `Dockerfile.web`
(Node only). Railway's config-as-code (`railway.json`) is deprecated, so each
service's Dockerfile path, start command, and restart policy are set on the
service itself:

| Service | Dockerfile | Start command |
|---|---|---|
| worker | `Dockerfile` | `node apps/worker/dist/cli.js start` |
| web | `Dockerfile.web` | `sh -c 'cd /app/apps/web && npx next start -p ${PORT:-3000}'` |

Services per roadmap §4: worker + web + MongoDB + a bucket. Both apps need
`MONGODB_URI` (from the Mongo service's `MONGO_URL`), `MONGODB_DB`,
`STORAGE_DRIVER=s3` and the `S3_*` vars from the bucket. Reference the source
service directly on each app (`${{MongoDB.MONGO_URL}}`,
`${{<bucket>.ENDPOINT}}` …) — a shared variable that itself references
another service does not resolve, and the worker crashes on an invalid
Mongo scheme. The worker also needs
`ANTHROPIC_API_KEY` (optionally `WORKER_CONCURRENCY`); the web app needs
`APP_PASSWORD` before it gets a public domain.

## Tests

`npm test` (repo root) — engine unit tests (gates, script-output parser),
queue lifecycle against `mongodb-memory-server`, a full six-phase pipeline
E2E with a fake agent invoker but **real** gates + real `seo_audit.py` /
`validate_schema.py`, and an importer run against the real `articles/`
corpus.
