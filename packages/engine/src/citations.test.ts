import { describe, expect, it } from "vitest";
import {
  buildCitationReport,
  buildLinkReport,
  extractExternalUrls,
  extractInternalLinks,
  parseResearchCitations,
  type CitationCheckResult,
} from "./citations.js";

const NOTES = `# Research Notes: pam healthcare

## Topic Summary
Words about the topic.

## Authoritative Sources
1. **BloodHound Enterprise / Attack Path Management research** — SpecterOps, 2026. https://www.quest.com/products/attack-path-management-software/
   Key claim: Over 70% of Active Directory environments contain an exploitable path from any authenticated user to Domain Admin
   Supporting quote: "not actually on the page"
2. **Cost of a Data Breach Report 2026** — IBM Security, 2026. https://www.ibm.com/reports/data-breach
   Key claim: Healthcare averaged $6.64M per breach, the costliest industry for 13 consecutive years
3. **Microsoft Enterprise Access Model** — Microsoft Learn, 2026. https://learn.microsoft.com/security/privileged-access-workstations/privileged-access-access-model
4. **Dead page** — Gone Inc, 2026. https://gone.example.com/404

## Statistics & Data Points
- Healthcare breach cost averaged $6.64M in 2026 — Source #2
- ~17,000 attack paths severed per choke point on average — Source citation #1 from Authoritative Sources
- A stat with no reference at all

## Quotes Worth Including
- "Whoever controls Tier 0 controls the identity estate" — Microsoft guidance, source #3
- "A quote citing a ghost" — Nobody, source #9
`;

describe("parseResearchCitations", () => {
  it("parses numbered sources with claims, quotes, and stat/quote references", () => {
    const parsed = parseResearchCitations(NOTES);
    expect(parsed.sources).toHaveLength(4);
    expect(parsed.sources[0]?.url).toBe(
      "https://www.quest.com/products/attack-path-management-software/",
    );
    expect(parsed.sources[0]?.claim).toContain("Over 70%");
    expect(parsed.sources[0]?.quote).toBe("not actually on the page");
    expect(parsed.sources[2]?.claim).toBeUndefined();

    const kinds = parsed.claims.map((c) => `${c.kind}:${c.sourceN}`);
    expect(kinds).toContain("key_claim:1");
    expect(kinds).toContain("key_claim:2");
    expect(kinds).toContain("statistic:2");
    expect(kinds).toContain("statistic:1");
    expect(kinds).toContain("quote:3");
    // Ghost reference is reported, unreferenced stat is simply not a claim.
    expect(parsed.problems.join(" ")).toContain("#9");
  });

  it("reports a missing sources section", () => {
    expect(parseResearchCitations("# notes\nno sources").problems[0]).toContain(
      "Authoritative Sources",
    );
  });

  it("never treats absence markers as attributed claims (Session-15 false positive)", () => {
    const notes = `# n

## Authoritative Sources
1. **Report** — Org, 2026. https://a.example.com/r
   Key claim: No reliable stat found for the exact percentage of hospitals affected
2. **Real** — Org, 2026. https://b.example.com/r
   Key claim: 48% of healthcare breaches involved ransomware

## Statistics & Data Points
- No reliable stat found for IoMT device compromise rates — Source #1
- 48% ransomware involvement — Source #2
- Could not verify the 93% figure — Source #1
`;
    const parsed = parseResearchCitations(notes);
    const texts = parsed.claims.map((c) => c.text);
    expect(texts).toEqual(["48% of healthcare breaches involved ransomware", "48% ransomware involvement"]);
  });
});

describe("buildCitationReport", () => {
  it("counts verified sources as fetched-and-fully-supported only", () => {
    const parsed = parseResearchCitations(NOTES);
    const results: CitationCheckResult[] = [
      // Source 1: the SpecterOps-via-Quest failure — claim not on the page.
      { sourceN: 1, url: parsed.sources[0]?.url ?? "", claim: "70%", kind: "key_claim", verdict: "unsupported" },
      { sourceN: 2, url: parsed.sources[1]?.url ?? "", claim: "$6.64M", kind: "key_claim", verdict: "supported" },
      // Source 3 reachable, claim-less.
      { sourceN: 3, url: parsed.sources[2]?.url ?? "", claim: "(reachability)", kind: "key_claim", verdict: "supported" },
    ];
    const report = buildCitationReport(parsed.sources, results);
    expect(report.verifiedSourceCount).toBe(2);
    expect(report.unsupportedCount).toBe(1);
    expect(report.verifiedUrls).not.toContain(parsed.sources[0]?.url);
  });

  it("does not count sources that were never checked", () => {
    const parsed = parseResearchCitations(NOTES);
    const report = buildCitationReport(parsed.sources, []);
    expect(report.verifiedSourceCount).toBe(0);
  });
});

