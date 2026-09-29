# Format guide: How-to Guide

**The job.** Take the reader from a defined starting state to a defined finished state. Step sequences are what AI Overviews are built to display, so this format has the highest AIO capture rate in the plan.

**Query patterns.** "how to X", "how to X in Y", "steps to X", "X tutorial".

## Structure

1. **H1:** "How to [outcome]".
2. **Intro (answer block).** Built from the research Topic Summary ¶1–2 (D44). Paragraph 1 compresses the whole procedure into about 60 words, or states "[Outcome] takes N steps: …". Paragraph 2 gives the sourced why-now.
3. **Key Takeaways:** the count in page.md.
4. **What you'll need:** prerequisites, permissions, tools and access level, stated exactly.
5. **Time and difficulty:** one line.
6. **The steps:** one H2 (or H3 under a "The procedure" H2) per step, numbered, in order. Headings are imperative ("Export the ACLs for Tier 0 objects"). Each step gives the action, one line on why it matters, the expected result, and a command block or console path.
7. **Verify it worked:** an explicit success check.
8. **Troubleshooting:** a table of symptom → cause → fix.
9. **What to do next,** then the company's angle. Give the manual procedure honestly and completely first; the automated path lands as a relief only after the reader has seen the manual work.
10. **FAQ** within page.md's range (implementation follow-ups), then the close.

## Schema

`HowTo` with each step's name and text, plus `tool`, `supply` and `totalTime` where known. It's this format's highest-value schema.

## Linking

Up to the pillar. Lateral to the Checklist and Template for the same task, if they exist. Down to a Deep-dive for any step that needs more depth. Never inflate a step into an essay.

## Fails when

- The steps aren't individually numbered and headed, or the procedure is buried in prose.
- The manual method is made to look harder than it is. Practitioners notice at once, and it costs the citation.
- There is no success check.
