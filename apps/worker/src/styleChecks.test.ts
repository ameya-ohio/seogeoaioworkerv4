import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REAL_REPO = join(import.meta.dirname, "..", "..", "..");

/** The style detectors are Python (scripts/ is stdlib-only); run their unit tests with the rest. */
describe("scripts/style_checks.py", () => {
  it("passes its unittest suite", () => {
    const out = execFileSync("python3", ["-m", "unittest", "discover", "-s", "scripts", "-p", "test_*.py"], {
      cwd: REAL_REPO,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    expect(out).toBe("");
  });
});
