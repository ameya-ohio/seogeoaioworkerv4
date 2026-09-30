import { describe, expect, it } from "vitest";
import { hdcpGate, parseHdcpLog, nextStage, WORK_STAGES } from "./index.js";

const ARTICLE = `---\ntitle: "T"\nslug: "t"\n---\n\n# Title\n\n${"word ".repeat(80)}\n`;
const log = (afterHigh: number, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    summary: "Two stats repeated; the case sat at the end.",
    findings: [
      { code: "A1", severity: "high", location: "Intro", excerpt: "82% of detections", diagnosis: "stat repeated", planned_fix: "keep once" },
    ],
    cuts: [{ content: "second 82%", reason: "A1" }],
    flags: ["[VERIFY: NIST dimension naming]"],
    verification: {
      findings_before: { high: 1, medium: 2, low: 0 },
      findings_after: { high: afterHigh, medium: 0, low: 0 },
      fact_diff_passed: true,
    },
    editor_notes: "Cut the repeated stat.",
    inventory: { facts: [] },
    ...extra,
  });

describe("HDCP phase", () => {
  it("sits between edit and schema", () => {
    expect(WORK_STAGES.indexOf("hdcp")).toBe(WORK_STAGES.indexOf("edit") + 1);
    expect(nextStage("edit")).toBe("hdcp");
    expect(nextStage("hdcp")).toBe("schema");
  });

  it("passes on the agent's own clean verification — no audit re-run", () => {
    expect(hdcpGate({ article: ARTICLE, hdcpJson: log(0) }).ok).toBe(true);
  });

  it("sends the agent back when its own verification leaves a High finding", () => {
    const g = hdcpGate({ article: ARTICLE, hdcpJson: log(1) });
    expect(g.ok).toBe(false);
    expect(g.problems.join(" ")).toMatch(/revise again.*A1 Intro/);
  });

  it("fails a missing or malformed log, and a dropped H1 or frontmatter", () => {
    expect(hdcpGate({ article: ARTICLE }).problems.join(" ")).toContain("hdcp.json missing");
    expect(hdcpGate({ article: ARTICLE, hdcpJson: "{nope" }).problems.join(" ")).toContain("not valid JSON");
    expect(hdcpGate({ article: ARTICLE.replace("# Title", "Title"), hdcpJson: log(0) }).problems.join(" ")).toContain("H1");
    expect(hdcpGate({ article: ARTICLE.replace('slug: "t"', 'slug: ""'), hdcpJson: log(0) }).problems.join(" ")).toContain("slug");
  });

  it("parses the log into the stored shape, keeping the rest verbatim", () => {
    const { log: parsed } = parseHdcpLog(log(0), "claude-opus-5-5");
    expect(parsed).toMatchObject({
      model: "claude-opus-5-5",
      editorNotes: "Cut the repeated stat.",
      flags: ["[VERIFY: NIST dimension naming]"],
      verification: { findings_before: { high: 1, medium: 2, low: 0 }, fact_diff_passed: true },
    });
    expect(parsed?.findings[0]?.code).toBe("A1");
    expect(parsed?.raw?.["inventory"]).toEqual({ facts: [] });
  });
});
