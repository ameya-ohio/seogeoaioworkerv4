import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HEADER_PATTERNS, embedSchema, estimateCostUsd, parseFiles, setFrontmatter } from "./directRunner.js";

const REAL_REPO = join(import.meta.dirname, "..", "..", "..");

describe("parseFiles", () => {
  it("keeps only allowed names and unwraps a fenced body", () => {
    const text = [
      'Preamble the model should not have written.',
      '<file name="article.md">',
      "```markdown\n# Title\n\nBody\n```",
      "</file>",
      '<file name="notes.txt">stray</file>',
      '<file name="meta.json">{"a":1}</file>',
    ].join("\n");
    const files = parseFiles(text, ["article.md", "meta.json"]);
    expect([...files.keys()]).toEqual(["article.md", "meta.json"]);
    expect(files.get("article.md")).toBe("# Title\n\nBody");
    expect(files.get("meta.json")).toBe('{"a":1}');
  });
});

describe("embedSchema", () => {
  const json = '{\n  "@graph": []\n}';

  it("inserts the fence above the edit summary", () => {
    const md = "# T\n\nBody.\n\n<!-- EDIT SUMMARY: ok -->\n";
    const out = embedSchema(md, json);
    expect(out).toBe("# T\n\nBody.\n\n```json-ld\n" + json + "\n```\n\n<!-- EDIT SUMMARY: ok -->\n");
  });

  it("appends when there is no edit summary, and replaces an existing fence", () => {
    const once = embedSchema("# T\n\nBody.\n", '{"old": true}');
    const twice = embedSchema(once, json);
    expect([...twice.matchAll(/```json-ld/g)]).toHaveLength(1);
    expect(twice).toBe("# T\n\nBody.\n\n```json-ld\n" + json + "\n```\n");
  });
});

describe("setFrontmatter", () => {
  it("replaces existing keys (dropping trailing comments) and appends missing ones", () => {
    const md = '---\ntitle: "T"\nhero_image: ""   # set by Phase 6\n---\n\n# T\n';
    const out = setFrontmatter(md, { hero_image: "header.png", hero_image_alt: 'A "quoted" alt' });
    expect(out).toBe(
      '---\ntitle: "T"\nhero_image: "header.png"\nhero_image_alt: "A \\"quoted\\" alt"\n---\n\n# T\n',
    );
  });
});

describe("estimateCostUsd", () => {
  it("prices cache writes at 1.25× and reads at 0.1× input", () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 100_000, cacheReadTokens: 1_000_000, cacheCreationTokens: 1_000_000 };
    // Sonnet 5: $2 + $0.2 + $2.5 input side, $1 output.
    expect(estimateCostUsd("claude-sonnet-5", usage)).toBeCloseTo(5.7, 6);
    expect(estimateCostUsd("some-unknown-model", usage)).toBeUndefined();
  });
});

describe("HEADER_PATTERNS", () => {
  it("matches PATTERN_NAMES in blogheaderimagegen/lib/patterns.py", () => {
    const py = readFileSync(join(REAL_REPO, "blogheaderimagegen", "lib", "patterns.py"), "utf-8");
    const block = /PATTERN_NAMES\s*=\s*\(([\s\S]*?)\)/.exec(py)?.[1] ?? "";
    const names = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(names).toEqual([...HEADER_PATTERNS]);
  });
});
