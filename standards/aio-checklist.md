# AIO Checklist — AI Optimization

AIO is the discipline of being **surfaced and cited by ChatGPT, Perplexity, Claude, Gemini, and Google AI Overviews**. It overlaps with GEO but tilts more practical — the structures and patterns that make an article *easy for an LLM to extract*.

The Editor walks this list explicitly.

---

## Structural patterns LLMs love

### Question coverage — satisfied by the FAQ block, not body headers (D33)
- The FAQ section's H3s carry the question-shaped surface: real questions, phrased the way users prompt LLMs (`What is X?`, `How does X work?`, `X vs Y — which is better?`).
- **Body H2s stay declarative** (house style — see `context/author-style/`). The likely-query match lives in the answer-first sentence under each declarative heading, not in the heading itself.
- Never turn the body into a question→answer stack; that is the answer-farm anti-pattern the first live batch failed on.

### Direct answers in the first sentence after each header
- Don't open a section with throat-clearing ("There are several factors to consider…").
- Open with the answer: "Agentic procurement is … . The shift matters because … ."
- LLMs lift the first 1–2 sentences under a heading more often than mid-section text.

### Lists and tables where appropriate
- LLMs extract bullet lists and tables cleanly into their answers. Use them for:
  - Parallel facts (steps, requirements, options)
  - Comparisons (X vs Y vs Z)
  - Specifications (sizes, prices, criteria)
- Don't substitute lists for prose where prose is clearer — the Editor flags bullet-spam.

### Comparison content
- "X vs Y" sections are unusually citable. AI engines often answer "is X better than Y?" by quoting comparison content directly.
- Use a table when the comparison has ≥ 3 dimensions; use prose when it's a deeper conceptual contrast.

### Common patterns
- "What is \<X\>?"
- "How does \<X\> work?"
- "\<X\> vs \<Y\>"
- "Best \<X\> for \<Y\>"
- "When to use \<X\>" / "When NOT to use \<X\>"
- "Examples of \<X\>"
- "How to \<verb\> \<noun\>"

---

## Speakable content

- Mark a speakable section in schema. The Key Takeaways block is the default target.
- The block is short (3–6 bullets), each bullet is standalone-citable, none of them require context from the rest of the article.
- This makes the article voice-assistant-friendly and gives AI engines a clean summary surface.

---

## FAQ schema and content

### Structure
- An H2 `## Frequently Asked Questions`.
- Each H3 is a real question, phrased the way humans phrase it.
- Each answer is 2–5 sentences, direct, standalone, factual.

### Verbatim mirror in schema
- The `FAQPage.mainEntity` array is a verbatim mirror of the article's FAQ section.
- Question text in schema = H3 text in article. Answer text in schema = answer prose in article.
- AI engines compare these. Mismatches reduce trust.

---

## Entity-first writing

### Wikipedia-style entity definitions
- When introducing a named entity, define it in a Wikipedia-like way: "**\<Entity\>** is a \<class\> that \<key property\>."
- Link the first mention to the canonical source (Wikipedia, the official site, the standards body).

### Entity richness
- 5+ named entities per article (people, organizations, products, concepts).
- Each major entity has a `sameAs` URL in the schema `mentions` array (Wikipedia / Wikidata when available).

### Topical authority
- The article fits inside a larger topic cluster on the site.
- Internal links knit the cluster together.
- (Cluster strategy is a placeholder until `context/marketing/` provides the map.)

---

## Co-citation and authoritative neighborhood

### Link to who AI engines cite
- The Researcher identifies which domains AI engines reach for on this topic. The Writer links to those.
- Co-citation works in both directions: be cited alongside authoritative domains, *and* cite authoritative domains.

### Avoid low-authority neighborhoods
- Don't link to spam, content farms, AI-generated competitor content. AI engines weight the company you keep.

---

## Crawlability

### No critical content behind JS
- The body, headings, FAQ, and schema must be in the static HTML at first paint. Many AI crawlers don't execute JS reliably.
- Hero images via `<img>` with proper `src` (and `srcset` for responsive). Lazy-loading is fine; client-rendering is not.

### No walled gardens
- Don't put substantive content behind a sign-up gate or membership wall. AI engines won't index gated text.

### llms.txt compatibility
- Recommend creating an `llms.txt` at the site root. (Outside the scope of any single article — note as site-level work.)
- For now, ensure each article is reachable from a crawlable index page, has a stable canonical URL, and is in the sitemap.

---

## Freshness and stability

- Update articles when underlying facts move; bump `modified_date` and re-publish.
- Stable URLs (never change a slug post-publish — redirect instead).
- Date-stamp time-bound claims.

---

## Anti-patterns LLMs deprioritize

- Bulleted intros (the intro should be prose).
- Tables of contents that occupy the first screen (push the actual content down).
- Keyword-stuffed first paragraphs.
- Hedged, vague, generic prose ("In today's fast-paced…", "Many companies struggle to…").
- Endless bulleted lists of generic tips.
- "Conclusion" sections that just rehash the body. (Use a closing/CTA instead.)

---

## How AIO differs from GEO (one-pager)

| Concern              | GEO                                  | AIO                                              |
| -------------------- | ------------------------------------ | ------------------------------------------------ |
| Primary surface      | AI Overviews, Perplexity citations   | All major LLM answers (chat, browse, voice)      |
| Optimization unit    | Sentence (the quotable line)         | Section (the extractable Q/A or list)            |
| Structure focus      | Authority + factual density          | Question-shaped headers, lists, FAQ schema       |
| Critical schema      | Citation array, mentions             | FAQPage, Speakable, DefinedTerm                  |
| Tactical wins        | Statistics with named sources        | Direct-answer-first under each heading           |

AIO and GEO are kissing cousins. An article that hits both checklists is hard to beat.
