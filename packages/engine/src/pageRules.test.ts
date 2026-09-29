import { describe, expect, it } from "vitest";
import {
  ctaUrlProblem,
  facetFrontmatter,
  mergeCtaSettings,
  parseOutlineFacets,
  renderPageSpec,
  resolvePageRules,
  stampFrontmatter,
  type CtaSettings,
} from "./pageRules.js";
import { ctaProblems, outlineGate, writeGate } from "./gates.js";
import { testFormats } from "./__testutil__/formats.js";
import type { ArticleFacets } from "./types.js";

const CTAS: CtaSettings = {
  tofu: { label: "Download the overview", url: "https://cdn.example.com/overview.pdf" },
  mofu: { label: "Free assessment", url: "https://www.example.com/assessment" },
  bofu: { label: "Book a demo", url: "https://www.example.com/demo" },
};

const facets = (over: Partial<ArticleFacets> = {}): ArticleFacets => ({
  pageRole: "cluster",
  searchIntent: "informational",
  articleType: "comparison-concept",
  funnel: "mofu",
  source: "plan",
  ...over,
});

describe("resolvePageRules (D45–D50)", () => {
  it("picks the funnel's CTA and lists the others as never-the-close", () => {
    const r = resolvePageRules(testFormats(), facets(), { ctas: CTAS });
    expect(r.cta?.url).toBe("https://www.example.com/assessment");
    expect(r.otherCtaUrls.sort()).toEqual(["https://cdn.example.com/overview.pdf", "https://www.example.com/demo"]);
    expect(r.faq).toEqual({ min: 3, max: 5, optional: true });
    expect(r.takeaways).toEqual({ min: 3, max: 3 });
  });

  it("falls back to the generic format with no facets and no CTA", () => {
    const r = resolvePageRules(testFormats(), undefined, { ctas: CTAS });
    expect(r.format.slug).toBe("generic");
    expect(r.cta).toBeUndefined();
  });
});

describe("closing CTA gate (D50)", () => {
  const rules = resolvePageRules(testFormats(), facets(), { ctas: CTAS });
  const md = (closing: string) =>
    `---\ntitle: T\n---\n# T\n\nIntro.\n\n## Key Takeaways\n\n- a\n\n## Body\n\nText.\n\n## What to do next\n\n${closing}\n\n## Frequently Asked Questions\n\n### Q?\n\nA [demo](https://www.example.com/demo).\n`;

  it("passes when the last content section links this funnel's CTA", () => {
    expect(ctaProblems(md("[Get a free assessment](https://www.example.com/assessment)."), rules)).toEqual([]);
  });

  it("fails a missing CTA, and another funnel's CTA used as the close", () => {
    expect(ctaProblems(md("Talk to us."), rules)[0]).toContain("does not link");
    const wrong = ctaProblems(md("[Assessment](https://www.example.com/assessment) or [a demo](https://www.example.com/demo)."), rules);
    expect(wrong).toHaveLength(1);
    expect(wrong[0]).toContain("another funnel's CTA");
  });

  it("does nothing until CTAs are configured", () => {
    expect(ctaProblems(md("Talk to us."), resolvePageRules(testFormats(), facets()))).toEqual([]);
  });
});

describe("outline Page Facets", () => {
  const outline = (body: string) => `# Strategy\n\n## Page Facets\n${body}\n\n## Keywords\n- Primary: x\n`;

  it("parses labels and slugs into registry facets", () => {
    const { facets: f, problems } = parseOutlineFacets(
      outline("- Page role: cluster\n- Article type: Comparison (Concept)\n- Search intent: informational\n- Funnel: MOFU"),
      testFormats(),
    );
    expect(problems).toEqual([]);
    expect(f).toMatchObject({ pageRole: "cluster", articleType: "comparison-concept", funnel: "mofu", source: "strategist" });
  });

  it("names every bad value", () => {
    const { facets: f, problems } = parseOutlineFacets(
      outline("- Page role: blog\n- Article type: Listicle of doom\n- Search intent: vibes\n- Funnel: middle"),
      testFormats(),
    );
    expect(f).toBeUndefined();
    expect(problems).toHaveLength(4);
    expect(parseOutlineFacets("# nothing", testFormats()).problems[0]).toContain("Missing");
  });
});

