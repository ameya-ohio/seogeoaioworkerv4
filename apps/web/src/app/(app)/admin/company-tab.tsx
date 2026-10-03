import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { ChevronRight, ExternalLink, TriangleAlert } from "lucide-react";
import { getCompany } from "@/lib/db";
import { repoRoot } from "@/lib/repo";
import { EmptyState } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SettingsGroup, SettingsRow, SettingsTitle, SettingsValue, settingsCategory } from "@/components/settings/settings-ui";

/** Settings › Company: config/company.yaml as a readable, read-only form. */

function get(raw: Record<string, unknown>, dotted: string): unknown {
  let cur: unknown = raw;
  for (const part of dotted.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[part];
    else return undefined;
  }
  return cur;
}

function str(raw: Record<string, unknown>, dotted: string): string | null {
  const v = get(raw, dotted);
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function Value({ value, mono, href }: { value: string | null; mono?: boolean; href?: boolean }) {
  if (!value) return <SettingsValue muted>Not set</SettingsValue>;
  if (href && /^https?:\/\//.test(value)) {
    return (
      <a
        href={value}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-w-0 items-center gap-1 font-mono text-xs break-all text-primary hover:underline"
      >
        {value}
        <ExternalLink aria-hidden className="size-3 shrink-0" />
      </a>
    );
  }
  return <SettingsValue mono={mono}>{value}</SettingsValue>;
}

const PUBLISH: Record<string, { label: string; note: string }> = {
  "framer-export": {
    label: "Framer export",
    note: "Review downloads a paste-ready package, and you mark the page live once it is up.",
  },
  hubspot: {
    label: "HubSpot",
    note: "Approved articles are sent to HubSpot from Review.",
  },
};

export async function CompanyTab() {
  const category = settingsCategory("company");
  let company: ReturnType<typeof getCompany>;
  let yaml = "";
  try {
    company = getCompany();
    yaml = await readFile(company.path, "utf-8");
  } catch (err) {
    return (
      <div className="flex max-w-[720px] flex-col gap-[26px]">
        <SettingsTitle category={category} />
        <div className="rounded-xl bg-surface shadow-card">
          <EmptyState
            icon={TriangleAlert}
            title="company.yaml could not be loaded"
            hint={err instanceof Error ? err.message : "Run /configure-company in terminal mode."}
          />
        </div>
      </div>
    );
  }

  const raw = company.raw;
  const target = str(raw, "publish.target");
  const publish = target ? PUBLISH[target] : undefined;
  const interview = str(raw, "pipeline.interview");
  const accent = str(raw, "brand.colors.primary_accent");
  const font = str(raw, "brand.font.family");
  let shownPath = company.path;
  try {
    const rel = relative(repoRoot(), company.path);
    if (rel && !rel.startsWith("..")) shownPath = rel;
  } catch {
    /* keep the absolute path */
  }

  return (
    <div className="flex max-w-[720px] flex-col gap-[26px]">
      <SettingsTitle category={category} />

      <SettingsGroup title="Identity">
        <SettingsRow label="Name">
          <Value value={str(raw, "company.name") ?? company.companyName} />
        </SettingsRow>
        <SettingsRow label="Domain">
          <Value value={str(raw, "company.domain")} mono />
        </SettingsRow>
        <SettingsRow label="Website">
          <Value value={str(raw, "company.url")} href />
        </SettingsRow>
        <SettingsRow label="Description">
          {str(raw, "company.description") ? (
            <span className="min-w-0 text-right text-[13px] leading-[18px] text-label-2 text-pretty">{str(raw, "company.description")}</span>
          ) : (
            <SettingsValue muted>Not set</SettingsValue>
          )}
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Site" footnote={publish?.note}>
        <SettingsRow label="Base URL">
          <Value value={str(raw, "site.base_url")} href />
        </SettingsRow>
        <SettingsRow label="Path prefix">
          <Value value={str(raw, "site.path_prefix")} mono />
        </SettingsRow>
        {str(raw, "blog.base_url") && (
          <SettingsRow label="Blog">
            <Value value={str(raw, "blog.base_url")} href />
          </SettingsRow>
        )}
        <SettingsRow label="Publish to">
          <Value value={publish?.label ?? target} />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Author">
        <SettingsRow label="Name">
          <Value value={str(raw, "author.name")} />
        </SettingsRow>
        <SettingsRow label="Job title">
          <Value value={str(raw, "author.job_title")} />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Pipeline"
        footnote="A content plan's own interview setting wins for its articles, and Strategy can skip it per article."
      >
        <SettingsRow label="Expert interview" sub="After research, before the outline">
          <Value value={interview === "skip" ? "Skipped" : interview === "pause" ? "Runs pause for it" : interview} />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Brand">
        <SettingsRow label="Accent color">
          {accent ? (
            <span className="inline-flex items-center gap-2 font-mono text-xs text-label-2">
              <span
                aria-hidden
                className="size-5 rounded-[6px] shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.15)]"
                style={{ background: accent }}
              />
              {accent}
            </span>
          ) : (
            <SettingsValue muted>Not set</SettingsValue>
          )}
        </SettingsRow>
        <SettingsRow label="Font">
          <Value value={font} />
        </SettingsRow>
      </SettingsGroup>

      <Collapsible className="flex flex-col gap-2">
        <p className="mx-4 text-xs leading-4 text-label-2 text-pretty">
          Loaded from <span className="font-mono">{shownPath}</span>. To change it, run{" "}
          <span className="font-mono">/configure-company</span> in terminal mode.
        </p>
        <div className="px-2">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="group text-primary hover:text-primary">
              <ChevronRight data-icon="inline-start" className="transition-transform group-data-[state=open]:rotate-90" />
              View company.yaml
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <pre className="max-h-[60vh] overflow-auto rounded-xl bg-surface p-4 font-mono text-xs leading-[19px] whitespace-pre text-label shadow-card">
            {yaml}
          </pre>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
