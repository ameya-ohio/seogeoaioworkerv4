# Format guide: Examples

**The job.** Make an abstraction concrete: the "but what does that actually look like" page that follows every definition.

**Query patterns.** "X examples", "examples of X", "real world X", "X scenarios".

## Structure
1. **H1:** "[N] [Topic] Examples".
2. **Intro (answer block).** Built from the research Topic Summary ¶1–2 (D44); paragraph 1 carries the answer block below within its first 60–80 words, paragraph 2 the sourced why-now. The answer block names the example categories.
3. A quick-reference table: example, environment, mechanism, impact, fix.
4. One H2 per example, 200–350 words, same sub-structure each time: the scenario, the technical mechanism, why it happens, what an attacker gains, how to detect it, how to fix it. Group by environment (Active Directory, Entra ID, AWS IAM, Okta, hybrid).
5. Patterns across the examples, then how to find these in your own environment.
Then **Key Takeaways** (the count in page.md), declarative H2s throughout (D33), the company section weighted by the funnel, the **FAQ** within page.md's range, and the close with page.md's CTA.

Examples come from case studies, anonymised platform findings where permitted, or cited incidents. Never invented scenarios (the edit gate fails them).

## Fails when
An example is generic. "A user has too many permissions" is not an example; "a service account with GenericAll on Domain Admins via an inherited ACL" is.
