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
import type { ArticleVerification, GateResult, ScriptReport, WorkStage } from "./types.js";
import type { FormatRegistry } from "./formats.js";
import { parseOutlineFacets, type PageRules } from "./pageRules.js";
import { povProblems } from "./interview.js";
import { evidenceProblems, factsToVerify } from "./evidence.js";

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
  /** Research gate: scripts/competitor_checks.py --research (no competitor as a source). */
  competitorReport?: ScriptReport;
  /** Internal-link resolution report (D35 — edit gate). */
  linkReport?: LinkReport;
  /** D45–D50: what this page's facets resolve to. Absent = pre-registry defaults. */
  page?: PageRules;
  /** Set when the article has no facets: the outline must supply them (validated here). */
  facetRegistry?: FormatRegistry;
  /** HDCP: the agent's hdcp.md log (raw markdown). */
  hdcpLog?: string;
  /** Interview (D59/D61): the POV writer's Expert POV brief. */
  pov?: string;
  /** Interview (D59): skipped by the operator or the plan — nothing to check. */
  interviewSkipped?: boolean;
  /** HDCP (D61): article.md as it was before HDCP, so no marker can be deleted. */
  priorArticle?: string;
  /** Verify (D61): the rounds the verify stage ran on the final text. */
  verification?: ArticleVerification;
}

/**
 * Inline notes an editor must resolve before a page ships. The export and
 * the Review screen refuse while any remain, and no phase may delete one
 * it didn't resolve (D61).
 */
export const EDITOR_MARKER_RE = /\[(?:NEEDS SOURCE|NEEDS RESEARCH|HUMAN INPUT|VERIFY):[^\]]*\]/g;

export function editorMarkers(md: string): string[] {
  return md.match(EDITOR_MARKER_RE) ?? [];
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
  "Subject Material",
  "Candidate Positions",
  "Target Keyword Analysis",
  "Top Ranking Pages",
  "Authoritative Sources",
  "Key Entities",
  "Statistics & Data Points",
  "Questions People Are Asking",
  "Content Gaps (Opportunities)",
];

const MIN_SUBJECT_MATERIAL_WORDS = 150;

