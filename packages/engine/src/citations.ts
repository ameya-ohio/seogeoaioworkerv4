/**
 * Citation integrity (roadmap 4Q.3, decision D34). The researcher's notes
 * carry numbered Authoritative Sources with per-source key claims and
 * supporting quotes; statistics and quotes reference sources by number.
 * This module parses that structure and defines the verification report
 * shape the worker fills by fetching each URL and checking every attributed
 * claim actually appears there. Gates consume the report: unverified claims
 * are hard failures, and fewer than 3 verified sources re-runs research.
 */

export interface CitationSource {
  n: number;
  title: string;
  url: string;
  /** "Key claim:" line, when present. */
  claim?: string;
  /** "Supporting quote:" line, when present. */
  quote?: string;
}

export interface AttributedClaim {
  text: string;
  sourceN: number;
  kind: "key_claim" | "statistic" | "quote";
}

export type CitationVerdict = "supported" | "unsupported" | "unreachable";

export interface CitationCheckResult {
  sourceN: number;
  url: string;
  claim: string;
  kind: AttributedClaim["kind"];
  verdict: CitationVerdict;
  /** Verbatim passage from the fetched page that supports the claim. */
  quote?: string;
  note?: string;
}

export interface CitationReport {
  ranAt: Date;
  results: CitationCheckResult[];
  /** Sources that were fetched successfully and had no unsupported claims. */
  verifiedSourceCount: number;
  verifiedUrls: string[];
  unsupportedCount: number;
  unreachableCount: number;
  /** Claims auto-pruned from the notes instead of re-running research (D37). */
  pruned?: CitationCheckResult[];
}

export interface ParsedCitations {
  sources: CitationSource[];
  claims: AttributedClaim[];
  problems: string[];
}

const URL_RE = /https?:\/\/[^\s<>()\][]+/;

/**
 * The researcher's "do not invent" rule tells it to WRITE absence markers
 * ("no reliable stat found for X") instead of fabricating. Those are honesty
 * declarations, not attributed claims — verifying one against a page is a
 * guaranteed false failure (observed live, Session 15).
 */
export function isAbsenceMarker(text: string): boolean {
  return (
    /^\W*no reliable (stat|statistic|data|figure|number|source)/i.test(text) ||
    /^\W*(none|nothing|not?) (reliable |verifiable )?(found|available|located)/i.test(text) ||
    /^\W*could not (find|verify|locate)/i.test(text)
  );
}

const SOURCE_FIELD_RE = /^(Key claim|Supporting quote)\s*:/i;

/**
 * Researchers sometimes hard-wrap long lines: a source entry's URL or the end
 * of its Key claim lands on the next line, and so does a banked statistic's
 * "— Source #N (supports: P1)". Every reader of these sections works line by
 * line, so a wrapped URL made the source unverifiable, a wrapped claim was
 * judged by its first half, and a wrapped statistic wasn't seen at all
 * (observed live, Oct 2026: 13 of 15 sources skipped). Join each continuation
 * line onto the line it continues. Idempotent.
 */
export function unwrapResearchNotes(notes: string): string {
  let out = notes;
  out = unwrapSection(out, "Authoritative Sources", (t) => /^\d+[.)]\s+/.test(t), (t) => SOURCE_FIELD_RE.test(t));
  for (const title of ["Statistics & Data Points", "Quotes Worth Including"]) {
    out = unwrapSection(out, title, (t) => /^[-*]\s+/.test(t), () => false);
  }
  return out;
}

/**
 * Within one `## title` section, a non-blank line that follows an item (or one
 * of its fields) is that item's continuation, unless it starts an item or a
 * field of its own. A blank line ends the item.
 */
