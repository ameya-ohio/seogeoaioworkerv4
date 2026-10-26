# config/ — the company configuration surface

Everything company- or brand-specific that the engine needs lives here. The
engine itself (agents, standards, templates, scripts, tools) contains **zero**
company hardcodes; pointing the system at a new company means writing this
folder (plus the company's `context/` docs) and nothing else. The Configurator
agent ([agents/configurator.md](../agents/configurator.md), invoked with
`/configure-company`) writes both for you.

## Layout

```
config/
  company.yaml          # the single declarative config file (see inline comments)
  brand-assets/
    fonts/              # licensed webfont files: <Basename>.woff or .ttf,
                        # declared per-weight in company.yaml brand.font.files
    logos/
      logo-light-bg.svg # full-color logo for light backgrounds
      logo-dark-bg.svg  # white/mono logo for dark backgrounds
```

## Sections of company.yaml

| Section | What it drives |
|---|---|
| `company` | identity; `description` is shown to the expert in the interview |
| `site` | D46: where pillar/hub/cluster pages live (`path_prefix`), canonical URLs and breadcrumbs stamped at plan import |
| `publish` | D52: `framer-export` (export bundle + Mark live) or `hubspot` |
| `pipeline` | D59: `interview: pause` stops each run for the expert interview; `skip` never stops |
| `market` | D21: DataForSEO `location_code` / `language_code` for keyword data (default 2840/en) |
| `ctas` | D50: closing CTA per funnel stage (`tofu`/`mofu`/`bofu`); Settings → Calls to action overrides win |
| `blog` | the existing blog's base URL, canonical pattern, locale, breadcrumbs |
| `author`, `organization` | byline and schema.org Person/Organization nodes |
| `hubspot` | token env var name + blog/author IDs (empty → resolved via API) |
| `brand` | header image colors, font, logos |
| `voice` | company-specific banned phrases and style rules |
| `competitors` | head-to-head vendors the audit bans as sources; mirrors `context/sales/competitive-landscape.md` |

## Rules

- **Loader:** `scripts/company_config.py` — stdlib-only, used by
  `seo_audit.py`, `blogheaderimagegen/`, and `blogsagent/`. Agents (Researcher
  → Header Designer) read `company.yaml` directly as an input file.
- **Path override:** set `COMPANY_CONFIG=/path/to/other-company.yaml` to run
  the engine for a different company without touching this folder. Brand
  assets are resolved from a `brand-assets/` folder **next to** whichever
  yaml file is loaded.
- **No secrets.** Tokens and API keys stay in env vars / `.env` files;
  `company.yaml` only names the env var (e.g. `hubspot.token_env`).
- **Missing assets degrade gracefully.** No font files → the CSS fallback
  stack is used. No logo files → the header generator renders a styled text
  wordmark from `company.name`.
- **YAML subset.** The parser supports nested maps (2-space indent), lists of
  scalars, lists of flat maps, quoted/unquoted scalars, and `#` comments. No
  anchors, no multi-line strings, no flow mappings. Inline lists of scalars
  (`[a, "b c", d]`) are fine.
- **Deploys copy it.** The worker image copies `config/` and `context/` at
  build time; changes reach the hosted worker and web app after commit +
  redeploy.