/** D60: the Researcher's `### P1: <claim>` entries under ## Candidate Positions. */
export function candidatePositions(notes: string): { id: string; claim: string }[] {
  const out: { id: string; claim: string }[] = [];
  for (const m of sectionBody(notes, "Candidate Positions").matchAll(/^###\s+(P\d+)\s*[:.—-]\s*(.+)$/gim)) {
    out.push({ id: (m[1] ?? "").toUpperCase(), claim: (m[2] ?? "").trim() });
  }
  return out;
}

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
  // D60: the material the page is built from, per the research playbook.
  if (hasSection(notes, "Subject Material") && countWords(sectionBody(notes, "Subject Material")) < MIN_SUBJECT_MATERIAL_WORDS) {
    problems.push(
      `Subject Material has ${countWords(sectionBody(notes, "Subject Material"))} words — gather the playbook's material (the procedure, mechanism, example bank, dimensions or measures in research-brief.md), with specifics and sources (need >= ${MIN_SUBJECT_MATERIAL_WORDS} words)`,
    );
  }
  const positions = candidatePositions(notes);
  if (hasSection(notes, "Candidate Positions") && positions.length < 2) {
    problems.push(
      `Candidate Positions lists ${positions.length} position(s) — need 2-3, each as \`### P1: <claim>\` with its support, strongest objection and what the article would argue`,
    );
  }
  const stats = sectionBody(notes, "Statistics & Data Points");
  if (countWords(stats) < 10 && !/none needed/i.test(stats)) {
    problems.push(
      "Statistics & Data Points is empty — bank the figures a position needs, or write `None needed:` and why this page's argument doesn't turn on one",
    );
  }
  // D60: every banked figure or quote names the position it serves; a figure
  // that serves no position is decoration, and the Strategist can't place it.
  if (positions.length) {
    const known = new Set(positions.map((p) => p.id));
    for (const section of ["Statistics & Data Points", "Quotes Worth Including"]) {
      for (const line of sectionBody(notes, section).split("\n")) {
        if (!/^\s*-\s+\S/.test(line) || !/source(?:\s+citation)?\s*#?\s*\d+/i.test(line)) continue;
        const tag = /supports:\s*(P\d+)/i.exec(line);
        if (!tag?.[1]) {
          problems.push(`${section}: "${line.trim().slice(2, 90)}" is not tagged with the position it supports (add "supports: P1")`);
        } else if (!known.has(tag[1].toUpperCase())) {
          problems.push(`${section}: "${line.trim().slice(2, 90)}" supports ${tag[1]}, which is not a Candidate Position`);
        }
      }
    }
  }
  if (countWords(sectionBody(notes, "Key Entities")) < 5) {
    problems.push("Key Entities section is empty — need at least one named entity");
  }
  if (countWords(sectionBody(notes, "Content Gaps (Opportunities)")) < 10) {
    problems.push("Content Gaps section is empty — need at least one explicit gap");
  }
  // D37/D60 claim budget: an evidence bank of at most MAX_ATTRIBUTED_CLAIMS
  // tagged candidates (the Strategist uses 3–5) — every claim is a
  // verification roll, and dozens make the gate a lottery.
  const claimCount = parseResearchCitations(notes).claims.length;
  if (claimCount > MAX_ATTRIBUTED_CLAIMS) {
    problems.push(
      `${claimCount} attributed claims — the evidence bank holds at most ${MAX_ATTRIBUTED_CLAIMS} (the Strategist uses 3–5); keep the ones a position turns on and list other sources without Key claim lines`,
    );
  }
  // Competitor ban (quality-bar → Competitor handling): a head-to-head vendor is
  // never research material the article will cite. Absent = the check didn't run
  // (older callers), which the gate doesn't block on.
  for (const c of files.competitorReport?.checks ?? []) {
    if (c.level === "fail") problems.push(c.message);
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
  // D49: the range is per role/format; pre-registry articles keep 3–7.
  const faq = files.page?.faq ?? { min: 3, max: 7 };
  const faqOk =
    (faq.max === 0 && faqCount === 0) ||
    (faq.optional === true && faqCount === 0) ||
    (faqCount >= faq.min && faqCount <= faq.max);
  if (!faqOk) {
    problems.push(
      faq.max === 0
        ? `FAQ Candidates has ${faqCount} question(s); this format carries no FAQ — list none`
        : `FAQ Candidates has ${faqCount} question(s); need ${faq.min}-${faq.max}${faq.optional ? " (or none)" : ""} for this page`,
    );
  }
  if (files.facetRegistry) {
    problems.push(...parseOutlineFacets(outline, files.facetRegistry).problems);
  }
  // D53: each internal-link target at most once per page.
  const planned = (sectionBody(outline, "Internal Links").match(/https?:\/\/[^\s|)]+/g) ?? []).map((u) =>
    u.replace(/\/+$/, ""),
  );
  const repeated = [...new Set(planned.filter((u, i) => planned.indexOf(u) !== i))];
  if (repeated.length) {
    problems.push(`Internal Links plans the same target more than once: ${repeated.join(", ")} — link each page once`);
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
  problems.push(...argumentProblems(outline, files.page));
  return result(problems);
}

// ── D60: the argument has to be built into the outline ─────────────────────

export interface OutlineBlock {
  level: "H2" | "H3";
  heading: string;
  body: string;
}

/** The `### H2:` / `#### H3:` blocks of `## Full Outline`, in order. */
export function outlineBlocks(outline: string): OutlineBlock[] {
  const full = sectionBody(outline, "Full Outline");
  const re = /^#{3,4}\s+(H2|H3):\s*(.+)$/gim;
  const heads = [...full.matchAll(re)];
  return heads.map((m, i) => {
    const start = (m.index ?? 0) + m[0].length;
    const end = heads[i + 1]?.index ?? full.length;
    // A block also ends at the next non-H2/H3 heading (### Closing, ### Key Takeaways).
    const raw = full.slice(start, end);
    const stop = /^#{3,4}\s+(?!H[23]:)\S/m.exec(raw);
    return {
      level: (m[1] ?? "H2").toUpperCase() as "H2" | "H3",
      heading: (m[2] ?? "").replace(/\s*\(≈[^)]*\)/, "").replace(/\s*\[[^\]]*\]\s*$/, "").trim(),
      body: stop ? raw.slice(0, stop.index) : raw,
    };
  });
}

/** The numbered claims under `## Argument Spine`. */
export function argumentSpine(outline: string): string[] {
  return (sectionBody(outline, "Argument Spine").match(/^\s*\d+[.)]\s+\S.*$/gm) ?? []).map((l) =>
    l.replace(/^\s*\d+[.)]\s+/, "").trim(),
  );
}

function lineValue(body: string, key: string): string | null {
  const m = new RegExp(`^\\s*-\\s*\\**${key}\\**\\s*:\\s*(.*)$`, "im").exec(body);
  return m ? (m[1] ?? "").trim() : null;
}

