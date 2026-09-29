import type { NormalizedPlanRow } from "./normalize.js";

/**
 * Site paths for a content plan (D46).
 *
 *   /learn/<pillar>/                      pillar page
 *   /learn/<pillar>/<hub>/                subtopic hub
 *   /learn/<pillar>/<hub>/<page>/         cluster article
 *
 * Two rules keep the URLs short and non-repetitive:
 *
 * - **Hub merge.** A hub whose subtopic IS the pillar's topic ("What is
 *   Identity Exposure Management" under the Identity Exposure Management
 *   pillar) duplicates the pillar page. It is dropped at import, the pillar
 *   answers its query, and its articles sit directly under the pillar.
 * - **Parent-term stripping.** A child slug drops its parent's head term:
 *   "Identity Exposure vs Identity Risk" under the identity-exposure hub is
 *   `vs-identity-risk`, and "How Identity Exposure Management Works" under
 *   the IEM pillar is `how-it-works` (after how/why/what/… a term in the
 *   middle of the title becomes "it"; otherwise it is simply dropped, so
 *   "Best Identity Exposure Management Tools" is `best-tools`).
 *
 * Paths are computed at import, shown in the plan UI, and editable there
 * until an article exists for the item.
 */

export const DEFAULT_PATH_PREFIX = "/learn/";
const MAX_SEGMENT = 60;

/** A URL segment: lowercase, hyphenated, apostrophes dropped ("Buyer's" → "buyers"). */
export function pathSegment(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

function capSegment(seg: string): string {
  if (seg.length <= MAX_SEGMENT) return seg;
  return seg.slice(0, MAX_SEGMENT).replace(/-[^-]*$/, "").replace(/-+$/, "");
}

/**
 * The child's own segment: the title before any colon, leading "the"
 * dropped, with the parent's head term removed.
 */
export function childSegment(title: string, parentTerm: string): string {
  const base = pathSegment(title.split(":")[0] ?? title).replace(/^the-/, "");
  const term = pathSegment(parentTerm);
  if (!term || !base.includes(term)) return capSegment(base);
  const tokens = base.split("-");
  const termTokens = term.split("-");
  let at = -1;
  for (let i = 0; i + termTokens.length <= tokens.length; i++) {
    if (termTokens.every((t, k) => tokens[i + k] === t)) {
      at = i;
      break;
    }
  }
  if (at === -1) return capSegment(base);
  const before = tokens.slice(0, at);
  const after = tokens.slice(at + termTokens.length);
  // "How <term> works" → "how-it-works"; "Best <term> Tools" → "best-tools".
  const pronounAfter = new Set(["how", "why", "when", "where", "what", "does", "do", "is", "causes", "makes", "secures"]);
  const useIt = before.length > 0 && after.length > 0 && pronounAfter.has(before[before.length - 1] ?? "");
  const joined = useIt ? [...before, "it", ...after] : [...before, ...after];
  const seg = joined.join("-").replace(/^the-/, "");
  return capSegment(seg || base);
}

function sameTopic(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b) && pathSegment(a ?? "") === pathSegment(b ?? "");
}

/** Hubs that duplicate their pillar's topic — merged into the pillar (D46). */
export function mergedHubs(rows: NormalizedPlanRow[]): NormalizedPlanRow[] {
  return rows.filter((r) => r.pageRole === "hub" && sameTopic(r.subtopicName, r.pillarName));
}

export interface PathResult {
  paths: Map<string, string>;
  /** externalIds that had to be suffixed to stay unique, with the path they wanted. */
  collisions: { externalId: string; wanted: string; got: string }[];
}

/**
 * Compute a path for every row. Expects merged hubs to be removed already
 * (their articles then resolve to the pillar as parent).
 */
export function computePaths(
  rows: NormalizedPlanRow[],
  opts: { prefix?: string; overrides?: Map<string, string> } = {},
): PathResult {
  const prefix = normalizePrefix(opts.prefix ?? DEFAULT_PATH_PREFIX);
  const pillarSeg = new Map<string, string>();
  for (const r of rows) {
    if (!pillarSeg.has(r.pillarId)) pillarSeg.set(r.pillarId, capSegment(pathSegment(r.pillarName)));
  }
  const hubRow = new Map<string, NormalizedPlanRow>();
  for (const r of rows) {
    if (r.pageRole === "hub" && r.subtopicId) hubRow.set(`${r.pillarId}::${r.subtopicId}`, r);
  }
  const hubSeg = (r: NormalizedPlanRow) => childSegment(r.subtopicName ?? r.title, r.pillarName);

  const wanted = (r: NormalizedPlanRow): string => {
    const pillar = pillarSeg.get(r.pillarId) ?? pathSegment(r.pillarName);
    if (r.pageRole === "pillar") return `${prefix}${pillar}/`;
    if (r.pageRole === "hub") return `${prefix}${pillar}/${hubSeg(r)}/`;
    const hub = r.subtopicId ? hubRow.get(`${r.pillarId}::${r.subtopicId}`) : undefined;
    if (hub) return `${prefix}${pillar}/${hubSeg(hub)}/${childSegment(r.title, hub.subtopicName ?? hub.title)}/`;
    // No hub row (merged into the pillar, or never planned): under the pillar.
    return `${prefix}${pillar}/${childSegment(r.title, r.pillarName)}/`;
  };

  const paths = new Map<string, string>();
  const collisions: PathResult["collisions"] = [];
  const taken = new Set<string>();
  // Overrides first, so a hand-set path is never the one that gets suffixed.
  for (const r of rows) {
    const o = opts.overrides?.get(r.externalId);
    if (o) {
      const p = normalizePath(o);
      paths.set(r.externalId, p);
      taken.add(p);
    }
  }
  for (const r of rows) {
    if (paths.has(r.externalId)) continue;
    const want = wanted(r);
    let got = want;
    for (let n = 2; taken.has(got); n++) got = want.replace(/\/$/, `-${n}/`);
    if (got !== want) collisions.push({ externalId: r.externalId, wanted: want, got });
    paths.set(r.externalId, got);
    taken.add(got);
  }
  return { paths, collisions };
}

function normalizePrefix(p: string): string {
  const s = `/${p.replace(/^\/+|\/+$/g, "")}/`;
  return s === "//" ? "/" : s;
}

/** An operator-typed path: leading and trailing slash, lowercase, clean segments. */
export function normalizePath(raw: string): string {
  const segs = raw
    .split("/")
    .map((s) => pathSegment(s))
    .filter(Boolean);
  return segs.length ? `/${segs.join("/")}/` : "/";
}
