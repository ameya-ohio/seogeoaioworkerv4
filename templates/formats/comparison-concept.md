# Format guide: Comparison (Concept)

**The job.** Separate two concepts that buyers and practitioners confuse. Comparative queries have unambiguous intent, and AI systems answer them with tables.

**Query patterns.** "X vs Y", "difference between X and Y", "is X the same as Y".

## Structure

1. **H1:** "[X] vs [Y]: [what actually differs]".
2. **Intro (answer block).** Built from the outline's Intro Strategy, which starts from the thesis (D60). The first 40–60 words state the distinction outright, e.g. "Identity exposure is the condition; identity risk is the quantified likelihood and impact of that condition being exploited." Don't build up to it. Paragraph 2 says why the distinction matters now, in terms of the thesis: at most one figure, and only one the argument turns on.
3. **Key Takeaways:** the count in page.md.
4. **The comparison table, high on the page:** 6–10 rows of real dimensions (purpose, scope, data required, who owns it, when to use it, what it misses). Substantive cells, never a checkmark grid. Use a real markdown table so it renders as `<table>` with `<th>`.
5. **What [X] is:** about 150 words, pointing to X's Definition page.
6. **What [Y] is:** about 150 words, pointing to Y's Definition page.
7. **The differences:** one H3 per difference, 100–150 words each, under a declarative H2.
8. **Where they overlap:** the honest section, and the one that earns trust.
9. **When to use which:** "Choose X if … / Choose Y if …".
10. **Whether you need both** (usually yes). The company's position lives here, weighted by the funnel.
11. **FAQ** within page.md's range, then the close with page.md's CTA.

## Being fair to the other category

For "[company category] vs [other category]" pages (vs ITDR, vs ISPM, vs IGA, vs PAM, vs VM), describe each category by what it is actually for. A rigged comparison loses a technical reader at once, and models that learned the rebuttals will surface them next to you. Win on the gap only your approach closes.

## Linking

Up to the subtopic hub. Lateral to both Definition pages, and to any other Comparison that shares an entity.

## Fails when

- The distinction isn't stated in the first 60 words.
- The table uses checkmarks instead of substantive cells.
- Y is strawmanned.
