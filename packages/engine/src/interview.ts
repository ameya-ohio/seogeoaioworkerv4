import type { ArticleInterview, InterviewCaptured, InterviewMessage } from "./types.js";

/**
 * D59 Expert Interview — the pure pieces both frontends share. The worker
 * opens the interview and refines the outline from it; the web app runs the
 * chat turns. Both build the interviewer's context here, so the questions a
 * run opens with and the follow-ups the chat asks see the same material.
 */

export const CAPTURED_KEYS = ["angle", "thesis", "objection", "anchor", "product", "facts", "quote", "attribution"] as const;

/** The checklist the UI shows; attribution rides along with the quote. */
export const CAPTURE_CHECKLIST: { key: keyof InterviewCaptured; label: string }[] = [
  { key: "angle", label: "Angle" },
  { key: "thesis", label: "Thesis" },
  { key: "objection", label: "Objection & answer" },
  { key: "anchor", label: "Real-world anchor" },
  { key: "product", label: "Product connection" },
  { key: "facts", label: "Facts to verify" },
  { key: "quote", label: "Quote (optional)" },
];

/** Sections pov.md must carry (agents/pov-writer.md). */
export const POV_SECTIONS = [
  "Thesis",
  "Argument Spine",
  "Objection & Answer",
  "Real-World Anchor",
  "Company Role",
  "Approved Quotes",
  "Rejected",
  // D61: third-party facts the expert raised, for the evidence stage ("none" when there are none).
  "Facts to Verify",
] as const;

const CAPTURED_RE = /<captured>\s*([\s\S]*?)\s*<\/captured>/i;

/**
 * Split an interviewer turn into what the expert sees and the captured
 * state it reports. The block is stripped even when its JSON doesn't
 * parse, so a malformed report never shows up in the chat.
 */
export function parseCaptured(text: string): { text: string; captured?: InterviewCaptured } {
  const m = CAPTURED_RE.exec(text);
  if (!m) return { text: text.trim() };
  const visible = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).trim();
  let raw: unknown;
  try {
    raw = JSON.parse((m[1] ?? "").replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    return { text: visible };
  }
  if (!raw || typeof raw !== "object") return { text: visible };
  const captured: InterviewCaptured = {};
  for (const key of CAPTURED_KEYS) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "string" && v.trim()) captured[key] = v.trim();
  }
  return { text: visible, captured };
}

/** Everything before a `<captured>` block has started — what a streaming UI shows. */
export function visibleSoFar(text: string): string {
  const at = text.search(/<captured/i);
  if (at !== -1) return text.slice(0, at);
  // Hold back a trailing partial tag ("<", "<capt") until it resolves.
  const partial = /<[a-z]*$/i.exec(text);
  return partial && "<captured".startsWith(partial[0].toLowerCase()) ? text.slice(0, partial.index) : text;
}

export function mergeCaptured(prev: InterviewCaptured, next: InterviewCaptured | undefined): InterviewCaptured {
  return next ? { ...prev, ...next } : prev;
}

/**
 * The Messages API wants a user turn first and strict alternation. The
 * transcript opens with the interviewer, and a failed reply can leave two
 * expert messages in a row, so: a fixed kickoff turn, then consecutive
 * same-role messages merged.
 */
export function toChatMessages(messages: InterviewMessage[]): { role: "user" | "assistant"; content: string }[] {
  const out: { role: "user" | "assistant"; content: string }[] = [
    { role: "user", content: "Start the interview." },
  ];
  for (const m of messages) {
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content = `${last.content}\n\n${m.content}`;
    else out.push({ role: m.role, content: m.content });
  }
  return out;
}

/** `## Heading` body, matching a heading that starts with `title` ("Content Gaps" → "Content Gaps (Opportunities)"). */
export function markdownSection(md: string, title: string): string {
  const esc = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`^##\\s+${esc}[^\\n]*$`, "im").exec(md);
  if (!m) return "";
  const rest = md.slice(m.index + m[0].length);
  const next = /^##\s+\S/m.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

/** proof-points.md reduced to its table header and the rows marked `Citable: yes`. */
export function citableProofPoints(md: string): string {
  const lines = md.split("\n");
  const header = lines.findIndex((l) => /^\|.*\bCitable\b.*\|\s*$/i.test(l));
  if (header === -1) return "";
  const rows = lines.slice(header + 2).filter((l) => /^\|/.test(l) && /\|\s*yes\s*\|\s*$/i.test(l));
  if (!rows.length) return "";
  return [lines[header], lines[header + 1], ...rows].join("\n");
}

/** Case studies an agent may see: never one marked `Permission: internal only`. */
export function isUsableCaseStudy(path: string, content: string): boolean {
  const name = path.split("/").pop() ?? "";
  if (name === "README.md" || name.startsWith("_") || !content.trim()) return false;
  return !/^\s*-?\s*Permission:\s*internal only/im.test(content);
}

export interface InterviewContextInput {
  companyName: string;
  /** company.yaml company.description — what the product does. */
  companyDescription?: string;
  topic: string;
  keyword?: string;
  researchNotes: string;
  /**
   * Only for interviews opened before D61, when the interview came after
   * the outline. New interviews are built from research alone.
   */
  outline?: string;
  /** page.md: the page's facets, format guide and funnel CTA (D45–D50). */
  pageMd?: string;
  /** The brief's company position, when the page came from a plan or cluster. */
  companyPosition?: string;
  /** context/brand/positioning.md, context/sales/value-props.md, … as {path, content}. */
  context: { path: string; content: string }[];
  caseStudies: { path: string; content: string }[];
  /** Raw proof-points.md; only Citable: yes rows reach the prompt. */
  proofPoints?: string;
  /** context/sales/competitive-landscape.md. */
  competitive?: string;
  /** The interview plan, once the opening call wrote one. */
  plan?: string;
  /** What an earlier interview on this article captured (a re-run re-interviews). */
  previous?: InterviewCaptured;
}

