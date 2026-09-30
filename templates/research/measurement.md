# Research playbook: Measurement

**Formats:** Metrics Guide, Assessment Guide, Framework.

**What the page needs.** A way to measure or assess something that the reader can actually compute. Each metric or criterion needs a definition, a formula or rubric, the data it's computed from and where that data comes from, and a sense of what good looks like. The page also has to say where the measure misleads. Your research supplies definitions, data sources, published methodologies and benchmarks.

## Gather this (→ `## Subject Material`)

### Measures
One entry per metric or criterion:

```
- **<Metric>**
  - Definition: exactly what it counts or scores
  - Formula / rubric: how it is computed
  - Data: the source data and where it comes from (the export, API, log or console view, per platform)
  - Good looks like: a published benchmark or threshold with its source, or "no published benchmark"
  - Misleads when: the blind spot or gaming risk
  - Source: Authoritative Source #N, or "practice"
```

### Method
How an assessment or measurement run is carried out: scope, sampling, cadence, who does it, and how results are compared over time.

### Existing scores and frameworks
The published scores, maturity models or frameworks people already use (vendor posture scores, CIS, NIST CSF), what each actually measures by its own documentation, and what it leaves out.

### Proof of change
How the reader tells that a change in the number reflects a real change in the thing being measured.

## Prefer these sources
Methodology documentation, standards and frameworks, vendor documentation for the scores they publish (what the score counts, in their words), academic or industry papers on the metric, and practitioner discussion of where the metric fails.

## Don't collect
- Breach and attack-volume statistics used as "why this matters". A measurement page earns attention by being computable.
- Metric lists from vendor blogs with no definition or data source.

## Candidate positions for this mode
A measurement page argues about **what the common measure gets wrong and what to count instead**: the score that tracks activity rather than outcome, the metric that moves for the wrong reason, the unit that should be counted. Each position names the measure it replaces and the data it needs.

## Statistics & Data Points for this mode
One to three: benchmarks, thresholds, or evidence that the common measure diverges from the outcome.

## Done when
- Every measure has a definition, a formula, a data source and a misleads-when note.
- Existing scores are described in their own documentation's words.
- There is a proof-of-change method.
