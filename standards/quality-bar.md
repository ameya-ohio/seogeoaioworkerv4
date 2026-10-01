# Quality Bar — Editorial Standards

The non-negotiable rules for every article. The Editor walks this list explicitly. Banned items get removed on sight; voice rules get applied paragraph by paragraph; fact-check rules are absolute.

---

## Banned phrases (Editor removes on sight)

These are AI-cliché markers. Generative engines deprioritize text that contains them, and human readers tune them out. Zero tolerance — rewrite the sentence rather than soften the phrase.

> **Single source of truth:** the machine-checked list lives in
> [`standards/banned-phrases.txt`](banned-phrases.txt) (consumed by
> `scripts/seo_audit.py`). Company-specific additions and style rules live in
> `config/company.yaml` under `voice.banned_phrases` / `voice.style_rules` —
> the Editor applies both on top of this file. The categories below annotate
> *why* each phrase is banned and list the judgment calls (e.g. "leverage",
> "transformative") that need a human/Editor eye and are not machine-checked.

### Generic openers
- "In today's fast-paced world"
- "In the ever-evolving landscape (of …)"
- "The world of [X]"
- "When it comes to (X)"
- "Whether you're a [X] or a [Y]"
- "It's important to note that"
- "It goes without saying"
- "More than ever"
- "Now more than ever"

### AI-vocabulary tells
- "delve into" / "dive deep into"
- "delve" (anywhere in the article)
- "unlock the power of"
- "harness the power of"
- "navigate the complexities (of …)"
- "leverage" (as a verb, when "use" or "apply" works)
- "robust solution"
- "cutting-edge"
- "seamless" / "seamlessly"
- "game-changer" / "game-changing"
- "revolutionary" (unless quoting a source verbatim)
- "transformative" (when "changed" or "rewrote" would work)
- "elevate" (when "improve" or "raise" would work)
- "empower" (when "let" or "allow" would work)
- "synergy" / "synergistic"
- "tapestry"
- "realm" (the realm of …)
- "embark on a journey"
- "in the pursuit of"
- "stand out from the crowd"
- "take it to the next level"

### Empty intensifiers
- "extremely important"
- "absolutely critical"
- "highly significant"
- "tremendously valuable"
(If the thing is truly important, the sentence should make that clear without intensifiers.)

### Structural anti-patterns
- An em-dash in every sentence — a paragraph-wide cadence of em-dashes is the AI-writing tell most readers notice first.
- Bullet-list-heavy structure where prose would be clearer.
- Lists where every bullet has the same shape and length (sign of AI generation).
- "Conclusion:" or "In conclusion," as a section header (use a CTA-shaped closing instead).
- "Pros and cons" as the only structuring device.

### Forbidden metaphors
- "double-edged sword"
- "tip of the iceberg"
- "moving parts"
- "rocket science"
- "low-hanging fruit"

If a banned phrase is the *exact* term of art (e.g. "synergy" in an M&A discussion of revenue synergies), use it once, in quotes, with explicit framing — and never as the article's voice.

--- 

## Machine-checked style limits (the edit gate enforces these)

`scripts/style_checks.py` measures the patterns below on every draft; the
Editor gate FAILs on every FAIL row, and the Editor is handed every hit
with its sentence quoted. Write to the limit, don't write to the checker:
the rules further down say *why* each pattern reads as generated.

