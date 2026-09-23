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

Quantification beats hot adjectives every time. "$60 billion evaporated" is more devastating than "a devastating loss."

**Fix:** Lead with the number. The number is the adjective.

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
- Name the company, person, product, dollar amount, percentage, year. "A 2025 McKinsey survey of 800 enterprises" beats "industry studies."
- Examples: "Salesforce" beats "a leading CRM." "$3.4B" beats "billions." "Q1 2026" beats "early this year."

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
- The number, the date, the publisher, the URL — all must come from `research-notes.md`.
- If the article cites a number not in research notes, the Editor either (a) removes it, (b) replaces it with a sourced one, or (c) escalates back to Phase 1 with `[NEEDS RESEARCH: <claim>]`.

### Every quote traces to research-notes.md
- Exact wording, attribution to the right speaker, attribution to the right publication.
- Quotes that can't be sourced are stripped.

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

## How the Editor runs this

For each item: pass / fail / notes. Apply fixes in `article.md`. Document the run as an HTML comment at the bottom of the article so the Schema Builder (and later humans) can see what was checked.
