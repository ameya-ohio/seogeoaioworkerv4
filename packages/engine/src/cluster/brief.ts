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
    lines.push(`**External statistics (source URLs required — never fabricate):**`, ``);
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
    brief.differentiationAngle,
    ``,
    `## Internal links`,
    ``,
    `- Hub: ${brief.internalLinks.hub}`,
    ...brief.internalLinks.siblings.map((s) => `- Sibling spoke: ${s}`),
    ``,
  );
  return lines.join("\n");
}