describe("per-page gate ranges (D49)", () => {
  const outlineWith = (faqs: number) =>
    [
      "# Strategy",
      "## Angle",
      "> x",
      "## Thesis",
      "Identity exposure is a condition and identity risk is the likelihood that condition gets exploited.",
      "## Keywords",
      "- Primary: identity exposure vs identity risk",
      "## Target Entities (for `mentions` array)",
      "- x",
      "## FAQ Candidates",
      ...Array.from({ length: faqs }, (_, i) => `${i + 1}. Question ${i}?`),
      "## External Citations to Use",
      "1. x",
      "## Full Outline",
      "### H2: A",
      "### H2: B",
      "### H2: C",
      "### H2: D",
    ].join("\n\n");

  it("uses the page's FAQ range, and allows none on an optional page", () => {
    const hub = resolvePageRules(testFormats(), facets({ pageRole: "hub", articleType: "definition-explainer", funnel: "tofu" }));
    expect(outlineGate({ outline: outlineWith(3), page: hub }).problems.join(" ")).toContain("need 4-6");
    expect(outlineGate({ outline: outlineWith(5), page: hub }).ok).toBe(true);
    const cluster = resolvePageRules(testFormats(), facets());
    expect(outlineGate({ outline: outlineWith(0), page: cluster }).ok).toBe(true);
    const tl = resolvePageRules(testFormats(), facets({ articleType: "thought-leadership", funnel: "tofu" }));
    expect(outlineGate({ outline: outlineWith(3), page: tl }).problems.join(" ")).toContain("no FAQ");
  });

  it("requires Page Facets only when the article has none", () => {
    const g = outlineGate({ outline: outlineWith(3), facetRegistry: testFormats() });
    expect(g.problems.join(" ")).toContain("Page Facets");
  });

  it("drops the FAQ requirement for formats without one", () => {
    const tl = resolvePageRules(testFormats(), facets({ articleType: "thought-leadership", funnel: "tofu" }));
    const article = `---\ntitle: T\nslug: t\nauthor: A\npublish_date: 2026-09-29\nmeta_description: m\nprimary_keyword: k\ncanonical_url: https://x\n---\n\n# T\n\n${"word ".repeat(60)}\n\n## Key Takeaways\n\n- a\n`;
    expect(writeGate({ article, page: tl }).ok).toBe(true);
    expect(writeGate({ article }).problems.join(" ")).toContain("FAQ section missing");
  });
});

describe("frontmatter stamping and page.md", () => {
  it("replaces or appends keys without touching the rest", () => {
    const md = `---\ntitle: "Keep me"\narticle_type: ""\n---\n\n# Body\n`;
    const out = stampFrontmatter(md, { article_type: "deep-dive", canonical_url: "https://x/learn/a/" });
    expect(out).toContain(`title: "Keep me"`);
    expect(out).toContain(`article_type: "deep-dive"`);
    expect(out).toContain(`canonical_url: "https://x/learn/a/"`);
    expect(out.endsWith("\n# Body\n")).toBe(true);
    expect(stampFrontmatter("# no frontmatter", { a: "b" })).toBe("# no frontmatter");
  });

  it("stamps facets and the canonical URL the worker owns", () => {
    const r = resolvePageRules(testFormats(), facets(), { canonicalUrl: "https://www.example.com/learn/p/h/x/" });
    expect(facetFrontmatter(r)).toEqual({
      page_role: "cluster",
      search_intent: "informational",
      article_type: "comparison-concept",
      funnel: "mofu",
      canonical_url: "https://www.example.com/learn/p/h/x/",
    });
  });

  it("renders the rules, CTA, breadcrumbs and guide into page.md", () => {
    const r = resolvePageRules(testFormats(), facets(), {
      ctas: CTAS,
      path: "/learn/p/h/x/",
      breadcrumbs: [
        { name: "Home", url: "https://www.example.com/" },
        { name: "X", url: "https://www.example.com/learn/p/h/x/" },
      ],
    });
    const md = renderPageSpec(r, "GUIDE BODY");
    expect(md).toContain("Comparison (Concept) (`comparison-concept`)");
    expect(md).toContain("Free assessment — https://www.example.com/assessment");
    expect(md).toContain("Home <https://www.example.com/> › X");
    expect(md).toContain("GUIDE BODY");
    expect(renderPageSpec(resolvePageRules(testFormats(), undefined), "g")).toContain("no facets yet");
  });
});

describe("CTA settings", () => {
  it("seeds from company.yaml and lets a saved value win per stage", () => {
    const merged = mergeCtaSettings(
      { ctas: { tofu: { label: "Seed", url: "https://seed/pdf" }, mofu: { url: "https://seed/mofu" } } },
      { mofu: { label: "Saved", url: "https://saved/mofu" }, bofu: { label: "no url" } },
    );
    expect(merged.tofu?.url).toBe("https://seed/pdf");
    expect(merged.mofu).toEqual({ label: "Saved", url: "https://saved/mofu" });
    expect(merged.bofu).toBeUndefined();
  });

  it("accepts only http(s) URLs", () => {
    expect(ctaUrlProblem("https://www.saporo.io/demo")).toBeNull();
    expect(ctaUrlProblem("javascript:alert(1)")).toContain("http");
    expect(ctaUrlProblem("not a url")).toContain("valid");
  });
});
