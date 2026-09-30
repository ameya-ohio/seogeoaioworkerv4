import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatBySlug, parseFormatRegistry, researchModeFor } from "./formats.js";
import { resolvePageRules } from "./pageRules.js";
import { demoteHeadings, modifiersFor, renderResearchBrief } from "./researchBrief.js";
import { testFormats } from "./__testutil__/formats.js";
import type { LinkTarget } from "./links/inventory.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (p: string) => readFileSync(join(repoRoot, p), "utf-8");

describe("research modes (D60)", () => {
  it("gives every shipped format a research mode with a playbook on disk", () => {
    const reg = testFormats();
    for (const f of reg.formats) {
      const mode = researchModeFor(reg, f);
      expect(mode.slug).toBe(f.researchMode);
      expect(existsSync(join(repoRoot, mode.playbook)), `${f.slug} → ${mode.playbook}`).toBe(true);
      expect(mode.briefEvidence.length).toBeGreaterThan(0);
    }
    expect(formatBySlug(reg, "how-to-guide").researchMode).toBe("procedure");
    expect(formatBySlug(reg, "examples").researchMode).toBe("catalog");
  });

  it("rejects a format whose research mode isn't registered", () => {
    const raw = JSON.parse(read("standards/formats.json"));
    raw.formats[0].researchMode = "nonsense";
    expect(() => parseFormatRegistry(raw)).toThrow(/researchMode "nonsense"/);
  });

  it("falls back to the mechanism mode for a registry that predates D60", () => {
    const raw = JSON.parse(read("standards/formats.json"));
    delete raw.researchModes;
    for (const f of raw.formats) delete f.researchMode;
    const reg = parseFormatRegistry(raw);
    expect(researchModeFor(reg, formatBySlug(reg, "how-to-guide")).slug).toBe("mechanism");
  });
});

describe("renderResearchBrief (D60)", () => {
  const reg = testFormats();
  const rules = resolvePageRules(reg, {
    pageRole: "cluster",
    articleType: "how-to-guide",
    searchIntent: "informational",
    funnel: "mofu",
    source: "plan",
  });
  const mode = researchModeFor(reg, rules.format);
  const sibling: LinkTarget = {
    url: "https://example.com/learn/x/what-is-identity-exposure/",
    path: "/learn/x/what-is-identity-exposure/",
    title: "What is Identity Exposure",
    query: "what is identity exposure",
    covers: "Definition / Explainer. A 40–60 word definition",
    status: "planned",
    anchorsUsed: [],
  };
  const md = renderResearchBrief({
    title: "How to Measure Identity Exposure",
    targetKeyword: "how to measure identity exposure",
    rules,
    mode,
    playbook: read(mode.playbook),
    modifiers: read("templates/research/modifiers.md"),
    formatGuide: read("templates/formats/how-to-guide.md"),
    inventory: [sibling],
  });

  it("names the page, its mode and what it must cover", () => {
    expect(md).toContain("**Research mode:** Procedure (`procedure`)");
    expect(md).toContain("## What the page must cover");
    expect(md).toContain("Prerequisites: permissions, tools and access level");
  });

  it("carries the playbook, and only the modifiers for this page's facets", () => {
    expect(md).toContain("## Research playbook: Procedure");
    expect(md).toContain("### Gather this");
    expect(md).toContain("### Role: cluster");
    expect(md).toContain("### Funnel: mofu");
    expect(md).toContain("### Intent: informational");
    expect(md).not.toContain("### Role: hub");
    expect(md).not.toContain("### Funnel: bofu");
  });

  it("lists neighbouring pages as owned elsewhere", () => {
    expect(md).toContain("## Owned by other pages");
    expect(md).toContain('**What is Identity Exposure** (query: "what is identity exposure")');
  });

  it("puts the company position in as context, never as the angle", () => {
    const withBrief = renderResearchBrief({
      title: "t",
      rules,
      mode,
      playbook: "",
      modifiers: "",
      formatGuide: "",
      inventory: [],
      brief: {
        themeName: "x",
        workingTitle: "t",
        primaryQueryTarget: "t",
        persona: "the practitioner who owns this problem day to day (placeholder — refine at enrichment)",
        buyingStage: "consideration",
        representativeSubQueries: [],
        h2Outline: ["A passage"],
        evidence: { proprietary: [], external: [{ requirement: "The exact command for each step." }], quotableStatCandidate: "" },
        differentiationAngle: "",
        companyPosition: "Must own the definitional SERP for its category.",
        internalLinks: { hub: "", siblings: [] },
        lengthBand: { min: 1, max: 2 },
        schemaTypes: [],
        priorityScore: 1,
      },
    });
    expect(withBrief).toContain("## The company's position (context, not evidence)");
    expect(withBrief).toContain("The exact command for each step.");
    // A placeholder persona is not passed on as if it were real.
    expect(withBrief).not.toContain("placeholder");
  });
});

describe("markdown helpers", () => {
  it("demotes headings and drops the H1", () => {
    expect(demoteHeadings("# Title\n\n## A\n### B\ntext", 1)).toBe("### A\n#### B\ntext");
  });

  it("picks modifier sections by facet", () => {
    const rules = resolvePageRules(testFormats(), undefined);
    expect(modifiersFor("## Role: cluster\n\nDeep.\n\n## Role: hub\n\nRoute.", rules).join("\n")).toContain("Deep.");
  });
});
