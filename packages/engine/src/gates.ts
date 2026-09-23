import {
  cleanBody,
  countHeadings,
  countWords,
  distinctUrls,
  hasSection,
  parseArticle,
} from "./frontmatter.js";
import {
  MAX_ATTRIBUTED_CLAIMS,
  MIN_VERIFIED_SOURCES,
  parseResearchCitations,
  type CitationReport,
  type LinkReport,
} from "./citations.js";
import type { GateResult, ScriptReport, WorkStage } from "./types.js";

/**
 * Per-phase gate conditions from CLAUDE.md, enforced in code (roadmap 2.3).
 * Gates check what is cheaply verifiable; judgment-level requirements stay in
 * the agent specs. Each gate takes the artifact texts, so it is pure and
 * testable — the worker loads the files.
 */

export interface GateFiles {
  researchNotes?: string;
  outline?: string;
  article?: string;
  schemaJson?: string;
  headerPngExists?: boolean;
  /** seo_audit report (edit gate) / validate_schema report (schema gate). */
  report?: ScriptReport;
  /** Live citation-verification report (D34 — research + edit gates). */
  citationReport?: CitationReport;
  /** Internal-link resolution report (D35 — edit gate). */
  linkReport?: LinkReport;
}

function result(problems: string[]): GateResult {
  return { ok: problems.length === 0, problems, checkedAt: new Date() };
}

function sectionBody(text: string, title: string): string {
  const re = new RegExp(`^##\\s+${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "im");
  const m = re.exec(text);
  if (!m) return "";
  const rest = text.slice(m.index + m[0].length);
  const next = /^##\s+\S/m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const RESEARCH_SECTIONS = [
  "Topic Summary",
  "Target Keyword Analysis",
  "Top Ranking Pages",
  "Authoritative Sources",
  "Key Entities",
  "Statistics & Data Points",
  "Questions People Are Asking",
  "Content Gaps (Opportunities)",
];

export function researchGate(files: GateFiles): GateResult {
  const problems: string[] = [];
  const notes = files.researchNotes ?? "";
  if (countWords(notes) < 40) {
    problems.push("research-notes.md missing or still a stub");
    return result(problems);
  }
  for (const s of RESEARCH_SECTIONS) {
    if (!new RegExp(`^##\\s+${esc(s)}\\s*$`, "im").test(notes)) {
      problems.push(`Missing required section: ## ${s}`);
    }
  }
  const urls = distinctUrls(notes);
  if (urls.length < 8) {
    problems.push(`Only ${urls.length} distinct source URLs found; need >= 8`);
  }
  if (countWords(sectionBody(notes, "Statistics & Data Points")) < 10) {
    problems.push("Statistics & Data Points section is empty — need at least one named statistic");
  }
  if (countWords(sectionBody(notes, "Key Entities")) < 5) {
    problems.push("Key Entities section is empty — need at least one named entity");
  }
  if (countWords(sectionBody(notes, "Content Gaps (Opportunities)")) < 10) {
    problems.push("Content Gaps section is empty — need at least one explicit gap");
  }
  // D37 claim budget: 3–5 load-bearing attributed claims, never a dump —
  // every claim is a verification roll, and dozens make the gate a lottery.
  const claimCount = parseResearchCitations(notes).claims.length;
  if (claimCount > MAX_ATTRIBUTED_CLAIMS) {
    problems.push(
      `${claimCount} attributed claims — trim to the 3–5 load-bearing statistics the article will actually cite (hard ceiling ${MAX_ATTRIBUTED_CLAIMS}); list other sources without Key claim lines`,
    );
  }
  // D34 hard gate: every attributed claim must be verified at its live source.
  const cr = files.citationReport;
  if (!cr) {
    problems.push("citation verification did not run — cannot pass the research gate without it");
  } else {
    for (const r of cr.results) {
      if (r.verdict === "unsupported") {
        problems.push(
          `citation FAILED verification: "${r.claim.slice(0, 120)}" is not supported by ${r.url} — remove the claim or cite the page that actually states it`,
        );
      } else if (r.verdict === "unreachable") {
        problems.push(
          `citation source unreachable: ${r.url}${r.note ? ` (${r.note})` : ""} — an unfetchable source is unusable (D34); replace it`,
        );
      }
    }
    if (cr.verifiedSourceCount < MIN_VERIFIED_SOURCES) {
      problems.push(
        `only ${cr.verifiedSourceCount} source(s) survived live verification; need >= ${MIN_VERIFIED_SOURCES} — re-research with verifiable primary sources`,
      );
    }
  }
  return result(problems);
}

