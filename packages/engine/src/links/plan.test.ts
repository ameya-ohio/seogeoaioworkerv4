import { describe, expect, it } from "vitest";
import { compareLinksToPlan, linkPlanProblems, parseLinkPlan, plannedLinkProblems } from "./plan.js";
import type { LinkTarget } from "./inventory.js";
import { hdcpGate, writeGate } from "../gates.js";

const BASE = "https://www.saporo.io/learn/identity-exposure-management/identity-exposure";

// The shape production outlines carry (identity-exposure-examples, Oct 2026).
const OUTLINE = `# Outline

## Internal Links
| Target URL | Section | Reader need (matches what the page covers) | Anchor |
|---|---|---|---|
| ${BASE}/ (planned) | Overview | Reader new to the term needs the baseline definition | "the baseline definition of identity exposure" |
| ${BASE}/how-to-reduce/ | The pattern | Reader convinced the hop matters needs the remediation sequence | the fix sequence for each hop |

## External Citations to Use
1. Source #3
`;

const target = (path: string, relation: LinkTarget["relation"], anchorsUsed: string[] = []): LinkTarget => ({
  url: `${BASE}${path}`,
  path: `/learn/identity-exposure-management/identity-exposure${path}`,
  title: path,
  query: path,
  covers: "",
  status: "planned",
  anchorsUsed,
  relation,
});

const article = (body: string) =>
  `---\ntitle: T\nslug: s\ncanonical_url: "${BASE}/examples/"\n---\n\n# Title\n\n${body}\n`;

describe("parseLinkPlan", () => {
  it("reads table rows, stripping the (planned) note and the anchor's quotes", () => {
    expect(parseLinkPlan(OUTLINE)).toEqual([
      {
        url: BASE,
        section: "Overview",
        need: "Reader new to the term needs the baseline definition",
        anchor: "the baseline definition of identity exposure",
      },
      {
        url: `${BASE}/how-to-reduce`,
        section: "The pattern",
        need: "Reader convinced the hop matters needs the remediation sequence",
        anchor: "the fix sequence for each hop",
      },
    ]);
  });

  it("has no plan for an outline without the section or with the old bullet form", () => {
    expect(parseLinkPlan("# x\n\n## Angle\nfoo")).toBeUndefined();
    expect(parseLinkPlan("## Internal Links\n\n- → Pillar (intro / closing)\n")).toBeUndefined();
  });
});

describe("linkPlanProblems", () => {
  it("passes a complete plan of inventory pages", () => {
    expect(linkPlanProblems(OUTLINE, [target("/", "parent"), target("/how-to-reduce/", "sibling")])).toEqual([]);
  });

  it("fails an anchor that points back at this page", () => {
    const outline = OUTLINE.replace("the fix sequence for each hop", "the technical layer behind these numbers");
    expect(linkPlanProblems(outline).join("\n")).toContain('points back at this page ("these")');
  });

  it("fails a target outside the inventory, a reused anchor, and a missed child on a hub", () => {
    const inventory = [
      target("/", "parent"),
      target("/how-to-reduce/", "sibling"),
      target("/how-to-measure/", "child", ["the fix sequence for each hop"]),
    ];
    const outline = OUTLINE.replace(`${BASE}/ (planned)`, "https://www.saporo.io/product/overview");
    const problems = linkPlanProblems(outline, inventory, "hub").join("\n");
    expect(problems).toContain("isn't in page.md's link inventory");
    expect(problems).toContain(`already used on the site for ${BASE}/how-to-measure/`);
    expect(problems).toContain("links down to every child page");
  });

  it("asks for a plan when there are pages to link and none is planned", () => {
    expect(linkPlanProblems("## Internal Links\n\nnone\n", [target("/", "parent")])[0]).toContain("no planned rows");
  });
});

describe("plannedLinkProblems", () => {
  const good = article(
    `Start with [the baseline definition of identity exposure](${BASE}/). Then follow [The fix sequence for each hop](${BASE}/how-to-reduce/).`,
  );

  it("passes the planned anchors, whatever their case, and ignores external links and the CTA", () => {
    const md = good.replace("\n# Title\n", `\n# Title\n\nSee [Microsoft docs](https://learn.microsoft.com/x) and [book a demo](https://www.saporo.io/demo).\n`);
    expect(plannedLinkProblems(OUTLINE, md, ["https://www.saporo.io/demo"])).toEqual([]);
  });

  it("fails a changed anchor, a missing planned link and an unplanned internal link", () => {
    const md = article(
      `Start with [what identity exposure is](${BASE}/). Read [the security graph](https://www.saporo.io/resources/blog/graph).`,
    );
    const problems = plannedLinkProblems(OUTLINE, md).join("\n");
    expect(problems).toContain('anchor changed: "what identity exposure is"');
    expect(problems).toContain(`planned internal link missing: [the fix sequence for each hop](${BASE}/how-to-reduce)`);
    expect(problems).toContain("unplanned internal link: [the security graph]");
  });

  it("checks nothing when the outline plans no links", () => {
    expect(plannedLinkProblems("## Angle\nx", good)).toEqual([]);
  });

  it("reports per-link status for the Review screen", () => {
    const cmp = compareLinksToPlan(OUTLINE, good);
    expect(cmp?.planned.map((p) => p.status)).toEqual(["used", "used"]);
    expect(cmp?.unplanned).toEqual([]);
  });
});

describe("gates hold the article to the link plan", () => {
  const drifted = article(
    `${"Words that make the draft long enough to check. ".repeat(10)}\n\n## Key Takeaways\n\n- a\n\n## Frequently Asked Questions\n\n### Q?\nA.\n\nStart with [what identity exposure is](${BASE}/) and [the fix sequence for each hop](${BASE}/how-to-reduce/).`,
  );

  it("write gate", () => {
    expect(writeGate({ article: drifted, outline: OUTLINE }).problems.join("\n")).toContain("anchor changed");
  });

  it("hdcp gate", () => {
    const log = "## Diagnosis\nx\n\n## Changes made\n- y\n\n## Cuts\n- none\n\n## Flags\n- none\n\n## Editor notes\n- none\n";
    expect(hdcpGate({ article: drifted, outline: OUTLINE, hdcpLog: log }).problems.join("\n")).toContain("anchor changed");
  });
});
