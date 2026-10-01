import { describe, expect, it } from "vitest";
import { hdcpGate, parseHdcpLog, nextStage, WORK_STAGES } from "./index.js";

const ARTICLE = `---\ntitle: "T"\nslug: "t"\n---\n\n# Title\n\n${"word ".repeat(80)}\n`;
const LOG = `# HDCP log — t — 2026-09-30

## Diagnosis
The Microsoft and Verizon figures each appear twice in near-identical wording, and "identity risk" is defined
three ways. The only real example, the bank engagement, sits in the second-to-last section.

## Changes made
- Kept each statistic once, in the section it supports — repeated evidence
- Moved the bank engagement into the first body section — buried strongest material

## Cuts
- Second copy of the 22% Verizon figure — duplicate
- Retelling of the definition — belongs to https://www.saporo.io/learn/identity-exposure-management/identity-exposure/

## Flags
- none

## Editor notes
Cut two repeated statistics. Confirm the bank case can lead the body.
`;

describe("HDCP phase (lean protocol)", () => {
  it("sits between write and edit (D61), so the Editor's gate checks the rewrite", () => {
    expect(WORK_STAGES.indexOf("hdcp")).toBe(WORK_STAGES.indexOf("write") + 1);
    expect(nextStage("write")).toBe("hdcp");
    expect(nextStage("hdcp")).toBe("edit");
  });

  it("parses the markdown log into the stored shape", () => {
    const { log, problems } = parseHdcpLog(LOG, "claude-opus-5-5");
    expect(problems).toEqual([]);
    expect(log?.diagnosis).toMatch(/^The Microsoft and Verizon figures/);
    expect(log?.changes).toHaveLength(2);
    expect(log?.cuts[0]).toEqual({ content: "Second copy of the 22% Verizon figure", reason: "duplicate" });
    expect(log?.cuts[1]?.reason).toContain("belongs to https://www.saporo.io/learn/");
    expect(log?.flags).toEqual([]);
    expect(log?.editorNotes).toContain("Confirm the bank case");
    expect(log?.model).toBe("claude-opus-5-5");
  });

  it("passes a sound output — the agent's judgment is the check", () => {
    expect(hdcpGate({ article: ARTICLE, hdcpLog: LOG }).ok).toBe(true);
  });

  it("fails a missing diagnosis, no changes, a missing section, or notes left in the article", () => {
    expect(hdcpGate({ article: ARTICLE }).problems.join(" ")).toContain("hdcp.md missing");
    expect(hdcpGate({ article: ARTICLE, hdcpLog: LOG.replace(/## Diagnosis[\s\S]*?## Changes/, "## Diagnosis\n\n## Changes") }).problems.join(" ")).toContain("Diagnosis");
    expect(hdcpGate({ article: ARTICLE, hdcpLog: LOG.replace(/^- Kept.*\n- Moved.*$/m, "") }).problems.join(" ")).toContain("Changes made");
    expect(hdcpGate({ article: ARTICLE, hdcpLog: LOG.replace("## Flags", "## Notes") }).problems.join(" ")).toContain("Flags");
    expect(hdcpGate({ article: ARTICLE + "\n## Editor notes\nCut things.\n", hdcpLog: LOG }).problems.join(" ")).toContain("belong in hdcp.md");
  });

  it("keeps real flags", () => {
    const { log } = parseHdcpLog(LOG.replace("- none", "- [HUMAN INPUT: a real customer example of stale delegation]"));
    expect(log?.flags).toEqual(["[HUMAN INPUT: a real customer example of stale delegation]"]);
  });
});

describe("HDCP editor notes and flags (D61)", () => {
  it("reads a flags line that starts with 'none' as no flags", () => {
    const log = LOG.replace("## Flags\n- none", "## Flags\n- none inline. (The [NEEDS RESEARCH] note was resolved in prose.)");
    expect(parseHdcpLog(log).log?.flags).toEqual([]);
  });

  it("fails when HDCP deletes an editor note it can't resolve", () => {
    const prior = ARTICLE.replace("# Title", "# Title\n\nThe DKM container claim. [NEEDS RESEARCH: a primary source for the ACL]");
    const g = hdcpGate({ article: ARTICLE, hdcpLog: LOG, priorArticle: prior });
    expect(g.ok).toBe(false);
    expect(g.problems.join(" ")).toContain("[NEEDS RESEARCH: a primary source for the ACL]");
    expect(hdcpGate({ article: prior, hdcpLog: LOG, priorArticle: prior }).ok).toBe(true);
  });
});
