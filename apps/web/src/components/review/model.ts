import type { CheckLine, LinkPlanComparison, TechnicalIssue } from "@blogagent/engine";
import type { UiRun } from "@/lib/ui-types";

export interface ReviewArticle {
  slug: string;
  folder: string;
  stage: string;
  title: string;
  targetKeyword: string | null;
  markdown: string;
  researchNotes: string | null;
  outline: string | null;
  draft: string | null;
  schemaJson: string | null;
  audit: CheckLine[] | null;
  schemaValidation: CheckLine[] | null;
  /** D34 citation verification + D35 link resolution, as pass/fail lines. */
  citations: CheckLine[] | null;
  links: CheckLine[] | null;
  /** D62: the outline's planned internal links against the saved article. */
  linkPlan: LinkPlanComparison | null;
  /** Pre-edit expert read of the Writer's draft (agents/technical-reviewer.md). */
  technicalReview: {
    ranAt: string;
    model: string;
    issues: TechnicalIssue[];
    droppedUnquoted: number;
    skipped: string | null;
    costUsd: number | null;
  } | null;
  /** Everything handed to the Editor before its first attempt. */
  editPreAudit: string[] | null;
  /** D61: the verify stage's rounds on the final text. */
  verification: {
    rounds: {
      round: number;
      mode: "review" | "confirm";
      model: string;
      issues: TechnicalIssue[];
      skipped: string | null;
      fixed: boolean;
      costUsd: number | null;
      at: string;
    }[];
    unresolved: number;
  } | null;
  /** D59 expert interview: status, the Expert POV brief and the transcript. */
  interview: { status: string; pov: string | null; transcript: string } | null;
  /** HDCP (agents/hdcp.md): diagnosis, changes, cuts, flags and editor notes. */
  hdcp: {
    ranAt: string;
    model: string;
    diagnosis: string;
    changes: string[];
    cuts: { content: string; reason: string }[];
    flags: string[];
    editorNotes: string;
  } | null;
  /** HubSpot post for this article (roadmap Phase 5), once sent. */
  hubspot: { postId: string; url: string | null; state: string; syncedAt: string | null } | null;
  hubspotConfig: { configured: boolean; tokenEnv: string };
  /** D52: where finished pages go. */
  publishTarget: "framer-export" | "hubspot";
  /** D52: confirmed live URL. */
  live: { url: string; verifiedAt: string; status: number } | null;
  /** D52: when the Framer package was last downloaded. */
  exportedAt: string | null;
  /** D51: vendor formats need a human sign-off before export. */
  signoffRequired: boolean;
  signoff: { by: string; at: string; note: string | null } | null;
  /** D45/D46: the page's facets, format and reserved URL. */
  facets: { pageRole: string; searchIntent: string; articleType: string; funnel: string; source: string } | null;
  formatLabel: string;
  /** formats.json slugs + labels for the Facets tab. */
  formatOptions: { value: string; label: string }[];
  /** What the facets resolve to (D49/D50), for the Facets tab. */
  rules: { lengthBand: string; takeaways: string; faq: string; cta: string; schema: string[] } | null;
  path: string | null;
  canonicalUrl: string | null;
  hasHeader: boolean;
  activeRun: UiRun | null;
  runs: UiRun[];
}

export const headerUrl = (a: Pick<ReviewArticle, "folder">) => `/api/storage/articles/${a.folder}/header.png`;

/** Pipeline phases with what a re-run from each one redoes. */
export const PHASES: { key: string; label: string; does: string }[] = [
  { key: "research", label: "Research", does: "Gathers sources and candidate positions" },
  { key: "interview", label: "Interview", does: "Expert interview and point of view" },
  { key: "evidence", label: "Evidence", does: "Checks the facts the expert raised" },
  { key: "outline", label: "Outline", does: "Thesis, argument spine and outline" },
  { key: "write", label: "Write", does: "Writes the draft" },
  { key: "hdcp", label: "HDCP", does: "Rewrites the draft for a human voice" },
  { key: "edit", label: "Edit", does: "Edits against the checklists" },
  { key: "verify", label: "Verify", does: "Expert technical review and fixes" },
  { key: "schema", label: "Schema", does: "Builds the JSON-LD schema" },
  { key: "design", label: "Design", does: "Generates the header image" },
];

/** Same set the export gate refuses on (engine EDITOR_MARKER_RE). */
export const NOTE_RE = /\[(?:NEEDS SOURCE|NEEDS RESEARCH|HUMAN INPUT|VERIFY):[^\]]*\]/g;

export interface EditorNote {
  /** 0-based, in order of appearance in the full markdown. */
  n: number;
  start: number;
  end: number;
  raw: string;
  kind: string;
  text: string;
}

const KIND_NAME: Record<string, string> = {
  VERIFY: "Verify",
  "HUMAN INPUT": "Human input",
  "NEEDS RESEARCH": "Needs research",
  "NEEDS SOURCE": "Needs source",
};

