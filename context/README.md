# Context — company proprietary inputs

The five subfolders here are how company-specific knowledge enters the agent system (which company: `config/company.yaml`). Drop documents in; the agents pick them up automatically the next time they run.

Until a folder has files, agents fall back to the defaults documented in `agents/writer.md` and `standards/quality-bar.md`. **Empty folders are not failures.** They just mean the agent has nothing proprietary to pull from yet.

---

## `context/brand/`

Brand voice, positioning, mission, taglines, do's and don'ts.

**Recommended files**
- `voice-and-tone.md` — voice attributes (e.g. "confident, expert, technically precise"), tone modulation by audience, dos & don'ts.
- `positioning.md` — one-sentence positioning, three-sentence positioning, category, primary differentiation.
- `mission-and-values.md` — what the company is here to do.
- `taglines.md` — current taglines and product names with usage rules (capitalization, when to use which).
- `dos-and-donts.md` — phrases to use, phrases never to use, brand-specific banned terms (extends `standards/quality-bar.md`).

Used by: **Writer** (voice), **Editor** (verification), **Strategist** (angle/positioning fit).

---

## `context/sales/`

ICP profiles, top objections, value-prop one-pagers, competitive battle cards.

**Recommended files**
- `icp.md` — ideal customer profile(s) with firmographics, role, pain, decision criteria.
- `objections.md` — top objections from real sales conversations + the company's response to each.
- `value-props.md` — primary value props with proof points (case studies, numbers, customer quotes).
- `battle-cards/` — one file per competitor: positioning, when we win, when they win, traps to set, traps to dodge.
- `case-studies.md` — short summaries of customer wins with named companies, named outcomes, named numbers (when permitted).

Used by: **Strategist** (angle, intent, audience-resonant framing) and **Writer** (concrete examples and proof points to weave in).

---

## `context/marketing/`

Content strategy, target keyword list, campaign briefs, persona docs.

**Recommended files**
- `content-strategy.md` — current pillars, topic clusters, editorial calendar.
- `target-keywords.md` — prioritized keyword list with intent, search volume, difficulty, current ranking.
- `personas.md` — buyer personas with goals, pains, channels, watering holes.
- `campaign-briefs/` — per-campaign briefs that the article should support or reference.
- `internal-linking-map.md` — list of evergreen pages and the topics they hub for, so the Strategist can suggest specific internal links rather than placeholders.

Used by: **Strategist** (keyword choice, internal-link suggestions, cluster fit) and **Editor** (verifying the article serves the broader strategy).

---

## `context/finance/`

Pricing, ROI calculators, cost-comparison data, financial talking points.

**Recommended files**
- `pricing.md` — current plans and pricing, what each tier includes, how to talk about it.
- `roi-calculators.md` — saved-time-per-process numbers, headcount-savings frames, payback-period examples.
- `cost-comparison.md` — the product vs. headcount, vs. RPA, vs. point-solution costs (with assumptions and sources).
- `financial-talking-points.md` — approved language for talking about ROI, savings, cost.

Used by: **Writer** (when an article needs concrete ROI numbers) and **Editor** (verifying any financial claim is sourced and on-brand).

---

## `context/author-style/`

Author bio, sample articles, voice guidelines, vocabulary preferences.

**Recommended files**
- `bio.md` — author full bio (used in the `Person` schema and in inline mentions).
- `sample-articles/` — 2–3 representative pieces by the author in markdown form. The Writer will model voice off these.
- `voice-guide.md` — vocabulary preferences, sentence patterns, opinions held, opinions avoided, idioms used, idioms avoided.
- `same-as.md` — canonical identity URLs for the author (LinkedIn, X/Twitter, personal site, Wikipedia/Wikidata if applicable). Schema Builder pulls these into `Person.sameAs`.

Used by: **Writer** (voice) and **Schema Builder** (`Person` node).

---

## How agents use these folders

Agents do **glob-style** reads — they load the full folder. A few rules:

- **Filenames don't matter.** Only directory placement matters. Agents read everything in the folder.
- **Empty folder ≠ failure.** Agents proceed with documented defaults and note the gap in their pass.
- **Markdown is preferred.** Plain `.md` reads cleanly. PDFs and docs work but parse less reliably; consider converting to markdown.
- **Update over time.** Re-running an article on the same topic after populating these folders should produce a meaningfully better article.

---

## Suggested order to populate

If you're starting from empty, the highest-leverage order is:

1. `author-style/sample-articles/` — drop in 2–3 of your best published pieces. The Writer's voice immediately improves.
2. `brand/voice-and-tone.md` — codify what the samples are showing.
3. `sales/icp.md` and `sales/objections.md` — sharper Strategist angles, more resonant Writer framing.
4. `marketing/target-keywords.md` and `marketing/internal-linking-map.md` — the Strategist starts making real keyword and link decisions instead of placeholders.
5. Everything else, as needed.

Empty `.gitkeep` files are placeholders so the directory structure exists in version control. Replace with real content as it's written.
