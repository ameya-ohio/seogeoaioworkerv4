# Saporo Author Voice — Style Spec

> Source of truth for how Saporo articles sound (decision D36). Derived from the two
> canonical posts on saporo.io designated by Ameya (2026-09-16):
> 1. "Compliance Is a Starting Point, Not a Measure of Exploitability"
>    https://www.saporo.io/resources/blog/compliance-is-a-starting-point-not-a-measure-of-exploitability
> 2. "Identity Is the New Attack Surface, But Most Graphs Are Blind"
>    https://www.saporo.io/resources/blog/identity-is-the-new-attack-surface-but-most-graphs-are-blind
>
> The Writer follows this over its default voice rules. The Editor enforces it.

## The arc every article follows

1. **Concede, then pivot.** Open by granting the conventional view its due, then turn:
   *"Security teams in regulated industries spend substantial time measuring controls,
   preparing audits, and tracking compliance scores. This work is necessary."* — and then
   the article spends its whole length showing why necessary is not sufficient.
2. **Problem → solution → action.** Establish the paradox or blind spot, dismantle the
   conventional logic, propose the alternative frame, ground it in one concrete worked
   example, close with what the reader should do or ask.
3. **Crystallize the thesis at the close.** The final lines compress the whole argument
   into one distinction: *"A failed control tells you that something is wrong. Exposure
   context tells you what it could lead to."* / *"That is the difference between
   measuring compliance and reducing risk."*

## Sentence rhythm

- Medium expository sentences carry the argument; **short declaratives land the punches**:
  *"This work is necessary."* / *"It is the reality we live in."*
- Fragments appear sparingly, for emphasis only.
- Longer analytical sentences are allowed when they resolve into a short conclusion.
- Never the AI cadence of every-sentence-the-same-length.

## Voice

- **Assertive and unhedged.** Claims are stated as established fact when the evidence
  backs them: *"most security tools still treat identity as a flat list."* Assertion is
  tempered by reasoning, never by hedging language.
- **"We" as insider, "you" to include the reader**: *"If you are not mapping these
  relationships, you are missing the exposure."*
- Authoritative but measured — expertise without hyperbole, **no false urgency, no fear**:
  *"This is not about fear. It is about giving defenders the ability to see the
  environment the same way attackers already do."*
- Questions appear inside prose as bridges (*"Can an attacker use this weakness to reach
  a critical asset?"*), not as headings.

## Headings

- **H2s are declarative statements**, often imperative or contrastive:
  "The limits of pass and fail" · "Add the attacker's perspective" ·
  "Prioritize structural risk reduction" · "Measure what the attacker loses" ·
  "What this looks like in a healthcare environment".
- No question-mark headings in the body. The FAQ block is the only place questions
  appear as headings.

## Evidence style

- One concrete, numerically grounded worked example anchors the abstract argument
  ("245,000 identities", "2 million attack paths") — better one deep example than
  five shallow ones.
- Stats are attributed in prose to their actual source; sophistication over repetition —
  terminology varies, keywords are never repeated for their own sake.

## Anti-patterns (never do these)

- Question-shaped H2s outside the FAQ block.
- Keyword repetition or stuffed query strings anywhere, especially the lede.
- Listicle cadence, numbered-step spam, "best practices" clichés.
- Hedging ("could potentially", "may sometimes") where the evidence supports assertion.
- Alarmist framing or false urgency.
- The answer-farm shape: a stack of Q→A sections with no thesis connecting them.
  Answer-first sentences under each heading are required — but they serve a running
  argument, they are not the structure itself.
