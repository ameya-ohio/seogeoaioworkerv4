# blogheaderimagegen — 1200×600 Blog Header Generator

A small pipeline that turns a blog title (or a finalized article folder) into a brand-on, on-format **1200×600 PNG hero image** plus the source HTML.

The brand system (colors, font, logos, domain mark) comes entirely from the repo's company config surface: `config/company.yaml` + `config/brand-assets/` (override the path with the `COMPANY_CONFIG` env var). No brand decisions are made here — this tool *applies* the configured system.

```
blogheaderimagegen/
├── generate_header.py        # CLI entry
├── lib/
│   ├── brand.py              # Colors, logo SVGs, Gilroy @font-face (base64-embedded)
│   ├── patterns.py           # 5 pattern templates tuned for 1200×600
│   ├── render.py             # Playwright headless element-screenshot at 2× DPI
│   └── article.py            # Frontmatter reader for Phase 6 integration
├── outputs/                  # Default landing zone for standalone runs
├── requirements.txt
└── README.md
```

---

## What it produces

```
header.html   # Self-contained: inline CSS, inline SVG logo, base64-embedded Gilroy
header.png    # 1200 × 600 logical pixels (2400 × 1200 actual, 2× DPI)
```

The PNG is what gets uploaded to HubSpot as the hero image. The HTML is preserved alongside it so you can hand-tweak typography, swap a word, or re-render without re-running the full Python pipeline.

---

## The five patterns

Tuned for 2:1 aspect ratio. All use brand colors and Gilroy. The CLI auto-picks one from the title shape; override with `--pattern <name>`.

| Pattern         | When to use                                                           | Background        |
| --------------- | --------------------------------------------------------------------- | ----------------- |
| `clean-light`   | Default. Versatile. Big bold headline with one accent word in red.    | Light (`#F8F8F8`) |
| `contrarian`    | Pattern-interrupt; opinionated headlines; "stop doing X" framing.     | Dark gradient     |
| `stat-highlight`| The title IS a number / stat (e.g. "$0.008 per email", "3× pipeline").| Dark + red glow   |
| `question-hook` | "X vs Y" comparisons; "How/Why/What" questions; pain-point framing.   | Light + accent    |
| `report-cover`  | Reports, whitepapers, benchmarks, multi-chapter playbooks.            | Dark + glass card |

Auto-pick rules (deliberately simple, audit-friendly):

- Number-led title with `%`/`x`/`×` → `stat-highlight`
- "X vs Y" or starts with How/Why/What/When/Should/Is → `question-hook`
- Mentions report/whitepaper/benchmark/study/research/playbook/guide → `report-cover`
- Contains don't/stop/no one/actually/wrong/myth → `contrarian`
- Otherwise → `clean-light`

---

## Setup

```bash
cd blogheaderimagegen/
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# Chromium is shared with blogscraper/ — only install if you haven't already:
python -m playwright install chromium
```

Brand font files are read from `config/brand-assets/fonts/` (declared per-weight in `company.yaml` under `brand.font.files`) and base64-embedded into each generated HTML so the PNG renders pixel-perfect in headless Chromium and the HTML is portable to any browser. If no font files are declared or found, the CSS fallback stack is used; if a logo SVG is missing, a styled text wordmark of `company.name` is rendered instead.

---

## Usage

### Standalone — pass the title directly

```bash
.venv/bin/python generate_header.py \
  --title "How agentic procurement replaces the RFP cycle" \
  --keyword "agentic procurement" \
  --subtitle "Same buyer. Same suppliers. New floor on cycle time." \
  --pattern clean-light \
  --output outputs/agentic-procurement
```

→ writes `outputs/agentic-procurement/header.html` and `header.png`.

### From a finalized article folder (Phase 6 of the production system)

```bash
.venv/bin/python generate_header.py --from-article ../articles/2026-04-29-rag-vs-fine-tuning/
```

The CLI reads the article's frontmatter (`title`, `primary_keyword`, `meta_description`, `category`) and writes `header.html` + `header.png` directly into the article folder. The orchestrator then sets `hero_image: "header.png"` in the article's frontmatter.

### Render all five patterns (design review)

```bash
.venv/bin/python generate_header.py \
  --title "How agentic procurement replaces the RFP cycle" \
  --keyword "agentic procurement" \
  --pattern all \
  --output outputs/agentic-procurement
```

→ writes `header-clean-light.{html,png}`, `header-contrarian.{html,png}`, …

Use this for design review / picking. Don't ship five hero images on one post.

### CLI flags

| Flag                | Default | Purpose                                                                  |
| ------------------- | ------- | ------------------------------------------------------------------------ |
| `--from-article DIR`| —       | Use frontmatter from a Phase 1–5 article folder (mutually exclusive with `--title`). |
| `--title TEXT`      | —       | Headline. Required when not using `--from-article`.                      |
| `--subtitle TEXT`   | —       | Optional dek under the title. Defaults to article meta_description.      |
| `--eyebrow TEXT`    | —       | Optional uppercase pill above title. Defaults to article category.       |
| `--keyword TEXT`    | —       | Word/phrase in the title to highlight in red. Defaults to primary_keyword or last word. |
| `--pattern NAME`    | `auto`  | `auto` \| `all` \| `clean-light` \| `contrarian` \| `stat-highlight` \| `question-hook` \| `report-cover` |
| `--output DIR`      | —       | Output folder. Default: alongside article folder, or `./outputs/<slug>/`. |
| `--filename-stem`   | `header`| Base filename. Outputs are `<stem>.html` and `<stem>.png`.               |
| `-v` / `--verbose`  | off     | DEBUG-level logging.                                                     |

---

## How to extend

**Add a new pattern.** Add a `render_<name>(inp: HeaderInputs) -> str` function to `lib/patterns.py`, register it in `PATTERN_RENDERERS` and `PATTERN_NAMES`, optionally add a heuristic to `auto_pick`. No other files need to change.

**Change the brand.** Edit `lib/brand.py`. Colors, logo SVGs, and Gilroy font lookup all live there. The patterns import from this module — no other module hardcodes brand values.

**Change the dimensions.** Edit `HEADER_WIDTH` and `HEADER_HEIGHT` in `lib/render.py`. The patterns are tuned for 1200×600; other ratios will need template adjustments.

---

## Tone-of-voice (apply when drafting `--title` / `--subtitle`)

Company-specific rules live in `config/company.yaml` (`voice.style_rules` + `voice.banned_phrases`) — apply those first. Generic header rules:

- **No corporate fluff:** "leverage", "synergy", and friends (see `standards/banned-phrases.txt`).
- **One idea per header.** If there are two ideas, you wanted two posts.
- Headers under ~14 words. Subtitles under ~18 words.

---

## Limitations

- **Pattern auto-pick is heuristic, not semantic.** It reads keywords in the title; it doesn't read the article body. For non-obvious picks, override with `--pattern`.
- **Keyword-highlighting is whole-word, case-insensitive, first-match.** If your keyword is "rag" and the title contains "ragged", you'll get the wrong highlight — pass a more specific `--keyword` or rely on the last-word fallback.
- **Headless Chromium honors `font-display: block`.** If the brand font doesn't load fast enough, rendering will pause briefly rather than fall back. If you see a system-fallback font in the PNG, check `brand.font.files` in `company.yaml` against the files in `config/brand-assets/fonts/`.
- **No image inputs.** The patterns are typography-led by design. If you want a hero photo behind the title, add a new pattern that includes an `<img>` tag.