describe("pruneUnverifiedCitations (D37 auto-prune)", () => {
  it("cuts failing claims, annotates unreachable sources, keeps everything else", async () => {
    const { pruneUnverifiedCitations, buildCitationReport: build } = await import("./citations.js");
    const parsed = parseResearchCitations(NOTES);
    const results: CitationCheckResult[] = [
      { sourceN: 1, url: parsed.sources[0]?.url ?? "", claim: parsed.sources[0]?.claim ?? "", kind: "key_claim", verdict: "unsupported" },
      { sourceN: 1, url: parsed.sources[0]?.url ?? "", claim: "~17,000 attack paths severed per choke point", kind: "statistic", verdict: "unsupported" },
      { sourceN: 2, url: parsed.sources[1]?.url ?? "", claim: parsed.sources[1]?.claim ?? "", kind: "key_claim", verdict: "supported" },
      { sourceN: 2, url: parsed.sources[1]?.url ?? "", claim: "Healthcare breach cost $6.64M", kind: "statistic", verdict: "supported" },
      { sourceN: 3, url: parsed.sources[2]?.url ?? "", claim: "Whoever controls Tier 0 controls the identity estate", kind: "quote", verdict: "supported" },
      { sourceN: 4, url: parsed.sources[3]?.url ?? "", claim: "(reachability)", kind: "key_claim", verdict: "unreachable", note: "HTTP 404" },
    ];
    const report = build(parsed.sources, results);
    const { notes, removed, report: clean } = pruneUnverifiedCitations(NOTES, report);

    // The failing stat bullet is gone; the supported one stays.
    expect(notes).not.toContain("~17,000 attack paths");
    expect(notes).toContain("Healthcare breach cost averaged $6.64M");
    // The failing key claim is replaced with a do-not-cite marker; its quote line dropped.
    expect(notes).toContain("Key claim: (removed — failed live verification");
    expect(notes).not.toContain("not actually on the page");
    // The unreachable source is annotated, not deleted (numbering preserved).
    expect(notes).toContain("Dead page");
    expect(notes).toContain("[UNREACHABLE — do not cite]");
    // Supported quote survives.
    expect(notes).toContain("Whoever controls Tier 0");

    expect(removed).toHaveLength(3);
    expect(clean.unsupportedCount).toBe(0);
    expect(clean.unreachableCount).toBe(0);
    expect(clean.pruned).toHaveLength(3);
    expect(clean.results.every((r) => r.verdict === "supported")).toBe(true);
  });

  it("is a no-op on a clean report", async () => {
    const { pruneUnverifiedCitations } = await import("./citations.js");
    const parsed = parseResearchCitations(NOTES);
    const clean = buildCitationReport(
      parsed.sources,
      parsed.sources.map((s, i) => ({
        sourceN: s.n, url: s.url, claim: s.claim ?? "(reachability)", kind: "key_claim" as const, verdict: "supported" as const,
      })),
    );
    const out = pruneUnverifiedCitations(NOTES, clean);
    expect(out.notes).toBe(NOTES);
    expect(out.removed).toHaveLength(0);
  });
});

describe("trimExcessClaims (D37 auto-trim)", () => {
  it("strips attribution from trailing sources until the budget fits, keeping the sources", async () => {
    const { trimExcessClaims } = await import("./citations.js");
    const manySources = Array.from({ length: 6 }, (_, i) =>
      [
        `${i + 1}. **Report ${i + 1}** — Org, 2026. https://s${i + 1}.example.com/r`,
        `   Key claim: Claim number ${i + 1} with a figure of ${i + 1}0%`,
        `   Supporting quote: "quote ${i + 1}"`,
      ].join("\n"),
    ).join("\n");
    const stats = Array.from({ length: 6 }, (_, i) => `- Stat ${i + 1}: ${i + 1}0% — Source #${i + 1}`).join("\n");
    const notes = `# n\n\n## Authoritative Sources\n${manySources}\n\n## Statistics & Data Points\n${stats}\n`;

    // 12 claims (6 key + 6 stats) → trim to ≤ 8 by dropping trailing sources.
    const { notes: out, trimmed } = trimExcessClaims(notes, 8);
    const after = parseResearchCitations(out);
    expect(after.claims.length).toBeLessThanOrEqual(8);
    expect(trimmed.length).toBe(12 - after.claims.length);
    // Early sources keep attribution; late ones are demoted to background.
    expect(out).toContain("Key claim: Claim number 1");
    expect(out).not.toContain("Key claim: Claim number 6");
    expect(out).not.toContain("Stat 6");
    // The source entries themselves survive (URL count for the gate intact).
    expect(out).toContain("https://s6.example.com/r");
  });

  it("is a no-op within budget", async () => {
    const { trimExcessClaims } = await import("./citations.js");
    const res = trimExcessClaims(NOTES, 8);
    expect(res.notes).toBe(NOTES);
    expect(res.trimmed).toHaveLength(0);
  });
});

describe("link extraction (D35)", () => {
  const BODY = `Per [IBM's report](https://www.ibm.com/reports/data-breach), costs rose.
See our [pillar](https://www.saporo.io/resources/blog/preemptive-identity-security)
and https://saporo.io/product plus (https://www.quest.com/products/attack-path-management-software/).`;

  it("splits internal from external by host, tolerating www and punctuation", () => {
    const internal = extractInternalLinks(BODY, ["saporo.io"]);
    expect(internal.sort()).toEqual([
      "https://saporo.io/product",
      "https://www.saporo.io/resources/blog/preemptive-identity-security",
    ]);
    const external = extractExternalUrls(BODY, ["saporo.io"]);
    expect(external).toContain("https://www.ibm.com/reports/data-breach");
    expect(external).toContain("https://www.quest.com/products/attack-path-management-software/");
    expect(external.some((u) => u.includes("saporo.io"))).toBe(false);
  });

  it("buildLinkReport counts missing links", () => {
    const report = buildLinkReport([
      { url: "https://saporo.io/product", status: "ok" },
      { url: "https://www.saporo.io/resources/blog/ghost", status: "missing" },
    ]);
    expect(report.missingCount).toBe(1);
  });
});
