import { unzip, ZipError } from "./zip.js";
import type { PlanSheet } from "./types.js";

/**
 * Read a workbook (.xlsx) or a .csv into one uniform grid shape.
 *
 * `ParsedWorkbook` is deliberately the ONLY seam between file formats and
 * everything downstream, so the reader can be swapped without touching
 * mapping, synthesis, or the UI.
 *
 * Scope: values as text. Cells that hold Excel date serials come through as
 * their underlying number — a content plan is text, and guessing at date
 * formats would be a silent-corruption risk for no benefit here.
 */

export class WorkbookError extends Error {}

export interface ParsedWorkbook {
  sheets: PlanSheet[];
  /** Free-form sheets with no tabular shape (a README tab), joined as text. */
  textSheets: Record<string, string>;
}

export interface ReadWorkbookOptions {
  /** Rows per sheet before truncating, so a huge file fails visibly. */
  maxRows?: number;
}

const DEFAULT_MAX_ROWS = 5000;

// ── XML helpers ───────────────────────────────────────────────────────────
// A full XML parser is not needed: these parts are machine-generated and
// shallow. What IS needed is correct entity handling, because sheet text
// routinely contains & and quotes.

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

export function decodeXmlText(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    const named = ENTITIES[body.toLowerCase()];
    return named ?? whole;
  });
}

