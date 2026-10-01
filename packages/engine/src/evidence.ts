import { markdownSection } from "./interview.js";

/**
 * D61 Evidence stage. The expert raises third-party facts in the interview
 * (an incident, a CVE, a report, a vendor's documented behavior). pov.md
 * lists them under `## Facts to Verify`; the evidence agent checks each one
 * on the web and appends `## Interview Evidence` to the research notes. The
 * verified ones then pass the same live citation check research does
 * (D34), so the Writer can cite them and the Edit gate accepts their URLs.
 */

export interface FactToVerify {
  id: string;
  text: string;
}

export type EvidenceVerdict = "verified" | "corrected" | "unsourced";

export interface EvidenceEntry {
  id: string;
  fact: string;
  verdict?: EvidenceVerdict;
  /** Source number (101+), title and URL, for verified and corrected facts. */
  sourceN?: number;
  title?: string;
  url?: string;
  keyClaim?: string;
  quote?: string;
  /** How the article may use it: as stated, as corrected, expert opinion only, or cut. */
  use?: string;
}

/** Evidence sources are numbered from here, so they never collide with research's Source #N. */
export const EVIDENCE_SOURCE_BASE = 101;

/** `- F1: <fact> — check: … — said: …` lines under pov.md's `## Facts to Verify`; empty for "none". */
export function factsToVerify(pov: string | undefined): FactToVerify[] {
  const out: FactToVerify[] = [];
  for (const line of markdownSection(pov ?? "", "Facts to Verify").split("\n")) {
    const m = /^\s*[-*\d.)]*\s*\**(F\d+)\**\s*[:.—-]\s*(.+)$/i.exec(line);
    if (m?.[1] && m[2]) out.push({ id: m[1].toUpperCase(), text: m[2].trim() });
  }
  return out;
}

const URL_RE = /https?:\/\/[^\s)>\]]+/;

/** The `### F<n>: …` entries of research-notes.md → `## Interview Evidence`. */
export function parseInterviewEvidence(notes: string): EvidenceEntry[] {
  const section = markdownSection(notes, "Interview Evidence");
  const entries: EvidenceEntry[] = [];
  const heads = [...section.matchAll(/^###\s+(F\d+)\s*[:.—-]\s*(.+)$/gim)];
  heads.forEach((h, i) => {
    const start = (h.index ?? 0) + h[0].length;
    const body = section.slice(start, heads[i + 1]?.index ?? section.length);
    const field = (key: string) => new RegExp(`^\\s*-\\s*${key}\\s*:\\s*(.+)$`, "im").exec(body)?.[1]?.trim();
    const entry: EvidenceEntry = { id: (h[1] ?? "").toUpperCase(), fact: (h[2] ?? "").trim() };
    const verdict = field("Verdict")?.toLowerCase().match(/^(verified|corrected|unsourced)/)?.[1];
    if (verdict) entry.verdict = verdict as EvidenceVerdict;
    const source = /^\s*-\s*Source\s*#?\s*(\d+)\s*:\s*(.+)$/im.exec(body);
    if (source?.[1] && source[2]) {
      entry.sourceN = Number(source[1]);
      const url = URL_RE.exec(source[2])?.[0]?.replace(/[),.;]+$/, "");
      if (url) entry.url = url;
      entry.title = source[2].replace(/https?:\/\/\S+/g, "").replace(/\*\*/g, "").replace(/\s+—.*$/, "").trim();
    }
    const keyClaim = field("Key claim");
    if (keyClaim) entry.keyClaim = keyClaim;
    const quote = field("Supporting quote")?.replace(/^["“]|["”]$/g, "");
    if (quote) entry.quote = quote;
    const use = field("Use");
    if (use) entry.use = use;
    entries.push(entry);
  });
  return entries;
}

/**
 * The verified and corrected entries as an `## Authoritative Sources`
 * block, so the research-stage citation verifier checks them unchanged.
 */
export function evidenceAsSources(entries: EvidenceEntry[]): string {
  const lines = ["## Authoritative Sources", ""];
  for (const e of entries) {
    if (e.verdict === "unsourced" || !e.url || e.sourceN === undefined) continue;
    lines.push(`${e.sourceN}. **${e.title || e.fact}** — interview evidence ${e.id}. ${e.url}`);
    if (e.keyClaim) lines.push(`   Key claim: ${e.keyClaim}`);
    if (e.quote) lines.push(`   Supporting quote: "${e.quote}"`);
  }
  return lines.join("\n") + "\n";
}

/** Structural problems with the Interview Evidence section, against pov.md's list. */
export function evidenceProblems(pov: string | undefined, notes: string): string[] {
  const listed = factsToVerify(pov);
  const hasSection = Boolean(markdownSection(notes, "Interview Evidence"));
  if (!listed.length && !hasSection) return [];
  if (!hasSection) {
    return ["research-notes.md has no `## Interview Evidence` section — add one `### F<n>:` entry per fact in pov.md"];
  }
  const parsed = parseInterviewEvidence(notes);
  const entries = new Map(parsed.map((e) => [e.id, e]));
  // A pov.md from before D61 lists no facts: check every entry the agent wrote.
  const facts = listed.length ? listed : parsed.map((e) => ({ id: e.id, text: e.fact }));
  const problems: string[] = [];
  for (const f of facts) {
    const e = entries.get(f.id);
    if (!e) {
      problems.push(`Interview Evidence has no entry for ${f.id} ("${f.text.slice(0, 80)}")`);
      continue;
    }
    if (!e.verdict) {
      problems.push(`${f.id}: no "- Verdict: verified | corrected | unsourced" line`);
      continue;
    }
    if (e.verdict !== "unsourced") {
      if (!e.url || e.sourceN === undefined) problems.push(`${f.id}: a ${e.verdict} fact needs "- Source ${EVIDENCE_SOURCE_BASE}+: Title — URL"`);
      else if (e.sourceN < EVIDENCE_SOURCE_BASE) problems.push(`${f.id}: number evidence sources from ${EVIDENCE_SOURCE_BASE} (got ${e.sourceN})`);
      if (!e.keyClaim) problems.push(`${f.id}: a ${e.verdict} fact needs "- Key claim:" — what the source actually says`);
    }
    if (!e.use) problems.push(`${f.id}: no "- Use:" line — as stated, as corrected, expert opinion only, or cut`);
  }
  return problems;
}
