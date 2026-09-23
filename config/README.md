# config/ — the company configuration surface

Everything company- or brand-specific that the engine needs lives here. The
engine itself (agents, standards, templates, scripts, tools) contains **zero**
company hardcodes; pointing the system at a new company means writing this
folder and nothing else. The Configurator agent (roadmap Phase 1) will
eventually write it for you.

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
  anchors, no multi-line strings, no flow mappings.
