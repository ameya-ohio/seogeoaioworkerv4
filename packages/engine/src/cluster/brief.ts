import type { SpokeBrief } from "./types.js";

/**
 * Render a spoke brief as the markdown document the Strategist receives as
 * a first-class input (roadmap 4.12, D31). The wording of the requirement
 * lines mirrors the spec (§9) so the Strategist and Writer see the same
 * rules the cluster agent planned against.
 */
export function renderBriefMarkdown(brief: Omit<SpokeBrief, "markdown">): string {
  const lines: string[] = [
    `# Spoke Brief: ${brief.workingTitle}`,
    ``,
    `> Produced by the Topic & Cluster Generator. This brief is a first-class input`,
    `> to the Strategist: its H2 outline (phrased in sub-query vocabulary), answer-first`,
    `> passage requirements, evidence requirements, and length band take precedence over`,
    `> the SERP-median word-count rule (decision D31).`,
    ``,
    `- **Theme:** ${brief.themeName}`,
    `- **Primary query target (D32):** ${brief.primaryQueryTarget}${
      brief.queryTargetAlternates?.length
        ? ` (alternates: ${brief.queryTargetAlternates.join(", ")})`
        : ""
    } — a natural query, to be used naturally; never contort a sentence to fit it`,
    `- **Primary persona:** ${brief.persona}`,
    `- **Buying stage:** ${brief.buyingStage}`,
    `- **Priority score:** ${brief.priorityScore}/45`,
    `- **Length band:** ${brief.lengthBand.min}–${brief.lengthBand.max} words${
      brief.lengthBand.justification ? ` (${brief.lengthBand.justification})` : ""
    }`,
    `- **Schema:** ${brief.schemaTypes.join(", ")}`,
    ``,
    ...renderPageFacets(brief),
    `## Representative sub-queries (shape passages, never titles or keywords)`,
    ``,
    ...brief.representativeSubQueries.map((q) => `- ${q}`),
    ``,
    `## Required passages (D33 — coverage contract, NOT the outline)`,
    ``,
    `Each item below must be answered somewhere in the article as an extractable`,
    `passage. The Strategist owns the narrative structure and the (declarative)`,
    `headings — these are requirements to satisfy, not sections to transcribe.`,
    ``,
    ...brief.h2Outline.map((h) => `- ${h}`),
    ``,
    `**Answer-first requirement:** the first 40–60 words of each required passage`,
    `must answer its question on their own — no "as mentioned above". Each passage`,
    `must survive extraction on its own.`,
    ``,
    `## Evidence required`,
    ``,
  ];
  if (brief.evidence.proprietary.length > 0) {
    lines.push(`**Proprietary (from company knowledge):**`, ``);
    lines.push(...brief.evidence.proprietary.map((p) => `- ${p}`), ``);
  }
  if (brief.evidence.external.length > 0) {
    lines.push(`**External evidence to find (source URLs required — never fabricate):**`, ``);
    lines.push(
      ...brief.evidence.external.map(
        (e) => `- ${e.requirement}${e.sourceUrl ? ` (${e.sourceUrl})` : ""}`,
      ),
      ``,
    );
  }
  lines.push(
    `**Quotable stat candidate:** ${brief.evidence.quotableStatCandidate}`,
    ``,
    `## Differentiation angle`,
    ``,
    brief.differentiationAngle.trim() ||
      `Not set. The Strategist decides it from the research: what this page says about the subject that the current top results don't.`,
    ``,
  );
  if (brief.companyPosition?.trim()) {
    lines.push(
      `## Company position (the pillar's, context for this page, not its angle)`,
      ``,
      brief.companyPosition.trim(),
      ``,
    );
  }
  lines.push(`## Internal links`, ``);
  // D53: no site-structure labels ("hub", "spoke") — the Writer repeated them
  // to readers. page.md's link inventory has each page's URL and what it covers.
  lines.push(`Pages this one should connect to (URLs and what each covers are in page.md's link inventory):`, ``);
  if (brief.internalLinks.hub) lines.push(`- ${brief.internalLinks.hub} (the broader topic this page sits under)`);
  lines.push(...brief.internalLinks.siblings.map((s) => `- ${s}`));
  lines.push(``);

  if (brief.siblingQueries && brief.siblingQueries.length > 0) {
    lines.push(
      `## Sibling pages' own queries (D49)`,
      ``,
      `Each of these is another page's target query. An FAQ answer may touch one`,
      `in a sentence or two and point to that page — never answer it in full.`,
      ``,
      ...brief.siblingQueries.map((s) => `- "${s.query}" — ${s.title}`),
      ``,
    );
  }

  const children = brief.internalLinks.children ?? [];
  if (children.length > 0 && brief.page?.pageRole === "pillar") {
    lines.push(
      `## Pages this pillar must link down to`,
      ``,
      `This is a PILLAR GUIDE (D47): a complete guide in its own right. Group the`,
      `pages below into sub-themes; each sub-theme section answers its question`,
      `completely, then links down to the child page with a descriptive anchor, using`,
      `the URL from page.md's link inventory (planned pages are linked now, D53).`,
      ``,
      ...children.map((c) => `- ${c}`),
      ``,
    );
  } else if (children.length > 0) {
    lines.push(
      `## Pages this routing page must link down to`,
      ``,
      `This is a ROUTING page. Each page below must get a 2-3 sentence answer in`,
      `the body, in this order, and a link onward — never a full treatment`,
      `(that belongs on the child page). Link each with a descriptive anchor using the`,
      `URL from page.md's link inventory (planned pages are linked now, D53).`,
      ``,
      ...children.map((c) => `- ${c}`),
      ``,
    );
  }
  return lines.join("\n");
}

/** The facet block (D45–D49); empty for briefs built before the registry. */
function renderPageFacets(brief: Omit<SpokeBrief, "markdown">): string[] {
  const p = brief.page;
  if (!p) return [];
  const faq =
    p.faq.max === 0
      ? "none — this format carries no FAQ block"
      : `${p.faq.min}–${p.faq.max} questions${p.faq.optional ? " (or none, if nothing is left to answer)" : ""}, 40–60 words each, direct answer first`;
  const takeaways =
    p.takeaways.min === p.takeaways.max
      ? `exactly ${p.takeaways.min}`
      : `${p.takeaways.min}–${p.takeaways.max}`;
  return [
    `## Page facets (D45–D49)`,
    ``,
    `- **Page role:** ${p.pageRole}${p.routing ? " (routing page — links down to every child; its format sets only the framing and intro)" : ""}`,
    `- **Article type:** ${p.articleTypeLabel} (\`${p.articleType}\` — follow format.md)`,
    `- **Search intent:** ${p.searchIntent}`,
    `- **Funnel:** ${p.funnel.toUpperCase()}`,
    ...(p.path ? [`- **Path:** ${p.path}`] : []),
    `- **Key Takeaways:** ${takeaways} bullets`,
    `- **FAQ:** ${faq}`,
    ...(p.competitorMode === "vendor"
      ? [`- **Competitors:** vendor format — the scoped exception in standards/quality-bar.md applies${p.signoff ? "; human sign-off required before export" : ""}`]
      : []),
    ``,
  ];
}
