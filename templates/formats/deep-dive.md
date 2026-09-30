# Format guide: Deep-dive

**The job.** Exhaust one narrow subtopic at practitioner depth, more specifically than any generalist publisher could. This is the plan's workhorse format. It builds technical credibility and collects long-tail citations.

**Query patterns.** Long-tail and specific: "what causes identity exposure in hybrid environments", "AdminSDHolder ACL abuse", "Kerberos delegation attack path". Each gets little volume; together they are most of the plan.

## Structure

1. **H1:** the specific question or topic, close to how it's searched.
2. **Intro (answer block).** Built from the outline's Intro Strategy, which starts from the thesis (D60). Paragraph 1 answers the precise long-tail question within its first 60–80 words. If the H1 asks what causes X, it lists the causes. Paragraph 2 says why it matters now, in terms of the thesis: sourced specifics, not a threat-report figure.
3. **Key Takeaways:** the count in page.md, each a technical claim with a specific (a technique ID, an attribute, a number).
4. **Background:** at most about 150 words of the context a reader needs. Link out rather than re-explain, especially to the Definition page for each term of art.
5. **The substance:** 4–8 declarative H2 sections of 250–450 words each, each advancing the thesis. Put the technical specifics here: commands, attribute names, permission strings, MITRE ATT&CK technique IDs, event IDs, actual values. Use a table or diagram for anything structural.
6. **Edge cases and exceptions:** one section. It's rarely written and cited disproportionately.
7. **How to detect or verify it in your own environment:** concrete checks a practitioner can run.
8. **The company's angle:** one section, after the value is delivered, on how the product surfaces this. Weight it by the funnel (page.md).
9. **FAQ** within page.md's range, then the close with page.md's CTA.

## Linking

Up to the subtopic hub and the pillar in the first 150 words. Lateral to 3–5 sibling pages and to the Definition page for every term of art. Nothing down: a deep-dive is a leaf.

## Fails when

- It is a definition padded to 2,000 words. The test: it has at least one specific, checkable technical detail a generalist couldn't have written. If it doesn't, it isn't a deep-dive.
- It pitches before it teaches.
- Its answer block answers the general topic instead of the precise question.
- It answers the same question as a sibling deep-dive. Two pages on one question cannibalise each other and neither gets cited.
