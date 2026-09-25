import { describe, expect, it } from "vitest";
import { assignSlugs, reduceTitle, type SlugPlanInput } from "./slug.js";

const row = (externalId: string, title: string, subtopicId: string | null = "P01-S01"): SlugPlanInput => ({
  externalId,
  title,
  pillarId: "P01",
  subtopicId,
});

describe("reduceTitle", () => {
  it("leaves a short title alone", () => {
    expect(reduceTitle("What is Identity Exposure")).toBe("what-is-identity-exposure");
  });

  it("sheds filler from the LEFT so the distinguishing tail survives", () => {
    const long = "The Complete Guide to Privileged Access Management for Healthcare Providers";
    const out = reduceTitle(long);
    expect(out.length).toBeLessThanOrEqual(60);
    // The tail is what distinguishes this from the financial-services sibling.
    expect(out).toContain("healthcare");
  });

  it("keeps at least two words even when everything is filler", () => {
    expect(reduceTitle("The Complete Guide", 5).split("-").length).toBeGreaterThanOrEqual(2);
  });
});

describe("assignSlugs", () => {
  it("assigns the plain slug when there is no conflict", () => {
    const { assignments, problems } = assignSlugs([row("A1", "What is Identity Exposure")]);
    expect(problems).toEqual([]);
    expect(assignments[0]).toMatchObject({
      externalId: "A1",
      slug: "what-is-identity-exposure",
      strategy: "title",
    });
  });

  it("keeps two long sibling titles apart instead of colliding on truncation", () => {
    const rows = [
      row("A1", "The Complete Guide to Privileged Access Management for Healthcare Providers"),
      row("A2", "The Complete Guide to Privileged Access Management for Financial Services"),
    ];
    const { assignments, problems } = assignSlugs(rows);
    expect(problems).toEqual([]);
    const slugs = assignments.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(2);
    for (const s of slugs) expect(s.length).toBeLessThanOrEqual(60);
    expect(slugs.some((s) => s.includes("healthcare"))).toBe(true);
    expect(slugs.some((s) => s.includes("financial"))).toBe(true);
  });

  it("falls back to the workbook id when titles are genuinely identical", () => {
    const rows = [row("P01-S01-A01", "Attack Path Analysis"), row("P02-S03-A07", "Attack Path Analysis")];
    const { assignments, problems } = assignSlugs(rows);
    expect(problems).toEqual([]);
    expect(new Set(assignments.map((a) => a.slug)).size).toBe(2);
    expect(assignments.some((a) => a.slug.includes("p02-s03-a07"))).toBe(true);
    expect(assignments.every((a) => a.collidedWith?.length === 1)).toBe(true);
  });

  it("terminates and stays unique across a large identical-title group", () => {
    const rows = Array.from({ length: 12 }, (_, i) => row(`P01-S01-A${i + 1}`, "Identity Hygiene"));
    const { assignments, problems } = assignSlugs(rows);
    expect(problems).toEqual([]);
    expect(new Set(assignments.map((a) => a.slug)).size).toBe(12);
  });

  it("reports a collision with an existing article rather than mutating the slug", () => {
    const { assignments, problems } = assignSlugs(
      [row("A1", "Attack Path Analysis")],
      new Set(["attack-path-analysis"]),
    );
    // The slug is NOT silently suffixed — the operator decides skip/rename/link.
    expect(assignments[0]?.slug).toBe("attack-path-analysis");
    expect(problems.join(" ")).toContain("already belongs to an existing article");
  });

  it("honours an operator override", () => {
    const { assignments } = assignSlugs(
      [row("A1", "What is Identity Exposure")],
      new Set(),
      new Map([["A1", "identity-exposure-explained"]]),
    );
    expect(assignments[0]).toMatchObject({
      slug: "identity-exposure-explained",
      strategy: "manual",
    });
  });

  it("is order-independent: shuffling the input yields the same slug per row", () => {
    const rows = [
      row("A1", "The Complete Guide to Privileged Access Management for Healthcare Providers"),
      row("A2", "The Complete Guide to Privileged Access Management for Financial Services"),
      row("A3", "What is Identity Exposure"),
    ];
    const forward = assignSlugs(rows).assignments;
    const reverse = assignSlugs([...rows].reverse()).assignments;
    const asMap = (a: typeof forward) => Object.fromEntries(a.map((x) => [x.externalId, x.slug]));
    expect(asMap(reverse)).toEqual(asMap(forward));
  });

  it("returns assignments in input order regardless of grouping", () => {
    const rows = [row("A1", "Alpha"), row("A2", "Beta"), row("A3", "Alpha")];
    const { assignments } = assignSlugs(rows);
    expect(assignments.map((a) => a.externalId)).toEqual(["A1", "A2", "A3"]);
  });

  it("never exceeds the 60-character ceiling", () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      row(`P0${i}-S01-A01`, "Preemptive Identity Exposure Management for Large Multinational Hybrid Enterprises"),
    );
    for (const a of assignSlugs(rows).assignments) {
      expect(a.slug.length).toBeLessThanOrEqual(60);
    }
  });
});
