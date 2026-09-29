import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { FunnelStage, PageRole, SearchIntent } from "./plan/types.js";

/**
 * Format registry (D45): the single source of truth for Article Type.
 *
 * The data lives in standards/formats.json so the Python audit, the worker
 * and the web app all read the same file, and an Admin edit (repo_files)
 * reaches every one of them. This module parses it and answers the questions
 * the pipeline asks of a page: which format is this label, how long is it,
 * how many takeaways and FAQs does it get, which schema types does it carry.
 *
 * Precedence (D47/D49): page role beats the format (a hub always routes and
 * gets the hub FAQ range), the format's own values beat the funnel rule, and
 * the funnel rule beats the defaults.
 */

export interface Range {
  min: number;
  max: number;
}

/** A FAQ range; `optional` means "none at all" is also acceptable. */
export interface FaqRange extends Range {
  optional?: boolean;
}

export type CompetitorMode = "strict" | "vendor";

export interface FormatSpec {
  slug: string;
  label: string;
  aliases: string[];
  defaultIntent: SearchIntent;
  defaultFunnel: FunnelStage;
  allowedRoles: PageRole[];
  allowedFunnels?: FunnelStage[];
  allowedIntents?: SearchIntent[];
  lengthBand: Range;
  takeaways?: Range;
  faq?: FaqRange;
  /** Schema.org types beyond the Organization/Person/WebPage/ImageObject every page gets. */
  schema: string[];
  headerPattern: string;
  competitorMode: CompetitorMode;
  /** Human sign-off required before export; never produced by the scheduler (D51). */
  signoff: boolean;
  /** Context files that must exist before this format is producible ({slug} = page slug). */
  requires?: { factSheet?: string; dataset?: string };
  producible: boolean;
  /** Coverage requirements for a cluster page ({subject}, {title}). */
  passages: string[];
}

export interface FormatRegistry {
  version: number;
  defaults: { takeaways: Range; faq: FaqRange };
  roleRules: Partial<Record<PageRole, { faq?: FaqRange; lengthBand?: Range; routing?: boolean }>>;
  funnelRules: Partial<Record<FunnelStage, { faq?: FaqRange }>>;
  formats: FormatSpec[];
}

/** The format a page falls back to when its label resolves to nothing. */
export const GENERIC_FORMAT_SLUG = "generic";

const GENERIC: FormatSpec = {
  slug: GENERIC_FORMAT_SLUG,
  label: "Article",
  aliases: [],
  defaultIntent: "informational",
  defaultFunnel: "mofu",
  allowedRoles: ["pillar", "hub", "cluster"],
  lengthBand: { min: 800, max: 2000 },
  schema: ["Article", "BreadcrumbList"],
  headerPattern: "auto",
  competitorMode: "strict",
  signoff: false,
  producible: true,
  passages: [
    `A direct answer to "{title}" in the first 40–60 words`,
    `What the reader should do differently as a result`,
  ],
};

export function normalizeFormatKey(v: string): string {
  return v.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
}

function asRange(v: unknown, what: string): Range {
  const r = v as Range | undefined;
  if (!r || !Number.isFinite(r.min) || !Number.isFinite(r.max) || r.min > r.max) {
    throw new Error(`formats.json: ${what} must be {min, max} with min <= max`);
  }
  return { min: r.min, max: r.max };
}

function asFaq(v: unknown, what: string): FaqRange {
  const r = asRange(v, what);
  return (v as FaqRange).optional ? { ...r, optional: true } : r;
}

/** Validate a parsed formats.json. Throws with the offending field named. */
export function parseFormatRegistry(raw: unknown): FormatRegistry {
  const obj = raw as Record<string, unknown>;
  if (!obj || !Array.isArray(obj["formats"])) throw new Error("formats.json: `formats` array missing");
  const defaults = (obj["defaults"] ?? {}) as Record<string, unknown>;
  const reg: FormatRegistry = {
    version: Number(obj["version"] ?? 1),
    defaults: {
      takeaways: asRange(defaults["takeaways"] ?? { min: 3, max: 3 }, "defaults.takeaways"),
      faq: asFaq(defaults["faq"] ?? { min: 3, max: 5, optional: true }, "defaults.faq"),
    },
    roleRules: {},
    funnelRules: {},
    formats: [],
  };
  for (const [role, rule] of Object.entries((obj["roleRules"] ?? {}) as Record<string, Record<string, unknown>>)) {
    reg.roleRules[role as PageRole] = {
      ...(rule["faq"] ? { faq: asFaq(rule["faq"], `roleRules.${role}.faq`) } : {}),
      ...(rule["lengthBand"] ? { lengthBand: asRange(rule["lengthBand"], `roleRules.${role}.lengthBand`) } : {}),
      ...(rule["routing"] ? { routing: true } : {}),
    };
  }
  for (const [funnel, rule] of Object.entries((obj["funnelRules"] ?? {}) as Record<string, Record<string, unknown>>)) {
    reg.funnelRules[funnel as FunnelStage] = rule["faq"] ? { faq: asFaq(rule["faq"], `funnelRules.${funnel}.faq`) } : {};
  }
  const seen = new Set<string>();
  for (const f of obj["formats"] as Record<string, unknown>[]) {
    const slug = String(f["slug"] ?? "").trim();
    if (!slug) throw new Error("formats.json: a format has no slug");
    if (seen.has(slug)) throw new Error(`formats.json: duplicate slug "${slug}"`);
    seen.add(slug);
    const spec: FormatSpec = {
      slug,
      label: String(f["label"] ?? slug),
      aliases: Array.isArray(f["aliases"]) ? (f["aliases"] as unknown[]).map(String) : [],
      defaultIntent: (f["defaultIntent"] as SearchIntent) ?? "informational",
      defaultFunnel: (f["defaultFunnel"] as FunnelStage) ?? "mofu",
      allowedRoles: (f["allowedRoles"] as PageRole[]) ?? ["cluster"],
      lengthBand: asRange(f["lengthBand"], `${slug}.lengthBand`),
      schema: Array.isArray(f["schema"]) ? (f["schema"] as unknown[]).map(String) : ["Article"],
      headerPattern: String(f["headerPattern"] ?? "auto"),
      competitorMode: f["competitorMode"] === "vendor" ? "vendor" : "strict",
      signoff: f["signoff"] === true,
      producible: f["producible"] !== false,
      passages: Array.isArray(f["passages"]) ? (f["passages"] as unknown[]).map(String) : [],
    };
    if (f["allowedFunnels"]) spec.allowedFunnels = f["allowedFunnels"] as FunnelStage[];
    if (f["allowedIntents"]) spec.allowedIntents = f["allowedIntents"] as SearchIntent[];
    if (f["takeaways"]) spec.takeaways = asRange(f["takeaways"], `${slug}.takeaways`);
    if (f["faq"]) spec.faq = asFaq(f["faq"], `${slug}.faq`);
    if (f["requires"]) spec.requires = f["requires"] as FormatSpec["requires"];
    reg.formats.push(spec);
  }
  return reg;
}

