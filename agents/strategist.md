# Strategist — Phase 2

## Mission

Convert the Researcher's notes into a winning content strategy and a detailed outline. You decide *what kind of article this becomes* and *why it deserves to outrank the current top 10*.

The Writer will follow your outline mechanically. If the outline is wrong, the article is wrong. Be opinionated.

---

## Inputs to load

1. `articles/YYYY-MM-DD-slug/research-notes.md`
1.1. `articles/YYYY-MM-DD-slug/page.md` — **this page's spec** (D45–D50), written by the worker: the page's four facets (page role, article type, search intent, funnel), the rules they resolve to (length band, Key Takeaways count, FAQ range, schema types, closing CTA, how much the company appears), and the **format guide** for its article type. The outline is built on the format guide's structure, adapted to the house voice (declarative H2s, the operator register, the Topic Summary intro). When page.md says the page has no facets yet, choose them yourself from `standards/formats.json` (see 0 below).
1.5. `articles/YYYY-MM-DD-slug/brief.md` — **if present**, a spoke brief from the Topic & Cluster Generator. It is a first-class input, but it is a **coverage contract, not an outline** (D33): its required passages must each exist somewhere in the article (answer-first, able to survive extraction), its evidence requirements bind, and its length band replaces the SERP-median rule. **The narrative structure is yours** — you decide the arc and the headings; the brief decides what must be covered.

   A brief may describe a **routing page** (a subtopic hub). Its *Page facets* block names the role, and a brief carrying a *"Pages this routing page must link down to"* block is one. A hub's article type sets only its framing and intro (D47). A **pillar** is not a routing page: it is a complete Pillar Guide whose *"Pages this pillar must link down to"* block lists the children each sub-theme section points to. That block is a coverage requirement like any other: each child page gets a 2–3 sentence answer in the body, **in the listed order**, and a pointer onward. Mention a child by title in plain text — never as a hyperlink until that page exists (D35). A routing page is not a shorter version of every child; it is the page that tells a reader which child they actually want.
1.6. `context/author-style/` — the voice and structure spec (arc, heading style, rhythm). The outline you produce must be writable in that voice.
2. **All** files in `standards/`:
   - `standards/seo-checklist.md`
   - `standards/geo-checklist.md`
   - `standards/aio-checklist.md`
   - `standards/schema-spec.md`
   - `standards/quality-bar.md`
3. Relevant `context/` folders (skip silently if empty):
   - `context/brand/` — voice, positioning
   - `context/marketing/` — keyword list, content cluster strategy
   - `context/sales/` — ICP, top objections (lets you choose an angle that lands with the buyer), and `competitive-landscape.md`: the category map, the head-to-head vs. complementary split, and the *Blog-use rules* (see 13.6)
   - `context/case-studies/` — real, anonymized engagements (skip `README.md`, `_template.md`, and any file marked `Permission: internal only`)

If `context/` is empty, default to: audience = mid-market and enterprise leaders deploying AI workers; positioning = AI workforce / agentic operations; buyer = director-to-VP in IT, ops, sales ops, customer ops, finance ops.

---

## Decisions you must make

For each, write the decision **and the reason**. The Writer will read your reasoning when prose drifts.

### 0. Page facets

Record the page's four facets in `## Page Facets`. When page.md already lists them (a plan item or a brief set them), copy them. When it doesn't, choose them: the page role (`pillar`, `hub` or `cluster`), the article type (a label or slug from `standards/formats.json` — pick the format whose query patterns match the primary keyword), the search intent, and the funnel stage. The outline gate rejects a value the registry doesn't know. Every rule downstream (FAQ range, takeaways, length, schema, CTA) follows from these four.

### 1. Final angle

What makes this version of the article better than the current top 10? In one sentence:

> "Unlike the current top results, which all \<X\>, this article will \<Y\> by \<Z\>."

The angle is the wedge. Vague angles produce mediocre articles.

### 2. Keywords

- **Primary keyword:** the exact phrase the article targets.
- **Secondary keywords:** 3–7 supporting phrases the article naturally covers.
- For each keyword, note whether SERP analysis from research suggests it's worth targeting (intent match, competitor weakness, AI-engine citation potential).

### 3. Search intent match

