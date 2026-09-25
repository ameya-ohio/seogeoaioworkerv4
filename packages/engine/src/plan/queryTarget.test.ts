import { describe, expect, it } from "vitest";
import { deriveQueryTarget, MAX_QUERY_TARGET_WORDS } from "./queryTarget.js";

const t = (title: string, ctx = {}) => deriveQueryTarget(title, ctx);

describe("deriveQueryTarget (D32)", () => {
  it("passes a comparison title through intact — it is already a real query", () => {
    expect(t("Identity Exposure vs Identity Risk")).toEqual({
      target: "identity exposure vs identity risk",
      needsReview: false,
    });
  });

  it("normalizes 'versus' and 'vs.' to the form people type", () => {
    expect(t("Attack Paths versus Vulnerabilities").target).toBe("attack paths vs vulnerabilities");
    expect(t("ADCS vs. AD CS").target).toContain("vs");
  });

  it("keeps interrogatives people actually type", () => {
    expect(t("What is Identity Exposure").target).toBe("what is identity exposure");
    expect(t("How to Harden Active Directory").target).toBe("how to harden active directory");
  });

  it("drops headline interrogatives nobody types", () => {
    expect(t("Why Attack Paths Beat Vulnerability Counts").target).toBe(
      "attack paths beat vulnerability counts",
    );
    expect(t("When to Run an Identity Assessment").target).toBe("run an identity assessment");
  });

  it("keeps the subject and drops a colon subtitle", () => {
    expect(t("Identity Tiering: The Complete Guide to Tier 0").target).toBe("identity tiering");
    expect(t("Attack Paths: Analysis, Mapping & Management").target).toBe("attack paths");
  });

  it("keeps the full title when the left of the colon is too thin", () => {
    // "PIEM" alone is one word — below the floor, so the whole title is used.
    expect(t("PIEM: What Preemptive Identity Exposure Management Means").target).not.toBe("PIEM");
  });

  it("strips spaced-dash subtitles but not hyphenated words", () => {
    expect(t("Shadow Admins — A Practical Guide").target).toBe("shadow admins");
    expect(t("Multi-Cloud Identity Security").target).toBe("multi-cloud identity security");
  });

  it("strips trailing filler and year suffixes", () => {
    expect(t("Kerberoasting, Explained").target).toBe("kerberoasting");
    expect(t("Identity Security Metrics (2026)").target).toBe("identity security metrics");
  });

  it("preserves acronyms in source case while lowercasing prose", () => {
    expect(t("How to Secure ADCS and SMB Shares").target).toBe("how to secure ADCS and SMB shares");
    expect(t("NIS2 Compliance for Identity Teams").target).toBe("NIS2 compliance for identity teams");
  });

  it("turns an ampersand into a word rather than dropping it", () => {
    expect(t("Chokepoints & Blast Radius").target).toBe("chokepoints and blast radius");
  });

  it("never exceeds the 7-word ceiling the brief parser enforces", () => {
    const long = "What Causes Identity Exposure in Large Hybrid Active Directory and Entra Environments Today";
    const r = t(long, { subtopicName: "Identity Exposure" });
    expect(r.target.split(" ").length).toBeLessThanOrEqual(MAX_QUERY_TARGET_WORDS);
  });

  it("sheds stopwords before meaningful words when shrinking", () => {
    const r = t("The Complete Guide to Securing All of Your Service Accounts");
    expect(r.target.split(" ").length).toBeLessThanOrEqual(MAX_QUERY_TARGET_WORDS);
    expect(r.target).toContain("service accounts");
  });

  it("flags for human review and falls back when it cannot derive a query", () => {
    const r = t("Overview", { subtopicName: "Identity Exposure" });
    expect(r.needsReview).toBe(true);
    expect(r.target).toBe("identity exposure");
  });

  it("falls back to the head term for a pillar row with no subtopic", () => {
    const r = t("?", { headTerm: "identity exposure management" });
    expect(r.needsReview).toBe(true);
    expect(r.target).toBe("identity exposure management");
  });

  it("is total: an empty title still returns a usable result", () => {
    expect(t("", { subtopicName: "Widget Exposure" })).toEqual({
      target: "widget exposure",
      needsReview: true,
    });
    expect(t("")).toEqual({ target: "", needsReview: true });
  });
});
