import { describe, expect, it } from "vitest";
import { applyEnrichment, parsePlanEnrichment, type EnrichmentAllowlist } from "./parse.js";

const allowed: EnrichmentAllowlist = {
  hub: "What is Widget Exposure",
  siblings: ["How to Harden Widgets"],
  children: [],
  concepts: ["Widget exposure / reduce widget exposure", "1,000+ hardening controls"],
};

const good = {
  persona: "the identity engineer who owns Active Directory",
  buying_stage: "consideration",
  primary_query_target: "widget exposure vs widget risk",
  query_target_alternates: ["widget risk vs exposure"],
  required_passages: [
    "What widget exposure is, answer-first",
    "How exposure differs from risk",
    "Which one to measure, and why",
  ],
  representative_questions: ["Is exposure the same as risk?"],
  differentiation_angle: "Most pages conflate the two; this one separates them operationally.",
  proprietary_evidence: ["Widget exposure / reduce widget exposure"],
  external_evidence: [
    "A dated, attributable statistic on exposure growth, cited to the page that states it.",
  ],
  quotable_stat_candidate: "A single sourced sentence contrasting exposure and risk.",
};

const parse = (obj: unknown) => parsePlanEnrichment(JSON.stringify(obj), allowed);

describe("parsePlanEnrichment", () => {
  it("accepts a well-formed enrichment", () => {
    const { value, problems } = parse(good);
    expect(problems).toEqual([]);
    expect(value?.primaryQueryTarget).toBe("widget exposure vs widget risk");
    expect(value?.requiredPassages).toHaveLength(3);
  });

  it("reads JSON out of a fenced block with prose around it", () => {
    const wrapped = "Here you go:\n```json\n" + JSON.stringify(good) + "\n```\nHope that helps.";
    expect(parsePlanEnrichment(wrapped, allowed).problems).toEqual([]);
  });

  it("rejects a non-JSON response", () => {
    expect(parsePlanEnrichment("I cannot do that", allowed).problems[0]).toContain("not a JSON object");
  });

  describe("D34 — evidence requirements, never evidence", () => {
    it("rejects a percentage in external evidence", () => {
      const { problems } = parse({
        ...good,
        external_evidence: ["64% of orgs have excessive permissions"],
      });
      expect(problems.join(" ")).toContain("REQUIREMENTS, not facts");
    });

    it("rejects a URL in external evidence", () => {
      const { problems } = parse({
        ...good,
        external_evidence: ["See https://example.com/report for the number"],
      });
      expect(problems.join(" ")).toContain("REQUIREMENTS, not facts");
    });

    it("rejects a bare year, which is an unsourced date claim", () => {
      const { problems } = parse({ ...good, external_evidence: ["A 2025 Gartner finding"] });
      expect(problems.join(" ")).toContain("REQUIREMENTS, not facts");
    });

    it("rejects money and multiplier figures", () => {
      for (const bad of ["costs $4.5 million per breach", "a 3x increase", "1.2 billion accounts"]) {
        expect(parse({ ...good, external_evidence: [bad] }).problems.length).toBeGreaterThan(0);
      }
    });

    it("rejects a stated statistic in the quotable candidate", () => {
      const { problems } = parse({
        ...good,
        quotable_stat_candidate: "Saporo reduces misconfigurations by 64%",
      });
      expect(problems.join(" ")).toContain("SHAPE of a claim");
    });

    it("rejects a figure smuggled into the differentiation angle", () => {
      const { problems } = parse({
        ...good,
        differentiation_angle: "We cut exposure 40% faster than anyone else",
      });
      expect(problems.join(" ")).toContain("never supplies the proof");
    });

    it("accepts a requirement that describes the evidence without stating it", () => {
      expect(
        parse({
          ...good,
          external_evidence: ["A named vendor study quantifying permission sprawl, cited to source"],
        }).problems,
      ).toEqual([]);
    });
  });

  describe("proprietary allowlist", () => {
    it("rejects a proprietary claim that is not in the concept list", () => {
      const { problems } = parse({
        ...good,
        proprietary_evidence: ["Our unbeatable 99.99% uptime guarantee"],
      });
      expect(problems.join(" ")).toContain("only name claims from the supplied concept list");
    });

    it("matches a concept loosely enough to survive rewording", () => {
      expect(parse({ ...good, proprietary_evidence: ["1,000+ hardening controls"] }).problems).toEqual([]);
    });
  });

  describe("D32 — query targets stay real queries", () => {
    it("rejects a target over the word ceiling", () => {
      const { problems } = parse({
        ...good,
        primary_query_target: "what exactly is widget exposure and how does it differ from risk",
      });
      expect(problems.join(" ")).toContain("at most 7");
    });

    it("rejects a target that is a sentence", () => {
      expect(parse({ ...good, primary_query_target: "What is widget exposure?" }).problems.join(" ")).toContain(
        "a sentence, not a query",
      );
    });

    it("rejects over-long alternates", () => {
      const { problems } = parse({
        ...good,
        query_target_alternates: ["this is far too long to be anything like a real search query"],
      });
      expect(problems.join(" ")).toContain("too long to be real queries");
    });
  });

  describe("link allowlist", () => {
    it("rejects a sibling outside the plan", () => {
      const { problems } = parse({ ...good, siblings: ["Some Page That Does Not Exist"] });
      expect(problems.join(" ")).toContain("only reference pages in this plan");
    });

    it("accepts a sibling from the allowlist", () => {
      expect(parse({ ...good, siblings: ["How to Harden Widgets"] }).problems).toEqual([]);
    });
  });

  it("requires at least three required passages", () => {
    const { problems } = parse({ ...good, required_passages: ["only one"] });
    expect(problems.join(" ")).toContain("at least 3");
  });

  it("collects every problem at once, so one retry can fix them all", () => {
    const { problems } = parse({
      ...good,
      external_evidence: ["90% of orgs"],
      siblings: ["Nonexistent"],
      required_passages: ["one"],
    });
    expect(problems.length).toBeGreaterThanOrEqual(3);
  });
});

describe("applyEnrichment", () => {
  const base = {
    persona: "placeholder",
    buyingStage: "consideration",
    primaryQueryTarget: "widget exposure",
    representativeSubQueries: [] as string[],
    h2Outline: ["deterministic passage"],
    differentiationAngle: "deterministic angle",
    lengthBand: { min: 800, max: 1200, justification: "Format: Definition" },
    schemaTypes: ["BlogPosting", "BreadcrumbList"],
    evidence: {
      proprietary: ["tie-in"],
      external: [{ requirement: "deterministic requirement" }],
      quotableStatCandidate: "deterministic candidate",
    },
  };

  it("overlays the enriched fields", () => {
    const { value } = parse(good);
    const out = applyEnrichment(base, value!);
    expect(out.persona).toContain("identity engineer");
    expect(out.h2Outline).toHaveLength(3);
    expect(out.evidence.external[0]?.requirement).toContain("dated, attributable");
  });

  it("never touches the length band or schema types", () => {
    const { value } = parse(good);
    const out = applyEnrichment(base, value!) as typeof base;
    expect(out.lengthBand).toEqual(base.lengthBand);
    expect(out.schemaTypes).toEqual(base.schemaTypes);
  });

  it("leaves the deterministic brief intact when enrichment gave nothing", () => {
    expect(applyEnrichment(base, {})).toEqual(base);
  });
});