| Pattern | Limit | Level |
|---|---|---|
| "Not X, but Y" in any form (`…, not X`; `not X, but Y`; `X isn't Y. It's Z.`; `not because`), headings included | max(3, one per 600 words) | FAIL |
| The same claim restated (≥ 6 shared content words, ≥ 60% overlap) | 2 occurrences — a third copy fails | FAIL |
| Hedge words (typically, usually, often, sometimes, generally, tends to, likely, potentially, …) | 4 per 1,000 words (≥ 6 hits) | FAIL |
| Lists of three in prose ("A, B, and C") | 6 per 1,000 words | WARN |
| Uniform sentence length (stdev ÷ mean of prose sentences) | ≥ 0.45 | WARN |
| Invented scenarios ("Picture a…", "Imagine a…", "Suppose…", "Let's say…", "hypothetical") | 0 — use a case study or a cited incident | FAIL |
| FAQ questions with filler intensifiers ("actually", "really", "exactly", "truly") | 0 | FAIL |
| Formal `**X** is a…` definitions | 2 | FAIL |
| A Key Takeaways bullet that repeats an intro sentence | 0 | FAIL |
| Key Takeaways bullet count | exactly 3 | FAIL |
| Hook moves in the intro: an opening statistic, "…goes to die", "That number should…", "Confuse the two…", "aren't the same word", "walked in the front door" | 0 — see *Hook-Shaped Intros* | FAIL |
| Prose sentences over 30 words (operator register rule 2) | 0 — split them | WARN |
| Sections whose first sentence restates their own heading | 2 | WARN |
| Paragraphs opening with a signpost ("That's why…", "This is also why…") | 3 | WARN |
| Commentary on other writing ("most of what's written", "most guides", "top-ranking pages", "search results", "nobody talks about this") | 0 — state the article's own view (D59) | FAIL |
| An intro that opens on a misconception ("Teams often worry that…", "It's a common myth…", "Contrary to…") | 0 — the first sentence states the thesis (D61) | FAIL |
| Statistics in the intro | 1 — the one the thesis turns on, inside its claim (D61) | FAIL |

The thesis belongs in the intro and the conclusion. Key Takeaways and FAQ
answers support it with specifics; they don't repeat it.

## Operator register (every article)

Write the way a senior practitioner explains something to a peer in a triage meeting. That means plain operational language, one claim per sentence, and no performance. The test for any sentence: would a security engineer say it out loud to a colleague? If it sounds like a keynote or a vendor page, rewrite it.

1. **Say what the concept is for.** When you define a term, give its operational job as well as its nature. "Identity risk is the contextual layer built on top of it, used to prioritize issues" tells an operator what to do with it.
2. **One claim per sentence.** A sentence that chains qualifiers ("…meaning what an attacker could reach… once its blast radius and business criticality are weighed against…") gets split into two plain sentences. Prose sentences over 30 words are machine-flagged.
3. **Operational verbs, not dramatic ones.** Write "spend remediation cycles", "fix", "prioritize", "result in exploits". Don't write "burn cycles", "goes to die", "costs real work", "walks in the front door".
4. **Calibrated claims, not absolutes.** Write "lower-priority findings", not "findings that don't matter". A finding almost always has some value; the operator's question is its priority.
5. **Hold defined terms fixed.** Once the article defines its terms ("identity exposure", "identity risk"), use those exact words every time. Don't swap in synonyms ("dangerous", "threat", "weakness") for variety. Vary the surrounding vocabulary, never the terms of art.
6. **No editorial tails.** Cut clauses that comment on a fact instead of adding one ("…, and the confusion costs security teams real work"). If the cost matters, the next sentence states it concretely.
7. **Present tense and "can" for what systems do.** "What an attacker can reach", not "could reach". Keep "could" for a real conditional.

**Before (rejected):**
> Identity exposure and identity risk are two of the most conflated terms in identity security, and the confusion costs security teams real work. Identity exposure is the measurable, technical layer of the problem: leaked credentials, over-privileged service accounts, stale delegations, misconfigured MFA policies. Identity risk is the contextual layer built on top of it, meaning what an attacker could reach through one specific exposure once its blast radius and business criticality are weighed against active threat signals. Teams that treat every exposure as equally dangerous burn remediation cycles on findings that don't matter and miss the toxic combinations that get exploited.

**After (operator register):**
> Identity exposure and identity risk are two of the most conflated terms in identity security. Identity exposure is the measurable, technical layer of the problem: leaked credentials, over-privileged service accounts, stale delegations, misconfigured MFA policies. Identity risk is the contextual layer built on top of it used to prioritize issues. It defines what an attacker can reach through one specific exposure weighted against active threat signals. Teams that treat every identity exposure as equally risky spend remediation cycles on lower priority findings and miss the toxic combinations that result in exploits.

What changed: the editorial tail was cut (rule 6); the 34-word definition became two sentences, one of them stating what risk is *for* (rules 1–2); "could" became "can" (7); "burn…findings that don't matter" became "spend…lower priority findings" (3–4); "equally dangerous" became "equally risky", and "exposure" became "identity exposure", holding the defined terms (5).

## Argument over evidence (every article, D57)

The article's job is to leave the reader clear on the problem. It explains how the thing works, takes a position, and reasons its way to a conclusion the reader can act on. Evidence supports that argument. It doesn't replace it. A page that makes each point by citing a report reads as a literature review, and an executive reader skims past it looking for what the author actually thinks.