const block = (path: string, content: string) => `<input path="${path}">\n${content.trim()}\n</input>`;

/**
 * The interviewer's working material (D61: the interview runs right after
 * research). Research contributes the Researcher's Candidate Positions (the
 * A/B/C the expert reacts to), the subject material and the wedge; page.md
 * contributes the facets and CTA. Case studies and citable proof points are
 * what the anchor and product beats offer.
 */
export function buildInterviewContext(input: InterviewContextInput): string {
  const words = (t: string, n: number) => {
    const w = t.split(/\s+/);
    return w.length > n ? `${w.slice(0, n).join(" ")} …` : t;
  };
  const research = [
    ["Topic Summary", 0],
    ["Candidate Positions", 0],
    ["Subject Material", 400],
    ["Content Gaps", 0],
    ["Debates", 0],
  ] as const;
  const researchText = research
    .map(([t, cap]) => {
      const body = markdownSection(input.researchNotes, t);
      return body ? `## ${t}\n${cap ? words(body, cap) : body}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
  const outline = [
    "Angle",
    "Thesis",
    "Page Facets",
    "Intro Strategy",
    "Real-World Anchor",
    "External Citations to Use",
    "Closing / CTA",
  ]
    .map((t) => {
      const body = markdownSection(input.outline ?? "", t);
      return body ? `## ${t}\n${body}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
  const title = /^#\s+Strategy & Outline:\s*(.+)$/m.exec(input.outline ?? "")?.[1]?.trim();
  // page.md's facets and page rules (CTA included), without the long format guide.
  const facets = input.pageMd ? (input.pageMd.split(/^## Format guide/m)[0] ?? "").replace(/^# Page spec\s*/, "").trim() : "";
  const proof = input.proofPoints ? citableProofPoints(input.proofPoints) : "";
  const studies = input.caseStudies.filter((f) => isUsableCaseStudy(f.path, f.content));
  return [
    `# Interview context`,
    ``,
    `Company: ${input.companyName}${input.companyDescription ? ` — ${input.companyDescription}` : ""}`,
    `Article: ${title ?? input.topic}`,
    `Topic: ${input.topic}`,
    `Primary keyword: ${input.keyword ?? "(not chosen yet — the Strategist picks it)"}`,
    ...(facets ? [``, `## The page (from page.md)`, ``, facets] : []),
    ...(input.companyPosition ? [``, `## The company's position on this topic (from the brief)`, ``, input.companyPosition.trim()] : []),
    ``,
    `## From the research notes`,
    ``,
    researchText || "_research notes have none of the sections the interview uses_",
    ...(outline
      ? [``, `## From the Strategist's outline (this interview was opened after an outline, before D61)`, ``, outline]
      : []),
    ``,
    `## Case studies (real engagements the anchor beat can offer)`,
    ``,
    studies.length ? studies.map((f) => block(f.path, f.content)).join("\n\n") : "_none_",
    ``,
    `## Citable proof points (the only company numbers an article may print)`,
    ``,
    proof || "_none marked Citable: yes — offer no company numbers_",
    ``,
    `## Company context`,
    ``,
    input.context.length ? input.context.map((f) => block(f.path, f.content)).join("\n\n") : "_none_",
    ...(input.competitive
      ? [``, `## Competitive landscape (head-to-head vendors are never sources)`, ``, input.competitive.trim()]
      : []),
    ...(input.previous && Object.keys(input.previous).length
      ? [
          ``,
          `## An earlier interview on this article captured`,
          ``,
          `The article is being re-planned. Confirm or update these rather than starting cold.`,
          ``,
          ...CAPTURE_CHECKLIST.filter((i) => input.previous?.[i.key]).map((i) => `- ${i.label}: ${input.previous?.[i.key]}`),
        ]
      : []),
    ...(input.plan ? [``, `## Your interview plan`, ``, input.plan.trim()] : []),
    ``,
  ].join("\n");
}

/** interview.md: the transcript the POV writer, evidence stage, Editor, HDCP and reviewer read — the fact boundary for expert claims. */
export function renderTranscript(interview: ArticleInterview): string {
  const c = interview.captured;
  return [
    `# Expert interview`,
    ``,
    `Status: ${interview.status}${interview.completedAt ? ` (${interview.completedAt.toISOString().slice(0, 10)})` : ""}`,
    ``,
    `## Captured`,
    ``,
    ...CAPTURE_CHECKLIST.map((i) => `- ${i.label}: ${c[i.key] ?? "_not captured_"}`),
    `- Attribution: ${c.attribution ?? "_none — quotes stay unattributed_"}`,
    ``,
    `## Transcript`,
    ``,
    ...interview.messages.map((m) => `### ${m.role === "assistant" ? "Interviewer" : "Expert"}\n\n${m.content.trim()}\n`),
  ].join("\n");
}

/** Gate check for pov.md: every required section present and non-empty. */
export function povProblems(pov: string | undefined): string[] {
  if (!pov || pov.trim().split(/\s+/).length < 40) return ["pov.md missing or still a stub"];
  const problems: string[] = [];
  for (const s of POV_SECTIONS) {
    if (!markdownSection(pov, s)) problems.push(`pov.md is missing ## ${s} (or it is empty)`);
  }
  const spine = markdownSection(pov, "Argument Spine");
  const claims = (spine.match(/^\s*\d+[.)]\s+\S/gm) ?? []).length;
  if (spine && (claims < 3 || claims > 5)) {
    problems.push(`pov.md Argument Spine has ${claims} numbered claim(s); need 3-5`);
  }
  return problems;
}