function unwrapSection(
  notes: string,
  title: string,
  startsItem: (t: string) => boolean,
  isField: (t: string) => boolean,
): string {
  const head = new RegExp(`^##\\s+${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "im").exec(notes);
  if (!head) return notes;
  const start = head.index + head[0].length;
  const rest = notes.slice(start);
  const next = /^##\s+\S/m.exec(rest);
  const body = next ? rest.slice(0, next.index) : rest;
  const out: string[] = [];
  let inItem = false;
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (!t) {
      inItem = false;
      out.push(line);
    } else if (startsItem(t)) {
      inItem = true;
      out.push(line);
    } else if (isField(t)) {
      out.push(line);
    } else if (inItem && !/^[-*]\s/.test(t) && out.length) {
      out[out.length - 1] = `${(out[out.length - 1] ?? "").replace(/\s+$/, "")} ${t}`;
    } else {
      out.push(line);
    }
  }
  const joined = out.join("\n");
  return joined === body ? notes : notes.slice(0, start) + joined + (next ? rest.slice(next.index) : "");
}

/** Parse numbered sources + attributed claims out of research-notes.md. */
export function parseResearchCitations(rawNotes: string): ParsedCitations {
  const notes = unwrapResearchNotes(rawNotes);
  const problems: string[] = [];
  const sources: CitationSource[] = [];
  const claims: AttributedClaim[] = [];

  const sourcesBody = sectionBody(notes, "Authoritative Sources");
  if (!sourcesBody.trim()) {
    return { sources, claims, problems: ["no ## Authoritative Sources section found"] };
  }
  // Entries look like: `1. **Title** — meta. URL` with optional
  // `Key claim:` / `Supporting quote:` continuation lines.
  const entryRe = /^(\d+)[.)]\s+(.*)$/;
  let current: CitationSource | null = null;
  for (const rawLine of sourcesBody.split("\n")) {
    const line = rawLine.trim();
    const entry = entryRe.exec(line);
    if (entry) {
      const n = Number(entry[1]);
      const rest = entry[2] ?? "";
      const url = URL_RE.exec(rest)?.[0]?.replace(/[),.;]+$/, "");
      const title = rest
        .replace(/https?:\/\/\S+/g, "")
        .replace(/\*\*/g, "")
        .replace(/\s+—.*$/, "")
        .trim();
      current = { n, title: title || `source ${n}`, url: url ?? "" };
      sources.push(current);
      if (!url) problems.push(`Authoritative Source #${n} has no URL`);
      continue;
    }
    if (!current) continue;
    const claimMatch = /^Key claim:\s*(.+)$/i.exec(line);
    if (claimMatch?.[1]) {
      const text = claimMatch[1].trim();
      if (!isAbsenceMarker(text)) {
        current.claim = text;
        claims.push({ text, sourceN: current.n, kind: "key_claim" });
      }
      continue;
    }
    const quoteMatch = /^Supporting quote:\s*["“]?(.+?)["”]?\s*$/i.exec(line);
    if (quoteMatch?.[1]) current.quote = quoteMatch[1].trim();
  }

  const byN = new Map(sources.map((s) => [s.n, s]));
  const refRe = /source(?:\s+citation)?\s*#?\s*(\d+)/i;

  for (const line of sectionBody(notes, "Statistics & Data Points").split("\n")) {
    const bullet = /^\s*-\s+(.+)$/.exec(line);
    if (!bullet?.[1]) continue;
    const ref = refRe.exec(bullet[1]);
    if (!ref) continue;
    const n = Number(ref[1]);
    const text = bullet[1].replace(/\s*[—-]\s*\[?source[^\]]*\]?\s*$/i, "").trim();
    if (isAbsenceMarker(text)) continue;
    if (!byN.has(n)) {
      problems.push(`Statistic references source #${n}, which does not exist`);
      continue;
    }
    claims.push({ text, sourceN: n, kind: "statistic" });
  }

  for (const line of sectionBody(notes, "Quotes Worth Including").split("\n")) {
    const bullet = /^\s*-\s+["“](.+?)["”]\s*[—-]\s*(.+)$/.exec(line);
    if (!bullet?.[1] || !bullet[2]) continue;
    const ref = refRe.exec(bullet[2]);
    if (!ref) continue;
    const n = Number(ref[1]);
    if (!byN.has(n)) {
      problems.push(`Quote references source #${n}, which does not exist`);
      continue;
    }
    claims.push({ text: bullet[1], sourceN: n, kind: "quote" });
  }

  return { sources, claims, problems };
}