**What needs a source.** A statistic, a survey figure, a dated event, a named incident, a quote, a claim about what a specific organization said or did, and the text of a standard or regulation. These trace to `research-notes.md` exactly as the fact-check rules below require. That hasn't changed.

**What doesn't.** How a mechanism works (a KDC issues service tickets encrypted with the service account's key), established practice, what follows logically from those, and the company's point of view. Write these from expertise, stated plainly and accurately. Don't hunt for a citation to prop up a point the reasoning already makes, and don't hedge it because it has no footnote. The technical reviewer checks that it's correct.

**The budget.**
- **3–5 load-bearing statistics per article.** Most sections carry none. A section that explains a mechanism or makes the case runs on reasoning.
- **A statistic earns its place when the argument turns on it:** it sizes the problem, changes a priority, or settles a disagreement. Cut one that only decorates a point already made, and never add one to "support" a sentence that stands on its own.
- **One figure per paragraph, two at most.** Three figures in a paragraph is a stat parade, and the audit fails it.
- **Open each section with its point, not its source.** The claim comes first, then the evidence for it. "According to…" and "X's 2026 report found…" don't open sections.
- **Organize sections around claims, not reports.** No H2 is named for a study, and no section exists to summarize one.
- **The why-now paragraph** of the intro says what changed in one to three sentences, with at most one sourced figure.

**The register to aim for:** a senior practitioner briefing an executive. There's a clear point of view, the reasoning is visible, the technical detail is exact, and every section ends with the reader knowing something they can act on.

`scripts/style_checks.py` machine-checks the budget. It FAILs more than max(6, one per 300 words) sentences carrying a statistic and any paragraph with a third statistic. It WARNs when two or more sections open on a statistic or a source, and on an H2 named for a report. Stats / Data and Original Research pages are exempt, because there the numbers are the point.

## Forbidden AI Slop Patterns (Editor enforces) 

### RULE: No Assertion Chaining.

When writing an explanation, every sentence that asserts a causal or 
mechanical claim ("X means Y doesn't matter", "X does the rest", 
"because of Z") must be followed by the actual mechanism — not a 
restatement of the claim, not a more dramatic version of the claim, 
but the concrete steps or fact that MAKE it true.

Test before finalizing: for each sentence, ask "if the reader asked 
'why?' or 'how?' right now, does the NEXT sentence answer that, or 
does it just assert something else?" If it just asserts something 
else, insert the missing mechanism.

Bad:  "If that account carries unconstrained delegation to a domain 
       controller, its password strength doesn't matter. An attacker 
       doesn't need to crack it."
       (Second sentence restates the first. No mechanism given.)

Good: "If that account carries unconstrained delegation, any machine 
       it authenticates to receives a full copy of its Kerberos TGT, 
       cached in memory. An attacker who compromises that machine can 
       extract the TGT directly — no password cracking required, 
       because they now hold a valid ticket, not a hash to crack."

Default to explaining mechanism over asserting drama. If you can't 
state the mechanism in one sentence, that's a sign you're compressing 
past the part that actually needs explaining — don't compress it, 
expand it.

### NO Antithetical Inversion

"X isn't Y. It's Z."
"The question isn't X. It's Y."
"Not because X. Because Y."
"X didn't do Y. It did Z."

These dress up ordinary observations as revelations. Just state the point directly.

**Slop:** "That's not an AI Worker. That's a very expensive writing assistant."
**Fix:** "He built an expensive writing assistant."

### NO Staccato Fragment Drumroll

A full sentence followed by a sequence of punchy fragments that restate or elaborate on it.

**Slop:** "He spent a week building the workflow. Seven tools. Multiple API keys. Four rate limit crashes."
**Fix:** "He spent a week wiring together seven tools, hit rate limits four times, and ended up with 15 draft emails."

### NO Dramatic Echo Repetition

Repeating a word or phrase immediately for emphasis, usually to manufacture shock.

**Slop:** "15 emails in Gmail drafts. Not sent. Drafts."
**Fix:** "He ended up with 15 emails sitting in Gmail drafts that he still had to send by hand."

### Parallel Negation Closers

Stacking "No X." fragments to close a section or paragraph.

**Slop:** "No manual sends. No babysitting. No rearchitecting. No cloning the repo."
**Fix:** "The SDRs never touch the system and you never have to rearchitect anything to add a persona."

