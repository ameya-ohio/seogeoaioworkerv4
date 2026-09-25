/**
 * Derive an article's keyword target from its planned title (D32).
 *
 * D32 exists because a fan-out sub-query string once leaked into
 * `targetKeyword` and the Editor gate then forced that machine-shaped phrase
 * into the lede. The rule it produced: a keyword target is a NATURAL query a
 * person would actually type. `parseBriefResponse` enforces a 7-word ceiling.
 *
 * A planned title is not a query — it is a headline. This converts one into
 * the other where it can, and REFUSES where it cannot, setting `needsReview`
 * so a human fixes it in the plan browser. Refusing loudly matters: across a
 * 504-row map, a silently bad keyword compounds 504 times.
 */

export interface QueryTargetContext {
  /** The pillar's head term — the fallback for a pillar page. */
  headTerm?: string;
  /** The subtopic name — the fallback for hubs and cluster articles. */
  subtopicName?: string;
}

export interface QueryTargetResult {
  target: string;
  /** True when derivation could not reach a natural query on its own. */
  needsReview: boolean;
}

/** `parseBriefResponse` rejects anything longer, so this is a hard ceiling. */
export const MAX_QUERY_TARGET_WORDS = 7;
const MIN_QUERY_TARGET_WORDS = 2;

/**
 * Shed these before shedding meaningful words. Ordered least-meaningful
 * first so the head term survives longest.
 */
const SHEDDABLE = new Set([
  "the", "a", "an", "and", "or", "of", "for", "to", "in", "on", "at",
  "with", "your", "their", "its", "that", "this", "into", "from", "by",
]);

/**
 * Interrogatives people DO type stay; ones they do not are dropped.
 * "what is X" and "how to X" are real queries with real volume;
 * "why X matters" is a headline, never a query.
 */
// The optional "to" prevents a dangling preposition: "When to Run an Audit"
// must become "run an audit", not "to run an audit".
const DROPPABLE_LEAD = /^(?:why|when|where|who)\s+(?:to\s+)?/i;

const YEAR_SUFFIX = /\s*[([]\s*(?:19|20)\d{2}\s*[)\]]\s*$/;
/** " — subtitle", " – subtitle", " - subtitle" (spaced, so hyphenated words survive). */
const DASH_SUBTITLE = /\s+[—–-]\s+.*$/;
const TRAILING_FILLER = /\s*[,:]\s*(explained|a (?:practical |complete |quick )?guide|the complete guide|an overview|what you need to know)\s*$/i;

/** Treat a source token as an acronym worth preserving verbatim. */
function isAcronym(word: string): boolean {
  const bare = word.replace(/[^A-Za-z0-9]/g, "");
  if (bare.length < 2 || bare.length > 6) return false;
  // All caps, or caps with digits (NIS2, M365, ISO27001).
  return /^[A-Z][A-Z0-9]*$/.test(bare);
}

function words(s: string): string[] {
  return s.split(/\s+/).filter(Boolean);
}

/** Lowercase everything except tokens that were acronyms in the source. */
function normalizeCase(raw: string): string {
  return words(raw)
    .map((w) => (isAcronym(w) ? w.replace(/[^A-Za-z0-9-]/g, "") : w.toLowerCase()))
    .join(" ");
}

function cleanPunctuation(s: string): string {
  return s
    .replace(/&/g, " and ")
    .replace(/[''`]/g, "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Shed stopwords from the right, then whole words from the right. */
function shrinkToLimit(w: string[]): string[] {
  const out = [...w];
  for (let i = out.length - 1; i >= 0 && out.length > MAX_QUERY_TARGET_WORDS; i--) {
    if (SHEDDABLE.has((out[i] ?? "").toLowerCase())) out.splice(i, 1);
  }
  while (out.length > MAX_QUERY_TARGET_WORDS) out.pop();
  return out;
}

function fallback(ctx: QueryTargetContext): string {
  const raw = (ctx.subtopicName ?? ctx.headTerm ?? "").trim();
  if (!raw) return "";
  return shrinkToLimit(words(normalizeCase(cleanPunctuation(raw)))).join(" ");
}

export function deriveQueryTarget(
  title: string,
  ctx: QueryTargetContext = {},
): QueryTargetResult {
  let work = (title ?? "").trim();
  if (!work) {
    const fb = fallback(ctx);
    return { target: fb, needsReview: true };
  }

  work = work.replace(YEAR_SUFFIX, "").trim();

  // "X vs Y" is ALREADY a natural query — people type comparisons verbatim.
  // Check before any subtitle/lead stripping so the comparison survives intact.
  if (/\bvs\.?\b|\bversus\b/i.test(work)) {
    const compared = normalizeCase(cleanPunctuation(work.replace(/\bversus\b/gi, "vs").replace(/\bvs\./gi, "vs")));
    const w = words(compared);
    if (w.length >= MIN_QUERY_TARGET_WORDS && w.length <= MAX_QUERY_TARGET_WORDS) {
      return { target: w.join(" "), needsReview: false };
    }
    const shrunk = shrinkToLimit(w);
    return {
      target: shrunk.join(" "),
      needsReview: shrunk.length < MIN_QUERY_TARGET_WORDS,
    };
  }

  // A colon subtitle is headline decoration; the subject is on the left. Keep
  // the whole title when the left side is too thin to stand alone.
  const colon = work.indexOf(": ");
  if (colon > 0) {
    const left = work.slice(0, colon).trim();
    if (words(left).length >= MIN_QUERY_TARGET_WORDS) work = left;
  }
  work = work.replace(DASH_SUBTITLE, "").trim();
  work = work.replace(TRAILING_FILLER, "").trim();
  work = work.replace(DROPPABLE_LEAD, "").trim();

  const normalized = normalizeCase(cleanPunctuation(work));
  let w = words(normalized);
  if (w.length > MAX_QUERY_TARGET_WORDS) w = shrinkToLimit(w);

  if (w.length < MIN_QUERY_TARGET_WORDS || w.length > MAX_QUERY_TARGET_WORDS) {
    const fb = fallback(ctx);
    return { target: fb || w.join(" "), needsReview: true };
  }
  return { target: w.join(" "), needsReview: false };
}