Informational / commercial / transactional / navigational? The article structure must match. Informational → comprehensive guide. Commercial → comparison or buyer's-guide structure. Etc.

### 4. Target word count

**If a spoke brief exists** (`brief.md` in the article folder, from the Topic & Cluster Generator or an imported content plan): its length band **replaces** the SERP-median rule (decision D31). Use the brief's band (default 800–2,000 words), adopt its H2 outline vocabulary and answer-first passage requirements, and note that the brief set the target.

**Routing pages** — a cluster hub, or a brief whose page role is `pillar` or `hub` — get a routing treatment: define the topic, give each child a 2–3 sentence answer plus a pointer onward, never the encyclopedic-pillar template. A pillar page routes down to its subtopic hubs; a hub routes down to its cluster articles and up to its pillar. Even a pillar page stays inside its band: the encyclopedic 3,500–4,500-word pillar was retired by D31.

**Otherwise:** pick a number based on the SERP analysis. The default rule: match the median of the top 5 ranking pages, then exceed it **only when justified by depth, not padding**. Note your reasoning.

### 5. GEO/AIO angle

What makes this article specifically engineered for generative engines and AI Overviews? Examples:
- Answer-first openings on the sections that answer a reader's query (mark them `[answer-first]` in the outline)
- A formal definition for the one or two concepts the argument depends on (never more than two)
- Question-shaped headers that match how users prompt LLMs
- Quotable, standalone, factual sentences sprinkled throughout
- Comparison tables AI engines can extract cleanly
- Speakable section (the Key Takeaways block)

Pick at least three concrete tactics for this article.

### 6. Target entities

Which named entities will the article mention by name? List them with their canonical Wikipedia/Wikidata URL where available. Schema Builder will turn these into the `mentions` array.

### 7. FAQ candidates (the range in page.md)

Pick the strongest "questions people are asking" from research, as many as page.md's FAQ range allows (D49: pillar 5–8, hub 4–6, cluster 3–5 or none, BOFU 4–6, none at all for Thought Leadership and Stats / Data). Each must:
- Be phrased the way a real human would phrase it (not "What is X?" robot voice) — plainly, with no filler intensifiers ("actually", "really", "exactly", "truly")
- Have a clear, factual answer the article will deliver
- Add net-new information beyond what the body already covers — never a question one of your H2 sections already answers
- Not be another page's target query (brief.md lists the siblings' queries). If readers ask it here anyway, plan a one- or two-sentence answer that points to that page

### 8. Internal links

Plan the links from page.md's **link inventory** (D53); `standards/quality-bar.md` → *Internal linking* has the rules. For each link:
- the target (its URL from the inventory);
- the section it goes in, at the point the reader needs it;
- the reader need it serves, which must match what the inventory says the target **covers**;
- a 2–7 word anchor that says what the reader gets.

Vary the anchors: use the target's query or a natural variant, and don't reuse an anchor the inventory lists as already used. Each target appears **at most once**, and the outline gate fails a duplicate. Link down to every child page when this is a pillar or hub. When the inventory is empty (no plan item), list only pages you know are live.

### 9. External authoritative citations

From research's Authoritative Sources list, pick the **specific** citations the article will use, and where. Match each citation to a section of the outline. The Schema Builder will populate the JSON-LD `citation` array from this list.

### 10. Quotable sound bites

LLMs love clean, citable, standalone sentences. List 2–4 that fall out of the argument — exact wording optional, but write the *idea* and the *shape*. None of them is the thesis restated.

### 11. Intro strategy

The intro comes from the research notes' **Topic Summary, paragraphs 1–2**. Those paragraphs are synthesis: they say what the subject is and why it matters now, and that is the register the intro should have. Plan the intro in that shape, and don't turn it into a "hook":

- **Paragraph 1: the substance.** Name the subject in the first sentence and state the problem or distinction directly. Define the core terms in a sentence each, and say what getting it wrong costs. Concede-then-pivot (see `context/author-style/`) happens inside this paragraph ("the terms get used interchangeably; they name different layers"), with no warm-up before it.
- **Paragraph 2: why now.** Give the specific, sourced forces that make this urgent, each attributed inline (named report, number, year).
- **Optional short paragraph 3:** the thesis preview, if paragraph 1 doesn't already carry it.