/** Build the report from per-claim verdicts (the worker supplies verdicts). */
export function buildCitationReport(
  sources: CitationSource[],
  results: CitationCheckResult[],
): CitationReport {
  const badUrls = new Set(
    results.filter((r) => r.verdict !== "supported").map((r) => r.url),
  );
  const checkedUrls = new Set(results.map((r) => r.url));
  const verifiedUrls = [
    ...new Set(
      sources
        .filter((s) => s.url && !badUrls.has(s.url))
        // A source with no checked claim only counts if it was reachable —
        // the worker records reachability as a claim-less "supported" result.
        .filter((s) => checkedUrls.has(s.url))
        .map((s) => s.url),
    ),
  ];
  return {
    ranAt: new Date(),
    results,
    verifiedSourceCount: verifiedUrls.length,
    verifiedUrls,
    unsupportedCount: results.filter((r) => r.verdict === "unsupported").length,
    unreachableCount: results.filter((r) => r.verdict === "unreachable").length,
  };
}

/** Minimum verified sources before research must re-run (Ameya, Session 14). */
export const MIN_VERIFIED_SOURCES = 3;

/** Claim budget (Ameya, Session 15): 3–5 load-bearing claims; 8 is the hard gate ceiling. */
export const MAX_ATTRIBUTED_CLAIMS = 8;

export interface PruneResult {
  notes: string;
  removed: CitationCheckResult[];
  report: CitationReport;
}

export interface TrimResult {
  notes: string;
  /** Claims stripped of attribution to fit the budget (kept as prose loss, not error). */
  trimmed: AttributedClaim[];
}

/**
 * Auto-trim (D37): enforce the claim budget mechanically BEFORE verification.
 * The in-phase feedback loop converged too slowly live (13 → 11 → run
 * nearly dead), and over-budget notes also waste verification spend. Keeps
 * claims in document order (the researcher leads with what matters) and
 * strips attribution source-by-source from the end — the source's Key
 * claim/Supporting quote lines and its dependent stat/quote bullets — until
 * the count fits. The gate's budget check remains as a backstop.
 *
 * Key claims go first, from the end, and banked statistics and quotes only
 * after: the figures are what a Candidate Position turns on, while a Key claim
 * on a documentation source grounds a mechanism. Dropping by source alone
 * emptied Statistics & Data Points on a run whose figures came from its
 * later-numbered sources, and the gate then failed the research (Oct 2026).
 */
