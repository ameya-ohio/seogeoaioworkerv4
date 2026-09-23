import type {
  ArchitectureType,
  FanoutSubQuery,
  GapStatus,
  ThemeScores,
  ThemeTier,
} from "./types.js";

/**
 * Deterministic scoring for the Topic & Cluster Generator (spec §3.2, §6,
 * §7, §8). This is the code-enforced half of the agent: the LLM proposes
 * groupings and judgment scores; stability, tiering, gap points, and the
 * 45-point total are computed here and never left to the model.
 */

/**
 * stability = runs where the theme appeared ÷ total runs. A theme "appears"
 * in run r when any of its sub-queries carries run number r, across all
 * prompts — K varied runs are the repeats, prompts are not.
 */
export function computeStability(subQueries: FanoutSubQuery[], totalRuns: number): number {
  if (totalRuns <= 0) return 0;
  const runs = new Set<number>();
  for (const sq of subQueries) runs.add(sq.run);
  return runs.size / totalRuns;
}

/** breadth = number of distinct sub-query types in the theme (spec §3.2). */
export function computeBreadth(subQueries: FanoutSubQuery[]): number {
  const types = new Set<string>();
  for (const sq of subQueries) types.add(sq.type);
  return types.size;
}

/** Tier thresholds (spec §3.2): core ≥ 0.6, secondary 0.3–0.59, noise < 0.3. */
export function tierForStability(stability: number): ThemeTier {
  if (stability >= 0.6) return "core";
  if (stability >= 0.3) return "secondary";
  return "noise";
}

/** Stability factor on the 1–5 scale: stability × 5, rounded (spec §7). */
export function stabilityScore(stability: number): number {
  const s = Math.round(stability * 5);
  return Math.min(5, Math.max(1, s));
}

/** Gap factor (spec §6): owned 0, buried 3, missing 5. */
export function gapScore(status: GapStatus): number {
  switch (status) {
    case "owned":
      return 0;
    case "buried":
      return 3;
    case "missing":
      return 5;
  }
}

const clamp1to5 = (n: number): number => Math.min(5, Math.max(1, Math.round(n)));

/**
 * The 45-point composite (spec §7): decisiveness ×3, gap ×2, right-to-win
 * ×2, stability ×1, openness ×1. LLM-judged factors are clamped to 1–5.
 */
export function computeThemeScores(input: {
  decisiveness: number;
  gapStatus: GapStatus;
  rightToWin: number;
  stability: number;
  openness: number;
}): ThemeScores {
  const decisiveness = clamp1to5(input.decisiveness);
  const gap = gapScore(input.gapStatus);
  const rightToWin = clamp1to5(input.rightToWin);
  const stability = stabilityScore(input.stability);
  const openness = clamp1to5(input.openness);
  return {
    decisiveness,
    gap,
    rightToWin,
    stability,
    openness,
    total: decisiveness * 3 + gap * 2 + rightToWin * 2 + stability + openness,
  };
}

/** Low right-to-win themes are awareness plays, never silently core (spec §7). */
export function isAwarenessPlay(rightToWin: number): boolean {
  return clamp1to5(rightToWin) <= 2;
}

export interface ArchitectureAssignment {
  theme: string;
  tier: ThemeTier;
  architecture: ArchitectureType;
  parentSpoke?: string;
  subQueryCount: number;
}

/**
 * Validate the LLM's architecture proposal against the spec's hard rules
 * (§8): never one page per sub-query, no spoke for noise themes, every
 * section must hang off a real spoke, no duplicate spoke themes, and at
 * least one spoke overall.
 */
export function validateArchitecture(assignments: ArchitectureAssignment[]): string[] {
  const problems: string[] = [];
  const spokes = assignments.filter((a) => a.architecture === "spoke");
  const spokeNames = new Set(spokes.map((a) => a.theme));

  if (assignments.length === 0) {
    return ["architecture is empty — every theme needs an assignment"];
  }
  if (spokes.length === 0) {
    problems.push("no standalone spokes assigned — a cluster needs at least one spoke");
  }
  if (spokeNames.size !== spokes.length) {
    problems.push("two spokes share a primary theme — no two spokes may share a theme");
  }
  for (const a of assignments) {
    if (a.architecture === "spoke" && a.tier === "noise") {
      problems.push(`"${a.theme}" is a noise-tier theme assigned as a spoke — fold it into a section or drop it`);
    }
    if (a.architecture === "spoke" && a.subQueryCount === 1) {
      problems.push(
        `"${a.theme}" is a single-sub-query spoke — never create one page per sub-query`,
      );
    }
    if (a.architecture === "section") {
      if (!a.parentSpoke) {
        problems.push(`section "${a.theme}" has no parent spoke`);
      } else if (!spokeNames.has(a.parentSpoke)) {
        problems.push(
          `section "${a.theme}" points at parent "${a.parentSpoke}", which is not a spoke`,
        );
      }
    }
  }
  return problems;
}

/** D31 default spoke length band. */
export const DEFAULT_LENGTH_BAND = { min: 800, max: 2000 } as const;

/**
 * Enforce the D31 length-band rule: inside 800–2,000 words needs no
 * justification; outside the band without one is snapped back to the band.
 */
export function normalizeLengthBand(band: {
  min?: number;
  max?: number;
  justification?: string;
}): { min: number; max: number; justification?: string } {
  const min = typeof band.min === "number" && band.min > 0 ? Math.round(band.min) : DEFAULT_LENGTH_BAND.min;
  const max = typeof band.max === "number" && band.max > min ? Math.round(band.max) : Math.max(min + 1, DEFAULT_LENGTH_BAND.max);
  const outside = min < DEFAULT_LENGTH_BAND.min || max > DEFAULT_LENGTH_BAND.max;
  if (outside && !band.justification?.trim()) {
    return { ...DEFAULT_LENGTH_BAND };
  }
  return {
    min,
    max,
    ...(band.justification?.trim() ? { justification: band.justification.trim() } : {}),
  };
}
