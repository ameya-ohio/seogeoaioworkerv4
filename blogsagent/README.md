# blogsagent — Markdown → HubSpot Blog Post Publisher

A small Python pipeline that takes a structured markdown file and publishes
it as a fully-formatted blog post to HubSpot via the v3 CMS Blog Posts API.

## Layout

```
blogsagent/
├── md_to_hubspot/
│   ├── parser.py          # markdown + YAML frontmatter -> PostInput
│   ├── html_builder.py    # markdown body -> Gilroy/black HTML; JSON-LD -> headHtml
│   ├── hubspot_client.py  # v3 API client; resolves blog & author IDs; caches them
│   └── main.py            # CLI: parse -> build -> publish
├── samples/
│   └── sample_post.md     # example input
├── requirements.txt
├── .env.example
└── .gitignore
```

## Install

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Configure

Copy `.env.example` to `.env` and fill in your HubSpot **private app token**:

```bash
cp .env.example .env
# edit .env, set HUBSPOT_TOKEN=pat-...
```

The token must have these scopes: `content` (read+write blog posts) and the
read scopes for blog authors and blog settings.

On first publish run the client looks up:

- the **blog (`contentGroupId`)** via `GET /cms/v3/blog-settings/settings`
- the **author (`blogAuthorId`)** by matching `displayName` against `author.name` from `config/company.yaml` (or directly from `hubspot.blog_author_id` there)
  via `GET /cms/v3/blogs/authors`

Both are cached in `.config_cache.json` next to where you run the CLI. You
can pre-seed or override that file at any time:

```json
{
  "content_group_id": "104001906678",
  "blog_author_id": "343954969844"
}
```

If multiple blogs or multiple authors with the same name exist, the client
errors with the candidate list and asks you to pick one in the cache file
explicitly. (HubSpot can have duplicate author records — verify before
trusting auto-detection.)

## Input format

A YAML frontmatter block followed by a markdown body:

```markdown
---
title: "Post title"
slug: "url-slug"
meta_description: "~155-char SEO description."
html_title: "Optional <title> override"        # optional
schemas:                                        # optional list of JSON-LD objects
  - "@context": "https://schema.org"
    "@type": "Article"
    headline: "Post title"
  - "@context": "https://schema.org"
    "@type": "FAQPage"
    mainEntity: [...]
---

# Optional H1 (will be stripped — HubSpot renders the title separately)

Body markdown. **Bold**, _italic_, [internal link](/some-page),
[external link](https://example.com), lists, blockquotes, etc.

## Section heading

Lower-level headings (`##`, `###`, ...) are kept as-is.
```

See [`samples/sample_post.md`](samples/sample_post.md) for a complete example.

### What the HTML builder does

- Wraps the rendered HTML in a styled `<div class="ew-post">` with **Gilroy**
  font (with a sans-serif fallback stack) and **black** body text.
- Strips/downgrades any leading `<h1>` so the post body never duplicates the
  HubSpot template's title.
- Adds `target="_blank" rel="noopener"` to **external** links only;
  internal links (relative paths, anchors, `mailto:`, `tel:`) keep default
  in-tab behavior.
- Renders each frontmatter `schemas` entry as a
  `<script type="application/ld+json">` block and sends them via HubSpot's
  `headHtml` field, which gets injected into the post page's `<head>`.

## Run it

Publish (default — creates the post in `PUBLISHED` state):

```bash
python -m md_to_hubspot.main samples/sample_post.md
```

Build the HTML and print it; **don't** call HubSpot:

```bash
python -m md_to_hubspot.main samples/sample_post.md --dry-run
```

Create the post in HubSpot but leave it as a draft:

```bash
python -m md_to_hubspot.main samples/sample_post.md --draft
```

Verbose logging:

```bash
python -m md_to_hubspot.main samples/sample_post.md -v
```

On success the CLI prints the live post URL.

## Environment variables

| Var                | Required | Purpose                                     |
| ------------------ | -------- | ------------------------------------------- |
| `HUBSPOT_TOKEN`    | yes      | HubSpot private app bearer token.           |
| `HUBSPOT_BASE_URL` | no       | Override API base URL (default `https://api.hubapi.com`). |

## Notes / gotchas

- **`headHtml` is the right field** for JSON-LD on a per-post basis.
  Some HubSpot doc pages don't list it explicitly, but it's a real field on
  the v3 blog post object and is rendered into `<head>`.
- The HubSpot v3 publish flow is: `POST /cms/v3/blogs/posts` with
  `state: "PUBLISHED"` and `publishImmediately: true`. There is no separate
  publish endpoint for first-time publish.
- Slugs are stored without leading/trailing slashes — HubSpot scopes the
  slug under the parent blog's path.