export function formatRegistryPath(repoRoot: string): string {
  return join(repoRoot, "standards", "formats.json");
}

/** Read standards/formats.json from the repo (after repo_files are applied). */
export function loadFormatRegistry(repoRoot: string): FormatRegistry {
  const path = formatRegistryPath(repoRoot);
  if (!existsSync(path)) throw new Error(`Format registry not found at ${path}`);
  return parseFormatRegistry(JSON.parse(readFileSync(path, "utf-8")));
}

/** A format by its registry slug; the generic fallback for an unknown slug. */
export function formatBySlug(reg: FormatRegistry, slug: string | null | undefined): FormatSpec {
  return reg.formats.find((f) => f.slug === slug) ?? GENERIC;
}

/**
 * Resolve a raw label ("Comparison (Concept)", "Explainer", "how-to") to a
 * registry format by exact slug, label or alias. No fuzzy matching: an
 * unknown label is reported for the operator to map, never guessed.
 */
export function resolveFormat(reg: FormatRegistry, raw: string): FormatSpec | undefined {
  const key = normalizeFormatKey(raw);
  if (!key) return undefined;
  return reg.formats.find(
    (f) =>
      normalizeFormatKey(f.slug) === key ||
      normalizeFormatKey(f.label) === key ||
      f.aliases.some((a) => normalizeFormatKey(a) === key),
  );
}

export function isRoutingRole(reg: FormatRegistry, role: PageRole): boolean {
  return reg.roleRules[role]?.routing === true;
}

export function faqRangeFor(
  reg: FormatRegistry,
  format: FormatSpec,
  role: PageRole,
  funnel: FunnelStage,
): FaqRange {
  return (
    reg.roleRules[role]?.faq ??
    format.faq ??
    reg.funnelRules[funnel]?.faq ??
    reg.defaults.faq
  );
}

export function takeawaysFor(reg: FormatRegistry, format: FormatSpec): Range {
  return format.takeaways ?? reg.defaults.takeaways;
}

export function lengthBandForFormat(reg: FormatRegistry, format: FormatSpec, role: PageRole): Range {
  return reg.roleRules[role]?.lengthBand ?? format.lengthBand;
}

/** Schema types stamped on the brief; FAQPage is added only when the page has an FAQ. */
export function schemaTypesForFormat(
  reg: FormatRegistry,
  format: FormatSpec,
  role: PageRole,
  funnel: FunnelStage,
): string[] {
  const types = [...format.schema];
  if (isRoutingRole(reg, role)) {
    for (const t of ["CollectionPage", "ItemList"]) if (!types.includes(t)) types.push(t);
  }
  if (faqRangeFor(reg, format, role, funnel).max > 0 && !types.includes("FAQPage")) types.push("FAQPage");
  return types;
}

/** Combinations the build spec calls mis-tagged — surfaced as import warnings, never blocking. */
export function facetWarnings(
  format: FormatSpec,
  role: PageRole,
  funnel: FunnelStage,
  intent: SearchIntent,
): string[] {
  const out: string[] = [];
  if (!format.allowedRoles.includes(role)) {
    out.push(`${format.label} is not a ${role} format (expected ${format.allowedRoles.join("/")})`);
  }
  if (format.allowedFunnels && !format.allowedFunnels.includes(funnel)) {
    out.push(`${format.label} at ${funnel.toUpperCase()} (expected ${format.allowedFunnels.map((f) => f.toUpperCase()).join("/")})`);
  }
  if (format.allowedIntents && !format.allowedIntents.includes(intent)) {
    out.push(`${format.label} with ${intent} intent (expected ${format.allowedIntents.join("/")})`);
  }
  return out;
}

/** Fill {subject}/{title} in a passage template. */
export function fillPassage(template: string, vars: { subject: string; title: string }): string {
  return template.replace(/\{subject\}/g, vars.subject).replace(/\{title\}/g, vars.title);
}

/** Workspace path of a format's writing template, with the generic fallback. */
export function formatTemplatePath(repoRoot: string, slug: string): string {
  const own = join(repoRoot, "templates", "formats", `${slug}.md`);
  return existsSync(own) ? own : join(repoRoot, "templates", "formats", "generic.md");
}
