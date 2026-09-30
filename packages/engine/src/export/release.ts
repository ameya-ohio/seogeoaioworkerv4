import type { ObjectId } from "mongodb";
import type { CompanyConfig } from "../companyConfig.js";
import type { EngineDb } from "../db.js";
import { stillDeferredLinks } from "../links/inventory.js";
import type { PageRole, PlanItemDoc } from "../plan/types.js";
import { zip } from "../plan/zip.js";
import type { ArticleDoc, Stage } from "../types.js";
import { framerExportProblems, framerFiles } from "./framer.js";

/**
 * Releases: a subtopic goes live as ONE unit — its hub and all its cluster
 * articles together — so no page in it ever links to a sibling or hub that
 * is not up yet. A pillar page is its own release, after its subtopics.
 *
 * A release is ready once every page in it is approved. Its export is one
 * package with every link inside the release switched on; links that leave
 * the release (up to the pillar page, across to another subtopic) stay
 * deferred until their target is live, exactly as for a single article (D53).
 */

export type ReleaseState =
  | "planned"
  | "building"
  | "in_review"
  | "ready"
  | "partly_live"
  | "live";

export interface ReleaseMember {
  planItemId: string;
  externalId: string;
  title: string;
  role: PageRole;
  sequence: number;
  slug: string;
  path: string | null;
  articleId: string | null;
  stage: Stage | null;
  live: boolean;
  liveUrl: string | null;
  exportedAt: Date | null;
  /** Why this page holds the release back, when it does. */
  blocking: string | null;
}

export interface ReleaseUnit {
  /** "P01/P01-S01" for a subtopic, "P01/pillar" for a pillar page. */
  key: string;
  kind: "subtopic" | "pillar";
  pillarId: string;
  pillarName: string;
  subtopicName: string | null;
  /** The hub's title (or the pillar page's). */
  title: string;
  state: ReleaseState;
  members: ReleaseMember[];
  /** Rows left out of the release, with why. */
  excluded: { externalId: string; title: string; reason: string }[];
  counts: { total: number; produced: number; approved: number; live: number };
}

const PRODUCED: readonly Stage[] = ["review", "approved", "publishing", "published"];
const APPROVED: readonly Stage[] = ["approved", "publishing", "published"];

export function releaseKeyOf(item: Pick<PlanItemDoc, "pillarId" | "subtopicId" | "pageRole">): string {
  return item.pageRole === "pillar" ? `${item.pillarId}/pillar` : `${item.pillarId}/${item.subtopicId ?? ""}`;
}

function exclusion(item: PlanItemDoc): string | null {
  if (item.status === "skipped") return "skipped";
  if (item.status === "quarantined") return "quarantined after repeated failures";
  if (item.held && !item.articleId) return item.held.reason || `held (${item.held.kind})`;
  return null;
}

type ArticleSlice = Pick<ArticleDoc, "_id" | "slug" | "stage" | "live" | "exportedAt">;

function memberOf(item: PlanItemDoc, article: ArticleSlice | undefined): ReleaseMember {
  const stage = article?.stage ?? null;
  const live = Boolean(article?.live) || stage === "published";
  let blocking: string | null = null;
  if (!article) {
    blocking =
      item.status === "enqueued" || item.status === "in_progress"
        ? "in production"
        : item.status === "failed"
          ? "failed — retry it"
          : item.status === "slug_conflict"
            ? "slug conflict"
            : "not built yet";
  } else if (!live && (!stage || !APPROVED.includes(stage))) {
    blocking = stage && PRODUCED.includes(stage) ? "awaiting approval" : stage === "failed" ? "failed — retry it" : "in production";
  }
  return {
    planItemId: item._id?.toHexString() ?? "",
    externalId: item.externalId,
    title: item.title,
    role: item.pageRole,
    sequence: item.sequence,
    slug: article?.slug ?? item.slug,
    path: item.path ?? null,
    articleId: article?._id?.toHexString() ?? null,
    stage,
    live,
    liveUrl: article?.live?.url ?? item.publishedUrl ?? null,
    exportedAt: article?.exportedAt ?? null,
    blocking,
  };
}

function stateOf(members: ReleaseMember[]): ReleaseState {
  if (members.length === 0) return "planned";
  const live = members.filter((m) => m.live).length;
  if (live === members.length) return "live";
  if (live > 0) return "partly_live";
  if (members.every((m) => !m.blocking)) return "ready";
  if (members.every((m) => m.stage && PRODUCED.includes(m.stage))) return "in_review";
  if (members.some((m) => m.articleId)) return "building";
  return "planned";
}

