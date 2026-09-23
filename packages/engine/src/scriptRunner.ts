import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import type { CheckLine, ScriptReport } from "./types.js";

const execFileAsync = promisify(execFile);

/**
 * The canonical quality logic lives in the stdlib-only Python scripts
 * (scripts/seo_audit.py, scripts/validate_schema.py) — single source of
 * truth shared with terminal mode (decision D12). The worker shells out and
 * parses their PASS/WARN/FAIL lines into structured, storable reports.
 */
export interface ScriptRunnerOptions {
  repoRoot: string;
  pythonBin?: string;
  /** Forwarded so the scripts load the same company config as the worker. */
  companyConfigPath?: string;
}

const LINE_RE = /^(PASS|WARN|FAIL)\s{2,}(.*)$/;

export function parseScriptOutput(stdout: string, exitCode: number): ScriptReport {
  const checks: CheckLine[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const m = LINE_RE.exec(line);
    if (!m) continue;
    checks.push({
      level: (m[1] as string).toLowerCase() as CheckLine["level"],
      message: (m[2] as string).trim(),
    });
  }
  return {
    checks,
    passes: checks.filter((c) => c.level === "pass").length,
    warnings: checks.filter((c) => c.level === "warn").length,
    failures: checks.filter((c) => c.level === "fail").length,
    exitCode,
    ranAt: new Date(),
    raw: stdout,
  };
}

async function runScript(
  opts: ScriptRunnerOptions,
  scriptRelPath: string,
  args: string[],
): Promise<ScriptReport> {
  const python = opts.pythonBin ?? "python3";
  const env = { ...process.env };
  if (opts.companyConfigPath) env["COMPANY_CONFIG"] = opts.companyConfigPath;
  try {
    const { stdout } = await execFileAsync(python, [join(opts.repoRoot, scriptRelPath), ...args], {
      cwd: opts.repoRoot,
      env,
      maxBuffer: 4 * 1024 * 1024,
    });
    return parseScriptOutput(stdout, 0);
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stdout?: string; code?: number | string };
    if (typeof e.stdout === "string" && e.stdout.length > 0) {
      const code = typeof e.code === "number" ? e.code : 1;
      return parseScriptOutput(e.stdout, code);
    }
    throw err;
  }
}

/** Run scripts/seo_audit.py against an article folder. Exit 1 = has failures. */
export function runSeoAudit(opts: ScriptRunnerOptions, articleFolder: string): Promise<ScriptReport> {
  return runScript(opts, join("scripts", "seo_audit.py"), [articleFolder]);
}

/** Run scripts/validate_schema.py against a schema.json path. */
export function runSchemaValidation(
  opts: ScriptRunnerOptions,
  schemaPath: string,
): Promise<ScriptReport> {
  return runScript(opts, join("scripts", "validate_schema.py"), [schemaPath]);
}
