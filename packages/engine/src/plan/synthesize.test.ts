import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { readWorkbook } from "./xlsx.js";
import { suggestMapping } from "./mapping.js";
import {
  extractConcepts,
  extractPillars,
  extractSubtopics,
  indexTaxonomy,
  normalizeRows,
  type NormalizedPlanRow,
} from "./normalize.js";
import {
  buildSynthesisContext,
  buyingStageFor,
  childrenOf,
  internalLinksFor,
  lengthBandFor,
  parentOf,
  priorityScoreFor,
  requiredPassagesFor,
  schemaTypesFor,
  synthesizeBrief,
  type SynthesisContext,
} from "./synthesize.js";
import { normalizeLengthBand } from "../cluster/scoring.js";

const here = dirname(fileURLToPath(import.meta.url));

let rows: NormalizedPlanRow[];
let ctx: SynthesisContext;

beforeAll(async () => {
  const wb = await readWorkbook(
    readFileSync(join(here, "__fixtures__", "sample-plan.xlsx")),
    "sample-plan.xlsx",
  );
  const { mapping } = suggestMapping(wb);
  const pillars = extractPillars(wb, mapping.sheet);
  const subtopics = extractSubtopics(wb, mapping.sheet);
  const concepts = extractConcepts(wb, mapping.sheet, pillars);
  const sheet = wb.sheets.find((s) => s.name === mapping.sheet);
  if (!sheet) throw new Error("no payload sheet");
  rows = normalizeRows(sheet, mapping, indexTaxonomy(pillars, subtopics)).rows;
  ctx = buildSynthesisContext({ pillars, subtopics, concepts, rows, companyName: "Acme" });
});

const byId = (id: string) => {
  const r = rows.find((x) => x.externalId === id);
  if (!r) throw new Error(`fixture row ${id} missing`);
  return r;
};

describe("length bands (D31)", () => {
  it("gives routing pages a routing band, not an encyclopedic pillar", () => {
    expect(lengthBandFor("Pillar Guide", "pillar")).toMatchObject({ min: 1400, max: 2000 });
    expect(lengthBandFor("Definition / Explainer", "hub")).toMatchObject({ min: 1000, max: 1600 });
  });

  it("derives a spoke band from the format", () => {
    expect(lengthBandFor("Definition / Explainer", "cluster")).toMatchObject({ min: 800, max: 1200 });
    expect(lengthBandFor("Comparison (Concept)", "cluster")).toMatchObject({ min: 1200, max: 1800 });
    expect(lengthBandFor("Deep-dive", "cluster")).toMatchObject({ min: 1400, max: 2000 });
  });

  it("falls back to the D31 default for an unknown format", () => {
    expect(lengthBandFor("Interpretive Dance", "cluster")).toMatchObject({ min: 800, max: 2000 });
  });

  it("always carries a justification, and survives normalizeLengthBand unchanged", () => {
    for (const role of ["pillar", "hub", "cluster"] as const) {
      for (const fmt of ["Deep-dive", "Definition / Explainer", "Pillar Guide", ""]) {
        const band = lengthBandFor(fmt, role);
        expect(band.justification).toBeTruthy();
        // The cluster path snaps unjustified out-of-band values back to
        // 800-2000; these must pass through untouched.
        expect(normalizeLengthBand(band)).toMatchObject({ min: band.min, max: band.max });
      }
    }
  });
});