### Label Colon Explanation

Using a noun or noun phrase followed by a colon to introduce a sentence, as if labeling exhibit evidence.

**Slop:** "The pattern: the agent builds the list, enriches the data, and hands you the next decision."
**Slop:** "The output: 15 emails sitting in Gmail drafts."
**Fix:** Write a normal sentence. "He ended up with 15 emails sitting in Gmail drafts." The label adds nothing.

### Ceiling/Floor and Other Forced Metaphor Pairs

Introducing a paired metaphor to frame a comparison, especially when the underlying point is already obvious from the numbers.

**Slop:** "The DIY ceiling is 15 draft emails. Our floor is thousands of contacts with meetings booked."
**Fix:** Just state both numbers in sequence. The contrast is already there. You don't need a metaphor to hold the reader's hand through it.


### The Punchline / The Takeaway / The Bottom Line

Announcing that you're about to deliver the conclusion. If the conclusion is strong, it doesn't need a header telling the reader to pay attention.

### Hedge-Then-Praise Cycling

Alternating between complimenting a competitor and dismantling them within the same paragraph or section. Pick a lane. Respect the work once at the top of the doc if you want to, then make your case without constantly softening it.

**Slop:** "Andy's post is actually great validation for us. He's a sharp operator. He did real work. And the best he could produce was 15 email drafts."
**Fix:** Acknowledge his work once in the intro. Then make the argument on its own terms for the rest of the doc.


### Repeated Punchlines

Restating the same stat or conclusion three or four times across a document. Once is powerful. Twice is acceptable if the contexts are different. Three times means the doc doesn't trust the reader.


### Numbered Dimension Frameworks

"Dimension 1: Volume. Dimension 2: Personas. Dimension 3: Teams. Dimension 4: Flexibility."

This is a model organizing its reasoning into neat parallel buckets. Use bold labels if you need scannable sections. Don't impose a taxonomy on a linear argument.


### "His system is X. Ours is Y."

One-line antithetical closers that summarize a section by restating the comparison in compressed form. These feel satisfying to write and add nothing. The section already made the point. End it and move on.

**Slop:** "His system is a script. Ours is an architecture."
**Fix:** Delete the sentence. The preceding paragraph already demonstrated the difference.


### Em-Dashes

Banned outright. Replace with periods, commas, or parentheses depending on grammatical fit. The em-dash reads as showy, theatrical, and (most damningly) is the most common signature of LLM-generated prose in 2026. If a draft has em-dashes, it has not been edited.

**Slop:** "The CFO said it — out loud, on the record — that revenue was weak."
**Fix:** "The CFO said it out loud, on the record. Revenue was weak."

The only acceptable horizontal dash construction is the markdown section break (`---`) between sections in long-form. That's structural, not stylistic.

### Verdict-Punch as Default Cadence

A long setup sentence followed by a short ad-copy beat. This is Ogilvy at the sentence level and it gets demoted in this voice. It feels confident when you write it and reads like a slogan when you read it back.

**Slop:** "We tested eighteen models across three benchmarks. They all got worse."
**Fix:** "All eighteen models tested across the three benchmarks degraded as input length grew."

Short sentences are fine when they carry information. They are not fine when they carry only rhythm. The default cadence is an 18–22 word sentence with a wry construction, not a two-beat punch.

### Two-Beat Mid-Paragraph Punches

Stacking two short verdicts inside the same paragraph for percussive effect.

**Slop:** "It is over. They are wrong."
**Slop:** "The price doesn't move. The margin does."
**Fix:** Fold into one sustained sentence with a wry construction, or cut one of the two beats entirely.

## Defensive Passages

"Now, I'm not saying X." "To be fair." "Let me be clear about what I'm NOT arguing." "Of course, there are exceptions." Preemptive caveat paragraphs that exist to insulate the writer from criticism rather than advance the argument.

**Fix:** Cut the entire passage. If the argument needs caveats to survive scrutiny, the argument is wrong. If the caveats are decoration, they're worse than wrong — they signal the writer doesn't trust their own claim.

### Hedging Vocabulary

"Perhaps." "Somewhat." "It could be argued." "Arguably." "In some sense." "To a certain extent."

**Fix:** Commit to the claim or do not make it. If the evidence supports the claim, state it. If it doesn't you don't have a claim. 

