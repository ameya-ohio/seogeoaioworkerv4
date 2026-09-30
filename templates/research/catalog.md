# Research playbook: Catalog

**Formats:** Examples, Use Case.

**What the page needs.** Concrete instances a reader can recognize in their own environment. Each one has to be specific enough to check: the exact attribute, permission, setting or command, how it's detected, and how it's fixed. "A user has too many permissions" isn't an example. "A service account with GenericAll on Domain Admins through an inherited ACL" is. Your research builds a bank of examples like that, each sourced to the documentation or technique reference that describes it.

## Gather this (→ `## Subject Material`)

### Example bank
Collect **more candidates than the page will use**. Aim for at least two per environment, platform or category the title names, so the Strategist can choose. One entry per example:

```
- **<Short name>** (<environment>)
  - Condition: the exact attribute / permission / setting / grant (code-formatted)
  - Mechanism: how an attacker, or the failure, uses it, step by step
  - Gains: what it leads to
  - Detect: log source, event ID, query or console view
  - Fix: the specific change
  - Source: Authoritative Source #N (documentation, technique reference, advisory), or "practice"
  - Seen in: a documented incident or advisory, if one exists
```

### Connections between examples
If the title spans several environments (e.g. AD, Entra ID and AWS), research the **links between them**: the sync, federation, trust or shared-credential paths that let an exposure in one lead into another. Name the exact component in each link (the sync account and its permissions, the federation trust, the cross-account role, the SSO assignment), with its source. A page that promises examples *across* environments has to show at least one path that actually crosses them.

### Patterns
What the examples share (a default, an ownership gap, a review blind spot) and what that implies for finding them.

## Prefer these sources
Vendor documentation for each platform, technique references (MITRE ATT&CK), government advisories, neutral security research blogs and conference talks, and published incident write-ups.

## Don't collect
- Aggregate threat-report percentages. An examples page is concrete; a figure only belongs if it shows that one example is common or costly.
- Examples that other pages in this cluster own in depth (see *Owned by other pages*). Keep one line and a pointer.
- Composite or anonymized vendor "story" examples with no named permission or setting.

## Candidate positions for this mode
An examples page argues about **what the examples reveal together**: that the dangerous ones are the ones no single tool flags, that they cross boundaries, that they come from one recurring cause. Each position must say which examples demonstrate it. A position the examples can't show is not usable.

## Statistics & Data Points for this mode
Zero to two.

## Done when
- The bank has at least two fully specified examples per category the title names.
- The connecting paths are researched with named components (for a multi-environment title).
- Each candidate position names the examples that prove it.
