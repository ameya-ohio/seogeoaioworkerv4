import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeXmlText, columnToIndex, parseCsv, readWorkbook, WorkbookError } from "./xlsx.js";
import { unzip, ZipError } from "./zip.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = () => readFileSync(join(here, "__fixtures__", "sample-plan.xlsx"));

describe("zip reader", () => {
  it("reads a real archive written by an independent zip implementation", () => {
    const parts = unzip(fixture());
    expect(parts.has("xl/workbook.xml")).toBe(true);
    expect(parts.has("xl/sharedStrings.xml")).toBe(true);
    expect(parts.get("xl/workbook.xml")?.toString("utf8")).toContain("<sheet ");
  });

  it("rejects non-zip input with a clear error", () => {
    expect(() => unzip(Buffer.from("this is not a zip archive at all"))).toThrow(ZipError);
  });
});

describe("xml helpers", () => {
  it("decodes named, decimal, and hex entities", () => {
    expect(decodeXmlText("a &amp; b")).toBe("a & b");
    expect(decodeXmlText("&lt;tag&gt; &quot;q&quot; &apos;s&apos;")).toBe(`<tag> "q" 's'`);
    expect(decodeXmlText("&#65;&#x42;")).toBe("AB");
  });

  it("leaves unknown entities alone rather than corrupting them", () => {
    expect(decodeXmlText("&nbsp;x")).toBe("&nbsp;x");
  });

  it("converts A1 column refs", () => {
    expect(columnToIndex("A1")).toBe(1);
    expect(columnToIndex("Z9")).toBe(26);
    expect(columnToIndex("AA1")).toBe(27);
    expect(columnToIndex("BC12")).toBe(55);
  });
});

describe("readWorkbook — xlsx", () => {
  it("shapes tabular sheets and routes free-form sheets to text", async () => {
    const wb = await readWorkbook(fixture(), "sample-plan.xlsx");
    const names = wb.sheets.map((s) => s.name);
    expect(names).toContain("Content Map");
    expect(names).toContain("Pillar Summary");
    expect(names).toContain("Subtopics");
    // README has only 2 non-empty cells in its widest row -> not tabular.
    expect(names).not.toContain("README");
    expect(wb.textSheets["README"]).toContain("Sample SEO Topic Map");
  });

  it("reads the payload sheet's headers and every data row", async () => {
    const wb = await readWorkbook(fixture(), "sample-plan.xlsx");
    const map = wb.sheets.find((s) => s.name === "Content Map");
    expect(map).toBeDefined();
    expect(map?.headers.slice(0, 5)).toEqual([
      "ID",
      "Pillar",
      "Subtopic",
      "Article + Phrase Combo",
      "Page Role",
    ]);
    expect(map?.rows).toHaveLength(9);
    expect(map?.rows[0]?.[0]).toBe("P01");
    expect(map?.rows[2]?.[3]).toBe("Widget Exposure vs Widget Risk");
  });

  it("decodes entities in cell text", async () => {
    const wb = await readWorkbook(fixture(), "sample-plan.xlsx");
    const map = wb.sheets.find((s) => s.name === "Content Map");
    const row = map?.rows.find((r) => r[0] === "P01-S01-A03");
    expect(row?.[9]).toBe('Tie-in with "quotes" & ampersand');
  });

  it("pads every row to a uniform width so column indexes stay valid", async () => {
    const wb = await readWorkbook(fixture(), "sample-plan.xlsx");
    for (const sheet of wb.sheets) {
      const width = sheet.headers.length;
      for (const row of sheet.rows) expect(row).toHaveLength(width);
    }
  });

  it("marks truncation instead of silently dropping rows", async () => {
    const wb = await readWorkbook(fixture(), "sample-plan.xlsx", { maxRows: 3 });
    const map = wb.sheets.find((s) => s.name === "Content Map");
    expect(map?.truncated).toBe(true);
    expect((map?.rows.length ?? 0)).toBeLessThan(9);
  });

  it("explains a renamed .xls rather than failing cryptically", async () => {
    await expect(
      readWorkbook(Buffer.from("\xd0\xcf\x11\xe0 old binary xls"), "old.xlsx"),
    ).rejects.toThrow(/re-save it as \.xlsx/);
  });

  it("refuses unsupported extensions", async () => {
    await expect(readWorkbook(Buffer.from("x"), "notes.pdf")).rejects.toThrow(WorkbookError);
  });
});

describe("parseCsv", () => {
  it("handles quotes, doubled quotes, commas and CRLF", () => {
    const rows = parseCsv('a,b,c\r\n1,"x,y","he said ""hi"""\r\n');
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "x,y", 'he said "hi"'],
    ]);
  });

  it("handles newlines inside quoted fields", () => {
    expect(parseCsv('a,b\n"line1\nline2",z')).toEqual([
      ["a", "b"],
      ["line1\nline2", "z"],
    ]);
  });

  it("strips a UTF-8 BOM from the first header", () => {
    expect(parseCsv("﻿ID,Pillar\n1,x")[0]?.[0]).toBe("ID");
  });
});

describe("readWorkbook — csv", () => {
  it("produces the same shape as an xlsx sheet", async () => {
    const csv = "ID,Pillar,Title\nP01,Widget Security,What is Widget Exposure\n";
    const wb = await readWorkbook(Buffer.from(csv), "map.csv");
    expect(wb.sheets).toHaveLength(1);
    expect(wb.sheets[0]?.headers).toEqual(["ID", "Pillar", "Title"]);
    expect(wb.sheets[0]?.rows).toEqual([["P01", "Widget Security", "What is Widget Exposure"]]);
  });
});