/** Concatenate the text of every <t> element in a fragment, entities decoded. */
function textOfAllT(fragment: string): string {
  let out = "";
  const re = /<t(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/t>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fragment)) !== null) out += decodeXmlText(m[1] ?? "");
  return out;
}

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`).exec(tag);
  return m ? decodeXmlText(m[1] ?? "") : undefined;
}

/** "BC" -> 55. 1-based, matching A1 notation. */
export function columnToIndex(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref.toUpperCase());
  if (!letters) return 0;
  let n = 0;
  for (const ch of letters[1] as string) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

// ── xlsx ──────────────────────────────────────────────────────────────────

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const re = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>|<si\s*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(textOfAllT(m[1] ?? ""));
  return out;
}

interface SheetRef {
  name: string;
  path: string;
}

function parseWorkbookSheets(workbookXml: string, relsXml: string): SheetRef[] {
  const rels = new Map<string, string>();
  const relRe = /<Relationship\b[^>]*\/?>/g;
  let rm: RegExpExecArray | null;
  while ((rm = relRe.exec(relsXml)) !== null) {
    const tag = rm[0];
    const id = attr(tag, "Id");
    const target = attr(tag, "Target");
    if (id && target) rels.set(id, target);
  }

  const sheets: SheetRef[] = [];
  const sheetRe = /<sheet\b[^>]*\/?>/g;
  let sm: RegExpExecArray | null;
  while ((sm = sheetRe.exec(workbookXml)) !== null) {
    const tag = sm[0];
    const name = attr(tag, "name");
    const rid = attr(tag, "r:id") ?? attr(tag, "relationshipId");
    if (!name || !rid) continue;
    let target = rels.get(rid);
    if (!target) continue;
    if (target.startsWith("/")) target = target.slice(1);
    else if (!target.startsWith("xl/")) target = `xl/${target}`;
    sheets.push({ name, path: target });
  }
  return sheets;
}

function parseSheetGrid(xml: string, shared: string[], maxRows: number): {
  grid: string[][];
  truncated: boolean;
} {
  const grid: string[][] = [];
  let truncated = false;

  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml)) !== null) {
    if (grid.length >= maxRows) {
      truncated = true;
      break;
    }
    const body = rm[1] ?? "";
    const cells: string[] = [];
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(body)) !== null) {
      const cellAttrs = cm[1] ?? "";
      const inner = cm[2] ?? "";
      const ref = attr(`<c ${cellAttrs}>`, "r");
      const type = attr(`<c ${cellAttrs}>`, "t");
      // Cells may be sparse; place by column so columns stay aligned.
      const col = ref ? columnToIndex(ref) : cells.length + 1;

      let value = "";
      if (type === "s") {
        const vm = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner);
        const idx = vm ? Number.parseInt(decodeXmlText(vm[1] ?? ""), 10) : Number.NaN;
        value = Number.isFinite(idx) ? shared[idx] ?? "" : "";
      } else if (type === "inlineStr") {
        value = textOfAllT(inner);
      } else if (type === "b") {
        const vm = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner);
        value = (vm?.[1] ?? "").trim() === "1" ? "TRUE" : "FALSE";
      } else {
        // Numbers, dates-as-serials, and formula results (t="str").
        const vm = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner);
        if (vm) value = decodeXmlText(vm[1] ?? "");
        else value = textOfAllT(inner);
      }

      while (cells.length < col - 1) cells.push("");
      cells[col - 1] = value;
    }
    grid.push(cells);
  }
  return { grid, truncated };
}

// ── csv ───────────────────────────────────────────────────────────────────

/** RFC4180-ish: quoted fields, doubled quotes, CRLF or LF, embedded newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  // Strip a UTF-8 BOM so the first header does not carry an invisible char.
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i] as string;
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ── shaping ───────────────────────────────────────────────────────────────

function isBlank(row: string[] | undefined): boolean {
  return !row || row.every((c) => (c ?? "").trim() === "");
}

/**
 * A sheet counts as tabular when its first non-empty row looks like a header
 * (>= 3 non-empty cells) and there is at least one row under it. Anything
 * else — a README tab, a cover sheet — becomes text, which is how free-form
 * sheets are kept without special-casing their names.
 */
function shapeSheet(
  name: string,
  grid: string[][],
  truncated: boolean,
): { sheet?: PlanSheet; text?: string } {
  const firstIdx = grid.findIndex((r) => !isBlank(r));
  if (firstIdx === -1) return { text: "" };
  const header = (grid[firstIdx] ?? []).map((c) => (c ?? "").trim());
  const nonEmpty = header.filter((c) => c !== "").length;
  const body = grid.slice(firstIdx + 1).filter((r) => !isBlank(r));

  if (nonEmpty >= 3 && body.length >= 1) {
    const width = Math.max(header.length, ...body.map((r) => r.length));
    const pad = (r: string[]) => {
      const out = r.slice(0, width).map((c) => (c ?? "").trim());
      while (out.length < width) out.push("");
      return out;
    };
    const sheet: PlanSheet = {
      name,
      headers: pad(header),
      rows: body.map(pad),
    };
    if (truncated) sheet.truncated = true;
    return { sheet };
  }
  const text = grid
    .filter((r) => !isBlank(r))
    .map((r) => r.map((c) => (c ?? "").trim()).filter(Boolean).join(" | "))
    .join("\n");
  return { text };
}

export async function readWorkbook(
  buf: Buffer,
  filename: string,
  opts: ReadWorkbookOptions = {},
): Promise<ParsedWorkbook> {
  const maxRows = opts.maxRows ?? DEFAULT_MAX_ROWS;
  const lower = filename.toLowerCase();

  if (lower.endsWith(".csv") || lower.endsWith(".tsv") || lower.endsWith(".txt")) {
    const grid = parseCsv(buf.toString("utf8")).slice(0, maxRows + 1);
    const name = filename.replace(/\.[^.]+$/, "");
    const { sheet, text } = shapeSheet(name, grid, false);
    return {
      sheets: sheet ? [sheet] : [],
      textSheets: text !== undefined ? { [name]: text } : {},
    };
  }

  if (!lower.endsWith(".xlsx") && !lower.endsWith(".xlsm")) {
    throw new WorkbookError(
      `unsupported file type "${filename}" — upload .xlsx or .csv`,
    );
  }

  let parts: Map<string, Buffer>;
  try {
    parts = unzip(buf);
  } catch (err) {
    if (err instanceof ZipError) {
      // The classic case: a .xls (old binary format) renamed to .xlsx.
      throw new WorkbookError(
        `could not read "${filename}" as a workbook: ${err.message}. ` +
          `If this is an older .xls file, re-save it as .xlsx or export a CSV.`,
      );
    }
    throw err;
  }

  const read = (p: string): string | undefined => parts.get(p)?.toString("utf8");
  const workbookXml = read("xl/workbook.xml");
  if (!workbookXml) throw new WorkbookError("not a workbook (xl/workbook.xml missing)");
  const relsXml = read("xl/_rels/workbook.xml.rels") ?? "";
  const shared = parseSharedStrings(read("xl/sharedStrings.xml") ?? "");

  const sheets: PlanSheet[] = [];
  const textSheets: Record<string, string> = {};
  for (const ref of parseWorkbookSheets(workbookXml, relsXml)) {
    const xml = read(ref.path);
    if (xml === undefined) continue;
    const { grid, truncated } = parseSheetGrid(xml, shared, maxRows);
    const shaped = shapeSheet(ref.name, grid, truncated);
    if (shaped.sheet) sheets.push(shaped.sheet);
    if (shaped.text !== undefined) textSheets[ref.name] = shaped.text;
  }
  if (sheets.length === 0 && Object.keys(textSheets).length === 0) {
    throw new WorkbookError(`"${filename}" contains no readable sheets`);
  }
  return { sheets, textSheets };
}
