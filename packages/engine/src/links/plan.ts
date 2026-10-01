import { cleanBody, parseArticle } from "../frontmatter.js";
import { anchorKey, extractMarkdownLinks, type LinkTarget } from "./inventory.js";

/**
 * D62: internal links are decided once, when the Strategist plans them.
 *
 * The outline's `## Internal Links` table names each link's target, section,
 * the reader need it serves and its anchor. Relevance is judged there, against
 * what the link inventory says each target covers. From then on every phase
 * that writes or rewrites the article (Writer, HDCP, Editor, the verify fix
 * pass) must keep each planned link exactly: the planned anchor text and the
 * planned URL. The sentence around a link may change; the link may not. The
 * check is plain text matching, so it gives the same answer on every run —
 * the LLM relevance judge it replaces (D53 off_target) did not.
 */

export interface PlannedLink {
  url: string;
  anchor: string;
  section: string;
  need: string;
}

export function normalizeLinkUrl(url: string): string {
  return url.trim().replace(/[),.;]+$/, "").replace(/\/+$/, "");
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function sectionBody(text: string, title: string): string | undefined {
  const m = new RegExp(`^##\\s+${title}\\s*$`, "im").exec(text);
  if (!m) return undefined;
  const rest = text.slice(m.index + m[0].length);
  const next = /^##\s+\S/m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

function stripCell(cell: string): string {
  return cell
    .trim()
    .replace(/^\*\*|\*\*$/g, "")
    .replace(/^[`"“'‘]+|[`"”'’]+$/g, "")
    .trim();
}

/**
 * The rows of the outline's `## Internal Links` table that name a URL.
 * `undefined` when the outline has no such section, or plans links in the
 * older bullet form without URLs: there is no plan to hold the article to.
 */
export function parseLinkPlan(outline: string | undefined): PlannedLink[] | undefined {
  const body = outline ? sectionBody(outline, "Internal Links") : undefined;
  if (body === undefined) return undefined;
  const rows: PlannedLink[] = [];
  for (const line of body.split("\n")) {
    if (!/^\s*\|/.test(line)) continue;
    const cells = line.trim().replace(/^\||\|$/g, "").split("|");
    const url = /https?:\/\/[^\s|)>\]]+/.exec(cells[0] ?? "")?.[0];
    if (!url || cells.length < 4) continue;
    rows.push({
      url: normalizeLinkUrl(url),
      section: stripCell(cells[1] ?? ""),
      need: stripCell(cells[2] ?? ""),
      anchor: stripCell(cells[cells.length - 1] ?? ""),
    });
  }
  return rows.length ? rows : undefined;
}

/**
 * An anchor with a demonstrative ("these numbers", "this surface", "here")
 * describes the page it sits on, not the page it opens. Read on its own it
 * says nothing about the destination, which is the first anchor rule (D53).
 */
const DEMONSTRATIVE = /\b(this|these|those|here)\b/i;
const MIN_ANCHOR_WORDS = 2;
const MAX_ANCHOR_WORDS = 7;

/**
 * Plan-time checks on the Internal Links table: every row is complete, each
 * anchor describes its destination and is unique, every target is in the
 * link inventory, and a pillar or hub links down to every child page.
 */
export function linkPlanProblems(
  outline: string | undefined,
  inventory: LinkTarget[] = [],
  pageRole?: string,
): string[] {
  const plan = parseLinkPlan(outline);
  const problems: string[] = [];
  if (!plan) {
    if (inventory.length) {
      problems.push(
        "Internal Links has no planned rows — plan each link as a table row: | Target URL | Section | Reader need | Anchor |",
      );
    }
    return problems;
  }
  const byUrl = new Map(inventory.map((t) => [normalizeLinkUrl(t.url), t]));
  const anchors = new Map<string, string>();
  for (const row of plan) {
    const words = row.anchor.split(/\s+/).filter(Boolean).length;
    if (!row.anchor) {
      problems.push(`Internal Links: no anchor planned for ${row.url}`);
      continue;
    }
    if (!row.section || !row.need) {
      problems.push(`Internal Links: the row for "${row.anchor}" needs a section and the reader need it serves`);
    }
    if (words < MIN_ANCHOR_WORDS || words > MAX_ANCHOR_WORDS) {
      problems.push(`Internal Links: anchor "${row.anchor}" is ${words} word(s) — plan ${MIN_ANCHOR_WORDS}–${MAX_ANCHOR_WORDS}`);
    }
    if (DEMONSTRATIVE.test(row.anchor)) {
      problems.push(
        `Internal Links: anchor "${row.anchor}" points back at this page ("${DEMONSTRATIVE.exec(row.anchor)?.[1]}") — an anchor names what the destination covers, so it reads on its own`,
      );
    }
    const key = anchorKey(row.anchor);
    const other = anchors.get(key);
    if (other && other !== row.url) {
      problems.push(`Internal Links: anchor "${row.anchor}" is planned for two pages — one anchor, one destination`);
    }
    anchors.set(key, row.url);
    if (inventory.length) {
      const target = byUrl.get(row.url);
      if (!target) {
        problems.push(`Internal Links: ${row.url} isn't in page.md's link inventory — link only pages the inventory lists`);
      } else {
        const clash = inventory.find(
          (t) => normalizeLinkUrl(t.url) !== row.url && t.anchorsUsed.some((a) => anchorKey(a) === key),
        );
        if (clash) {
          problems.push(`Internal Links: anchor "${row.anchor}" is already used on the site for ${clash.url} — pick another`);
        }
      }
    }
  }
  if (pageRole === "pillar" || pageRole === "hub") {
    const planned = new Set(plan.map((r) => r.url));
    for (const child of inventory.filter((t) => t.relation === "child")) {
      if (!planned.has(normalizeLinkUrl(child.url))) {
        problems.push(`Internal Links: a ${pageRole} links down to every child page — ${child.title} (${child.url}) isn't planned`);
      }
    }
  }
  return problems;
}

export type PlannedLinkStatus = "used" | "anchor_changed" | "missing";

export interface LinkPlanComparison {
  planned: (PlannedLink & { status: PlannedLinkStatus; used?: string })[];
  /** Internal links in the article that the plan doesn't name. */
  unplanned: { url: string; anchor: string }[];
}

/**
 * The article's internal links against the plan. Internal means the
 * article's own host (from canonical_url) or a planned target's host.
 * `exempt` URLs (the funnel CTA) are never "unplanned".
 */
export function compareLinksToPlan(
  outline: string | undefined,
  articleMd: string,
  exempt: string[] = [],
): LinkPlanComparison | undefined {
  const plan = parseLinkPlan(outline);
  if (!plan) return undefined;
  const { frontmatter, body } = parseArticle(articleMd);
  const hosts = new Set(
    [String(frontmatter["canonical_url"] ?? ""), ...plan.map((p) => p.url)].map(hostOf).filter((h): h is string => Boolean(h)),
  );
  const links = extractMarkdownLinks(cleanBody(body))
    .map((l) => ({ url: normalizeLinkUrl(l.url), anchor: l.anchor.replace(/[*_`]/g, "").trim() }))
    .filter((l) => {
      const h = hostOf(l.url);
      return h !== undefined && hosts.has(h);
    });
  const exemptSet = new Set(exempt.map(normalizeLinkUrl));
  const plannedUrls = new Set(plan.map((p) => p.url));
  return {
    planned: plan.map((p) => {
      const atUrl = links.filter((l) => l.url === p.url);
      if (!atUrl.length) return { ...p, status: "missing" as const };
      const match = atUrl.find((l) => anchorKey(l.anchor) === anchorKey(p.anchor));
      return match
        ? { ...p, status: "used" as const, used: match.anchor }
        : { ...p, status: "anchor_changed" as const, used: atUrl[0]?.anchor ?? "" };
    }),
    unplanned: links.filter((l) => !plannedUrls.has(l.url) && !exemptSet.has(l.url)),
  };
}

/** Gate problems: the article must carry the planned links exactly, and only those. */
export function plannedLinkProblems(outline: string | undefined, articleMd: string | undefined, exempt: string[] = []): string[] {
  if (!articleMd) return [];
  const cmp = compareLinksToPlan(outline, articleMd, exempt);
  if (!cmp) return [];
  const problems: string[] = [];
  for (const p of cmp.planned) {
    if (p.status === "missing") {
      problems.push(
        `planned internal link missing: [${p.anchor}](${p.url}) — the outline plans it in "${p.section}"; write it into that section with this exact anchor`,
      );
    } else if (p.status === "anchor_changed") {
      problems.push(
        `internal link anchor changed: "${p.used}" → ${p.url}; the outline plans "${p.anchor}" — use the planned anchor exactly and rewrite the sentence around it (D62)`,
      );
    }
  }
  for (const u of cmp.unplanned) {
    problems.push(
      `unplanned internal link: [${u.anchor}](${u.url}) — the outline's Internal Links table doesn't plan it; remove the link (plain text is fine) (D62)`,
    );
  }
  return problems;
}
