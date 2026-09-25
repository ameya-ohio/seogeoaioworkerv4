import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { readWorkbook, type ParsedWorkbook } from "./xlsx.js";
import { suggestMapping } from "./mapping.js";
import { analyzePlan } from "./import.js";
import { findOrderViolations } from "../schedule/sequencing.js";
import type { PlanMapping } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
let wb: ParsedWorkbook;
let mapping: PlanMapping;

beforeAll(async () => {
  wb = await readWorkbook(readFileSync(join(here, "__fixtures__", "sample-plan.xlsx")), "sample-plan.xlsx");
  mapping = suggestMapping(wb).mapping;
});

const analyze = (over: Parameters<typeof analyzePlan>[0] extends infer T ? Partial<T> : never = {}) =>
  analyzePlan({ workbook: wb, mapping, companyName: "Acme", ...over });

describe("analyzePlan", () => {
  it("produces one item per payload row with nothing blocking", () => {
    const { report, items } = analyze();
    expect(report.blocking).toEqual([]);
    expect(report.mappedRows).toBe(9);
    expect(items).toHaveLength(9);
  });

  it("reports the facet distributions the operator confirms against", () => {
    const { report } = analyze();
    expect(report.byPageRole).toEqual({ pillar: 2, hub: 3, cluster: 4 });
    expect(report.byPriority).toEqual({ P1: 4, P2: 4, P3: 1 });
    expect(report.byFunnel).toEqual({ tofu: 4, mofu: 4, bofu: 1 });
    expect(report.byIntent.informational).toBe(8);
  });

  it("gives every item a unique reserved slug", () => {
    const { items } = analyze();
    const slugs = items.map((i) => i.slug);
    expect(slugs.every(Boolean)).toBe(true);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("gives every item a complete brief and a query target", () => {
    const { items } = analyze();
    for (const i of items) {
      expect(i.brief.markdown).toContain("# Spoke Brief:");
      expect(i.primaryQueryTarget).not.toBe("");
      expect(i.primaryQueryTarget.split(" ").length).toBeLessThanOrEqual(7);
    }
  });

  it("orders the plan so no item precedes its parent", () => {
    const { items } = analyze();
    const violations = findOrderViolations(
      items.map((i) => ({
        key: i.externalId,
        parentKey: i.parentExternalId,
        rowIndex: i.sheetRow,
        pillarId: i.pillarId,
        subtopicId: i.subtopicId,
        role: i.pageRole,
        priority: i.priority,
        funnel: i.funnel,
        tier: i.tierHint,
      })),
      items.map((i) => ({ key: i.externalId, sequence: i.sequence })),
    );
    expect(violations).toEqual([]);
  });

  it("numbers sequences densely from zero", () => {
    const { items } = analyze();
    expect([...items].map((i) => i.sequence).sort((a, b) => a - b)).toEqual(
      items.map((_, idx) => idx),
    );
  });

  it("leads with the pillar pages", () => {
    const { items } = analyze();
    const first = [...items].sort((a, b) => a.sequence - b.sequence)[0];
    expect(first?.pageRole).toBe("pillar");
  });

  it("resolves each item's parent: spoke -> hub -> pillar", () => {
    const { items } = analyze();
    const byId = new Map(items.map((i) => [i.externalId, i]));
    expect(byId.get("P01-S01-A02")?.parentExternalId).toBe("P01-S01-A01");
    expect(byId.get("P01-S01-A01")?.parentExternalId).toBe("P01");
    expect(byId.get("P01")?.parentExternalId).toBeNull();
  });

  it("blocks the import when a row collides with an existing article", () => {
    const { report } = analyze({
      takenSlugs: new Map([["what-is-widget-exposure", "published"]]),
    });
    expect(report.articleCollisions).toHaveLength(1);
    expect(report.articleCollisions[0]).toMatchObject({ stage: "published" });
    expect(report.blocking.join(" ")).toContain("collide with an existing article");
  });

  it("blocks the import when a required column is unmapped", () => {
    const broken: PlanMapping = { ...mapping, columns: { ...mapping.columns } };
    delete broken.columns.title;
    const { report } = analyze({ mapping: broken });
    expect(report.blocking.join(" ")).toContain("Title");
  });

  it("blocks the import when a page role value is unmapped", () => {
    const broken: PlanMapping = {
      ...mapping,
      values: { ...mapping.values, pageRole: { "pillar page": "pillar" } },
    };
    const { report } = analyze({ mapping: broken });
    expect(report.blocking.join(" ")).toContain("Assign a page role");
    expect(report.unrecognized.some((u) => u.field === "pageRole")).toBe(true);
  });

  it("blocks the import when the sheet was truncated", async () => {
    const small = await readWorkbook(
      readFileSync(join(here, "__fixtures__", "sample-plan.xlsx")),
      "sample-plan.xlsx",
      { maxRows: 4 },
    );
    const { report } = analyzePlan({
      workbook: small,
      mapping: suggestMapping(small).mapping,
      companyName: "Acme",
    });
    expect(report.blocking.join(" ")).toContain("truncated");
  });

  it("reports duplicate keyword targets against the existing library", () => {
    const { report } = analyze({
      existingKeywords: new Map([["widget security", "idea"]]),
    });
    expect(report.keywordCollisions.length).toBeGreaterThan(0);
    // Reported, never blocking: the operator links or ignores.
    expect(report.blocking).toEqual([]);
  });

  it("honours a slug override and a query-target override", () => {
    const { items } = analyze({
      slugOverrides: new Map([["P01", "widget-security-hub"]]),
      queryTargetOverrides: new Map([["P01", "Widget Security Platform"]]),
    });
    const p01 = items.find((i) => i.externalId === "P01");
    expect(p01?.slug).toBe("widget-security-hub");
    expect(p01?.slugStrategy).toBe("manual");
    expect(p01?.primaryQueryTarget).toBe("widget security platform");
    expect(p01?.needsQueryTarget).toBe(false);
  });

  it("reports a subtopic whose hub row is missing", () => {
    const sheet = wb.sheets.find((s) => s.name === "Content Map");
    if (!sheet) throw new Error("fixture");
    const withoutHub = {
      ...wb,
      sheets: wb.sheets.map((s) =>
        s.name === "Content Map"
          ? { ...s, rows: s.rows.filter((r) => r[0] !== "P02-S01-A01") }
          : s,
      ),
    };
    const { report } = analyzePlan({ workbook: withoutHub, mapping, companyName: "Acme" });
    expect(report.missingHubs.length).toBeGreaterThan(0);
  });

  it("carries the taxonomy, concepts and notes through for the plan doc", () => {
    const a = analyze();
    expect(a.taxonomy.pillars).toHaveLength(2);
    expect(a.taxonomy.subtopics).toHaveLength(3);
    expect(a.concepts).toHaveLength(3);
    expect(a.notes).toContain("Sample SEO Topic Map");
  });

  it("is deterministic across repeated analysis", () => {
    expect(analyze().items).toEqual(analyze().items);
  });
});
