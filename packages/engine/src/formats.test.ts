import { describe, expect, it } from "vitest";
import {
  faqRangeFor,
  formatBySlug,
  parseFormatRegistry,
  resolveFormat,
  schemaTypesForFormat,
  takeawaysFor,
  facetWarnings,
} from "./formats.js";
import { testFormats } from "./__testutil__/formats.js";

const F = testFormats;
const slug = (raw: string) => resolveFormat(F(), raw)?.slug;

describe("format registry (D45)", () => {
  it("parses the shipped formats.json: 23 formats, Explainer merged", () => {
    expect(F().formats).toHaveLength(23);
    expect(slug("Explainer")).toBe("definition-explainer");
    expect(slug("Definition / Explainer")).toBe("definition-explainer");
  });

  it("resolves every label in the Saporo plan, and nothing fuzzy", () => {
    const labels = [
      "Pillar Guide", "Definition / Explainer", "Explainer", "Deep-dive", "How-to Guide", "Framework",
      "Template", "Checklist", "Comparison (Concept)", "Comparison (Vendor)", "Alternatives",
      "Best Practices", "Assessment Guide", "Buyer's Guide", "Metrics Guide", "Stats / Data",
      "Original Research", "Examples", "Thought Leadership", "Tools Listicle", "Solution Page",
      "Use Case", "Integration Page", "Offer / Landing Page",
    ];
    for (const l of labels) expect(slug(l), l).toBeTruthy();
    expect(slug("Interpretive Dance")).toBeUndefined();
    expect(slug("")).toBeUndefined();
  });

  it("rejects a malformed registry with the field named", () => {
    expect(() => parseFormatRegistry({})).toThrow(/formats/);
    expect(() =>
      parseFormatRegistry({ formats: [{ slug: "x", lengthBand: { min: 5, max: 1 } }] }),
    ).toThrow(/x\.lengthBand/);
    expect(() =>
      parseFormatRegistry({
        formats: [
          { slug: "x", lengthBand: { min: 1, max: 2 } },
          { slug: "x", lengthBand: { min: 1, max: 2 } },
        ],
      }),
    ).toThrow(/duplicate/);
  });
});

describe("FAQ ranges (D49): role > format > funnel > default", () => {
  const faq = (s: string, role: "pillar" | "hub" | "cluster", funnel: "tofu" | "mofu" | "bofu") =>
    faqRangeFor(F(), formatBySlug(F(), s), role, funnel);

  it("gives pillars 5–8 and hubs 4–6 whatever their format", () => {
    expect(faq("pillar-guide", "pillar", "tofu")).toMatchObject({ min: 5, max: 8 });
    expect(faq("definition-explainer", "hub", "tofu")).toMatchObject({ min: 4, max: 6 });
    expect(faq("stats-data", "hub", "tofu")).toMatchObject({ min: 4, max: 6 });
  });

  it("gives thought leadership and stats pages no FAQ", () => {
    expect(faq("thought-leadership", "cluster", "tofu")).toMatchObject({ min: 0, max: 0 });
    expect(faq("stats-data", "cluster", "tofu")).toMatchObject({ min: 0, max: 0 });
  });

  it("gives BOFU pages 4–6 and everything else 3–5, optionally none", () => {
    expect(faq("tools-listicle", "cluster", "bofu")).toMatchObject({ min: 4, max: 6 });
    expect(faq("buyers-guide", "cluster", "bofu")).toMatchObject({ min: 4, max: 6 });
    expect(faq("comparison-concept", "cluster", "mofu")).toEqual({ min: 3, max: 5, optional: true });
    expect(faq("how-to-guide", "cluster", "mofu")).toEqual({ min: 3, max: 5, optional: true });
  });
});

describe("takeaways, schema, warnings", () => {
  it("keeps exactly 3 takeaways except for stats and research", () => {
    expect(takeawaysFor(F(), formatBySlug(F(), "deep-dive"))).toEqual({ min: 3, max: 3 });
    expect(takeawaysFor(F(), formatBySlug(F(), "stats-data"))).toEqual({ min: 8, max: 12 });
    expect(takeawaysFor(F(), formatBySlug(F(), "original-research"))).toEqual({ min: 5, max: 8 });
  });

  it("adds routing types for hubs and FAQPage only with an FAQ", () => {
    const hub = schemaTypesForFormat(F(), formatBySlug(F(), "definition-explainer"), "hub", "tofu");
    expect(hub).toEqual(expect.arrayContaining(["CollectionPage", "ItemList", "FAQPage", "DefinedTerm"]));
    const tl = schemaTypesForFormat(F(), formatBySlug(F(), "thought-leadership"), "cluster", "tofu");
    expect(tl).not.toContain("FAQPage");
  });

  it("flags the spec's mis-tagged combinations without blocking", () => {
    expect(facetWarnings(formatBySlug(F(), "pillar-guide"), "cluster", "tofu", "informational")).toHaveLength(1);
    expect(facetWarnings(formatBySlug(F(), "definition-explainer"), "cluster", "bofu", "informational")).toHaveLength(1);
    expect(facetWarnings(formatBySlug(F(), "comparison-vendor"), "cluster", "tofu", "commercial")).toHaveLength(1);
    expect(facetWarnings(formatBySlug(F(), "offer-landing-page"), "hub", "bofu", "informational")).toHaveLength(1);
    // A hub with a non-routing type is the operator's decision (D47), not a mis-tag.
    expect(facetWarnings(formatBySlug(F(), "deep-dive"), "hub", "mofu", "informational")).toEqual([]);
  });

  it("marks vendor formats for sign-off and product formats as needing a fact sheet", () => {
    for (const s of ["tools-listicle", "alternatives", "comparison-vendor"]) {
      const f = formatBySlug(F(), s);
      expect(f.competitorMode).toBe("vendor");
      expect(f.signoff).toBe(true);
    }
    expect(formatBySlug(F(), "integration-page").requires?.factSheet).toContain("{slug}");
    expect(formatBySlug(F(), "offer-landing-page").producible).toBe(false);
  });
});