export function trimExcessClaims(rawNotes: string, maxClaims = MAX_ATTRIBUTED_CLAIMS): TrimResult {
  const notes = unwrapResearchNotes(rawNotes);
  const parsed = parseResearchCitations(notes);
  if (parsed.claims.length <= maxClaims) return { notes, trimmed: [] };

  const isKey = (c: AttributedClaim) => c.kind === "key_claim";
  const orderOf = (claims: AttributedClaim[]) => [...new Set(claims.map((c) => c.sourceN))];
  let remaining = parsed.claims.length;
  // Pass 1: Key claims, by source, from the end.
  const dropKeyClaim = new Set<number>();
  const keyOrder = orderOf(parsed.claims.filter(isKey));
  for (let i = keyOrder.length - 1; i >= 0 && remaining > maxClaims; i--) {
    const n = keyOrder[i] as number;
    dropKeyClaim.add(n);
    remaining -= parsed.claims.filter((c) => isKey(c) && c.sourceN === n).length;
  }
  // Pass 2: banked statistics and quotes, by source, from the end.
  const dropBullets = new Set<number>();
  const bulletOrder = orderOf(parsed.claims.filter((c) => !isKey(c)));
  for (let i = bulletOrder.length - 1; i >= 0 && remaining > maxClaims; i--) {
    const n = bulletOrder[i] as number;
    dropBullets.add(n);
    remaining -= parsed.claims.filter((c) => !isKey(c) && c.sourceN === n).length;
  }

  const trimmed = parsed.claims.filter((c) => (isKey(c) ? dropKeyClaim : dropBullets).has(c.sourceN));
  const lines = notes.split("\n");
  const out: string[] = [];
  let section = "";
  let currentSourceN: number | null = null;
  let dropQuoteLine = false;
  const refRe = /source(?:\s+citation)?\s*#?\s*(\d+)/i;

  for (const line of lines) {
    const header = /^##\s+(.+?)\s*$/.exec(line);
    if (header?.[1]) {
      section = header[1];
      currentSourceN = null;
      out.push(line);
      continue;
    }
    if (section === "Authoritative Sources") {
      const entry = /^\s*(\d+)[.)]\s+/.exec(line);
      if (entry) {
        currentSourceN = Number(entry[1]);
        dropQuoteLine = false;
        out.push(line);
        continue;
      }
      if (currentSourceN !== null && dropKeyClaim.has(currentSourceN)) {
        if (/^\s*Key claim:/i.test(line)) {
          dropQuoteLine = true;
          continue; // demote to background source: attribution lines removed
        }
        if (dropQuoteLine && /^\s*Supporting quote:/i.test(line)) {
          dropQuoteLine = false;
          continue;
        }
      }
      out.push(line);
      continue;
    }
    if (section === "Statistics & Data Points" || section === "Quotes Worth Including") {
      const bullet = /^\s*-\s+(.+)$/.exec(line);
      const ref = bullet?.[1] ? refRe.exec(bullet[1]) : null;
      if (ref && dropBullets.has(Number(ref[1]))) continue;
    }
    out.push(line);
  }
  return { notes: out.join("\n"), trimmed };
}

const normalizeLine = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Auto-prune (D37): D34 says an unverified claim is "cut or replaced" — this
 * performs the cut deterministically instead of re-running the whole research
 * phase. Only called when >= MIN_VERIFIED_SOURCES sources survived: failing
 * stat/quote bullets are deleted, failing key-claim lines are replaced with a
 * do-not-cite marker, unreachable sources are annotated (never renumbered,
 * so other references stay valid). The returned report carries the removals
 * in `pruned` so nothing disappears silently.
 */
export function pruneUnverifiedCitations(rawNotes: string, report: CitationReport): PruneResult {
  const notes = unwrapResearchNotes(rawNotes);
  const failed = report.results.filter((r) => r.verdict !== "supported");
  if (failed.length === 0) {
    return { notes, removed: [], report };
  }
  const failedClaimKeys = new Set(
    failed.filter((r) => r.claim !== "(reachability)").map((r) => normalizeLine(r.claim).slice(0, 60)),
  );
  const failedKeyClaimSources = new Set(
    failed.filter((r) => r.kind === "key_claim" && r.claim !== "(reachability)").map((r) => r.sourceN),
  );
  const unreachableSources = new Set(
    failed.filter((r) => r.verdict === "unreachable").map((r) => r.sourceN),
  );

  const lines = notes.split("\n");
  const out: string[] = [];
  let section = "";
  let currentSourceN: number | null = null;
  let dropNextSupportingQuote = false;

  for (const line of lines) {
    const header = /^##\s+(.+?)\s*$/.exec(line);
    if (header?.[1]) {
      section = header[1];
      currentSourceN = null;
      out.push(line);
      continue;
    }

    if (section === "Authoritative Sources") {
      const entry = /^\s*(\d+)[.)]\s+/.exec(line);
      if (entry) {
        currentSourceN = Number(entry[1]);
        dropNextSupportingQuote = false;
        if (unreachableSources.has(currentSourceN) && !line.includes("[UNREACHABLE")) {
          out.push(`${line.trimEnd()} **[UNREACHABLE — do not cite]**`);
        } else {
          out.push(line);
        }
        continue;
      }
      if (currentSourceN !== null && failedKeyClaimSources.has(currentSourceN)) {
        if (/^\s*Key claim:/i.test(line)) {
          const indent = /^\s*/.exec(line)?.[0] ?? "";
          out.push(`${indent}Key claim: (removed — failed live verification; do not cite this source for it)`);
          dropNextSupportingQuote = true;
          continue;
        }
        if (dropNextSupportingQuote && /^\s*Supporting quote:/i.test(line)) {
          dropNextSupportingQuote = false;
          continue;
        }
      }
      out.push(line);
      continue;
    }

    if (section === "Statistics & Data Points" || section === "Quotes Worth Including") {
      const bullet = /^\s*-\s+(.+)$/.exec(line);
      if (bullet?.[1]) {
        const key = normalizeLine(bullet[1]).slice(0, 60);
        const matchesFailed = [...failedClaimKeys].some(
          (f) => key.startsWith(f.slice(0, 40)) || f.startsWith(key.slice(0, 40)),
        );
        if (matchesFailed) continue; // the cut
      }
    }
    out.push(line);
  }

  const cleanReport: CitationReport = {
    ranAt: new Date(),
    results: report.results.filter((r) => r.verdict === "supported"),
    verifiedSourceCount: report.verifiedSourceCount,
    verifiedUrls: report.verifiedUrls,
    unsupportedCount: 0,
    unreachableCount: 0,
    pruned: [...(report.pruned ?? []), ...failed],
  };
  return { notes: out.join("\n"), removed: failed, report: cleanReport };
}

