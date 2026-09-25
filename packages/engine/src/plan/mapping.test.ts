import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { readWorkbook } from "./xlsx.js";
import {
  assignColumns,
  normalizeHeader,
  remapValues,
  scoreHeader,
  suggestMapping,
  suggestPageRole,
  suggestPriority,
  suggestValueMaps,
  planFieldSpec,
} from "./mapping.js";

const here = dirname(fileURLToPath(import.meta.url));
const load = () => readWorkbook(readFileSync(join(here, "__fixtures__", "sample-plan.xlsx")), "sample-plan.xlsx");

describe("normalizeHeader / scoreHeader", () => {
  it("normalizes punctuation and case away", () => {
    expect(normalizeHeader("Article + Phrase Combo")).toBe("articlephrasecombo");
    expect(normalizeHeader("Source Page(s)")).toBe("sourcepages");
  });

  it("scores an exact alias above a partial above a fuzzy match", () => {
    const title = planFieldSpec("title");
    expect(scoreHeader("Article + Phrase Combo", title)).toBe(3);
    expect(scoreHeader("Working Title Draft", title)).toBe(2);
    expect(scoreHeader("Completely Unrelated", title)).toBe(0);
  });
});

describe("suggestMapping", () => {
  it("picks the payload sheet over sibling sheets that share columns", async () => {
    const { mapping, sheetScores } = suggestMapping(await load());
    expect(mapping.sheet).toBe("Content Map");
    // Subtopics also has ID/Pillar, so this is the discriminating assertion.
    expect(sheetScores[0]?.sheet).toBe("Content Map");
    expect(sheetScores.find((s) => s.sheet === "Subtopics")?.score).toBeLessThan(
      sheetScores[0]?.score ?? 0,
    );
  });

  it("maps every real column of the reference shape", async () => {
    const { mapping } = suggestMapping(await load());
    expect(mapping.columns).toMatchObject({
      externalId: 0,
      pillar: 1,
      subtopic: 2,
      title: 3,
      pageRole: 4,
      searchIntent: 5,
      format: 6,
      funnel: 7,
      priority: 8,
      sourcePages: 10,
    });
  });

  it("never assigns two fields to the same column", async () => {
    const { mapping } = suggestMapping(await load());
    const used = Object.values(mapping.columns);
    expect(new Set(used).size).toBe(used.length);
  });

  it("resolves the facet vocabulary found in the sheet", async () => {
    const { mapping } = suggestMapping(await load());
    expect(mapping.values.pageRole["pillar page"]).toBe("pillar");
    expect(mapping.values.pageRole["subtopic hub"]).toBe("hub");
    expect(mapping.values.pageRole["cluster article"]).toBe("cluster");
    expect(mapping.values.funnel["mofu"]).toBe("mofu");
    expect(mapping.values.priority["p1"]).toBe(1);
    expect(mapping.values.searchIntent["commercial"]).toBe("commercial");
  });
});

describe("renamed headers", () => {
  const renamed = [
    "Ref", "Topic", "Cluster", "Working Title", "Content Role",
    "Query Intent", "Content Type", "Journey Stage", "Rank", "Why Us", "References",
  ];

  it("still auto-detects when headers are worded differently", () => {
    const { columns } = assignColumns(renamed);
    expect(columns.externalId).toBe(0);
    expect(columns.pillar).toBe(1);
    expect(columns.title).toBe(3);
    expect(columns.pageRole).toBe(4);
    expect(columns.funnel).toBe(7);
  });

  it("leaves a genuinely unrecognizable header unmapped rather than guessing", () => {
    const { columns } = assignColumns(["Ref", "Xyzzy", "Frobnicate"]);
    expect(columns.externalId).toBe(0);
    expect(columns.title).toBeUndefined();
    expect(columns.pageRole).toBeUndefined();
  });
});

describe("value maps", () => {
  it("reports nothing for values outside the vocabulary (the UI asks)", () => {
    const sheet = {
      name: "s",
      headers: ["ID", "Page Role", "Title"],
      rows: [["1", "Listicle Page", "t"]],
    };
    const values = suggestValueMaps(sheet, { externalId: 0, pageRole: 1, title: 2 });
    expect(values.pageRole["listicle page"]).toBeUndefined();
  });

  it("accepts the common synonyms an operator might use", () => {
    expect(suggestPageRole("Spoke")).toBe("cluster");
    expect(suggestPageRole("Hub Page")).toBe("hub");
    expect(suggestPriority("High")).toBe(1);
    expect(suggestPriority("3")).toBe(3);
  });

  it("keeps an operator override when re-deriving after a remap", async () => {
    const wb = await load();
    const { mapping } = suggestMapping(wb);
    mapping.values.pageRole["pillar page"] = "cluster"; // deliberate override
    const next = remapValues(wb, mapping);
    expect(next.values.pageRole["pillar page"]).toBe("cluster");
    expect(next.values.pageRole["subtopic hub"]).toBe("hub");
  });
});
