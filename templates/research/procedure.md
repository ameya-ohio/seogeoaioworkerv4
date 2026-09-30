# Research playbook: Procedure

**Formats:** How-to Guide, Checklist, Template, Integration Page.

**What the page needs.** A practitioner has to be able to follow the page this week and get the result. Every step needs a real action: a command, an API call, a query, or a console path, plus the permission it needs and the output that proves it worked. Your research has to supply that material, sourced to the documentation that defines it. Threat-landscape statistics don't help anyone run a step, so they are not what this page is built from.

## Gather this (→ `## Subject Material`)

Write `## Subject Material` with these subsections:

### Procedure
One numbered entry per step, in the order a practitioner would do them:

```
N. <Step, as an imperative>
   - Action: the exact command, API call, query or console path (code-formatted), per platform where it differs
   - Needs: the role, permission or access level, as the platform documents it
   - Output: what a correct result looks like (fields, counts, a state)
   - Source: Authoritative Source #N (the documentation page), or "practice" if it is standard operator knowledge
```

Cover every platform the title names (e.g. a title naming AD, Entra ID and AWS gets each step's action for all three, or an explicit note that the step doesn't apply there).

### Prerequisites
The tools, access and data the reader needs before step 1, as the documentation states them. Note anything that needs write access, an agent install or a licence tier.

### Verification
How to confirm the procedure worked end to end: the check, and the result that means success.

### Failure modes
Symptom → cause → fix, from documentation, known issues pages, or practitioner forums. At least three.

### Decisions inside the procedure
Where the reader has to choose (scope, thresholds, cadence), what the options are, and what each costs. These choices are where the article's point of view lives.

## Prefer these sources
Vendor documentation (Microsoft Learn, AWS docs, the product's own reference), standards and hardening guides (CIS, NIST, government advisories), official CLI and API references, well-maintained open-source tooling docs from non-competitors, and practitioner write-ups that show the real output.

## Don't collect
- Annual threat-report statistics ("X% of breaches involve credentials"). Include one only if it changes which step comes first or whether a step is worth doing, and say which.
- Definitions of the subject: the parent and sibling pages own them (see the research brief's *Owned by other pages*).
- Vendor product pages presented as procedure.

## Candidate positions for this mode
A procedure page argues about **how the work should be done**: which step people skip or get wrong, which order matters, what the manual method reveals that a tool hides, where the common method measures the wrong thing. For each position, name the step it lives in.

## Statistics & Data Points for this mode
Usually zero to two. A figure earns a place when it sizes the effort (how long, how many objects), sets a threshold, or justifies the order of steps.

## Done when
- Every step has an action, a permission and an output, and every platform the title names is covered.
- Verification and at least three failure modes are written.
- At least two candidate positions are tied to specific steps.
