import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { readWorkbook, type ParsedWorkbook } from "./xlsx.js";
import { suggestMapping } from "./mapping.js";
import {
  collectNotes,
  extractConcepts,
  extractPillars,
  extractSubtopics,
  indexTaxonomy,
  missingRequiredColumns,
  normalizeRows,
  parseHierarchicalId,
  splitList,
} from "./normalize.js";
import type { PlanMapping } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));

let wb: ParsedWorkbook;
let mapping: PlanMapping;

beforeAll(async () => {
  wb = await readWorkbook(readFileSync(join(here, "__fixtures__", "sample-plan.xlsx")), "sample-plan.xlsx");
  mapping = suggestMapping(wb).mapping;
});

describe("helpers", () => {
  it("splits delimited lists", () => {
    expect(splitList("Home, Overview; Features")).toEqual(["Home", "Overview", "Features"]);
    expect(splitList("")).toEqual([]);
  });

  it("expands a hierarchical id into its ancestor chain", () => {
    expect(parseHierarchicalId("P01-S03-A07")).toEqual(["P01", "P01-S03", "P01-S03-A07"]);
    expect(parseHierarchicalId("P01")).toEqual(["P01"]);
    expect(parseHierarchicalId("")).toEqual([]);
  });
});

describe("taxonomy extraction", () => {
  it("reads pillars with their head term and differentiation angle", () => {
    const pillars = extractPillars(wb, "Content Map");
    expect(pillars).toHaveLength(2);
    expect(pillars[0]).toMatchObject({
      pillarId: "P01",
      name: "Widget Security",
      headTerm: "widget security",
    });
    expect(pillars[0]?.whyWeCanOwnIt).toContain("own category");
  });

  it("reads subtopics with hub title and tier", () => {
    const subs = extractSubtopics(wb, "Content Map");
    expect(subs).toHaveLength(3);
    expect(subs[0]).toMatchObject({
      subtopicId: "P01-S01",
      pillarId: "P01",
      name: "Widget Exposure",
      hubTitle: "What is Widget Exposure",
      tier: "A",
    });
  });

  it("reads concepts and maps them to a pillar", () => {
    const pillars = extractPillars(wb, "Content Map");
    const concepts = extractConcepts(wb, "Content Map", pillars);
    expect(concepts).toHaveLength(3);
    expect(concepts[0]?.pillarId).toBe("P01");
    expect(concepts[2]?.pillarId).toBe("P02");
  });

  it("keeps free-form sheets as operator notes", () => {
    expect(collectNotes(wb)).toContain("Sample SEO Topic Map");
  });
});

