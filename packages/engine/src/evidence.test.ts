import { describe, expect, it } from "vitest";
import {
  EVIDENCE_SOURCE_BASE,
  evidenceAsSources,
  evidenceGate,
  evidenceProblems,
  factsToVerify,
  parseInterviewEvidence,
  verifyGate,
  editorMarkers,
  framerExportProblems,
  type ArticleDoc,
} from "./index.js";

const POV = `# Expert POV

## Facts to Verify
- F1: Storm-0501 reached the cloud through a compromised Entra Connect server — check: Microsoft's write-up — said: "the Storm-0501 Entra Connect server"
- F2: Silver SAML is the documented Entra-to-AWS technique — check: the technique's primary write-up — said: "Silver SAML"
`;

const NOTES = `## Topic Summary
Background.

## Interview Evidence

### F1: Storm-0501 reached the cloud through a compromised Entra Connect server
- Verdict: verified
- Source 101: **Storm-0501's evolving techniques** — Microsoft Threat Intelligence, 2025. https://www.microsoft.com/en-us/security/blog/storm-0501
- Key claim: Storm-0501 compromised an Entra Connect Sync server and moved into Entra ID.
- Supporting quote: "compromised the Entra Connect Sync server"
- Use: as stated

### F2: Silver SAML is the documented Entra-to-AWS technique
- Verdict: unsourced
- Use: expert opinion only — no primary source outside a head-to-head vendor
`;

describe("interview evidence (D61)", () => {
  it("lists the facts pov.md asks to verify, and none for 'none'", () => {
    expect(factsToVerify(POV).map((f) => f.id)).toEqual(["F1", "F2"]);
    expect(factsToVerify("## Facts to Verify\nnone — the expert raised no third-party facts\n")).toEqual([]);
  });

  it("parses verdicts, sources and uses", () => {
    const [f1, f2] = parseInterviewEvidence(NOTES);
    expect(f1).toMatchObject({ id: "F1", verdict: "verified", sourceN: 101, url: "https://www.microsoft.com/en-us/security/blog/storm-0501" });
    expect(f1?.keyClaim).toContain("Entra Connect Sync server");
    expect(f2).toMatchObject({ id: "F2", verdict: "unsourced" });
    expect(evidenceProblems(POV, NOTES)).toEqual([]);
  });

  it("renders only verified/corrected entries as sources for the citation verifier", () => {
    const block = evidenceAsSources(parseInterviewEvidence(NOTES));
    expect(block).toContain("## Authoritative Sources");
    expect(block).toContain(`${EVIDENCE_SOURCE_BASE}. **Storm-0501's evolving techniques**`);
    expect(block).toContain("Key claim: Storm-0501 compromised");
    expect(block).not.toContain("Silver SAML");
  });

  it("names a fact with no entry, no verdict, or a verified fact with no source", () => {
    const broken = NOTES.replace(/### F2[\s\S]*$/, "").replace("- Source 101:", "- Sauce:");
    const problems = evidenceProblems(POV, broken);
    expect(problems.some((p) => p.startsWith("Interview Evidence has no entry for F2"))).toBe(true);
    expect(problems.some((p) => p.startsWith("F1: a verified fact needs"))).toBe(true);
  });

  it("gate: with a pre-D61 pov.md (no list), still checks every entry and every citation", () => {
    const legacyPov = "# Expert POV\n\n## Thesis\nThe links carry the exposure.\n";
    const unsupported = {
      ranAt: new Date(),
      results: [{ sourceN: 101, url: "https://x", claim: "c", kind: "key_claim" as const, verdict: "unsupported" as const, note: "not on page" }],
      verifiedSourceCount: 0,
      verifiedUrls: [],
      unsupportedCount: 1,
      unreachableCount: 0,
    };
    const g = evidenceGate({ pov: legacyPov, researchNotes: NOTES, citationReport: unsupported });
    expect(g.ok).toBe(false);
    expect(g.problems.join(" ")).toContain("source #101");
    const noUse = NOTES.replace("- Use: as stated\n", "");
    expect(evidenceGate({ pov: legacyPov, researchNotes: noUse }).problems.join(" ")).toContain('F1: no "- Use:" line');
    expect(evidenceGate({ pov: legacyPov, researchNotes: "## Topic Summary\nx\n" }).ok).toBe(true);
  });

  it("gate: passes with no facts; fails an unsupported evidence citation", () => {
    expect(evidenceGate({ pov: "## Facts to Verify\nnone\n" }).ok).toBe(true);
    const g = evidenceGate({
      pov: POV,
      researchNotes: NOTES,
      citationReport: {
        ranAt: new Date(),
        results: [{ sourceN: 101, url: "https://x", claim: "c", kind: "key_claim", verdict: "unsupported", note: "not on page" }],
        verifiedSourceCount: 0,
        verifiedUrls: [],
        unsupportedCount: 1,
        unreachableCount: 0,
      },
    });
    expect(g.ok).toBe(false);
    expect(g.problems.join(" ")).toContain("source #101");
  });
});

describe("verify gate and editor markers (D61)", () => {
  it("requires a completed verification and one [VERIFY] note per unresolved issue", () => {
    const issue = { kind: "technical_error" as const, quote: "q", problem: "p", fix: "f" };
    const base = { rounds: [], unresolved: [issue], completedAt: new Date() };
    const notes = (g: { problems: string[] }) => g.problems.filter((p) => p.includes("verification") || p.includes("[VERIFY"));
    expect(notes(verifyGate({ article: "# T\n\nq [VERIFY: p]\n", verification: base }))).toEqual([]);
    expect(notes(verifyGate({ article: "# T\n\nq\n", verification: base }))[0]).toContain("1 unresolved verification issue");
    expect(notes(verifyGate({ article: "# T\n", verification: { rounds: [], unresolved: [] } }))[0]).toContain("did not complete");
  });

  it("the export refuses a [NEEDS RESEARCH] note too", () => {
    const md = "---\ntitle: T\n---\n# T\n\nClaim. [NEEDS RESEARCH: a primary source]\n";
    expect(editorMarkers(md)).toEqual(["[NEEDS RESEARCH: a primary source]"]);
    const article = { stage: "review", artifacts: { article: md } } as unknown as ArticleDoc;
    expect(framerExportProblems(article, { signoffRequired: false }).join(" ")).toContain("NEEDS RESEARCH");
  });
});
