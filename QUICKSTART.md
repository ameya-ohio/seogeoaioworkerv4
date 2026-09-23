# QUICKSTART

The one-page operator handbook. For deep reference see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## First-time setup (60 seconds)

```bash
# In each tool, create a venv and install deps:
for d in blogsagent blogheaderimagegen blogscraper; do
  (cd $d && python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt)
done

# One-time: install headless Chromium (shared across tools)
blogheaderimagegen/.venv/bin/python -m playwright install chromium

# HubSpot token + cached IDs
cat > blogsagent/.env <<'EOF'
HUBSPOT_TOKEN=pat-eu1-...
HUBSPOT_BASE_URL=https://api.hubapi.com
EOF
cat > blogsagent/.config_cache.json <<'EOF'
{ "blog_author_id": "245720213752", "content_group_id": "104001906678" }
EOF
```

---

## Write an article

In Claude Code, in this repo:

```
Write an article about <topic>
```

Optional variants:

```
Write an article about <topic>, target keyword "<kw>"
Write an article using this outline: <paste>
```

Claude reads `CLAUDE.md`, scaffolds `articles/YYYY-MM-DD-<slug>/`, runs the 6 phases (Researcher → Strategist → Writer → Editor → Schema Builder → Header Designer), runs the audit, and reports a summary.

**Expect:** 5–10 minutes per article. Output is `article.md` + `schema.json` + `header.png` + `research-notes.md` + `outline.md` in the folder.

---

## Audit any article

```bash
python scripts/seo_audit.py articles/<folder>/
```

Returns 21 checks as `PASS / WARN / FAIL`. Anything FAIL routes back to Phase 4 (Editor).

---

## Publish a single article as draft

```bash
cd blogsagent
.venv/bin/python /tmp/publish_cluster.py   # adapter handles 1 or many
```

Or call `blogsagent` directly on a pre-adapted markdown file:

```bash
cd blogsagent
.venv/bin/python -m md_to_hubspot.main /tmp/cluster-publish/<file>.md --draft
```

Returns post `id` + `url`. Draft lives at `<blog.base_url from config/company.yaml>/<slug>` (not yet public).

---

## Publish the whole cluster as drafts

```bash
cd blogsagent
.venv/bin/python /tmp/publish_cluster.py
```

Loops every article folder, adapts each to blogsagent format (strips `json-ld` fence + edit-summary comment, injects schema into frontmatter), publishes as `--draft`, writes IDs to `/tmp/cluster-publish/manifest.json`.

---

## Flip a draft to live

```bash
curl -X PATCH "https://api.hubapi.com/cms/v3/blogs/posts/<post_id>" \
  -H "Authorization: Bearer $HUBSPOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"state": "PUBLISHED"}'
```

Or ask Claude: `go live on 398990670054` (single) or `go live on the whole cluster` (batch).

---

## Generate a header standalone

For ad-hoc graphics outside the article pipeline:

```bash
blogheaderimagegen/.venv/bin/python blogheaderimagegen/generate_header.py \
  --title "Your headline" \
  --keyword "word to highlight in red" \
  --subtitle "Optional dek." \
  --pattern clean-light \
  --output outputs/<slug>
```

Patterns: `clean-light` (default), `contrarian`, `stat-highlight`, `question-hook`, `report-cover`, `auto`, `all`.

---

## Scrape a competitor blog

```bash
cd blogscraper
.venv/bin/python scrape_blog.py https://<site>/blog --use-browser
python3 tools/build_topic_index.py <domain>/blog/manifest.json
```

Output: `<domain>/blog/{blog_text,blog_images,manifest.json,topic_index.{json,md}}`. Feed the topic index into a Researcher phase as gap-analysis input.

---

## When something's wrong

| Symptom | First place to look |
|---|---|
| Audit FAIL on primary keyword | First 100 words of body; the tokenizer hyphen-strips for matching |
| Audit FAIL on word count | Within `±15%` of outline target; trim or split |
| Header looks wrong (long title overflows) | Use `--pattern clean-light` (most title-tolerant); avoid `stat-highlight` for non-stat titles |
| Em-dashes flagged | Brand ToV requires zero; replace with comma, semicolon, parens, or sentence split |
| Banned phrase flagged | List in `standards/quality-bar.md`; the Editor must rewrite the sentence |
| HubSpot 502 | Transient. Re-run the publisher; resume skips already-created posts |
| Schema validation fails | Run `python scripts/validate_schema.py <folder>/schema.json`; fix per the error |

---

## Documentation map

- **You are here.** Operator handbook.
- **[README.md](README.md)** — system overview, the 6-phase pipeline at a glance, folder layout.
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — full architecture reference: 4 executables, every phase, cluster threading, publishing pipeline, brand enforcement, design decisions, extension points.
- **[CLAUDE.md](CLAUDE.md)** — the runtime orchestrator. Claude reads this automatically when you ask for an article.

---

## Where each piece lives

| Folder | What's there |
|---|---|
| `agents/` | Per-phase agent specs (markdown briefs) |
| `standards/` | Editorial/technical bars every article must meet |
| `scripts/` | Stdlib utilities (`new_article.py`, `validate_schema.py`, `seo_audit.py`) |
| `templates/` | Blank skeletons (`article-template.md`, `schema-template.json`) |
| `context/` | Company proprietary inputs (brand, sales, marketing, finance, author-style) |
| `articles/` | Outputs: one folder per article |
| `blogsagent/` | HubSpot publisher |
| `blogheaderimagegen/` | 1200×600 header image generator |
| `blogscraper/` | Competitor blog scraper |