/** Every release in a plan, in the plan's own order. */
export async function listReleases(db: EngineDb, planId: ObjectId): Promise<ReleaseUnit[]> {
  const items = await db.planItems.find({ planId }).sort({ sequence: 1 }).toArray();
  const articleIds = items.map((i) => i.articleId).filter((id): id is ObjectId => Boolean(id));
  const articles = new Map<string, ArticleSlice>();
  if (articleIds.length) {
    const rows = await db.articles
      .find({ _id: { $in: articleIds } })
      .project<ArticleSlice>({ slug: 1, stage: 1, live: 1, exportedAt: 1 })
      .toArray();
    for (const a of rows) if (a._id) articles.set(a._id.toHexString(), a);
  }

  const groups = new Map<string, PlanItemDoc[]>();
  for (const i of items) {
    const k = releaseKeyOf(i);
    const list = groups.get(k) ?? [];
    list.push(i);
    groups.set(k, list);
  }

  const units: ReleaseUnit[] = [];
  for (const [key, group] of groups) {
    const first = group[0] as PlanItemDoc;
    const hub = group.find((i) => i.pageRole === "hub");
    const members: ReleaseMember[] = [];
    const excluded: ReleaseUnit["excluded"] = [];
    for (const i of group) {
      const why = exclusion(i);
      if (why) excluded.push({ externalId: i.externalId, title: i.title, reason: why });
      else members.push(memberOf(i, i.articleId ? articles.get(i.articleId.toHexString()) : undefined));
    }
    // The hub leads the release; then its articles in build order.
    members.sort((a, b) => (a.role === "hub" ? -1 : b.role === "hub" ? 1 : a.sequence - b.sequence));
    units.push({
      key,
      kind: first.pageRole === "pillar" ? "pillar" : "subtopic",
      pillarId: first.pillarId,
      pillarName: first.pillarName,
      subtopicName: first.pageRole === "pillar" ? null : first.subtopicName,
      title: first.pageRole === "pillar" ? first.title : hub?.title ?? first.subtopicName ?? first.title,
      state: stateOf(members),
      members,
      excluded,
      counts: {
        total: members.length,
        produced: members.filter((m) => m.stage && PRODUCED.includes(m.stage)).length,
        approved: members.filter((m) => m.live || (m.stage && APPROVED.includes(m.stage))).length,
        live: members.filter((m) => m.live).length,
      },
    });
  }
  // A pillar's release comes after its subtopics.
  const lastSeq = (u: ReleaseUnit) => Math.max(-1, ...u.members.map((m) => m.sequence));
  return units.sort((a, b) => lastSeq(a) - lastSeq(b));
}

export async function getRelease(db: EngineDb, planId: ObjectId, key: string): Promise<ReleaseUnit | null> {
  return (await listReleases(db, planId)).find((u) => u.key === key) ?? null;
}

function normPath(urlOrPath: string): string {
  let p = urlOrPath;
  try {
    p = new URL(urlOrPath).pathname;
  } catch {
    // already a path
  }
  return p.replace(/\/+$/, "");
}

export class ReleaseNotReadyError extends Error {}

/**
 * One zip for the whole release: a folder per page (hub first), each the same
 * files as a single-article Framer export, plus a README with the order.
 * Only pages not yet live are packed, so a partly-live release can finish.
 */