describe("normalizeRows", () => {
  const run = () => {
    const pillars = extractPillars(wb, "Content Map");
    const subs = extractSubtopics(wb, "Content Map");
    const sheet = wb.sheets.find((s) => s.name === "Content Map");
    if (!sheet) throw new Error("fixture missing payload sheet");
    return normalizeRows(sheet, mapping, indexTaxonomy(pillars, subs));
  };

  it("normalizes every payload row", () => {
    const { rows, skipped } = run();
    expect(skipped).toEqual([]);
    expect(rows).toHaveLength(9);
  });

  it("resolves page roles, funnel, priority and intent to canonical values", () => {
    const { rows } = run();
    const byId = new Map(rows.map((r) => [r.externalId, r]));
    expect(byId.get("P01")?.pageRole).toBe("pillar");
    expect(byId.get("P01-S01-A01")?.pageRole).toBe("hub");
    expect(byId.get("P01-S01-A02")?.pageRole).toBe("cluster");
    expect(byId.get("P01-S02-A02")).toMatchObject({
      funnel: "bofu",
      priority: 1,
      searchIntent: "commercial",
    });
  });

  it("treats the '(Pillar Page)' sentinel as no subtopic", () => {
    const { rows } = run();
    const pillarRow = rows.find((r) => r.externalId === "P01");
    expect(pillarRow?.subtopicName).toBeNull();
    expect(pillarRow?.subtopicId).toBeNull();
    expect(pillarRow?.pillarId).toBe("P01");
  });

  it("joins rows to the taxonomy by NAME, so ids come from the taxonomy sheet", () => {
    const { rows } = run();
    const spoke = rows.find((r) => r.externalId === "P01-S01-A02");
    expect(spoke?.pillarId).toBe("P01");
    expect(spoke?.subtopicId).toBe("P01-S01");
    expect(spoke?.subtopicName).toBe("Widget Exposure");
  });

  it("parses source pages into a list", () => {
    const { rows } = run();
    expect(rows.find((r) => r.externalId === "P01")?.sourcePages).toEqual(["Home"]);
  });

  it("skips a row with an unmapped page role and reports the value", () => {
    const sheet = {
      name: "s",
      headers: ["ID", "Pillar", "Article Title", "Page Role"],
      rows: [
        ["A1", "Widget Security", "Good Row", "Cluster Article"],
        ["A2", "Widget Security", "Bad Row", "Listicle Page"],
      ],
    };
    const m: PlanMapping = {
      sheet: "s",
      columns: { externalId: 0, pillar: 1, title: 2, pageRole: 3 },
      values: {
        pageRole: { "cluster article": "cluster" },
        funnel: {},
        priority: {},
        searchIntent: {},
      },
    };
    const { rows, skipped, unrecognized } = normalizeRows(sheet, m, indexTaxonomy([], []));
    expect(rows).toHaveLength(1);
    expect(skipped[0]?.reason).toContain("unmapped page role");
    expect(unrecognized[0]).toMatchObject({ field: "pageRole", value: "Listicle Page" });
  });

  it("defaults funnel/priority/intent when their columns are absent, and says so", () => {
    const sheet = {
      name: "s",
      headers: ["ID", "Pillar", "Article Title", "Page Role"],
      rows: [["A1", "Widget Security", "Some Article", "Cluster Article"]],
    };
    const m: PlanMapping = {
      sheet: "s",
      columns: { externalId: 0, pillar: 1, title: 2, pageRole: 3 },
      values: { pageRole: { "cluster article": "cluster" }, funnel: {}, priority: {}, searchIntent: {} },
    };
    const { rows, defaulted } = normalizeRows(sheet, m, indexTaxonomy([], []));
    expect(rows[0]).toMatchObject({ funnel: "mofu", priority: 2, searchIntent: "informational" });
    expect(defaulted).toEqual(expect.arrayContaining(["funnel", "priority", "searchIntent", "format"]));
  });

  it("derives ids from names when the workbook has no id scheme", () => {
    const sheet = {
      name: "s",
      headers: ["Ref", "Pillar", "Subtopic", "Article Title", "Page Role"],
      rows: [["r1", "Widget Security", "Widget Exposure", "What is Widget Exposure", "Cluster Article"]],
    };
    const m: PlanMapping = {
      sheet: "s",
      columns: { externalId: 0, pillar: 1, subtopic: 2, title: 3, pageRole: 4 },
      values: { pageRole: { "cluster article": "cluster" }, funnel: {}, priority: {}, searchIntent: {} },
    };
    const { rows } = normalizeRows(sheet, m, indexTaxonomy([], []));
    expect(rows[0]?.pillarId).toBe("r1");
    expect(rows[0]?.subtopicId).toContain("widget-exposure");
  });
});

describe("missingRequiredColumns", () => {
  it("names the required fields that are unmapped", () => {
    const m: PlanMapping = {
      sheet: "s",
      columns: { externalId: 0 },
      values: { pageRole: {}, funnel: {}, priority: {}, searchIntent: {} },
    };
    expect(missingRequiredColumns(m)).toEqual(["Pillar", "Title", "Page Role"]);
  });

  it("is empty for the reference mapping", () => {
    expect(missingRequiredColumns(mapping)).toEqual([]);
  });
});
