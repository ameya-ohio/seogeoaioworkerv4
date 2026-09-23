# Header Designer — Phase 6

## Mission

Produce a 1200×600 blog header image (HTML + PNG) for the finalized article, using the company brand system (`config/company.yaml` + `config/brand-assets/`). The PNG is what gets uploaded to HubSpot as the post's hero image; the HTML is preserved alongside it for tweaks.

This phase runs **after** Phase 5 (Schema Builder) and only when the article is otherwise fully finalized.

---

## Inputs to load

- The finalized `articles/YYYY-MM-DD-slug/article.md` (frontmatter only — `title`, `primary_keyword`, `meta_description`, `category`).
- The brand system: colors, font, logo, ToV bans. The pipeline tool encodes all of these — you don't need to redo brand decisions, only feed the right inputs.

---

## Tooling

The implementation lives at `blogheaderimagegen/` (sibling to the production system at the repo root). It is a self-contained Python CLI:

```bash
.venv/bin/python blogheaderimagegen/generate_header.py \
  --from-article articles/YYYY-MM-DD-slug/ \
  --pattern auto
```

**What it does**
- Reads the article frontmatter.
- Picks one of five 1200×600 patterns via simple heuristics (or `--pattern <name>` if the agent overrides):
  - `clean-light` — light bg, big bold headline, accent word in red. **Default.**
  - `contrarian` — dark bg, huge centered headline. For pattern-interrupt or opinionated posts.
  - `stat-highlight` — vibrant, stat-led; the title IS the number.
  - `question-hook` — question above bold answer. For "X vs Y" or "How / Why / What" titles.
  - `report-cover` — premium dark gradient, eyebrow pill. For reports / whitepapers / playbooks.
- Renders the HTML via headless Chromium and saves a 1200×600 PNG (2× DPI).
- Output lands in the article folder by default: `articles/YYYY-MM-DD-slug/header.html` and `header.png`.

---

## When to override `--pattern`

The default `auto` is good. Override when:

- The article has a **standout statistic** that deserves the headline (`--pattern stat-highlight` and pass the stat as `--title`).
- The article is **explicitly contrarian** in tone — uses a "stop doing X" or "X is wrong" frame (`--pattern contrarian`).
- The article is a **report or playbook** — auto picks this when the title or category hints at it, but pass `--pattern report-cover` if not.

---

## Inputs you can override

| Frontmatter field    | Auto-mapped to  | Override flag    |
| -------------------- | --------------- | ---------------- |
| `title`              | headline        | `--title`        |
| `primary_keyword`    | accent-word     | `--keyword`      |
| `meta_description`   | subtitle / dek  | `--subtitle`     |
| `category`           | eyebrow pill    | `--eyebrow`      |

Override when the article's meta description is too long for a header (it will get truncated visually). Hand-write a 6–14-word `--subtitle` if so.

---

## Update the article frontmatter

After the header is generated:

1. Update the article's `hero_image` frontmatter to `"header.png"` (or the path the user expects HubSpot to read).
2. Update `hero_image_alt` with a short, accurate description (e.g. `"How agentic procurement replaces the RFP cycle — <company name>"`).

---

## Hard rules

- **Never invent brand colors or fonts.** The tool's brand module is the source of truth.
- **Don't accept a silent font downgrade.** The tool base64-embeds the brand font weights declared in `config/company.yaml` (`brand.font.files`, files in `config/brand-assets/fonts/`). If the headline renders in a system fallback font *and the config declares font files*, the declaration and the files on disk disagree — fix that, don't accept the fallback. (A company with no declared font files renders with the fallback stack by design.)
- **One pattern per run unless explicitly comparing.** `--pattern all` is for design review; never ship five candidates as the hero.
- **Don't edit the article body.** Phase 4 finalized it. Your only edit is the two frontmatter fields (`hero_image`, `hero_image_alt`).

---

## Gate

`articles/YYYY-MM-DD-slug/header.png` exists at exactly 2400×1200 pixels (1200×600 logical at 2× DPI), the PNG opens, and `hero_image` is set in the article frontmatter.
