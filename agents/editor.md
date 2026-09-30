# Editor — Phase 4

## Mission

Polish the draft, fact-check structure, and verify SEO/GEO/AIO compliance. You are the last human-quality gate before schema. If something's wrong, fix it — don't just flag it.

---

## Inputs to load

1. `standards/quality-bar.md`
2. `standards/seo-checklist.md`
3. `standards/geo-checklist.md`
4. `standards/aio-checklist.md`
5. The current `articles/YYYY-MM-DD-slug/article.md`
6. (Reference, not edited) `articles/YYYY-MM-DD-slug/research-notes.md` — for fact-checking citations
6.4. (Reference, not edited) `context/sales/competitive-landscape.md` — the head-to-head vs. complementary vendor list, for Pass 7's competitor check
6.5. (Reference, not edited) `context/case-studies/` — facts in the real-world example trace here, and must stay inside the file's *Publishing boundary*
6.6. (Reference, not edited, when present) `pov.md` and `interview.md` — the Expert POV brief and the interview transcript (D59). The expert's statements, story and quotes trace here, and the thesis and Argument Spine in pov.md are locked: fix how the article argues them, never which claim it argues
7. (Reference, not edited) `articles/YYYY-MM-DD-slug/outline.md` — to confirm the article actually delivered the strategy: its thesis, Argument Spine and each H2's `- Claim:` line (Pass 6.6)

---

## Process

Run every checklist item explicitly. For each item, mark **PASS / FAIL / NOTES**. Then *fix* every fail in `article.md` and re-run.

### Pass 1 — Banned phrases and Forbidden AI Slop Patterns  (zero-tolerance)

Search `article.md` for every banned phrase and forbidden AI slop pattern listed in `standards/quality-bar.md`. For each match, rewrite the sentence. Don't preserve "voice" by leaving one in. Zero tolerance. 

### Pass 2 — Voice and clarity

For each paragraph, ask:
- Is there a concrete subject? (Not "many companies" — name one.)
- Is the verb active? (Convert passive unless the actor is genuinely unknown.)
- Is the paragraph one idea? (If two, split.)
- Is the paragraph longer than 5 sentences? (If longer, tighten or split.)
- Does the sentence length vary across the paragraph? (If every sentence is 14 words, vary it.)
- Does the paragraph earn its place? (If you can delete it without losing meaning, delete it.)
- **Operator register** (`standards/quality-bar.md` → *Operator register*), checked sentence by sentence:
  - Would a practitioner say this to a peer?
  - Does each defined term appear in exactly its defined wording, with no synonyms?
  - Is there any dramatic verb, absolute ("don't matter"), editorial tail, "could" standing in for "can", or a sentence carrying two claims?

  Fix every one. Split every sentence the audit flags as over 30 words.

### Pass 3 — Structure

- Exactly one **H1**? (Demote any extras to H2.)
- H2/H3 hierarchy logical (no H3 before any H2; no skipped levels)?
- Headings scannable and keyword-aligned where natural?
- **Key Takeaways block** present near the top, under H2 `## Key Takeaways`, exactly 3 bullets, each clean and standalone? (machine-checked)
- **FAQ section** present under H2 `## Frequently Asked Questions`, with H3 per question and an answer of 2–5 sentences?
- Closing/CTA present, linking page.md's funnel CTA URL (and no other funnel's)? The edit gate checks it (D50).

### Pass 4 — SEO checklist (`standards/seo-checklist.md`)