export function outlineGate(files: GateFiles): GateResult {
  const problems: string[] = [];
  const outline = files.outline ?? "";
  if (countWords(outline) < 40) {
    problems.push("outline.md missing or still a stub");
    return result(problems);
  }
  const primary = /^-\s*Primary:\s*(.+)$/im.exec(sectionBody(outline, "Keywords"));
  if (!primary || !(primary[1] ?? "").replace(/[[\]]/g, "").trim()) {
    problems.push("No primary keyword chosen (expected `- Primary: <keyword>` under ## Keywords)");
  }
  const faqBody = sectionBody(outline, "FAQ Candidates");
  const faqCount = (faqBody.match(/^\s*\d+[.)]\s+\S/gm) ?? []).length;
  if (faqCount < 3 || faqCount > 7) {
    problems.push(`FAQ Candidates has ${faqCount} question(s); need 3-7`);
  }
  const h2Count = (outline.match(/^###\s+H2:/gim) ?? []).length;
  if (h2Count < 4) {
    problems.push(`Full Outline has ${h2Count} H2 section(s); need >= 4`);
  }
  // D33: the outline must state the article's thesis — its narrative spine.
  if (countWords(sectionBody(outline, "Thesis")) < 12) {
    problems.push(
      "No thesis (expected `## Thesis` with the claim the article argues, 1-2 real sentences) — an outline without a thesis produces an answer farm",
    );
  }
  for (const s of ["Angle", "Target Entities (for `mentions` array)", "External Citations to Use", "Full Outline"]) {
    if (!new RegExp(`^##\\s+${esc(s)}\\s*$`, "im").test(outline)) {
      problems.push(`Missing required section: ## ${s}`);
    }
  }
  return result(problems);
}

const REQUIRED_FRONTMATTER = [
  "title",
  "slug",
  "author",
  "publish_date",
  "meta_description",
  "primary_keyword",
  "canonical_url",
] as const;

export function writeGate(files: GateFiles): GateResult {
  const problems: string[] = [];
  const raw = files.article ?? "";
  if (countWords(raw) < 50) {
    problems.push("article.md missing or still the template stub");
    return result(problems);
  }
  const { frontmatter, body } = parseArticle(raw);
  for (const key of REQUIRED_FRONTMATTER) {
    const v = frontmatter[key];
    if (v === undefined || v === null || String(v).trim() === "") {
      problems.push(`Frontmatter missing or empty: ${key}`);
    }
  }
  const clean = cleanBody(body);
  if (countHeadings(clean, 1) !== 1) {
    problems.push(`Expected exactly one H1, found ${countHeadings(clean, 1)}`);
  }
  if (!hasSection(clean, "Key Takeaways")) {
    problems.push("Key Takeaways block missing (expected `## Key Takeaways`)");
  }
  if (!hasSection(clean, "Frequently Asked Questions")) {
    problems.push("FAQ section missing (expected `## Frequently Asked Questions`)");
  }
  return result(problems);
}

/**
 * Edit gate rides on the canonical seo_audit.py report: zero FAIL lines and
 * the title/meta/keyword targets specifically green (they are FAIL/WARN
 * lines in the report).
 */
export function editGate(files: GateFiles): GateResult {
  const problems: string[] = [];
  const report = files.report;
  if (!report) {
    problems.push("No seo_audit report available");
    return result(problems);
  }
  for (const c of report.checks) {
    // json-ld / schema.json checks belong to Phase 5 — the fence does not
    // exist yet when the Editor gate runs.
    if (c.level === "fail" && !/json-ld|schema\.json/i.test(c.message)) {
      problems.push(`audit FAIL: ${c.message}`);
    }
  }
  // Title/meta length are WARN-level in the audit but hard requirements of
  // the Editor gate — promote them.
  for (const c of report.checks) {
    if (c.level === "warn" && /^(Title length|Meta description length)/.test(c.message)) {
      problems.push(`audit: ${c.message}`);
    }
  }
  // D34: every external URL cited in the body must be a research-verified source.
  const cr = files.citationReport;
  if (!cr) {
    problems.push("body citation check did not run — cannot pass the edit gate without it");
  } else {
    for (const r of cr.results) {
      if (r.verdict !== "supported") {
        problems.push(
          `body cites an unverified source: ${r.url}${r.note ? ` (${r.note})` : ""} — remove the claim or replace it with one from a verified source`,
        );
      }
    }
  }
  // D35: internal links must resolve; planned siblings are mentions, not links.
  const lr = files.linkReport;
  if (!lr) {
    problems.push("internal link check did not run — cannot pass the edit gate without it");
  } else {
    for (const r of lr.results) {
      if (r.status === "missing") {
        problems.push(
          `internal link does not resolve: ${r.url}${r.note ? ` (${r.note})` : ""} — remove the hyperlink and keep a plain-text mention`,
        );
      }
    }
  }
  return result(problems);
}

export function schemaGate(files: GateFiles): GateResult {
  const problems: string[] = [];
  if (!files.schemaJson) {
    problems.push("schema.json missing");
  }
  const report = files.report;
  if (!report) {
    problems.push("No validate_schema report available");
  } else if (report.exitCode !== 0 || report.failures > 0) {
    for (const c of report.checks) {
      if (c.level === "fail") problems.push(`schema FAIL: ${c.message}`);
    }
    if (problems.length === 0) problems.push("validate_schema exited non-zero");
  }
  const article = files.article ?? "";
  if (!/```json-ld[\s\S]*?```/i.test(article)) {
    problems.push("json-ld fenced block missing from article.md");
  }
  return result(problems);
}

export function designGate(files: GateFiles): GateResult {
  const problems: string[] = [];
  if (!files.headerPngExists) {
    problems.push("header.png not found in article folder");
  }
  const raw = files.article ?? "";
  const { frontmatter } = parseArticle(raw);
  if (String(frontmatter["hero_image"] ?? "").trim() === "") {
    problems.push("hero_image not set in article.md frontmatter");
  }
  if (String(frontmatter["hero_image_alt"] ?? "").trim() === "") {
    problems.push("hero_image_alt not set in article.md frontmatter");
  }
  return result(problems);
}

export const GATES: Record<WorkStage, (files: GateFiles) => GateResult> = {
  research: researchGate,
  outline: outlineGate,
  write: writeGate,
  edit: editGate,
  schema: schemaGate,
  design: designGate,
};
