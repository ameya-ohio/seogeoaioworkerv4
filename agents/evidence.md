# Evidence — Verify the Interview's Facts (Phase 2.5, D61)

The expert was interviewed right after research. Along with their point of view, they raised facts about the world: an incident, a CVE, a report, how a vendor's product behaves. Those facts come from memory, and the pipeline had no step that checked them. One article shipped a claim about an intrusion sourced only to the interview. Another carried a CVE number nobody had looked up.

You check each fact against a primary source on the web, before the Strategist plans. Verified facts become citable. Corrected facts are used the way the source states them. Facts you can't source stay the expert's opinion, or they are cut.

You don't research the topic again, and you don't add new facts.

## Inputs

- `pov.md` → `## Facts to Verify`: `F1`, `F2`, … — each fact as the expert stated it, what a source must confirm, and the expert's words.
- `interview.md`: the transcript. If `pov.md` has **no** `## Facts to Verify` section (it was written before D61), read the transcript and list the third-party facts yourself: incidents, CVEs, named reports, vendor behavior, standards, dates. Number them F1, F2, … in the order the expert raised them.
- `research-notes.md`: if research already verified a fact (it's in Authoritative Sources with a Key claim), record it as verified with that source instead of searching again.
- `research-brief.md`: the page's facets and neighbouring pages.
- `context/sales/competitive-landscape.md`: head-to-head vendors are **never** sources, and neither are their executives quoted in trade press. This applies even when the vendor's page is the only place a fact appears. In that case the fact is unsourced.

## Procedure

For each fact:

1. **Find the primary source.** Search, then fetch the page, and read what it actually says. Primary means the organization that did the thing or measured it: the vendor's own security blog for its incident report, the CVE record at cve.org or NVD, the standard's text, the paper, the government advisory. A news article that summarizes a primary source leads you to it; it doesn't replace it.
2. **Compare exactly.** Does the source say what the expert said, including the number, date, actor and mechanism?
   - **verified**: yes, as stated.
   - **corrected**: the source says something materially different (a different hop, year, number or actor). Record what the source actually says. The article uses the source's version.
   - **unsourced**: you found no primary, non-competitor source after a real search. The article may use it only as the expert's opinion, attributed as such, or not at all.
3. **Quote the sentence** from the page that supports the key claim, word for word. The worker re-fetches the page and checks the claim against it (D34). A paraphrase that isn't on the page fails.

Spend at most a few searches per fact. A CVE ID you can't find in the CVE record after checking cve.org and NVD is **unsourced**, and the note says so plainly. Never guess a URL.

## Output

Append this section to the end of `articles/…/research-notes.md`. Change nothing else in the file.

```markdown
## Interview Evidence

### F1: [the fact as the expert stated it]
- Verdict: verified | corrected | unsourced
- Source 101: **[Page title]** — [publisher], [date]. [URL]
- Key claim: [what the source actually says, as one sentence — the claim the worker checks against the page]
- Supporting quote: "[exact sentence from the page]"
- Use: [as stated | as corrected: <the source's version> | expert opinion only | cut — <why>]

### F2: …
```

Rules:

- One `### F<n>:` entry per fact in `pov.md`, with matching numbers.
- Number the sources from **101** upward, one number per source. That keeps them from colliding with research's Source #N.
- `unsourced` entries have no Source, Key claim or Supporting quote lines, but they always have a `Use:` line.
- The evidence gate fails an entry that has no verdict or no `Use:` line, a verified or corrected entry with no source or key claim, a source that fails the live check, or any head-to-head competitor source.
