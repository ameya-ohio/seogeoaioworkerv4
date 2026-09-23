# GEO Checklist — Generative Engine Optimization

GEO is about being **the source generative engines reach for** — Google AI Overviews, Perplexity citations, ChatGPT browsing answers, Gemini's grounded responses. Different from SEO: ranking for a query is the prize in SEO; *being cited inside the answer* is the prize in GEO.

The Editor walks this list explicitly.

---

## Tier 1 — Foundational

### Direct, factual, citation-worthy statements
- Write in declarative sentences with a clear subject, verb, and concrete fact.
- Avoid hedged or ambiguous phrasing ("could potentially," "may sometimes," "in certain cases") unless the hedge is itself the fact.
- A good test: can a generative engine quote this sentence as a standalone fact and cite the article? If yes, you've written for GEO.

### Statistics with sources
- Every statistic in-text is paired with a named source ("according to a 2025 McKinsey survey of 800 enterprises…").
- The source's authority matters more than the impressiveness of the number.

### Direct answers near the top
- The intro previews the thesis in plain language by paragraph two or three.
- The Key Takeaways block sits near the top and contains the article's most quotable, citable lines.

### Definition-style sentences for key terms
- Bold the term, write a clean definition: `**Agentic procurement** is …`.
- Keep the definition under 25 words.
- Use the simplest accurate phrasing — AI engines extract these as authoritative definitions.

### Author authority signals
- Author name in frontmatter and on-page.
- Bio link (`author_bio_url` in frontmatter) resolving to a page with credentials, role, prior work.
- Schema `Person` node populated with `sameAs` to LinkedIn / Twitter / personal site.

### Publisher authority signals
- Schema `Organization` populated with `name`, `url`, `logo`, `sameAs`.
- Article's domain is part of a recognizable, topical site (the company's domain for its core topic area).

---

## Tier 2 — Differentiation

### Original insights / unique data / proprietary frameworks
- The article should contain at least one thing the top 10 ranking pages don't have. Examples: a proprietary company framework, internal benchmark data, a specific methodology, a counter-intuitive finding.
- Generative engines reward novelty when grounding their answers — they need to cite *somewhere*, and that somewhere is usually the source with a unique claim.

### Quotable sentences
- 3–5 standalone, punchy, factual sentences scattered through the body. Each is one idea, complete out of context, citation-worthy.
- The Strategist sketches these in the outline; the Writer crafts them; the Editor preserves them.

### Topic comprehensiveness
- Cover what AI engines need to fully answer adjacent questions about the topic.
- This is *coverage*, not length — the article should be the kind of source where an AI engine, asked any reasonable sub-question, can find the answer.

### Entity richness
- Mention named entities — people, companies, products, concepts, methodologies — by name.
- Each major entity should appear at least once. The Schema `mentions` array lists them with `sameAs` links.

### Structured data depth
- BlogPosting + FAQPage + Person + Organization at minimum.
- DefinedTerm for inline-defined terms.
- HowTo where genuinely applicable.
- Citation array on the BlogPosting referencing the external sources used.

---

## Tier 3 — Co-citation and corroboration

### External corroboration
- Link to authoritative sources that confirm the article's claims.
- AI engines weight articles cited *by* high-authority pages and articles that themselves cite high-authority pages. Be in the same neighborhood.

### Co-citation hygiene
- The external links you add should be domains AI engines already cite for this topic. (Research phase identifies these patterns.)

### Freshness signals
- `publish_date` and `modified_date` populated.
- Year stamps on time-bound claims.
- Update articles when the underlying facts move; bump `modified_date` and re-publish.

---

## Tier 4 — Defensive

### Avoid AI-generated patterns
- Banned phrases (see `quality-bar.md`) are *not* just stylistic preferences — generative engines have learned to deprioritize text that looks AI-written. Counter-intuitively, AI-detectable text gets cited *less*.
- Vary sentence length and structure. Prefer concrete to abstract. Avoid the AI cadence of every-paragraph-the-same-shape.

### No content-farm patterns
- No bullet-list spam where prose would be clearer.
- No "summary of summaries" content with no original perspective.
- No keyword-stuffed introductions.

---

## How GEO differs from SEO (one-pager)

| Goal               | SEO                           | GEO                                                   |
| ------------------ | ----------------------------- | ----------------------------------------------------- |
| What's rewarded    | Click on a blue link          | Citation inside an AI answer                          |
| Optimization unit  | Page                          | Sentence (the line that gets quoted)                  |
| Authority signal   | Backlinks                     | Co-citation, entity richness, factual density         |
| Structure          | Skimmable sections            | Direct-answer-per-section + structured Q/A           |
| Schema role        | Helps with rich results       | Helps engines ground the citation                    |
| Banned             | Keyword stuffing              | AI-detectable phrasing                               |

GEO is a superset of good editorial discipline. If the article is truly excellent, it tends to rank in both worlds.
