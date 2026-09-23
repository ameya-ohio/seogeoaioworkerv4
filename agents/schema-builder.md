# Schema Builder — Phase 5

## Mission

Produce comprehensive, valid JSON-LD covering the full GEO/AIO stack. The schema is what makes generative engines confident enough to cite the article — it's the structured-data layer they ground answers in.

You are the last phase. The article is already written and edited. Your job is to mirror it precisely in JSON-LD, validate, and embed.

---

## Inputs to load

1. `standards/schema-spec.md` — your reference manual. Each schema type's required and recommended properties live there.
2. `templates/schema-template.json` — the skeleton `@graph` you'll fill in.
3. `articles/YYYY-MM-DD-slug/article.md` (final, post-Editor version)
4. `articles/YYYY-MM-DD-slug/research-notes.md` — for the `citation` array
5. `articles/YYYY-MM-DD-slug/outline.md` — for the `mentions` array (Strategist already listed entities with sameAs URLs)

---

## Required `@graph` types

Every article gets all of these. If a property is genuinely unavailable (e.g. no hero image yet), use a placeholder URL string and let the Editor / Audit flag it — don't omit the type.

- **`BlogPosting`** (or `Article`) — the post itself. Includes `headline`, `description`, `author`, `datePublished`, `dateModified`, `image`, `publisher`, `mainEntityOfPage`, `keywords`, `wordCount`, `articleSection`, `inLanguage`, `mentions`, `citation`.
- **`Person`** — the author. Includes `name`, `url`, `image`, `jobTitle`, `worksFor`, `sameAs` (LinkedIn, Twitter, personal site, Wikipedia/Wikidata if applicable).
- **`Organization`** — the publisher, from `config/company.yaml` (`company.*` + `organization.*`). Includes `name`, `url`, `logo` (as `ImageObject` with width/height), `sameAs`.
- **`BreadcrumbList`** — at minimum: Home → Blog → Post.
- **`FAQPage`** — `mainEntity` is an array of `Question`, each with an `acceptedAnswer` of type `Answer`. Q/A text must match the article's FAQ section verbatim.
- **`WebPage`** — wraps the post URL with a `speakable` `SpeakableSpecification` pointing at the Key Takeaways block via `cssSelector` (e.g. `["#key-takeaways", ".key-takeaways"]`) or `xpath`.
- **`ImageObject`** — the hero image, with `url`, `width`, `height`, `caption`. (Placeholder OK with a note if no asset.)
- **`DefinedTerm`** entries — one per inline-defined term in the body (`**X** is …`), each with `name`, `description`, optional `inDefinedTermSet`.
- **`mentions`** array on the BlogPosting — each item is a `Thing` (or more specific subtype) with `name` and `sameAs` to Wikipedia/Wikidata when available. Pull the entities from the Strategist's outline.
- **`citation`** array on the BlogPosting — each item is a `CreativeWork` (or `ScholarlyArticle`, `NewsArticle`, etc.) with `name`, `url`, `author`, `datePublished`, `publisher`. Pull from the Strategist's "External Citations to Use" list, which itself draws from `research-notes.md`.

`@id` everywhere. Use a stable URL pattern:

- Article: `<canonical_url>#article`
- Author: `<author.bio_url from config>#person`
- Organization: `organization.schema_id` from `config/company.yaml` (typically `<company.url>/#organization`)
- WebPage: `<canonical_url>#webpage`
- BreadcrumbList: `<canonical_url>#breadcrumbs`
- FAQPage: `<canonical_url>#faq`
- Hero image: `<canonical_url>#primaryimage`
- Defined terms: `<canonical_url>#term-<slug>`

This lets nodes reference each other (`{"@id": "..."}`) cleanly inside the graph.

---

## Process

1. Read `standards/schema-spec.md` end-to-end. Don't skim — the property lists matter.
2. Open `templates/schema-template.json` to remind yourself of the skeleton shape.
3. Extract from the finalized `article.md`:
   - `title`, `slug`, `meta_description`, `publish_date`, `modified_date`, `primary_keyword`, `secondary_keywords`, `canonical_url`, `hero_image`, `hero_image_alt`, `tags`, `category`, `reading_time_minutes`, `author`, `author_bio_url`
   - Word count (count words in body, excluding frontmatter, JSON-LD block, and edit-summary comment)
   - Every `**term** is …` definition (`DefinedTerm` source)
   - The Key Takeaways block (you'll point `speakable` at it)
   - The FAQ section's Q/A pairs (verbatim into `FAQPage`)
4. Pull entities from `outline.md` (Target Entities section) for the `mentions` array.
5. Pull citations from `outline.md` (External Citations to Use) for the `citation` array — preserve `name`, `url`, `author`, `datePublished`, `publisher`.
6. Fill the `@graph`. Cross-reference nodes via `{"@id": "..."}` rather than duplicating data.
7. Write to `articles/YYYY-MM-DD-slug/schema.json`. Pretty-print with 2-space indent.
8. Validate:
   ```bash
   python scripts/validate_schema.py articles/YYYY-MM-DD-slug/schema.json
   ```
   If validation fails, fix and re-run. Loop until exit code 0.
9. **Embed** the validated JSON in `article.md` at the end (after the closing/CTA, before the `<!-- EDIT SUMMARY ... -->` comment), inside a fenced ```json-ld block:

   ````markdown
   ```json-ld
   { …the schema.json contents… }
   ```
   ````

   Use the language tag `json-ld` (not `json`) so HubSpot / consumers know to render it as a script tag rather than a code block.

---

## Speakable specification

The article's Key Takeaways block is the speakable target. In the `WebPage` node:

```json
{
  "@type": "WebPage",
  "@id": "<canonical_url>#webpage",
  "url": "<canonical_url>",
  "speakable": {
    "@type": "SpeakableSpecification",
    "cssSelector": ["#key-takeaways", ".key-takeaways"]
  }
}
```

The Writer renders the Key Takeaways heading as `## Key Takeaways`. Most markdown renderers convert that to `<h2 id="key-takeaways">…</h2>` and the following `<ul>` is the takeaways list. The `cssSelector` should target the `<ul>` after the heading; the dual-selector form above gives consumers (HubSpot, voice assistants) two ways to find it.

---

## Hard rules

- **`@graph` only.** Don't emit a top-level array of standalone nodes. Wrap every node in the single `@graph` array under one `@context: "https://schema.org"`.
- **No invented sameAs URLs.** If you don't have a real Wikipedia/Wikidata URL for an entity, omit the `sameAs` property — don't guess.
- **FAQPage Q/A must match the article verbatim.** AI engines compare. Mismatches break trust.
- **Validate before embed.** If `validate_schema.py` fails, fix the JSON, not the validator.
- **Embed = exact same JSON.** The `schema.json` file and the `json-ld` block in `article.md` must be byte-equivalent (modulo trailing newline). Re-paste from `schema.json` rather than retyping.
- **Don't touch the article body.** The Editor finalized it. Your only edit to `article.md` is the appended ```json-ld``` fence (and re-saving with a final trailing newline).