### Three-Takeaways Closes

Ending a piece by listing the three things the reader should remember. Cousins: "The bottom line is...", "To summarize...", "Here's what this means for you...", "Key takeaways:".

This treats the reader like they need a study guide. The piece either landed or it didn't. A summary at the end cannot save a piece that didn't land, and it actively diminishes a piece that did.

### Lyrical Reprise Closes

Returning to the opening image at the close to "bring the piece full circle." Feels writerly. Reads as performative and predictable. The reader saw it coming three paragraphs ago.

**Fix:** End on a new beat. A cool verdict, a quiet image, or the suggestion that the situation is ongoing. Never a callback to the opening.

### Hook-Shaped Intros

Opening with a performance instead of the subject. The pattern: a lone statistic, then a dramatic fragment ("The attacker used a valid identity and walked in the front door."), then a paragraph commenting on the opening ("That number should reframe how teams talk about X, but mostly it hasn't."), then a set-piece about terms ("They aren't the same word, and the gap between them is where remediation effort goes to die."), then a threat ("Confuse the two, and you'll spend a sprint fixing the wrong things."). Each move delays the substance and leaves the reader less informed than a plain statement would.

**Fix:** Start from the outline's Intro Strategy and the thesis (D60). Paragraph 1 names the subject, states the problem the thesis answers in the thesis's terms, and says what getting it wrong costs. Paragraph 2 says what changed, in one to three sentences, with at most one sourced figure (*Argument over evidence*). A statistic belongs inside a sentence that makes a claim ("…CrowdStrike's 2026 Global Threat Report found 82% of detections were malware-free, meaning…"). It shouldn't stand alone as the opener.


## AI Marketing Slop Vocabulary

Banned outright: unlock, supercharge, reimagine, transformative, revolutionary, game-changing, paradigm shift, next-generation, cutting-edge, world-class, mission-critical, AI-powered (as opposed to AI-driven or AI-native, which carry information).

If the sentence requires one of these words to function, the sentence is not making an argument.

## MBA Buzzwords

Synergy. Leverage (as a verb). Best-in-class. Stakeholder alignment. Cross-functional. Thought leadership. Strategic value. Holistic approach. Mission-driven. Best practices.

**Fix:** Use English. If you can't say what you mean in English, you don't know what you mean.

### Earnest Enthusiasm Vocabulary

"Amazing." "Incredible." "Thrilled." "Excited to share." "Honored." "Humbled."

These are LinkedIn opener vocabulary. The voice is dry. Earnestness gets read as sales energy.

**Fix:** State the thing without the adjective. The thing is either interesting or it isn't. Saying it's amazing doesn't make it amazing.


### LinkedIn-Bro Openers

"Look." "Here's the thing." "Listen." "Buckle up." "Hot take:". "Unpopular opinion:". "Real talk."

These are throat-clearing devices that signal the writer is about to say something they think is bold. The writer thinking it's bold is the problem.

**Fix:** Open with the actual claim. If the claim is bold, the reader will notice. If it isn't, the warning was a lie.


### Hot Adjectives Where Cool Ones Carry It

"Massive." "Explosive." "Historic." "Unprecedented." "Staggering." "Devastating."

The concrete fact beats the hot adjective every time. "$60 billion evaporated" is more devastating than "a devastating loss."

**Fix:** Replace the adjective with the concrete fact: the mechanism, the scope, or a sourced number when you have one that carries the point. Don't reach for a statistic just to replace an adjective.

### Generic Business Analogies

The iceberg. The journey. The war room. The rocket ship. The marathon not the sprint. The Swiss Army knife. The North Star. The flywheel. Skating to where the puck is going.

These are frictionless because they're worn smooth. They slide off the reader.

**Fix:** Pull a specific reference from the coded reference pool — Vegas, the casino, hard SF, ML papers, the NFL, behavioural economics. The reference IS the insight. Generic analogies are filler.


### Insider Posing

"I have sat through this pitch more times than I care to count." "Anyone who has been in this industry knows..." "Those of us who have been here a while remember when..."

These are postures. They flatter the writer and condescend to the reader. The voice is peer-to-peer. The reader has been in the same rooms.

**Fix:** State the observation without the credentialing setup. If the observation is sharp, the credential is implied. If it isn't, the credential won't save it.

### Hedge-Then-Praise of the Critiqued Work