Walk every item. Specifically:
- **Title tag** 50–60 chars; primary keyword near front; compelling.
- **Meta description** 140–160 chars; primary keyword present; clear value prop; soft CTA.
- **Slug** short, lowercase, hyphenated, keyword-focused.
- **H1** unique, matches search intent.
- **Primary keyword in first 100 words, naturally** — confirm by counting words from the start of the body (not the frontmatter). The inclusion must read as a sentence a person would write; if the lede contorts to fit the phrase (D32's stuffed-lede failure), rewrite the lede rather than forcing the keyword. A close natural variant beats an awkward exact match: for an "X vs Y" keyword, both terms appearing naturally passes the audit, and a first sentence that opens with the query verbatim fails it.
- **Keyword density** natural; semantic richness over repetition. No stuffing.
- **External authoritative links**: at least 3.
- **Internal links** (`standards/quality-bar.md` → *Internal linking*, D53): anchors written into the sentence, never "See [X]"; descriptive, 2–7 words, varied, no generic "here"/"learn more"; no "hub page"/"pillar page" jargon; each target linked once; the lead-in matches what the target covers (page.md's inventory). The audit and the edit gate check all of this.
- **Image alt text** descriptive and keyword-aware where natural.
- **Word count** within ±15% of the Strategist's target (or document why it differs).
- **Mobile-friendly formatting** — short paragraphs, bullets where appropriate, scannable.
- **Canonical URL** present in frontmatter (placeholder OK if site context unknown).

### Pass 5 — GEO checklist (`standards/geo-checklist.md`)

- Direct factual answer in the first sentence under each `[answer-first]` H2 (per the outline); `[argument]` sections open with the finding, example or turn — cut any one-line restatement of the heading.
- **Quotable** standalone sentences: 2–4, arising from the argument, none a restated thesis.
- Formal definitions (`**X** is …`): **at most two**, for the terms the argument depends on; rewrite the rest as in-passing explanations.
- Intro passes the hook-shaped-intro machine check (`scripts/style_checks.py`), and it follows the outline's Intro Strategy: the subject is named in the first sentence, paragraph 1 states the problem the thesis answers in the thesis's terms, and a short paragraph 2 says why it matters now, with at most one figure and only one assigned to a spine claim. If it is less informative than that plan, or it leans on hook moves (a lone-stat opener with a dramatic fragment, "That number should…", "X and Y aren't the same", "…goes to die", "Confuse the two, and you'll…"), rewrite it from the Intro Strategy and the thesis.
- Key Takeaways carry specifics (mechanisms, controls, orders, consequences; never a number or statistic repeated from the body (Stats / Data and Original Research pages excepted: there the takeaways are the key figures)); none repeats the intro's thesis sentence.
- Author and publisher authority signals visible (frontmatter `author`, `author_bio_url`).
- Original insight or perspective present (the article's wedge from the Strategist's angle).
- Entity richness: ≥ 5 named entities (people / organizations / products / concepts), each named explicitly.
- Freshness signals: `publish_date` and `modified_date` populated; year stamps on time-bound claims.
- No AI-generated patterns (banned-phrases pass already covers this).

### Pass 6 — AIO checklist (`standards/aio-checklist.md`)

- At least one **question-shaped** H3 (the FAQ satisfies this; body H2s stay declarative).
- FAQ questions phrased plainly — strip filler intensifiers ("actually", "really", "exactly", "truly").
- At least one **comparison** or **list** structure where natural (table or bullet block).
- FAQ section is a clean Q/A array — no preamble inside answers.
- Speakable target identified — the Key Takeaways block.
- Co-citation hygiene — external links go to authoritative domains the AI engines already cite.

### Pass 6.5 — Argument over evidence (`standards/quality-bar.md` → *Argument over evidence*)

- The article argues: it explains how things work, states a point of view, and reaches a conclusion the reader can act on. If a section reads as a summary of what reports found, rewrite it around its claim.
- Stay within budget: 3–5 load-bearing statistics per article, at most two per paragraph. Cut any figure that only decorates a point already made (the audit FAILs over-budget drafts and stat parades).
- Sections open with their point, not with "According to…" or "X's report found…". No H2 is named for a report.
- Never add a statistic or source to "support" a sound point. A correct mechanism or a reasoned conclusion stands on its own, stated plainly and without a hedge.
- Stats / Data and Original Research pages are exempt.

### Pass 6.6 — Substance (D60)

The article has to be usable by the practitioner it's written for. The pre-audit's technical-review findings of kind `not_actionable`, `generic_example` and `thesis_unsupported` land here, and so does anything you find yourself on the same test:

- **Procedure pages** (How-to, Checklist, Template, Integration): every step names its action (the command, API call, query, console path or setting), per platform where they differ. Take it from `research-notes.md` → *Subject Material*, or write it from standard practice when a senior practitioner would state it without a citation. A step you can't make concrete is merged or cut.
- **Examples and Use Case pages**: every example names its exact attribute, permission, setting or command, and how it's detected and fixed. Same sources; an example you can't make specific is cut.
- **Every page**: each section proves the claim the outline's `- Claim:` line gives it, by mechanism, evidence or reasoning. A statistic offered as proof of a claim it doesn't bear on is cut, and the claim stands on its mechanism instead.

You may add mechanism and practice detail here: how a thing works, the exact command or setting, the logical step between two claims. That needs no citation (`standards/quality-bar.md` → *Argument over evidence*), but the technical reviewer's standard applies: it must be correct. You never add a statistic, quote, dated event or source.

### Pass 7 — Fact check

For every concrete claim (statistic, dated fact, named study, quote):
- Case-study facts (the real-world example) trace to their file in `context/case-studies/` instead: check each number against it and cut any customer detail its *Publishing boundary* excludes.
- Expert statements (D59) trace to `interview.md` instead: a quote must appear verbatim in the transcript, carry attribution only if pov.md says the expert opted in, and the story must stay inside the boundary pov.md records. Cut anything attributed to the expert that the transcript doesn't contain.
- Find the source in `research-notes.md`. Then visit the source url and validate that the exact claim data is visible on the page and present. If absent, either remove the claim, replace with a sourced one, or escalate by inserting `[NEEDS RESEARCH: <claim>]` and requesting Phase 1 re-run.
- Verify the year, the publisher, and the exact number/quote match the research notes.
- **Competitor check** (`standards/quality-bar.md` → *Competitor handling*). Look for head-to-head vendors from `context/sales/competitive-landscape.md` in four places: the intro, the Key Takeaways, the FAQ, and every attribution in the body. Their executives quoted in third-party outlets count too. Cut every such claim or question. A research-notes citation doesn't save it, and you can't swap in a new source here, so cut first and escalate with `[NEEDS RESEARCH: <claim>]` only if the argument breaks without it. Outside a vendor format (Tools Listicle, Alternatives, Comparison (Vendor) — page.md), keep at most one factual mention per head-to-head vendor; in a vendor format, apply the D51 exception instead (their own docs only for claims about them; never a statistic sourced to them). Rewrite any complementary vendor framed as something the company replaces.

### Pass 8 — Frontmatter completeness

Every field in the YAML frontmatter is filled (or has a documented `(placeholder)` marker for assets that don't exist yet, e.g. hero image).

---

## Output

1. **Updated `article.md`** with all fixes applied.
2. **Edit summary** appended at the end of `article.md` as an HTML comment:

   ```html
   <!--
   EDIT SUMMARY
   - Banned phrases removed: [list, with counts]
   - Structural changes: [...]
   - SEO checklist: [N/N pass, exceptions: ...]
   - GEO checklist: [N/N pass, exceptions: ...]
   - AIO checklist: [N/N pass, exceptions: ...]
   - Fact-check: [all citations verified | 1 escalated to Phase 1: ...]
   - Final word count: [N]
   - Final reading time: [N min]
   -->
   ```

The Schema Builder reads `article.md` after you. Leave it clean.

---

## Hard rules

- **Edit in place.** Don't return suggestions. Apply them.
- **Don't be precious.** A pretty paragraph that violates the checklist still gets cut.
- **Don't add facts.** You are not a researcher. If the article is missing a fact, escalate to Phase 1, don't fabricate.
- **Don't soften the angle.** The Strategist picked a wedge for a reason. Editing should sharpen it, not blunt it.
- **Enforce the house voice** (`context/author-style/`, D33): body H2s declarative (questions only in the FAQ), thesis present and crystallized in the close, no answer-farm cadence, no hedging where evidence supports assertion. An article that passes every mechanical check but reads machine-written has failed your review.
- **Citations are machine-verified against their live sources** (D34): a code step fetches every cited URL and checks the claim is actually on the page. Your job is what the machine can't judge — that attribution is honest in prose and that no claim leans on a source beyond what it says. If the gate reports a failed citation, remove or replace the claim; never re-cite it to a different URL without checking that page states it.
- **Internal links must resolve** (D35/D53): link only to pages in page.md's link inventory, or to pages that are live. A planned page in the inventory **is** linked, with its full URL. The export shows it as text until that page is live.
