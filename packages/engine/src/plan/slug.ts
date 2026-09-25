import { slugify } from "../pipelineOps.js";
import type { SlugStrategy } from "./types.js";

/**
 * Reserve a slug for every planned article, up front, in one pass.
 *
 * `slugify` truncates at 60 characters, which on a long planned title kills
 * the DISTINGUISHING tail: "…-for-healthcare" and "…-for-financial-services"
 * collapse to the same slug. So titles over budget shed filler words from the
 * left (keeping the head term and the tail) instead of being cut from the
 * right, and anything still colliding is disambiguated deterministically.
 *
 * Doing this at import rather than at enqueue is the point: a collision then
 * surfaces in a UI with the operator watching, instead of as a SlugTakenError
 * thrown by the scheduler 300 articles into a multi-week cadence.
 */

export interface SlugPlanInput {
  externalId: string;
  title: string;
  pillarId: string;
  subtopicId: string | null;
}

export interface SlugAssignment {
  externalId: string;
  slug: string;
  /** The slug before disambiguation — useful for explaining a collision. */
  base: string;
  strategy: SlugStrategy;
  /** Other externalIds that wanted this same base slug. */
  collidedWith?: string[];
}

export interface SlugResult {
  assignments: SlugAssignment[];
  problems: string[];
}

const MAX_SLUG_LENGTH = 60;

/** Shed from the left first: the head term and the qualifying tail matter most. */
const FILLER = [
  "the", "a", "an", "and", "or", "of", "for", "to", "in", "on", "at",
  "with", "your", "their", "its", "that", "this", "into", "from", "by",
  "complete", "ultimate", "practical", "definitive", "guide", "explained",
];
/** Tier (a) of disambiguation retries with only the weakest fillers removed. */
const WEAK_FILLER = new Set(["the", "a", "an", "of", "to", "in", "on", "at", "by"]);

function titleWords(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
}

/**
 * Reduce a title until its slug fits `budget`, dropping filler words from the
 * left. Returns the original words when no filler remains to drop.
 */
export function reduceTitle(title: string, budget = MAX_SLUG_LENGTH, weakOnly = false): string {
  const words = titleWords(title);
  if (words.join("-").length <= budget) return words.join("-");

  const droppable = (w: string) => (weakOnly ? WEAK_FILLER.has(w) : FILLER.includes(w));
  const kept = [...words];
  for (let i = 0; i < kept.length && kept.join("-").length > budget; ) {
    if (droppable(kept[i] as string) && kept.length > 2) kept.splice(i, 1);
    else i++;
  }
  return kept.join("-");
}

function baseSlugFor(title: string, weakOnly = false): { slug: string; strategy: SlugStrategy } {
  const direct = slugify(title);
  if (direct.length <= MAX_SLUG_LENGTH && slugify(title) === direct && titleWords(title).join("-").length <= MAX_SLUG_LENGTH) {
    return { slug: direct, strategy: "title" };
  }
  const reduced = reduceTitle(title, MAX_SLUG_LENGTH, weakOnly);
  // slugify still applies the hard ceiling, so a title with no droppable
  // filler is truncated — but only after filler removal has been tried.
  return { slug: slugify(reduced), strategy: "trimmed" };
}

/**
 * The tail of `title` that the colliding titles do not share, slugified.
 * This is what makes two long sibling titles distinguishable.
 */
function distinguishingTail(title: string, others: string[]): string {
  const mine = titleWords(title);
  const otherSets = others.map((o) => new Set(titleWords(o)));
  const unique = mine.filter((w) => otherSets.every((s) => !s.has(w)));
  return unique.join("-");
}

function fit(base: string, suffix: string): string {
  if (!suffix) return base;
  const room = MAX_SLUG_LENGTH - (suffix.length + 1);
  if (room <= 0) return slugify(suffix);
  return slugify(`${base.slice(0, room).replace(/-+$/, "")}-${suffix}`);
}

/**
 * Assign a unique slug to every row.
 *
 * @param rows  every planned article in the import
 * @param taken slugs already owned by existing articles (collisions are
 *              reported, not silently mutated — the operator decides)
 * @param overrides externalId -> operator-chosen slug
 *
 * Deterministic and order-independent for a given input set.
 */
export function assignSlugs(
  rows: SlugPlanInput[],
  taken: Set<string> = new Set(),
  overrides: Map<string, string> = new Map(),
): SlugResult {
  const problems: string[] = [];
  const assignments: SlugAssignment[] = [];

  // Pass 1: a base slug per row.
  const bases = new Map<string, { slug: string; strategy: SlugStrategy }>();
  for (const row of rows) {
    const override = overrides.get(row.externalId);
    if (override) {
      const slug = slugify(override);
      bases.set(row.externalId, { slug, strategy: "manual" });
      continue;
    }
    bases.set(row.externalId, baseSlugFor(row.title));
  }

  // Pass 2: group by base slug and disambiguate each group.
  const groups = new Map<string, SlugPlanInput[]>();
  for (const row of rows) {
    const b = bases.get(row.externalId);
    if (!b) continue;
    const list = groups.get(b.slug);
    if (list) list.push(row);
    else groups.set(b.slug, [row]);
  }

  const used = new Set<string>();
  for (const [base, members] of groups) {
    if (members.length === 1) {
      const row = members[0] as SlugPlanInput;
      const b = bases.get(row.externalId) as { slug: string; strategy: SlugStrategy };
      assignments.push({ externalId: row.externalId, slug: base, base, strategy: b.strategy });
      used.add(base);
      continue;
    }

    const collidedWith = members.map((m) => m.externalId);
    for (const row of members) {
      const others = members.filter((m) => m.externalId !== row.externalId).map((m) => m.title);

      // (a) retry keeping more words — usually enough on its own.
      let candidate = slugify(reduceTitle(row.title, MAX_SLUG_LENGTH, true));
      let strategy: SlugStrategy = "trimmed";

      // (b) append the tail the colliding titles do not share.
      if (used.has(candidate) || candidate === base) {
        const tail = distinguishingTail(row.title, others);
        if (tail) {
          candidate = fit(base, tail);
          strategy = "suffixed";
        }
      }

      // (c) the workbook's own id — unique by construction, so this
      //     always terminates.
      if (!candidate || used.has(candidate) || candidate === base) {
        candidate = fit(base, row.externalId.toLowerCase());
        strategy = "suffixed";
      }

      assignments.push({
        externalId: row.externalId,
        slug: candidate,
        base,
        strategy,
        collidedWith: collidedWith.filter((id) => id !== row.externalId),
      });
      used.add(candidate);
    }
  }

  // Pass 3: report anything still wrong rather than papering over it.
  const seen = new Map<string, string[]>();
  for (const a of assignments) {
    const list = seen.get(a.slug);
    if (list) list.push(a.externalId);
    else seen.set(a.slug, [a.externalId]);
  }
  for (const [slug, ids] of seen) {
    if (ids.length > 1) {
      problems.push(`slug "${slug}" is still claimed by ${ids.length} rows: ${ids.join(", ")}`);
    }
    if (taken.has(slug)) {
      problems.push(`slug "${slug}" (${ids.join(", ")}) already belongs to an existing article`);
    }
  }

  // Stable output order, independent of Map iteration.
  const order = new Map(rows.map((r, i) => [r.externalId, i]));
  assignments.sort((a, b) => (order.get(a.externalId) ?? 0) - (order.get(b.externalId) ?? 0));
  return { assignments, problems };
}
