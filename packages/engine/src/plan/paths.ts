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

/** "Preemptive Identity Exposure Management (PIEM)" → "piem" (a trailing acronym only). */
export function trailingAcronym(name: string): string | undefined {
  const m = /\(\s*([A-Z][A-Za-z0-9]{1,7})\s*\)\s*$/.exec(name.trim());
  return m?.[1] ? pathSegment(m[1]) : undefined;
}

/** A name without its parenthetical asides: "Group Policy (GPO) Security" → "Group Policy Security". */
function withoutParens(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*/g, " ").trim();
}

// Only words that dangle once a term is cut away — never "in"/"on" ("breaking in").
const STOP_TAIL = new Set(["a", "an", "the", "your", "our", "their", "its", "of", "for", "and", "with", "by"]);
const ARTICLES = new Set(["a", "an", "the"]);
// A term after these is the subject: "How <term> works" → "how-it-works".
const SUBJECT_AFTER = new Set(["how", "why", "when", "where", "what", "does", "do", "is", "are"]);
// A term after these is just dropped: "Best <term> Tools" → "best-tools".
const DROP_AFTER = new Set(["best", "top", "leading", "free"]);

/** Tokens equal up to a plural "s": "paths" matches "path". */
function sameWord(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const s = (w: string) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
  return s(a) === s(b);
}

function isPlural(termTokens: string[]): boolean {
  const last = termTokens[termTokens.length - 1] ?? "";
  return last.length > 3 && last.endsWith("s") && !last.endsWith("ss");
}

function stripTerm(tokens: string[], term: string): string[] | undefined {
  const termTokens = pathSegment(term).split("-").filter(Boolean);
  if (termTokens.length === 0) return undefined;
  for (let i = 0; i + termTokens.length <= tokens.length; i++) {
    if (!termTokens.every((t, k) => sameWord(tokens[i + k], t))) continue;
    let before = tokens.slice(0, i);
    const after = tokens.slice(i + termTokens.length);
    // "What an <term> reveals" → drop the article, then the pronoun rule applies.
    if (ARTICLES.has(before[before.length - 1] ?? "")) before = before.slice(0, -1);
    if (before.length === 0 || after.length === 0) return [...before, ...after];
    const prev = before[before.length - 1] ?? "";
    if (DROP_AFTER.has(prev)) return [...before, ...after];
    // A term in the middle becomes a pronoun, so the segment still reads:
    // "how-it-works", "how-they-work", "how-to-find-them-in-active-directory".
    const plural = isPlural(termTokens);
    const pronoun = SUBJECT_AFTER.has(prev) ? (plural ? "they" : "it") : plural ? "them" : "it";
    return [...before, pronoun, ...after];
  }
  return undefined;
}

/**
 * The child's own segment: the title before any colon, parentheticals and a
 * leading "the" or "what is" dropped, with the parent's head term (or its
 * acronym) removed, and no dangling articles or prepositions at the end.
 * "What is Continuous Threat Exposure Management (CTEM)" → "ctem".
 */
export function childSegment(title: string, parentTerm: string | string[]): string {
  const head = (title.split(":")[0] ?? title).trim();
  const acronym = trailingAcronym(head);
  if (acronym && /^what\s+(is|are)\b/i.test(head)) return acronym;
  const base = pathSegment(withoutParens(head))
    .replace(/^the-/, "")
    .replace(/^what-(?:is|are)-(?:the-|a-|an-)?(?=.)/, "");
  const terms = (Array.isArray(parentTerm) ? parentTerm : [parentTerm]).filter(Boolean);
  let tokens = base.split("-").filter(Boolean);
  let cut = false;
  for (const term of terms) {
    const stripped = stripTerm(tokens, withoutParens(term));
    if (stripped && stripped.length > 0) {
      tokens = stripped;
      cut = true;
      break;
    }
  }
  if (cut) {
    while (tokens.length > 1 && STOP_TAIL.has(tokens[tokens.length - 1] ?? "")) tokens = tokens.slice(0, -1);
    while (tokens.length > 1 && ARTICLES.has(tokens[0] ?? "")) tokens = tokens.slice(1);
  }
  const seg = tokens.join("-");
  return capSegment(seg || base);
}

/**
 * A hub's segment: its trailing acronym when it has one ("… (ISPM)" → "ispm"),
 * otherwise its name minus the leading words it shares with the pillar
 * ("Identity Attack Surface" under Identity Exposure Management →
 * "attack-surface"), or the whole name when that would leave nothing.
 */
export function hubSegment(subtopicName: string, pillarName: string): string {
  const acronym = trailingAcronym(subtopicName);
  if (acronym) return acronym;
  const tokens = pathSegment(withoutParens(subtopicName)).split("-").filter(Boolean);
  const pillar = pathSegment(withoutParens(pillarName)).split("-");
  let shared = 0;
  while (shared < tokens.length && sameWord(tokens[shared], pillar[shared])) shared++;
  const rest = tokens.slice(shared);
  return capSegment((rest.length > 0 ? rest : tokens).join("-"));
}

/** Terms a child may drop: the hub's name and its acronym. */
function parentTerms(name: string): string[] {
  const acronym = trailingAcronym(name);
  return [withoutParens(name), ...(acronym ? [acronym] : [])];
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
  const hubSeg = (r: NormalizedPlanRow) => hubSegment(r.subtopicName ?? r.title, r.pillarName);

  const wanted = (r: NormalizedPlanRow): string => {
    const pillar = pillarSeg.get(r.pillarId) ?? pathSegment(r.pillarName);
    if (r.pageRole === "pillar") return `${prefix}${pillar}/`;
    if (r.pageRole === "hub") {
      // An offer / landing hub is a conversion page outside /learn/ (D46);
      // its articles still sit under /learn/<pillar>/<hub>/.
      if (r.articleType === "offer-landing-page") return `/${pathSegment(withoutParens(r.subtopicName ?? r.title))}/`;
      return `${prefix}${pillar}/${hubSeg(r)}/`;
    }
    const hub = r.subtopicId ? hubRow.get(`${r.pillarId}::${r.subtopicId}`) : undefined;
    if (hub) {
      return `${prefix}${pillar}/${hubSeg(hub)}/${childSegment(r.title, [...parentTerms(hub.subtopicName ?? hub.title), r.pillarName])}/`;
    }
    // No hub row (merged into the pillar, or never planned): under the pillar.
    return `${prefix}${pillar}/${childSegment(r.title, parentTerms(r.pillarName))}/`;
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
