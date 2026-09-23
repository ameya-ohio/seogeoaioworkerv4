# SEO Checklist

Practical, prioritized SEO requirements every article must meet. The Editor walks this list explicitly. Items are grouped by impact.

---

## Tier 1 — Non-negotiable

### Title tag
- 50–60 characters (count visible chars; emoji and quotes count).
- Primary keyword near the front (first three words ideally).
- Compelling, not generic ("How to" / "X vs Y" / specific number).
- Not clickbait — must accurately describe the article.

### Meta description
- 140–160 characters.
- Primary keyword present, naturally.
- Clear value proposition — what does the reader learn or get?
- Soft CTA at the end ("…here's the framework," "…what changed in 2026," "…and when to use each").

### URL slug
- Lowercase, hyphenated, ≤ 60 chars.
- Keyword-focused; remove stop words ("a," "the," "and") unless they change meaning.
- Stable — never change a slug after publish (set up a redirect instead).

### H1
- Exactly one per page.
- Matches search intent (informational article ≠ commercial landing page).
- Includes primary keyword (close paraphrase OK if natural).

### Primary keyword in first 100 words
- Count from the first word of the body (not the frontmatter).
- Naturally placed — not stuffed.

### Canonical URL
- Set in frontmatter.
- Self-canonical for original articles; explicit canonical to the original for syndicated content.

---

## Tier 2 — Strong impact

### H2/H3 hierarchy
- Logical and scannable.
- No skipped levels (no H4 under an H2 with no H3 between them).
- Headings include keyword variations and entities where natural.
- Avoid pure-keyword headings — write for humans.

### Keyword density and semantic richness
- Don't target a density number. Target *coverage*: the article should mention the entities, sub-topics, and adjacent terms a reader would expect. Modern search engines reward topic comprehensiveness over repetition.
- Primary keyword: 2–4 times per 1,000 words is plenty.
- Secondary keywords: appear at least once each.
- Co-occurring entities: appear naturally as context demands.

### Internal linking
- Minimum 3 internal links to related pages on the company's site when site context exists.
- Use descriptive anchor text — never "click here," never the bare URL.
- Place links where they actually help the reader navigate, not at the bottom as an afterthought.

### External authoritative links
- Minimum 3 external links to authoritative domains (gov, edu, recognized publications, primary research, official documentation).
- Open in new tab via the publisher's standard handling.
- Anchor text = source name or claim, not "according to this study."

### Image alt text
- Descriptive — what's actually in the image.
- Keyword-aware where natural; never keyword-stuffed.
- Empty alt (`alt=""`) for purely decorative images.

### Word count
- **Spoke brief present:** the brief's length band (default 800–2,000 words) is the target — it overrides SERP-median matching (D31). Hit the band; anything outside it needs the brief's own justification.
- **No brief:** match the SERP. The Strategist sets a target. Hit it within ±15% unless the topic genuinely needs less.
- Padding hurts more than length helps.

---

## Tier 3 — Refinement

### Mobile formatting
- Paragraphs 2–4 sentences.
- Bullets and numbered lists where parallel structure exists.
- Tables for comparison content.
- Bold for genuinely important phrases (definitions, key terms) — not for emphasis spam.

### Hero image
- Note dimensions in frontmatter (e.g. 1600×900) so consumers can budget page-load.
- Modern format (WebP preferred; PNG/JPG OK). Compressed.
- Filename keyword-aware (e.g. `agentic-procurement-hero.webp`).

### Schema markup
- Present and validated. Phase 5 handles this — the Editor confirms the `json-ld` fence exists and `schema.json` is in the folder.

### Freshness signals
- `publish_date` and `modified_date` populated in frontmatter.
- Time-bound claims have a year stamp ("In 2025…", "As of Q1 2026…").

### Structured data beyond the basics
- FAQPage (always — built from the article's FAQ section).
- DefinedTerm (when terms are defined inline).
- HowTo (only when the article is genuinely a step-by-step process — don't force it).

---

## How to walk this checklist (Editor's job)

For each item: write **PASS / FAIL / NOTES** in the working pass. Fix every FAIL in `article.md`. Document any deliberately accepted exception in the edit summary at the bottom of the article.
