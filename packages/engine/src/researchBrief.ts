import type { SpokeBrief } from "./cluster/types.js";
import type { ResearchMode } from "./formats.js";
import type { LinkTarget } from "./links/inventory.js";
import type { PageRules } from "./pageRules.js";
import { markdownSection } from "./interview.js";

/**
 * research-brief.md (D60): what the Researcher is researching FOR.
 *
 * Before D60 the Researcher got a topic and a keyword and nothing else. It
 * never saw the page's facets, its brief, or the pages around it, so every
 * page ran the same SEO-landscape recipe. A how-to got threat-report
 * statistics instead of commands, and every cluster page re-researched the
 * hub's definition. This file hands it the page (facets, format, what it
 * must cover), the research playbook its article type selects (the
 * "quiver", templates/research/<mode>.md), the role/funnel/intent
 * adjustments, and the pages that own neighbouring topics.
 */

export interface ResearchBriefInput {
  title: string;
  targetKeyword?: string | undefined;
  rules: PageRules;
  mode: ResearchMode;
  /** templates/research/<mode>.md. */
  playbook: string;
  /** templates/research/modifiers.md. The relevant sections are picked out. */
  modifiers: string;
  /** templates/formats/<slug>.md: what the Writer will build from this research. */
  formatGuide: string;
  /** The plan or cluster brief, when the page has one. */
  brief?: Omit<SpokeBrief, "markdown"> | undefined;
  /** D53 link inventory: the parent, siblings and children, with what each covers. */
  inventory: LinkTarget[];
}

/** Drop a document's H1 and push every other heading down `by` levels. */
export function demoteHeadings(md: string, by: number): string {
  return md
    .replace(/^#\s+.*\n+/, "")
    .replace(/^(#{1,5})(\s)/gm, (_m, hashes: string, sp: string) => `${"#".repeat(Math.min(6, hashes.length + by))}${sp}`)
    .trim();
}

/** The modifier sections that apply to this page's facets, in role → funnel → intent order. */
export function modifiersFor(modifiers: string, rules: PageRules): string[] {
  const f = rules.facets;
  const wanted = [
    `Role: ${f?.pageRole ?? "cluster"}`,
    ...(f ? [`Funnel: ${f.funnel}`, `Intent: ${f.searchIntent}`] : []),
  ];
  const out: string[] = [];
  for (const h of wanted) {
    const body = markdownSection(modifiers, h);
    if (body) out.push(`### ${h}`, ``, body, ``);
  }
  return out;
}

export function renderResearchBrief(input: ResearchBriefInput): string {
  const { rules, mode, brief } = input;
  const f = rules.facets;
  const lines: string[] = [
    `# Research Brief: ${input.title}`,
    ``,
    `> Built by the worker for the Researcher (D60). It says what this page is and what it needs.`,
    `> Research the material this page is built from, per the playbook below, not a generic`,
    `> landscape. Everything here is direction; none of it is evidence.`,
    ``,
    `## This page`,
    ``,
    `- **Title:** ${input.title}`,
    ...(input.targetKeyword ? [`- **Target query:** ${input.targetKeyword}`] : []),
    `- **Page role:** ${f?.pageRole ?? "not set (the Strategist chooses; research as a cluster page)"}${rules.routing ? " (routing page)" : ""}`,
    `- **Article type:** ${rules.format.label} (\`${rules.format.slug}\`)`,
    `- **Research mode:** ${mode.label} (\`${mode.slug}\`)`,
    ...(f ? [`- **Search intent:** ${f.searchIntent}`, `- **Funnel:** ${f.funnel.toUpperCase()}`] : []),
    `- **Length band:** ${rules.lengthBand.min}–${rules.lengthBand.max} words. Gather enough to fill it with substance, not more.`,
    ...(brief?.persona && !/placeholder/i.test(brief.persona) ? [`- **Reader:** ${brief.persona}`] : []),
    ``,
  ];

  const passages = brief?.h2Outline?.length ? brief.h2Outline : rules.format.passages;
  if (passages.length) {
    lines.push(
      `## What the page must cover`,
      ``,
      `Each of these has to be answerable from your notes. Research the material for each one.`,
      ``,
      ...passages.map((p) => `- ${p}`),
      ``,
    );
  }

  const external = brief?.evidence.external ?? [];
  if (external.length) {
    lines.push(
      `## Evidence the brief asks for`,
      ``,
      `These describe what to find. Where one asks for a statistic, find one only if it bears on the page's argument.`,
      ``,
      ...external.map((e) => `- ${e.requirement}`),
      ``,
    );
  }

  const position = brief?.companyPosition?.trim();
  const angle = brief?.differentiationAngle?.trim();
  if (position || angle) {
    lines.push(`## The company's position (context, not evidence)`, ``);
    if (position) lines.push(position, ``);
    if (angle && angle !== position) lines.push(`**This page's angle (from the brief):** ${angle}`, ``);
    lines.push(
      `Use this to judge which positions are worth testing. Never cite it, and don't bend evidence toward it.`,
      `Your candidate positions must stand on the research.`,
      ``,
    );
  }

  if (input.inventory.length) {
    lines.push(
      `## Owned by other pages`,
      ``,
      `Each page below owns its own topic. Give each one line at most in your notes, enough for the`,
      `writer to summarize it and link. Don't research any of them in depth, and don't re-research the`,
      `broader topic's definition.`,
      ``,
      ...input.inventory.map((t) => `- **${t.title}** (query: "${t.query}"): ${t.covers}`),
      ``,
    );
  }

  lines.push(`## Research playbook: ${mode.label}`, ``, demoteHeadings(input.playbook, 1), ``);

  const mods = modifiersFor(input.modifiers, rules);
  if (mods.length) lines.push(`## Adjustments for this page`, ``, ...mods);

  if (input.formatGuide.trim()) {
    lines.push(
      `## What the Writer will build from your notes (format guide)`,
      ``,
      `Read this to see which parts of the page need material. You're not writing it.`,
      ``,
      demoteHeadings(input.formatGuide, 2),
      ``,
    );
  }
  return lines.join("\n");
}