Warmth toward the work being critiqued is a hedging tell. "He's a sharp operator." "It's a thoughtful piece." "The team has done real work." Then the dismantling. Pick a lane.

**Fix:** Acknowledge the work once at the top of the piece if you want to. Then make the argument. Stop returning to compliment the thing you're tearing apart — the reader sees it as nervous, not generous.

### Repeated Punchlines

Restating the same stat or conclusion three or four times across a document. Once is powerful. Twice is acceptable in different contexts. Three times means the doc doesn't trust the reader to remember.

(This pattern was already in the original list. Re-listed here because it keeps recurring in drafts and deserves the reinforcement.)

## Manic Fragment Strings

"Seven tools. Multiple API keys. Four rate limit crashes. Fifteen drafts. Zero sent." Stacks of three or more sentence fragments in a row, separated by periods, used to manufacture intensity.

**Fix:** Fold into one sustained sentence with a serial comma list, or break into two real sentences carrying real arguments.

### "Not X. Y." in Any Form

The antithetical inversion was already on the list. This is the broader family it belongs to: the rhetorical move where the writer sets up a wrong frame, then dramatically reveals the right one.

"It's not a tool. It's a teammate."
"It's not about the technology. It's about the people."
"This isn't marketing. It's revenue science."

All of these are doing the same thing: dressing up an ordinary observation as a revelation. State the point directly.

### Confessional Self-Awareness as a Move

"I'll be honest with you." "Real talk for a second." "I'm going to say something controversial here." "Look, I might be wrong about this, but..."

The voice does not confess. It states. The Sutherland wink is a different mechanism — it acknowledges the contrarian shape of the argument once per piece, in a dry register. The confessional move is a LinkedIn move.

**Fix:** Make the controversial claim without announcing that it's controversial. The reader can tell.


### "What If I Told You..." / "Imagine If..." Setups

Hypothetical openers that build to a reveal. Always cuttable.

**Fix:** Skip the setup. State the claim.

## Exclamation Marks and ALL CAPS

Banned outright. Acceptable only for genuine acronyms (LLM, RAG, CRM, GTM). Never for emphasis. The voice does not raise its volume. It cuts.


---

## Voice rules (Editor enforces)

### Specific over general
- Name the control, the attribute, the product, the year. "Unconstrained delegation on a file server" beats "risky settings." "Q1 2026" beats "early this year."
- Specific means precise. It doesn't mean a statistic in every paragraph (*Argument over evidence*). When you do cite a figure, name its source: "a 2025 McKinsey survey of 800 enterprises" beats "industry studies."

### Concrete over abstract
- Write what the reader can picture. If a sentence describes a concept, follow it with a sentence describing an instance.

