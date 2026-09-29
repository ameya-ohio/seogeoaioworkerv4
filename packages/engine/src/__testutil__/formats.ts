import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFormatRegistry, type FormatRegistry } from "../formats.js";

/** The repo root, from packages/engine/src/__testutil__. */
export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

let cached: FormatRegistry | undefined;

/** The real standards/formats.json — tests pin behaviour to the shipped registry. */
export function testFormats(): FormatRegistry {
  cached ??= loadFormatRegistry(REPO_ROOT);
  return cached;
}
