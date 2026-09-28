# Case studies — real engagements the articles can stand on

One file per engagement, anonymized to whatever level you're allowed to
publish. The Strategist picks **at most one** per article as its real-world
anchor; the Writer builds the article's real-world section on it; the
Editor and the technical reviewer treat its facts as sourced.

Without a case study, the rule is: use a documented, cited incident from the
research notes, or no example at all. **Never an invented "picture a
hospital with 400 service accounts…" scenario** — the style gate fails
hypotheticals.

## Adding one

Admin → Context → **New case study** creates a file here from
`_template.md`. Fill in every section you can; leave out what you can't
publish rather than softening it. It is used from the next article run —
no deploy needed.

## What makes a good one

- **Specific numbers** — identities, accounts, paths, hours, days. "14,200
  identities, 312 service accounts with SPNs, 41 crackable in under a day"
  beats "a large environment with many weak accounts".
- **What you found that the customer didn't expect** — the part only
  someone who did the work would know.
- **What changed, in order** — which fix came first and why.
- **The publishing boundary** — how the customer may be described
  ("a 12-hospital US health system"), what must never appear (names,
  hostnames, exact dates).

Files starting with `_` and this README are folder documentation, not
inputs — the agents skip them.