export async function buildReleaseBundle(
  db: EngineDb,
  company: CompanyConfig,
  unit: ReleaseUnit,
  opts: {
    loadHeader?: (article: ArticleDoc) => Promise<Buffer | undefined>;
    signoffRequired?: (article: ArticleDoc) => boolean;
  } = {},
): Promise<{ filename: string; zip: Buffer; pages: string[] }> {
  const blocking = unit.members.filter((m) => m.blocking);
  if (blocking.length) {
    throw new ReleaseNotReadyError(
      `Every page must be approved first: ${blocking
        .slice(0, 5)
        .map((m) => `"${m.title}" (${m.blocking})`)
        .join(", ")}${blocking.length > 5 ? `, and ${blocking.length - 5} more` : ""}.`,
    );
  }
  const toShip = unit.members.filter((m) => !m.live && m.articleId);
  if (!toShip.length) throw new ReleaseNotReadyError("Every page in this release is already live.");

  // Links between pages of this release are switched on: they go live together.
  const inRelease = new Set(unit.members.map((m) => m.path).filter((p): p is string => Boolean(p)).map(normPath));

  const files: { name: string; data: Buffer | string }[] = [];
  const pages: string[] = [];
  const problems: string[] = [];
  const outside: { page: string; url: string; anchor?: string }[] = [];
  let n = 0;
  for (const m of toShip) {
    const article = await db.articles.findOne({ slug: m.slug, companyId: company.companyId });
    if (!article) {
      problems.push(`"${m.title}": article not found`);
      continue;
    }
    const signoff = opts.signoffRequired?.(article) ?? false;
    const p = framerExportProblems(article, { signoffRequired: signoff });
    if (p.length) {
      problems.push(`"${m.title}": ${p.join(" ")}`);
      continue;
    }
    const deferred = (await stillDeferredLinks(db, article)).filter((d) => !inRelease.has(normPath(d.url)));
    for (const d of deferred) outside.push({ page: m.title, url: d.url, ...(d.anchor ? { anchor: d.anchor } : {}) });
    const header = await opts.loadHeader?.(article);
    const bundle = framerFiles(article, company, {
      ...(header ? { headerPng: header } : {}),
      signoffRequired: signoff,
      deferredLinks: deferred,
    });
    const folder = `${String(++n).padStart(2, "0")}-${article.slug}`;
    for (const f of bundle.files) files.push({ name: `${folder}/${f.name}`, data: f.data });
    pages.push(folder);
  }
  if (problems.length) throw new ReleaseNotReadyError(problems.join(" "));

  const name = unit.kind === "pillar" ? unit.title : `${unit.pillarName} › ${unit.subtopicName ?? unit.title}`;
  const readme = [
    `# Release: ${name}`,
    ``,
    `Framer export — ${new Date().toISOString().slice(0, 10)} — ${pages.length} page(s)`,
    ``,
    unit.kind === "subtopic"
      ? `These pages go live together: the hub and its articles link to each other, and every one of those links is switched on in this package.`
      : `The pillar page. Its links to hubs that are already live are switched on.`,
    ``,
    `## Pages (one folder each; its README has the Framer steps)`,
    ``,
    ...toShip.map((m, i) => `${i + 1}. ${m.role === "hub" ? "**Hub** — " : m.role === "pillar" ? "**Pillar** — " : ""}${m.title} → ${m.path ?? "(no reserved path)"}`),
    ``,
    `## Order`,
    ``,
    `1. Create and publish every page above in Framer.`,
    `2. Then press **Mark release live** on the plan's Releases tab. It checks every URL responds and marks them live together.`,
    ``,
    ...(outside.length
      ? [
          `## Links that leave this release`,
          ``,
          `Their targets aren't live yet, so they're plain text here. Once a target is live, re-download the page it sits on:`,
          ``,
          ...outside.map((o) => `- ${o.page}: "${o.anchor ?? o.url}" → ${o.url}`),
          ``,
        ]
      : []),
  ].join("\n");
  files.unshift({ name: "README.md", data: readme });

  const slug = (unit.subtopicName ?? unit.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
  return { filename: `release-${unit.pillarId.toLowerCase()}-${slug}.zip`, zip: zip(files), pages };
}

/**
 * Live articles whose deferred links now point at live pages but whose last
 * export predates that — they are on the site with those links still as
 * plain text, so they need re-downloading and re-pasting.
 */
export async function articlesToReexport(
  db: EngineDb,
  companyId: string,
  planId: ObjectId,
): Promise<{ slug: string; title: string; links: number }[]> {
  const live = await db.articles
    .find({
      companyId,
      planId,
      $or: [{ live: { $exists: true } }, { stage: "published" }],
      "linkChecks.results.status": "deferred",
    })
    .toArray();
  const out: { slug: string; title: string; links: number }[] = [];
  for (const a of live) {
    const deferred = (a.linkChecks?.results ?? []).filter((r) => r.status === "deferred");
    const still = new Set((await stillDeferredLinks(db, a)).map((d) => d.url));
    const switchedOn = deferred.filter((d) => !still.has(d.url));
    if (!switchedOn.length) continue;
    // When did the most recent of those targets go live?
    const paths = switchedOn.map((d) => normPath(d.url));
    const targets = await db.articles
      .find({
        companyId,
        $or: [
          { "live.url": { $in: switchedOn.map((d) => d.url) } },
          { path: { $in: [...paths, ...paths.map((p) => `${p}/`)] } },
        ],
      })
      .project<Pick<ArticleDoc, "live" | "updatedAt">>({ live: 1, updatedAt: 1 })
      .toArray();
    const latest = Math.max(0, ...targets.map((t) => (t.live?.verifiedAt ?? t.updatedAt).getTime()));
    if (!a.exportedAt || a.exportedAt.getTime() < latest) {
      out.push({ slug: a.slug, title: String(a.frontmatter?.["title"] ?? a.topic), links: switchedOn.length });
    }
  }
  return out;
}
