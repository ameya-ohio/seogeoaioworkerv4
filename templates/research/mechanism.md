# Research playbook: Mechanism

**Formats:** Definition / Explainer, Deep-dive (and the generic format).

**What the page needs.** The reader should come away understanding **how the thing works**: the moving parts, the sequence, the conditions that make it possible, and what breaks it. A definition page has to be precise about where the concept starts and stops. A deep-dive has to reach the technical specifics a generalist couldn't produce: attribute names, permission strings, protocol steps, event IDs, technique IDs. Your research supplies that mechanism from primary technical sources.

## Gather this (→ `## Subject Material`)

### How it works
The mechanism as a numbered sequence: actor, action, system response, result. Name the protocol, component, attribute or permission at each step, with its source (documentation, RFC, standard, technique reference) or "practice".

### Conditions
What has to be true for the mechanism to occur or matter (a configuration, a default, a trust, a missing control), and which of those are defaults versus mistakes.

### Boundaries
Where the concept ends: the nearest neighbouring term and the exact difference, and what people wrongly fold into it. A definition page lives or dies here.

### Specifics
The exact names a practitioner would search for: settings, attributes, API permissions, event IDs, log sources, technique IDs, each with its source.

### In practice
One or two documented cases (a named incident write-up, an advisory, a published post-mortem) that show the mechanism working, with what the write-up says happened at each step.

### Detection and prevention
How the mechanism shows up in logs or telemetry, and the controls that break it, from vendor or standards documentation.

## Prefer these sources
Standards and RFCs, vendor technical documentation, MITRE ATT&CK and similar technique references, government advisories (CISA, NCSC, ASD), incident write-ups from neutral responders, and conference talks or papers by the researchers who described the technique.

## Don't collect
- Market-size and "X% of organizations" survey figures, unless the argument depends on how common the condition is.
- Other vendors' glossary pages as sources. Read them to see the common framing, and cite the primary source instead.

## Candidate positions for this mode
A mechanism page argues about **what people misunderstand about how it works**: the condition everyone overlooks, the boundary everyone draws in the wrong place, the control that looks like it breaks the mechanism and doesn't.

## Statistics & Data Points for this mode
One to three. A figure earns a place when it shows how common the enabling condition is, or how much the mechanism matters in real intrusions.

## Done when
- The mechanism is written as a sourced sequence with named specifics.
- The boundary with the nearest neighbouring term is stated.
- There is at least one documented case, and detection and prevention are covered.