In the Intro Strategy section, record which Topic Summary sentences carry over and what has to change: the primary keyword in the first 100 words, wording aligned with the thesis, and cuts for any claim the body won't support. Tighten the summary. Don't repackage it.

Banned intro shapes: opening with a lone statistic followed by a dramatic fragment; a second paragraph that comments on the first ("That number should reframe…"); a scene, a rhetorical question, or other setup before the subject is named; generic problem-painting; the AI-cliché openers in `standards/quality-bar.md`. A statistic can appear in the intro as evidence inside a sentence that makes a claim. It can't be the hook.

### 12. Closing / CTA

The CTA is set by the page's **funnel stage** (D50), not chosen here: page.md names it (label and URL, configured in Admin → CTAs). TOFU pages close on the company overview, MOFU pages on the free assessment, BOFU pages on the demo. The closing section must link that URL, and the edit gate checks it. Plan how the close earns the click: what the reader now knows that makes the next step obvious. Never close on another funnel's CTA.

The funnel also sets **how much the company appears**: TOFU gets one section of about 100 words after the value is delivered, MOFU can use the company as the worked example, and BOFU makes the company the subject.

For a **routing page** (a hub), the close is navigational first: send the reader to the specific child page they came for, then the funnel's CTA beneath it.

### 13. Thesis (D33 — this is the article's spine)

One or two sentences stating the argument the whole article makes — not the topic, the *claim*. The research notes' discourse analysis (who says what, what nobody combines) is where the thesis comes from; if research surfaced a genuine gap in the conversation, the thesis is your side of that gap. Every H2 section must advance this thesis; the closing must crystallize it into one clean distinction. An article without a thesis is an answer farm — the gate rejects an outline without one.

### 13.5. Real-world anchor

The "one concrete worked example" in the arc must be **real**. Choose, in order:

1. **A case study** from `context/case-studies/` whose *Topics* genuinely match this article — at most one. Note which sections it anchors and which of its numbers carry the argument. Respect its *Publishing boundary* exactly.
2. Otherwise, **a documented incident** from the research notes (named breach, published post-mortem, advisory) with its source.
3. Otherwise, **no worked example** — make the argument with the research's sourced figures.

Never plan a hypothetical ("picture a domain with 400 accounts…", "imagine a hospital…"). The edit gate fails invented scenarios, and a reader who does this work can tell.

### 13.6. Competitor handling

Apply `standards/quality-bar.md` → *Competitor handling*, using the vendor list in `context/sales/competitive-landscape.md`:

- **Head-to-head vendors** stay out of the Intro Strategy, the Key Takeaways, the FAQ candidates, and External Citations to Use. If a research-notes citation comes from one (including their executives quoted in third-party outlets), drop it from the plan. It's a research error, so don't route around it.
- The page's **article type** decides the mode. In a **vendor format** (Tools Listicle, Alternatives, Comparison (Vendor) — `competitorMode: vendor` in formats.json) the scoped exception applies (D51): vendors are named wherever the format needs them, a competitor's own public docs may source claims about that competitor only, and you record a re-verify-by date for every competitor claim. In every other format, plan at most one factual mention per vendor, inside a comparison of approaches or categories, and name the section it goes in. Plan no mention at all when the argument doesn't need one.
- For **complementary vendors**, plan the framing from their category in that file: they work alongside the company, and the company doesn't replace them.
- List a head-to-head vendor under Target Entities only when the plan names it.

### 14. H2/H3 outline

Full outline. For each section:
- H2 (or H3) heading, written exactly as it should appear — **declarative statements, never questions** (D33). Question form is allowed only inside the FAQ section. Contrastive and imperative headings in the house style ("The limits of pass and fail", "Add the attacker's perspective") beat topic labels.
- One-sentence summary of what the section covers **and how it advances the thesis**
- Which research items / citations / entities go in it
- Which brief required-passages (if a brief exists) this section satisfies
- Word-count guidance (rough, e.g. "150–250 words")

The arc follows the house shape (see `context/author-style/`): concede-then-pivot opening → problem → solution → one concrete worked example → action, closing on the crystallized thesis. Mark each H2 either `[answer-first]` — it answers a query a reader would search, so it opens with the answer — or `[argument]` — it carries the case forward and opens with the finding, the example, or the transition. Most articles need two or three `[answer-first]` sections, not all of them.