describe("schema types", () => {
  it("never stamps FAQPage — the Strategist decides whether an FAQ exists", () => {
    for (const role of ["pillar", "hub", "cluster"] as const) {
      expect(schemaTypesFor("Deep-dive", role)).not.toContain("FAQPage");
    }
  });

  it("gives routing pages CollectionPage + ItemList, which the schema spec documents", () => {
    expect(schemaTypesFor("Pillar Guide", "pillar")).toEqual([
      "BlogPosting",
      "BreadcrumbList",
      "CollectionPage",
      "ItemList",
    ]);
    expect(schemaTypesFor("Definition / Explainer", "hub")).toContain("CollectionPage");
    // A normal article is never a CollectionPage.
    expect(schemaTypesFor("Deep-dive", "cluster")).toEqual(["BlogPosting", "BreadcrumbList"]);
  });

  it("can be told the company's schema spec lacks the routing types", () => {
    expect(schemaTypesFor("Pillar Guide", "pillar", { routingTypesDocumented: false })).toEqual([
      "BlogPosting",
      "BreadcrumbList",
    ]);
  });

  it("adds DefinedTerm only for definition formats", () => {
    expect(schemaTypesFor("Definition / Explainer", "cluster")).toContain("DefinedTerm");
    expect(schemaTypesFor("How-to Guide", "cluster")).not.toContain("DefinedTerm");
  });
});

describe("facet mapping", () => {
  it("maps funnel to buying stage", () => {
    expect(buyingStageFor("tofu")).toBe("awareness");
    expect(buyingStageFor("mofu")).toBe("consideration");
    expect(buyingStageFor("bofu")).toBe("decision");
  });

  it("scores priority on the 0-45 scale the brief renderer prints", () => {
    expect(priorityScoreFor(1, "A", "mofu")).toBe(45);
    expect(priorityScoreFor(1, "A", "bofu")).toBe(45); // clamped, not 48
    expect(priorityScoreFor(2, "B", "mofu")).toBe(27);
    expect(priorityScoreFor(3, "C", "mofu")).toBe(9);
    for (const p of [1, 2, 3] as const) {
      for (const t of ["A", "B", "C", null] as const) {
        for (const f of ["tofu", "mofu", "bofu"] as const) {
          const s = priorityScoreFor(p, t, f);
          expect(s).toBeGreaterThanOrEqual(0);
          expect(s).toBeLessThanOrEqual(45);
        }
      }
    }
  });
});

describe("the tree", () => {
  it("resolves a spoke's parent to its hub and a hub's parent to its pillar", () => {
    expect(parentOf(byId("P01-S01-A02"), rows)?.externalId).toBe("P01-S01-A01");
    expect(parentOf(byId("P01-S01-A01"), rows)?.externalId).toBe("P01");
    expect(parentOf(byId("P01"), rows)).toBeNull();
  });

  it("lists a pillar's hubs and a hub's articles as children", () => {
    expect(childrenOf(byId("P01"), rows).map((r) => r.externalId).sort()).toEqual([
      "P01-S01-A01",
      "P01-S02-A01",
    ]);
    expect(childrenOf(byId("P01-S01-A01"), rows).map((r) => r.externalId).sort()).toEqual([
      "P01-S01-A02",
      "P01-S01-A03",
    ]);
    expect(childrenOf(byId("P01-S01-A02"), rows)).toEqual([]);
  });
});

describe("internal links", () => {
  it("gives a pillar page down-links only — it has no parent", () => {
    const links = internalLinksFor(byId("P01"), rows);
    expect(links.hub).toBe("");
    expect(links.siblings).toEqual([]);
    expect(links.children).toEqual(["What is Widget Exposure", "How to Harden Widgets"]);
  });

  it("gives a hub up, down and sideways links", () => {
    const links = internalLinksFor(byId("P01-S01-A01"), rows);
    expect(links.hub).toBe("Widget Security: The Complete Guide");
    expect(links.children).toEqual([
      "Widget Exposure vs Widget Risk",
      "Why Widget Exposure Grows in Hybrid & Cloud Estates",
    ]);
    expect(links.siblings).toEqual(["How to Harden Widgets"]);
  });

  it("gives a spoke up and sideways links, never children", () => {
    const links = internalLinksFor(byId("P01-S01-A02"), rows);
    expect(links.hub).toBe("What is Widget Exposure");
    expect(links.siblings).toEqual(["Why Widget Exposure Grows in Hybrid & Cloud Estates"]);
    expect(links.children).toBeUndefined();
  });
});

