# @blogagent/web — the operator web app

Roadmap Phase 3: the five-screen app over the engine — same Mongo, same
`config/company.yaml`, same specs as the worker and terminal mode.

## Screens

- **Target Keywords** — the keyword library: status filters, search, add,
  bulk actions (prioritize / archive / mark queued / send to pipeline).
- **Content Strategy** — four tabs: **Chat** (natural-language invocation →
  queued pipeline run; v1 is a smart intake that parses topic + trailing
  `target keyword "…"`), **Upload Keywords** (CSV → parse → dedupe →
  confirm → library), **Use Agent** (placeholder until roadmap Phase 4),
  **Select** (stage keywords → batch send to pipeline).
- **Production** — **Work**: live board of everything in flight grouped by
  stage, stage filters, recent-activity feed; stays live via an SSE stream
  of pipeline events (`/api/events`). **Review**: the approval queue; each
  article opens in a markdown editor + preview (D7) with sidebar tabs for
  research notes, outline, first draft, audit report, header image, and run
  history, plus Save / Approve-for-publish / re-run-from-phase actions.
- **Articles** — library of everything produced (imported corpus included),
  with per-artifact tabs.
- **Admin** — edit the engine's markdown surfaces in place (standards /
  templates / agents / context) with a save-guard, plus a read-only company
  config view.

## Running locally

```bash
node scripts/dev_mongo.mjs          # persistent local Mongo on :27017 (D15)
npm run dev -w @blogagent/web       # http://localhost:3000
node apps/worker/dist/cli.js import-articles   # seed the article corpus (once)
node apps/worker/dist/cli.js start  # the worker, so queued runs actually execute
```

Auth (D5): set `APP_PASSWORD` to enable the login gate; unset = open (dev).
Other env: `MONGODB_URI`, `MONGODB_DB`, `STORAGE_DRIVER` — same as the
worker (see `.env.example`). The web app and worker must point at the same
Mongo and the same storage.

## Architecture notes

- Server components read Mongo directly through `@blogagent/engine`'s DAL
  (singleton connection in `src/lib/db.ts`); mutations are server actions
  under `src/lib/actions/`.
- Client components only receive plain-JSON `Ui*` shapes (`src/lib/ui-types.ts`).
- `/api/events` is an SSE tail of the `events` collection; the Work board
  listens and re-fetches server data on each event.
- `/api/storage/…` serves stored binaries (header PNGs) through the engine's
  storage adapter, so local-dir and S3 storage both work.
- Deploy: rides in the combined post-Phase-3 Railway deploy with roadmap 2.8.