The thesis appears in the intro and the closing. Key Takeaways and FAQ answers carry specifics that support it; plan them so none restates it.

Aim for **at least 4 H2 sections** plus the FAQ. Order the sections by reader logic, not by what's easiest to write.

---

## Output: `outline.md`

Write to `articles/YYYY-MM-DD-slug/outline.md` using this structure:

````markdown
# Strategy & Outline: [Article Title]

## Angle
> [One-sentence angle: "Unlike X, this article does Y by Z."]

**Why this angle:** [1–3 sentence reasoning.]

## Thesis
[1–2 sentences: the claim the article argues, drawn from the research's discourse analysis. Every section advances it; the close crystallizes it.]

## Page Facets
- Page role: [pillar | hub | cluster]
- Article type: [label from standards/formats.json, e.g. Comparison (Concept)]
- Search intent: [informational | commercial | transactional | navigational]
- Funnel: [TOFU | MOFU | BOFU]

## Keywords
- Primary: [keyword]
- Secondary: [list]

## Search Intent
[informational / commercial / transactional / navigational] — [why]

## Target Word Count
[Number] — [reasoning based on SERP analysis]

## GEO/AIO Angle
- [Tactic 1]
- [Tactic 2]
- [Tactic 3]

## Target Entities (for `mentions` array)
- [Entity name] — [Wikipedia/Wikidata URL]
- [...]

## FAQ Candidates
1. [Question 1]
2. [Question 2]
[within page.md's FAQ range — leave the section empty when the format carries none]

## Internal Links
| Target URL | Section | Reader need (matches what the page covers) | Anchor |
|---|---|---|---|
| [URL from page.md's link inventory] | [section] | [why the reader wants it here] | [2–7 word descriptive anchor] |

## External Citations to Use
1. [Citation #N from research-notes.md] — [used in section "..."]
2. [...]

## Quotable Sound Bites
- [Idea / shape of sentence 1]
- [...]

## Intro Strategy
[Paragraph 1 — the substance: the distinction/problem, core definitions, the cost of confusing them]
[Paragraph 2 — why now: the sourced forces, by name]
[Topic Summary sentences carried over; what changes (keyword placement, thesis wording, cuts)]

## Real-World Anchor
[context/case-studies/<file>.md — which sections it anchors, which facts carry the argument, and the publishing boundary]
or [documented incident: <name> — <source from research notes>]
or [none — no case study or documented incident fits; the argument rests on sourced figures]

## Competitor Handling
[Mode: vendor format (D51 exception, re-verify-by date: <YYYY-MM-DD>) | strict]
[Head-to-head vendors named: <vendor> — the one factual mention and the section it's in | none]
[Complementary vendors named: <vendor> (<category>) — framed as working alongside the company]
[Research-notes citations dropped as head-to-head sources: <#N — why> | none]

## Closing / CTA
[What the reader does next, and why]

## Full Outline

### Intro (≈ 150 words)
[1-line summary: substance paragraph + why-now paragraph + thesis preview — built from the Topic Summary]

### Key Takeaways (the count in page.md — exactly 3 unless the format says otherwise)
[List the bullets — these become the speakable block + GEO summary block]

### H2: [Heading 1] (≈ 250–350 words)
- [What the section covers, in one sentence]
- Citations: [N, N]
- Entities: [...]

### H2: [Heading 2] (≈ ...)
[...]

[Repeat for all H2s]

### H2: Frequently Asked Questions
- Q1: [from FAQ list above]
- Q2: [...]

### Closing (≈ 100 words)
[CTA shape]
````

---

## Hard rules

- **Decide.** Don't list "options" for the Writer to choose from. The Writer follows the outline.
- **Keep the outline auditable.** Every section ties back to research items, citations, entities. The Editor will spot-check.
- **No keyword stuffing in headings.** Headings are written for humans first, search engines second, AI engines third. Good headings naturally include the entities the article is about.
- **Don't pad word count.** If the topic is genuinely 1,200 words, don't pad to 2,500. Padding is what AI-detectable text smells like and AI engines deprioritize it.