### Active over passive
- Default to active voice. Passive is allowed when the actor is genuinely unimportant or unknown ("The data was lost" — fine if you don't know who lost it).

### Short paragraphs
- 2–4 sentences. One idea per paragraph. If the paragraph runs long, the second idea hiding inside it is its own paragraph.

### Vary sentence length
- Mix short (5–8 words) with medium (15–25). Avoid the AI cadence of every-sentence-the-same-length. A 7-word sentence after a 22-word sentence is good rhythm.

### One idea per paragraph
- If the paragraph contains a "but also" pivot to a second idea, split into two paragraphs.

### Earn every sentence
- If you can delete the sentence without losing meaning, delete it.
- Padding sentences ("This is a critical consideration.", "Let's take a closer look at why.") get cut.

### Confident, expert, helpful
- Not breezy ("So you've decided to learn about AI workers!").
- Not stiff ("This article shall examine the contemporary state of …").
- Direct, opinionated where opinion is supported, helpful in tone.

---

## Fact-check rules (absolute)

### Every statistic traces to research-notes.md
- The number, the date, the publisher, the URL — all must come from `research-notes.md` (company numbers: `context/sales/proof-points.md`, `Citable: yes` rows).
- The one exception is the real-world example: facts from the case study the outline names (`context/case-studies/`) are sourced — they are the company's own engagements — as long as they stay inside that file's *Publishing boundary*.
- If the article cites a number not in research notes, the Editor either (a) removes it, (b) replaces it with a sourced one, or (c) escalates back to Phase 1 with `[NEEDS RESEARCH: <claim>]`.

### Every quote traces to research-notes.md
- Exact wording, attribution to the right speaker, attribution to the right publication.
- Quotes that can't be sourced are stripped.

### Facts the expert raised are verified before use (D61)
- A third-party fact from the interview (an incident, a CVE, a report, a vendor's behavior) is used only as its `## Interview Evidence` verdict in the research notes allows: verified as stated, corrected as the source says, unsourced only as the expert's opinion or not at all.

### The final text is reviewed, and leftovers stay visible (D61)
- After the Editor, the verify stage reviews the finished article, a fix pass resolves what it finds, and a confirm round checks the fixes. Anything still open is left inline as `[VERIFY: …]`.
- No phase deletes an editor note it didn't resolve. The export refuses while any `[HUMAN INPUT]`, `[NEEDS RESEARCH]`, `[NEEDS SOURCE]` or `[VERIFY]` note remains.

### Expert statements trace to interview.md (D59)
- When the article was interviewed, the expert's point of view, their story and their quotes are sourced to `interview.md` (the transcript) and `pov.md` (the brief the POV writer wrote from it), not to the research notes.
- Quotes from the expert are verbatim from the transcript, attributed by name and title only when `pov.md` records that the expert opted in. Otherwise they stay unattributed or become the article's own voice.
- The expert's story keeps the publishing boundary `pov.md` records (named, anonymized, or background only).
- A company number the expert gave is printed only if it is a `Citable: yes` proof point. The interview never makes a number citable.

### Never invent sources
- "A recent study" is not a citation. Either the study is named with publisher and year, or the claim doesn't appear in the article.

### Date-bound claims include the date
- "As of Q1 2026," "In 2025," "Since the 2024 update."
- "Recent" is not a date. "Lately" is not a date. "Now" is not a date.

### Names are spelled correctly
- People, products, companies, frameworks. Cross-check every named entity against the source.

### Don't paraphrase a paraphrase
- If the research notes cite a primary source, attribute to the primary source — not to the secondary outlet that summarized it.

---

## Internal linking (D53)

Internal links carry readers and search engines to the next page. An anchor that reads like a footnote, or a lead-in that promises something the destination doesn't deliver, wastes both.

- **Describe the destination.** Someone reading only the anchor should know what the linked page is about.
- **Write anchors into the sentence.** Don't append "see X" at the end.
- **Keep anchors roughly 2–7 words.** Link the meaningful phrase, not the whole sentence.
- **Vary the wording across the site.** Use the target's primary phrase sometimes, and natural variants or partial matches other times.
- **Never use the same anchor text for two different pages.** It muddies which page is relevant for that phrase.
- **Link each target once per page,** at the point where it's most relevant.
- **Make the surrounding text agree with the destination.** Search engines read the context around a link, and readers who get something unexpected leave.
- **No generic anchors** ("here", "this article", "learn more"), and **no site-structure jargon** ("the hub page", "pillar page"). Readers don't know what a hub is, so describe what the page covers.

**Before:**
> For how these weaknesses accumulate specifically across Active Directory, Entra ID, and AWS, see What Causes Identity Exposure in Hybrid Environments and the hub page, What is Identity Exposure.
>
> If you already have exposure data but no way to rank it, or a risk framework with no exposure feed underneath it, that gap is the one to close next. See How to Reduce Identity Exposure.
>
> For the remediation side of that work, see How to Reduce Identity Exposure.

**After:**
> These weaknesses build up differently across Active Directory, Entra ID, and AWS, and [what causes identity exposure in hybrid environments](…) breaks down each one. If you're newer to the concept, start with [what identity exposure is](…).
>
> If you already have exposure data but no way to rank it, or a risk framework with no exposure feed underneath it, that's the gap to close next. Here's [how to prioritize and reduce identity exposure](…).
>
> (The third link is removed: it repeated the same target with the same anchor.)

**How it's enforced:**
- **The plan (D62).** Whether a link fits its destination is decided once, when the Strategist plans it in the outline's `## Internal Links` table. The outline gate FAILs a row without a section, reader need or anchor; an anchor outside 2–7 words; an anchor that points back at its own page ("these numbers", "this surface", "here"); one anchor planned for two pages; a target outside the link inventory, or one that doesn't resolve; an anchor the site already uses for a different page; and, on a pillar or hub, a child page left out.
- **Held to the plan (D62).** The write, HDCP and edit gates (and the verify fix pass, through the edit gate) FAIL a planned link that is missing, a planned anchor that was changed (case aside), and an internal link the plan doesn't name. The sentence around a link may be rewritten; the link may not. The CTA is exempt. Review's **Links** tab shows the plan against the article.
- **Page-level checks** (`scripts/link_checks.py`) FAIL on footnote links, generic anchors, jargon, relative internal URLs, a target linked twice, and one anchor for two pages. They WARN on anchor length and on an anchor that is the target's full title (unless that title is also the page's query).
- **The worker's link checker** FAILs a link that doesn't resolve and an anchor already used for a different page anywhere on the site.
- The LLM relevance judge (D53 `off_target`) is gone. It re-judged every rewrite, flagged links the plan itself had chosen, and failed runs on borderline calls (D62).
- **Planned pages** in the inventory are linked with their reserved `/learn/` URL. They count as deferred, not missing, and the Framer export renders them as text until each target is live.

## Company numbers (D51)

The company's own figures are the most defensible claims an article can make, and the easiest to discredit when they float free of a method. Cite them only from `context/sales/proof-points.md` entries marked `Citable: yes`, with the methodology line attached. `scripts/seo_audit.py` FAILs a sentence that names the company with a number whose entry is marked `no`, and WARNs on a company number that isn't in the table at all (fine for a case-study figure; a product claim needs an entry).

## Competitor handling (absolute)

The company's head-to-head competitors are listed in `context/sales/competitive-landscape.md` → *Blog-use rules*, along with the scope of each (whole company or one product). If that file is absent, this section doesn't apply. For every head-to-head vendor:

- **Never the opening hook.** No figure, quote or framing from them in the intro.
- **Never a Key Takeaways stat.**
- **Never the subject of an FAQ answer.** No FAQ question about their product or their research.
- **Never cited as a source**, in the body or in the JSON-LD `citation` array. That includes their blogs, reports, docs, and their executives' bylines or interviews in third-party outlets. Disclosing the relationship ("X, which sells Y, estimates…") doesn't make it allowed, and neither does the lack of a neutral source. If a claim's only source is a head-to-head vendor, cut the claim.
- **Named only factually.** Name each one at most once, inside a factual comparison of approaches or categories. Acknowledge their work once at most, then make the company's case on its own terms (*Hedge-Then-Praise Cycling*, above).

**The vendor-format exception (D51).** Tools Listicle, Alternatives and Comparison (Vendor) exist to name competitors, so for those three formats only (`competitorMode: vendor` in `standards/formats.json`):

- Vendors may be named anywhere the format needs them, including the intro, the answer block, the entries and the FAQ, and as often as needed.
- A competitor's **own public documentation** may source a claim **about that competitor** (a capability, a deployment model, a pricing model), in a sentence that names them, with the URL and the date checked. It never sources anything else, and a competitor is never the source of a statistic.
- The company appears as one entry among the others, with the same structure and a real limitations line. Every other entry is written so its own customers would agree with it.
- No `Review` or `AggregateRating` schema on a competitor.
- These pages need human sign-off before export and are never produced unattended by the scheduler. The Strategist records a re-verify-by date; competitor claims decay fast.

`scripts/competitor_checks.py --research` enforces the source ban at the research gate, before anything is written: a vendor's URL, or their name in the attribution of an Authoritative Sources, Statistics, Quotes or Key Claims entry, fails it. Product-only bans match by URL. `scripts/seo_audit.py` machine-checks the article against the same domains, URL prefixes and names in `config/company.yaml` → `competitors.head_to_head`. It FAILs a head-to-head vendor that is linked, cited in the JSON-LD, named in the intro, Key Takeaways or FAQ, or used as a source. It WARNs on a second mention unless the frontmatter's `article_type` is a vendor format. In a vendor format it FAILs only a competitor link outside a sentence about them and a statistic attributed to them. Keep the config list and the context file's table in sync.

**Complementary vendors** (every other vendor that file lists) can be named and cited normally. Frame them as layers that work alongside the company, never as tools it replaces.

The file's quoted talk tracks are internal sales scripts, so never quote or paraphrase them. Dated facts in the file keep claims current and flag stale ones, but a public claim about a vendor still needs a public, non-competitor source in `research-notes.md`.

---

## How the Editor runs this

For each item: pass / fail / notes. Apply fixes in `article.md`. Document the run as an HTML comment at the bottom of the article so the Schema Builder (and later humans) can see what was checked.
