# BlogScraper

A multi-agent blog scraping system. Give it a blog index URL; it discovers every article, extracts the body text and header image, and writes a clean, resumable folder of markdown + images + a manifest.

```
blogscraper/
├── scrape_blog.py            # CLI entry point
├── agents/
│   ├── discovery.py          # URL enumeration (sitemap → pagination → browser)
│   ├── extraction.py         # title / body / header image / publish date
│   ├── download.py           # async image downloads with retries
│   └── orchestrator.py       # concurrency, jitter, manifest, resume
├── utils/
│   ├── slugs.py              # slug + filename helpers
│   ├── urls.py               # URL normalization, blog-path filters
│   └── robots.py             # async robots.txt loader (with caching)
├── requirements.txt
└── README.md
```

---

## Setup

```bash
cd blogscraper/
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# Browser engine for JS-heavy sites:
python -m playwright install chromium
```

Python 3.10+ recommended.

---

## Usage

### Quick scrape

```bash
python scrape_blog.py https://example.com/blog
```

This will:
1. Fetch `robots.txt` and respect it.
2. Discover article URLs via sitemap, falling back to HTML pagination.
3. Extract the title, body, header image URL, and publish date for each.
4. Download header images.
5. Write everything under `./example.com/blog/`.

### JS-rendered sites (Artisan, Webflow, Framer, Builder.io, etc.)

```bash
python scrape_blog.py https://www.artisan.co/blog --use-browser
```

`--use-browser` flips both Discovery and Extraction to Playwright/Chromium. Discovery scroll-loads the index page (and clicks `Load more` / `Show more` buttons); Extraction renders each article fully before passing the HTML to trafilatura.

### Test the pipeline

```bash
python scrape_blog.py https://www.artisan.co/blog --use-browser --max-articles 3
```

### Dry run (discover only, no fetching of bodies/images)

```bash
python scrape_blog.py https://example.com/blog --dry-run
```

Prints the discovered URLs. Useful for confirming the discovery filter.

### CLI flags

| Flag                | Default | Purpose                                                                 |
| ------------------- | ------- | ----------------------------------------------------------------------- |
| `url` (positional)  | —       | Blog index URL.                                                         |
| `--output-dir DIR`  | `./`    | Override the output root. Domain folder is created inside it.           |
| `--max-articles N`  | none    | Stop after N new articles (useful for testing).                         |
| `--no-images`       | off     | Skip image download. Text-only run.                                     |
| `--use-browser`     | off     | Use Playwright/Chromium for discovery + extraction. Required for JS sites. |
| `--dry-run`         | off     | Discovery only; print URLs and stop.                                    |
| `--concurrency N`   | `5`     | Max concurrent extraction/download tasks.                               |
| `-v` / `--verbose`  | off     | DEBUG-level logging on console + `scrape.log`.                         |

---

## Output layout

For input `https://www.artisan.co/blog`, the script writes into:

```
artisan.co/
└── blog/
    ├── blog_text/
    │   ├── how-to-build-an-ai-bdr.md
    │   ├── outbound-vs-inbound-2025.md
    │   └── ...
    ├── blog_images/
    │   ├── how-to-build-an-ai-bdr.jpg
    │   ├── outbound-vs-inbound-2025.png
    │   └── ...
    └── manifest.json
```

Each `blog_text/<slug>.md` has YAML frontmatter:

```markdown
---
title: "How to build an AI BDR"
url: "https://www.artisan.co/blog/how-to-build-an-ai-bdr"
published: "2025-08-12T09:00:00+00:00"
image_filename: "how-to-build-an-ai-bdr.jpg"
---

(article body in markdown)
```

`manifest.json` is the single source of truth for what's been scraped:

```json
{
  "target": "https://www.artisan.co/blog",
  "domain_root": "artisan.co",
  "blog_path": "/blog",
  "generated_at": "2026-04-29T15:12:43+00:00",
  "articles": [
    {
      "url": "https://www.artisan.co/blog/how-to-build-an-ai-bdr",
      "title": "How to build an AI BDR",
      "text_path": "blog_text/how-to-build-an-ai-bdr.md",
      "image_path": "blog_images/how-to-build-an-ai-bdr.jpg",
      "image_url": "https://cdn.artisan.co/...",
      "published": "2025-08-12T09:00:00+00:00",
      "date_scraped": "2026-04-29T15:12:43+00:00",
      "status": "ok",
      "error": null
    }
  ]
}
```

`status` is one of:
- `ok` — text saved, image saved (or `--no-images`/no image URL was reported).
- `partial` — text saved, but image download failed.
- `failed` — extraction returned no body; nothing was saved for this URL.

---

## Resume

Re-running the same command skips any URL already present in `manifest.json`. To force re-scrape of one article, edit the manifest and remove its entry — or delete the manifest and re-run from scratch.

---

## Politeness & robots.txt

- Default `User-Agent`: `BlogScraper/1.0 (+contact: configure in README)`. Edit `agents/orchestrator.py` to add your contact email.
- Per-request jitter of 0.5–1.0s.
- Concurrency cap of 5 by default.
- Honors `robots.txt`: refuses to start if the index is disallowed, and skips any individual article URL that's disallowed.
- Honors `Sitemap:` directives in `robots.txt` — uses them as the first discovery source when present.

---

## Limitations

- **Headless browser detection.** Some sites (Cloudflare-protected, fingerprint-aware) block headless Chromium. There's no built-in workaround beyond switching off `--use-browser` and trying `httpx`-only mode, which works on most sitemap-friendly sites.
- **Single-page applications without sitemaps and without scroll-based pagination** may be missed entirely. If the index uses a custom "Next" carousel or category tabs, the discovery agent's scroll-and-click loop may not find all articles. Inspect the network calls in DevTools and consider feeding URLs explicitly.
- **Image extraction is best-effort.** The pickers fall through `og:image` → `twitter:image` → `<link rel="image_src">` → `<article> <img>` → first wide `<img>` → first `<img>`. Sites with non-standard markup may yield the wrong image. The original URL is preserved in `manifest.json` so you can audit.
- **Lazy-loaded images.** The script honors `data-src` and `data-lazy-src` attributes, but truly client-side-rendered images (loaded only after specific scroll events on the article body itself) may resolve to a placeholder. `--use-browser` mitigates this for most sites.
- **Pagination heuristics.** The HTML-mode crawl tries `?page=N` and `/page/N` patterns. Sites with custom pagination schemes (e.g., `/blog/p/2`, cursor-based pagination, year/month archives) may need a sitemap or `--use-browser`.
- **No PDF or attachment handling.** Articles that are mostly PDFs/iframes won't extract usefully.
- **Date formats vary wildly.** The publish date is captured as ISO-8601 when possible, otherwise stored as the raw string from the meta tag. Don't rely on it for sorting without re-parsing.

---

## Logging

All runs append to `<output-dir>/<domain>/scrape.log`. Failures don't crash the run — each per-article exception is logged and the orchestrator moves on. The final summary prints the breakdown of OK/partial/failed.

---

## Legal

Scraping public blog content for personal/research use is generally fine. If you plan to **republish** or use this commercially, check the target site's Terms of Service and robots.txt first — the scraper respects robots.txt but ToS is a separate document the script can't read. When in doubt, ask.