export function findNotes(markdown: string): EditorNote[] {
  const out: EditorNote[] = [];
  for (const m of markdown.matchAll(NOTE_RE)) {
    const raw = m[0];
    const inner = raw.slice(1, -1);
    const colon = inner.indexOf(":");
    const key = inner.slice(0, colon);
    out.push({
      n: out.length,
      start: m.index ?? 0,
      end: (m.index ?? 0) + raw.length,
      raw,
      kind: KIND_NAME[key] ?? key,
      text: inner.slice(colon + 1).trim(),
    });
  }
  return out;
}

/** Remove one note from the markdown, with the space that led into it. */
export function removeNote(markdown: string, note: EditorNote): string {
  let start = note.start;
  const after = markdown[note.end] ?? "";
  if (start > 0 && markdown[start - 1] === " " && (after === "" || /[\s.,;:!?)]/.test(after))) start -= 1;
  return markdown.slice(0, start) + markdown.slice(note.end);
}

/** Body only: frontmatter, json-ld fence, and HTML comments stripped. */
export function previewBody(markdown: string): string {
  return markdown
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
    .replace(/```json-ld[\s\S]*?```/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
}

export const NOTE_HREF = "#review-note-";

export interface OutlineEntry {
  id: string;
  title: string;
  /** 1-based line in the reading body (matches react-markdown positions); 0 = top. */
  line: number;
  notes: number[];
}

export interface ReadingBody {
  body: string;
  outline: OutlineEntry[];
  /** Note numbers visible in the reading view, in order. */
  visibleNotes: number[];
  words: number;
}

function plainHeading(s: string): string {
  return s
    .replace(/\[([^\]]*)\]\([^)]*\)/g, (_m, t: string) => (t.match(NOTE_RE) || /^(?:VERIFY|HUMAN INPUT|NEEDS)/.test(t) ? "" : t))
    .replace(/[*_`]/g, "")
    .replace(/\s+#+\s*$/, "")
    .trim();
}

/**
 * The reading view's markdown: each editor note becomes a link to
 * `#review-note-<n>` (rendered as a highlight), then frontmatter and
 * comments are stripped. Line numbers are preserved, so the H2 outline and
 * each note's section come straight from the text.
 */
export function readingBody(markdown: string): ReadingBody {
  const notes = findNotes(markdown);
  let marked = "";
  let last = 0;
  for (const note of notes) {
    const label = note.raw.slice(1, -1).replace(/\\/g, "\\\\").replace(/\[/g, "\\[");
    marked += markdown.slice(last, note.start) + `[${label}](${NOTE_HREF}${note.n})`;
    last = note.end;
  }
  marked += markdown.slice(last);
  const body = previewBody(marked);

  const lines = body.split("\n");
  const outline: OutlineEntry[] = [];
  const top: OutlineEntry = { id: "sec-top", title: "Introduction", line: 0, notes: [] };
  const visibleNotes: number[] = [];
  let fence = false;
  let words = 0;
  lines.forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (!fence) {
      const h2 = /^##\s+(.+)$/.exec(line);
      if (h2) outline.push({ id: `sec-${outline.length}`, title: plainHeading(h2[1] ?? ""), line: i + 1, notes: [] });
    }
    const text = line.replace(/\]\(#review-note-\d+\)/g, "]").replace(/[#>*_`|-]/g, " ");
    words += text.split(/\s+/).filter(Boolean).length;
    for (const m of line.matchAll(/\]\(#review-note-(\d+)\)/g)) {
      const n = Number(m[1]);
      visibleNotes.push(n);
      (outline[outline.length - 1] ?? top).notes.push(n);
    }
  });
  if (top.notes.length > 0) outline.unshift(top);
  return { body, outline, visibleNotes, words };
}

/** Same normalization the worker uses to match a finding's quote to the draft. */
export function normalizeQuote(s: string): string {
  return s
    .replace(/[*_`]/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export const KIND_LABEL: Record<TechnicalIssue["kind"], string> = {
  technical_error: "Technical error",
  contradiction: "Contradiction",
  outdated: "Outdated",
  unsupported_number: "Unsupported number",
  not_actionable: "Not actionable",
  generic_example: "Generic example",
  thesis_unsupported: "Claim not proven",
  thesis_not_first: "Thesis not first",
};

export type DiffLine = { kind: "same" | "add" | "del"; text: string };

/** Line diff (LCS) of the first draft against the current text. Null when too large to diff. */
export function lineDiff(before: string, after: string): DiffLine[] | null {
  const a = before.split("\n");
  const b = after.split("\n");
  const n = a.length;
  const m = b.length;
  if (n * m > 6_000_000) return null;
  const w = m + 1;
  const dp = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = a[i] === b[j] ? dp[(i + 1) * w + j + 1]! + 1 : Math.max(dp[(i + 1) * w + j]!, dp[i * w + j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i]! });
      i++;
      j++;
    } else if (dp[(i + 1) * w + j]! >= dp[i * w + j + 1]!) {
      out.push({ kind: "del", text: a[i++]! });
    } else {
      out.push({ kind: "add", text: b[j++]! });
    }
  }
  while (i < n) out.push({ kind: "del", text: a[i++]! });
  while (j < m) out.push({ kind: "add", text: b[j++]! });
  return out;
}

export function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function hostPath(url: string): string {
  return url.replace(/^https?:\/\//, "");
}
