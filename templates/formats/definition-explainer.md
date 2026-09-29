# Format guide: Definition / Explainer

**The job.** Own one entity: be the cleanest canonical definition a model can ground an answer on. This is the plan's highest-leverage format for AI citations. (It also covers "Explainer" rows, which are the same format.)

**Query patterns.** "what is X", "X meaning", "X definition", "X explained".

## Structure

1. **H1:** "What is [entity]?" or "[Entity]: definition and how it works". The H1 is the only question-shaped heading outside the FAQ.
2. **Intro (definition block).** Built from the research Topic Summary ¶1–2 (D44), with the definition as its first 40–60 words: one sentence of definition, then two of essential qualification. It must stand alone with zero surrounding context, with no "as discussed above" and no reliance on the H1 for the subject. This block is the product.
3. **Key Takeaways:** the count in page.md.
4. **Why it matters:** the consequence of getting it wrong, with sourced figures.
5. **How it works:** the mechanism, briefly, as a numbered sequence where it's sequential.
6. **Components or types:** a list or table.
7. **[Entity] and its nearest neighbour:** about 100 words on the term it's confused with, then a pointer to the Comparison page.
8. **A real example** in the company's domain, from a case study or a cited incident. Never an invented scenario.
9. **Common misconceptions.**
10. **The company's approach:** about 100 words on a TOFU page, linking the funnel's CTA.
11. **FAQ** within page.md's range, then the close.

On a **hub** page (routing), keep items 1–3 as the framing, then route: a 2–3 sentence answer for each child page in the brief's order, each pointing onward.

## Formal definition

This format's defined entity gets the one bolded formal definition the article is allowed (`**X** is …`, at most two per article). The Schema Builder turns it into a `DefinedTerm`.

## The company's own terms

For terms the company coined (PIEM, Resistance Score), this page *is* the canonical definition on the internet, so write it with that care. For industry terms, the definition must be neutral and accurate first. A definition bent toward the product loses the citation to a vendor-neutral source.

## Fails when

- The definition is hedged, runs past 60 words, or arrives after a paragraph of context.
- Two definition pages in the plan define the same entity. One entity gets one definitional URL, or the signal splits and neither page is cited.