const isFaqHeading = (h: string) => /frequently asked|^faqs?\b/i.test(h);

/**
 * D60 outline checks: a 3–5 claim Argument Spine; every body H2 names the
 * spine claim it advances (or the format requirement it serves); every claim
 * is advanced; each planned citation names the claim it supports; and the
 * research mode's own requirements (a procedure's steps carry an action; an
 * examples page's examples carry specifics and prove the thesis).
 */
export function argumentProblems(outline: string, page?: PageRules): string[] {
  const problems: string[] = [];
  if (!hasSection(outline, "Argument Spine")) {
    return ["Missing required section: ## Argument Spine (3-5 numbered claims that build the thesis, each with its proof)"];
  }
  const spine = argumentSpine(outline);
  if (spine.length < 3 || spine.length > 5) {
    problems.push(`Argument Spine has ${spine.length} claim(s); need 3-5, numbered, each a step in the argument with its proof`);
  }
  const blocks = outlineBlocks(outline);
  const body = blocks.filter((b) => b.level === "H2" && !isFaqHeading(b.heading));
  const advanced = new Set<number>();
  let advancing = 0;
  for (const b of body) {
    const adv = lineValue(b.body, "Advances");
    if (adv === null || !adv) {
      problems.push(`H2 "${b.heading}" has no "- Advances:" line — name the spine claim it advances ("spine #2") or the format requirement it serves ("format — prerequisites")`);
      continue;
    }
    if (/spine/i.test(adv)) {
      const nums = [...adv.matchAll(/(?:#|spine\s+)\s*(\d+)/gi)].map((m) => Number(m[1]));
      const bad = nums.filter((n) => n < 1 || n > spine.length);
      if (!nums.length || bad.length) {
        problems.push(`H2 "${b.heading}" advances ${nums.length ? `spine #${bad.join(", #")}` : "no numbered claim"}, which is not in the Argument Spine`);
      } else {
        advancing++;
        for (const n of nums) advanced.add(n);
      }
    } else if (!/format/i.test(adv)) {
      problems.push(`H2 "${b.heading}": "Advances: ${adv.slice(0, 60)}" must name a spine claim ("spine #N") or a format requirement ("format — …")`);
    }
    if (!lineValue(b.body, "Claim")) {
      problems.push(`H2 "${b.heading}" has no "- Claim:" line — say what the reader should believe or do after the section`);
    }
  }
  // A routing hub's child sections exist to route, so the majority rule doesn't apply to it.
  if (!page?.routing && body.length && advancing * 2 < body.length) {
    problems.push(
      `only ${advancing} of ${body.length} body H2s advance a spine claim — at least half must; a section that only covers a subtopic needs a claim or should go`,
    );
  }
  for (let n = 1; n <= spine.length; n++) {
    if (!advanced.has(n)) problems.push(`Argument Spine claim #${n} is not advanced by any H2 — give it a section or cut it`);
  }
  for (const line of sectionBody(outline, "External Citations to Use").split("\n")) {
    if (!/^\s*\d+[.)]\s+\S/.test(line)) continue;
    if (!/supports\s+spine\s*#?\s*\d+|mechanism/i.test(line)) {
      problems.push(`External Citations: "${line.trim().slice(0, 90)}" must name the spine claim it supports ("supports spine #N") or be marked "mechanism"`);
    }
  }

  const mode = page?.format.researchMode;
  if (mode === "procedure") {
    for (const b of blocks.filter((x) => /^step\b/i.test(x.heading))) {
      const action = lineValue(b.body, "Action");
      if (!action || /^(none|n\/a|tbd)\b/i.test(action)) {
        problems.push(`Step "${b.heading}" has no "- Action:" — plan the exact command, API call, query or console path from Subject Material`);
      }
    }
  }
  if (mode === "catalog") {
    const examples = body.filter((b) => lineValue(b.body, "Specifics"));
    const min = page?.format.slug === "examples" ? 3 : 1;
    if (examples.length < min) {
      problems.push(`${examples.length} example section(s) carry "- Specifics:"; need >= ${min} — each example names its exact attribute, permission, setting or command`);
    }
    for (const b of examples) {
      if (!/spine/i.test(lineValue(b.body, "Advances") ?? "")) {
        problems.push(`Example "${b.heading}" doesn't advance a spine claim — the examples are the thesis's proof`);
      }
    }
  }
  return problems;
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
  const faq = files.page?.faq;
  const faqRequired = !faq || (faq.max > 0 && !faq.optional);
  if (faqRequired && !hasSection(clean, "Frequently Asked Questions")) {
    problems.push("FAQ section missing (expected `## Frequently Asked Questions`)");
  }
  if (faq?.max === 0 && hasSection(clean, "Frequently Asked Questions")) {
    problems.push("This format carries no FAQ — remove `## Frequently Asked Questions`");
  }
  return result(problems);
}

/**
 * D50: the closing section links this page's funnel CTA, and never another
 * funnel's. "Closing" is the last H2 section before the FAQ (or the last one).
 */
export function ctaProblems(articleMd: string, page: PageRules | undefined): string[] {
  if (!page?.cta) return [];
  const body = cleanBody(parseArticle(articleMd).body);
  const sections = body.split(/^(?=##\s+(?!#))/m);
  const named = sections.map((s) => ({ heading: (/^##\s+(.+)$/m.exec(s)?.[1] ?? "").trim(), text: s }));
  const content = named.filter(
    (s) => s.heading && !/^(frequently asked questions|faq|key takeaways)$/i.test(s.heading),
  );
  const closing = content[content.length - 1]?.text ?? "";
  const problems: string[] = [];
  if (!closing.includes(page.cta.url)) {
    problems.push(
      `closing section does not link this page's ${page.facets?.funnel.toUpperCase() ?? ""} CTA (${page.cta.label}: ${page.cta.url})`,
    );
  }
  for (const other of page.otherCtaUrls) {
    if (closing.includes(other)) {
      problems.push(`closing section uses another funnel's CTA (${other}) — this page's close is ${page.cta.url}`);
    }
  }
  return problems;
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
  // D50: the funnel's CTA closes the page.
  if (files.article) problems.push(...ctaProblems(files.article, files.page));
  // D35: internal links must resolve; planned siblings are mentions, not links.
  const lr = files.linkReport;
  if (!lr) {
    problems.push("internal link check did not run — cannot pass the edit gate without it");
  } else {
    for (const r of lr.results) {
      if (r.status === "missing") {
        problems.push(
          `internal link does not resolve: ${r.url}${r.note ? ` (${r.note})` : ""} — link a page from page.md's link inventory, or drop the link`,
        );
      } else if (r.status === "off_target") {
        problems.push(
          `internal link off target: "${r.anchor ?? ""}" → ${r.url}${r.note ? ` — ${r.note}` : ""}. The sentence before a link must match what the destination delivers (D53)`,
        );
      } else if (r.status === "anchor_conflict") {
        problems.push(
          `anchor text "${r.anchor ?? ""}" already points at a different page on the site${r.note ? ` (${r.note})` : ""} — one anchor, one destination (D53)`,
        );
      }
    }
  }
  return result(problems);
}

/** One `## Heading` section of a markdown log (case-insensitive). */
function logSection(md: string, title: string): string | undefined {
  const m = new RegExp(`^##\\s+${title}\\s*$`, "im").exec(md);
  if (!m) return undefined;
  const rest = md.slice(m.index + m[0].length);
  const next = /^##\s+\S/m.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

function bullets(section: string | undefined): string[] {
  return (section ?? "")
    .split("\n")
    .map((l) => /^\s*[-*]\s+(.+)$/.exec(l)?.[1]?.trim() ?? "")
    .filter(Boolean);
}

/**
 * Parse the HDCP agent's markdown log (agents/hdcp.md → Log format). Returns
 * the log or the problems that make it unusable. Since D61 the Editor runs
 * after HDCP, so its gate checks the rewrite.
 */
export function parseHdcpLog(
  text: string | undefined,
  model = "",
): { log?: import("./types.js").HdcpLog; problems: string[] } {
  if (!text?.trim()) return { problems: ["hdcp.md missing — return the log as well as the article"] };
  const problems: string[] = [];
  const diagnosis = logSection(text, "Diagnosis");
  const changes = logSection(text, "Changes made");
  const cuts = logSection(text, "Cuts");
  const flags = logSection(text, "Flags");
  const notes = logSection(text, "Editor notes");
  if (!diagnosis) problems.push("hdcp.md: `## Diagnosis` is missing or empty — Step 1 comes first");
  if (!bullets(changes).length) problems.push("hdcp.md: `## Changes made` lists no changes");
  for (const [name, s] of [["Cuts", cuts], ["Flags", flags], ["Editor notes", notes]] as const) {
    if (s === undefined) problems.push(`hdcp.md: \`## ${name}\` section missing`);
  }
  if (problems.length) return { problems };
  // "none", "none inline. (…)", "n/a": the agent saying there's nothing to list.
  const none = (s: string) => /^(?:none|n\/a)\b|^[—-]\.?$/i.test(s.trim());
  return {
    problems,
    log: {
      ranAt: new Date(),
      model,
      diagnosis: diagnosis as string,
      changes: bullets(changes),
      cuts: bullets(cuts)
        .filter((c) => !none(c))
        .map((c) => {
          const at = c.search(/\s[—–-]\s/);
          return at === -1 ? { content: c, reason: "" } : { content: c.slice(0, at).trim(), reason: c.slice(at + 3).trim() };
        }),
      flags: bullets(flags).filter((f) => !none(f)),
      editorNotes: notes as string,
      markdown: text,
    },
  };
}

/**
 * HDCP gate: the output exists and is sound, and no editor note was
 * deleted. The rewrite itself is checked by the Editor's gate, which runs
 * after HDCP since D61.
 */
export function hdcpGate(files: GateFiles): GateResult {
  const problems: string[] = [];
  const raw = files.article ?? "";
  if (countWords(raw) < 50) {
    problems.push("article.md missing or empty after HDCP");
    return result(problems);
  }
  const { frontmatter, body } = parseArticle(raw);
  for (const key of ["title", "slug"] as const) {
    if (String(frontmatter[key] ?? "").trim() === "") problems.push(`HDCP dropped frontmatter: ${key}`);
  }
  if (countHeadings(cleanBody(body), 1) !== 1) problems.push("HDCP output must keep exactly one H1");
  if (/^\s*#{1,2}\s+Editor notes\s*$/im.test(body)) {
    problems.push("the editor notes belong in hdcp.md, not in the article");
  }
  problems.push(...parseHdcpLog(files.hdcpLog).problems);
  // D61: a note left for a human stays until a human resolves it.
  if (files.priorArticle) {
    const after = editorMarkers(raw);
    for (const m of editorMarkers(files.priorArticle)) {
      if (!after.includes(m)) problems.push(`HDCP removed an editor note it can't resolve — keep it verbatim: ${m.slice(0, 160)}`);
    }
  }
  return result(problems);
}

/**
 * Interview (D59/D61): the POV writer turned the expert's answers into
 * pov.md, before the Strategist plans. The brief must carry every section
 * the Strategist and Writer build on, including the facts to verify.
 */
export function interviewGate(files: GateFiles): GateResult {
  if (files.interviewSkipped) return result([]);
  return result(povProblems(files.pov));
}

/**
 * Evidence (D61): every third-party fact the expert raised has a verdict in
 * research-notes.md → Interview Evidence, and the verified ones passed the
 * live citation check, from a source that isn't a head-to-head competitor.
 */
export function evidenceGate(files: GateFiles): GateResult {
  if (!factsToVerify(files.pov).length) return result([]);
  const problems = evidenceProblems(files.pov, files.researchNotes ?? "");
  const cr = files.citationReport;
  if (cr) {
    for (const r of cr.results) {
      if (r.verdict === "unsupported" || r.verdict === "unreachable") {
        problems.push(`Interview evidence source #${r.sourceN} (${r.url}): ${r.verdict} — "${r.claim.slice(0, 100)}"${r.note ? ` (${r.note})` : ""}`);
      }
    }
  }
  if (files.competitorReport) {
    for (const c of files.competitorReport.checks) {
      if (c.level === "fail") problems.push(`competitor FAIL: ${c.message}`);
    }
  }
  return result(problems);
}

/**
 * Verify (D61): the final text passes every Edit check, the verify stage
 * recorded its rounds, and each issue still open after the last round is
 * flagged inline for the editor.
 */
export function verifyGate(files: GateFiles): GateResult {
  const problems = editGate(files).problems;
  const v = files.verification;
  if (!v?.completedAt) {
    problems.push("verification did not complete — no review of the final text is recorded");
  } else {
    const flagged = editorMarkers(files.article ?? "").filter((m) => m.startsWith("[VERIFY:")).length;
    if (flagged < v.unresolved.length) {
      problems.push(`${v.unresolved.length} unresolved verification issue(s) but ${flagged} [VERIFY: …] note(s) in the article`);
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
  interview: interviewGate,
  evidence: evidenceGate,
  outline: outlineGate,
  write: writeGate,
  hdcp: hdcpGate,
  edit: editGate,
  verify: verifyGate,
  schema: schemaGate,
  design: designGate,
};
