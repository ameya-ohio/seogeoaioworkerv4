import { describe, expect, it } from "vitest";
import type { NormalizedPlanRow } from "./normalize.js";
import { childSegment, computePaths, mergedHubs, normalizePath } from "./paths.js";

/** The P01 rows of the Saporo pillar map, as the operator pasted them (2026-09-29). */
const P01: [string, string | null, string, NormalizedPlanRow["pageRole"]][] = [
  ["P01", null, "Identity Exposure Management: The Complete Guide", "pillar"],
  ["P01-S01-A01", "Identity Exposure", "What is Identity Exposure", "hub"],
  ["P01-S01-A02", "Identity Exposure", "Identity Exposure vs Identity Risk", "cluster"],
  ["P01-S01-A03", "Identity Exposure", "Identity Exposure vs Vulnerabilities", "cluster"],
  ["P01-S01-A04", "Identity Exposure", "What Causes Identity Exposure in Hybrid Environments", "cluster"],
  ["P01-S01-A05", "Identity Exposure", "Identity Exposure Examples Across AD, Entra ID and AWS", "cluster"],
  ["P01-S01-A06", "Identity Exposure", "How to Measure Identity Exposure", "cluster"],
  ["P01-S01-A07", "Identity Exposure", "How to Reduce Identity Exposure", "cluster"],
  ["P01-S01-A08", "Identity Exposure", "Why Identity Is the Primary Attack Surface", "cluster"],
  ["P01-S01-A09", "Identity Exposure", "Identity Exposure Statistics", "cluster"],
  ["P01-S02-A01", "Identity Exposure Management", "What is Identity Exposure Management", "hub"],
  ["P01-S02-A02", "Identity Exposure Management", "How Identity Exposure Management Works", "cluster"],
  [
    "P01-S02-A03",
    "Identity Exposure Management",
    "The Identity Exposure Management Lifecycle: Collect, Normalize, Graph, Analyze, Act",
    "cluster",
  ],
  ["P01-S02-A04", "Identity Exposure Management", "Identity Exposure Management vs Vulnerability Management", "cluster"],
  ["P01-S02-A05", "Identity Exposure Management", "Identity Exposure Management vs ITDR", "cluster"],
  ["P01-S02-A10", "Identity Exposure Management", "Best Identity Exposure Management Tools", "cluster"],
  ["P01-S02-A11", "Identity Exposure Management", "Identity Exposure Management Buyer's Guide", "cluster"],
  ["P01-S02-A12", "Identity Exposure Management", "Identity Exposure Management RFP Checklist", "cluster"],
];

function rows(): NormalizedPlanRow[] {
  return P01.map(([externalId, subtopicName, title, pageRole], i) => ({
    externalId,
    sheetRow: i,
    pageRole,
    pillarId: "P01",
    pillarName: "Identity Exposure Management",
    subtopicId: subtopicName ? (externalId.split("-")[1] ?? null) : null,
    subtopicName,
    title,
    format: "",
    articleType: "generic",
    funnel: "mofu",
    searchIntent: "informational",
    priority: 1,
    tieIn: "",
    sourcePages: [],
  }));
}

function paths() {
  const all = rows();
  const merged = new Set(mergedHubs(all).map((r) => r.externalId));
  return computePaths(all.filter((r) => !merged.has(r.externalId))).paths;
}

describe("/learn/ paths (D46)", () => {
  it("produces exactly the operator's example tree", () => {
    const p = paths();
    expect(p.get("P01")).toBe("/learn/identity-exposure-management/");
    // The IEM subtopic's hub merges into the pillar; its articles sit under it.
    expect(p.get("P01-S02-A02")).toBe("/learn/identity-exposure-management/how-it-works/");
    expect(p.get("P01-S02-A03")).toBe("/learn/identity-exposure-management/lifecycle/");
    expect(p.get("P01-S02-A04")).toBe("/learn/identity-exposure-management/vs-vulnerability-management/");
    expect(p.get("P01-S02-A11")).toBe("/learn/identity-exposure-management/buyers-guide/");
    expect(p.get("P01-S01-A01")).toBe("/learn/identity-exposure-management/identity-exposure/");
    expect(p.get("P01-S01-A02")).toBe("/learn/identity-exposure-management/identity-exposure/vs-identity-risk/");
    expect(p.get("P01-S01-A06")).toBe("/learn/identity-exposure-management/identity-exposure/how-to-measure/");
    expect(p.get("P01-S01-A09")).toBe("/learn/identity-exposure-management/identity-exposure/statistics/");
  });

  it("merges only the hub whose subtopic is the pillar's topic", () => {
    expect(mergedHubs(rows()).map((r) => r.externalId)).toEqual(["P01-S02-A01"]);
    expect(paths().has("P01-S02-A01")).toBe(false);
  });

  it("keeps a title whole when it doesn't contain the parent term", () => {
    expect(paths().get("P01-S01-A08")).toBe(
      "/learn/identity-exposure-management/identity-exposure/why-identity-is-the-primary-attack-surface/",
    );
    expect(childSegment("Best Identity Exposure Management Tools", "Identity Exposure Management")).toBe("best-tools");
    expect(childSegment("What Causes Identity Exposure in Hybrid Environments", "Identity Exposure")).toBe(
      "what-causes-it-in-hybrid-environments",
    );
  });

  it("keeps every path unique and honours operator overrides", () => {
    const all = rows().filter((r) => r.externalId !== "P01-S02-A01");
    const dup = { ...all[2]!, externalId: "P01-S01-A99" };
    const { paths: p, collisions } = computePaths([...all, dup], {
      overrides: new Map([["P01-S02-A10", "/learn/identity-exposure-management/top-tools"]]),
    });
    expect(p.get("P01-S02-A10")).toBe("/learn/identity-exposure-management/top-tools/");
    expect(p.get("P01-S01-A99")).toBe("/learn/identity-exposure-management/identity-exposure/vs-identity-risk-2/");
    expect(collisions).toHaveLength(1);
    expect(new Set(p.values()).size).toBe(p.size);
  });

  it("normalizes hand-typed paths", () => {
    expect(normalizePath("Learn/Identity Exposure Management//Buyer's Guide")).toBe(
      "/learn/identity-exposure-management/buyers-guide/",
    );
  });
});