/** External URLs cited in the article body (markdown links + bare URLs). */
export function extractExternalUrls(body: string, internalHosts: string[]): string[] {
  const urls = new Set<string>();
  for (const m of body.matchAll(/https?:\/\/[^\s<>()\]["']+/g)) {
    const url = m[0].replace(/[),.;]+$/, "");
    try {
      const host = new URL(url).hostname.replace(/^www\./, "");
      if (internalHosts.some((h) => host === h || host.endsWith(`.${h}`))) continue;
      urls.add(url);
    } catch {
      /* not a real URL */
    }
  }
  return [...urls];
}

/** Internal-domain links in the article body (roadmap 4Q.4, D35). */
export function extractInternalLinks(body: string, internalHosts: string[]): string[] {
  const urls = new Set<string>();
  for (const m of body.matchAll(/https?:\/\/[^\s<>()\]["']+/g)) {
    const url = m[0].replace(/[),.;]+$/, "");
    try {
      const host = new URL(url).hostname.replace(/^www\./, "");
      if (internalHosts.some((h) => host === h || host.endsWith(`.${h}`))) urls.add(url);
    } catch {
      /* not a real URL */
    }
  }
  return [...urls];
}

/**
 * ok        — resolves to a live page
 * deferred  — a same-plan page's reserved /learn/ path, not live yet: a real
 *             link in the draft, rendered as text in the export until it is (D53)
 * missing   — resolves to nothing (D35) — FAIL
 * anchor_conflict — this anchor text already points at a different page on
 *             the site (D53) — FAIL
 */
export type LinkStatus = "ok" | "deferred" | "missing" | "anchor_conflict";

export interface LinkCheckResult {
  url: string;
  status: LinkStatus;
  note?: string;
  anchor?: string;
}

export interface LinkReport {
  ranAt: Date;
  results: LinkCheckResult[];
  missingCount: number;
  deferredCount?: number;
}

/** Statuses that fail the edit gate. */
export const FAILING_LINK_STATUSES: readonly LinkStatus[] = ["missing", "anchor_conflict"];

export function buildLinkReport(results: LinkCheckResult[]): LinkReport {
  return {
    ranAt: new Date(),
    results,
    missingCount: results.filter((r) => FAILING_LINK_STATUSES.includes(r.status)).length,
    deferredCount: results.filter((r) => r.status === "deferred").length,
  };
}

function sectionBody(text: string, title: string): string {
  const esc = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^##\\s+${esc}\\s*$`, "im");
  const m = re.exec(text);
  if (!m) return "";
  const rest = text.slice(m.index + m[0].length);
  const next = /^##\s+\S/m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}