describe("required passages (D33 coverage contract)", () => {
  it("gives a routing page one passage per child, in order", () => {
    const passages = requiredPassagesFor(byId("P01-S01-A01"), rows);
    expect(passages[0]).toContain("Widget Exposure");
    expect(passages.some((p) => p.includes("Widget Exposure vs Widget Risk"))).toBe(true);
    expect(passages.some((p) => p.includes("2–3 sentence"))).toBe(true);
  });

  it("gives a spoke format-shaped passages", () => {
    const passages = requiredPassagesFor(byId("P01-S01-A02"), rows);
    expect(passages.length).toBeGreaterThanOrEqual(3);
    expect(passages.join(" ")).toMatch(/differ/i);
  });
});

describe("synthesizeBrief", () => {
  it("produces a complete, renderable brief for every fixture row", () => {
    for (const row of rows) {
      const { brief } = synthesizeBrief(row, ctx);
      expect(brief.workingTitle).toBe(row.title);
      expect(brief.markdown).toContain("# Spoke Brief:");
      expect(brief.h2Outline.length).toBeGreaterThanOrEqual(2);
      expect(brief.evidence.external.length).toBeGreaterThan(0);
      expect(brief.lengthBand.min).toBeGreaterThan(0);
      expect(brief.priorityScore).toBeGreaterThanOrEqual(0);
    }
  });

  it("uses the pillar's head term verbatim as a pillar page's query target", () => {
    const { brief, needsQueryTarget } = synthesizeBrief(byId("P01"), ctx);
    expect(brief.primaryQueryTarget).toBe("widget security");
    expect(needsQueryTarget).toBe(false);
  });

  it("keeps every query target within the 7-word ceiling", () => {
    for (const row of rows) {
      const { brief } = synthesizeBrief(row, ctx);
      expect(brief.primaryQueryTarget.split(" ").length).toBeLessThanOrEqual(7);
    }
  });

  it("never invents sub-queries — no fan-out produced this brief", () => {
    for (const row of rows) {
      expect(synthesizeBrief(row, ctx).brief.representativeSubQueries).toEqual([]);
    }
  });

  it("states evidence as requirements, never as numbers or URLs (D34)", () => {
    const forbidden = /(https?:\/\/)|(\d+\s*(%|percent|million|billion))/i;
    for (const row of rows) {
      const { brief } = synthesizeBrief(row, ctx);
      for (const e of brief.evidence.external) expect(e.requirement).not.toMatch(forbidden);
      expect(brief.evidence.quotableStatCandidate).not.toMatch(forbidden);
    }
  });

  it("carries the pillar's differentiation angle and the row's tie-in", () => {
    const { brief } = synthesizeBrief(byId("P01-S01-A02"), ctx);
    expect(brief.differentiationAngle).toContain("own category");
    expect(brief.differentiationAngle).toContain("Core H1");
  });

  it("draws proprietary evidence only from the tie-ins and the concepts sheet", () => {
    const { brief } = synthesizeBrief(byId("P01-S01-A02"), ctx);
    expect(brief.evidence.proprietary).toContain("Core H1");
    expect(brief.evidence.proprietary.join(" ")).toContain("widget exposure");
    // P02's concept must not leak into a P01 article.
    expect(brief.evidence.proprietary.join(" ")).not.toContain("Audit-ready reporting");
  });

  it("renders down-links into the markdown the Strategist reads", () => {
    const { brief } = synthesizeBrief(byId("P01"), ctx);
    expect(brief.markdown).toContain("link down to");
    expect(brief.markdown).toContain("What is Widget Exposure");
  });

  it("omits the hub line for a pillar page, which has no parent", () => {
    const { brief } = synthesizeBrief(byId("P01"), ctx);
    expect(brief.markdown).not.toMatch(/^- Hub:\s*$/m);
  });

  it("is deterministic — same input, identical brief", () => {
    const a = synthesizeBrief(byId("P01-S01-A02"), ctx).brief;
    const b = synthesizeBrief(byId("P01-S01-A02"), ctx).brief;
    expect(a).toEqual(b);
  });
});
