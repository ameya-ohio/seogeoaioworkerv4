import Link from "next/link";
import { readFile } from "node:fs/promises";
import { getCompany } from "@/lib/db";
import { listAdminFiles, readAdminFile } from "@/lib/actions/admin";
import { Card, EmptyState, PageHeader, TabNav, cls } from "@/components/ui";
import { AdminEditor } from "@/components/admin-editor";
import { CompetitiveTab } from "./competitive-tab";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "standards", label: "Standards" },
  { key: "templates", label: "Templates" },
  { key: "agents", label: "Agents" },
  { key: "context", label: "Context" },
  { key: "competitive", label: "Competitive" },
  { key: "company", label: "Company" },
];

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tab = typeof params.tab === "string" && TABS.some((t) => t.key === params.tab) ? params.tab : "standards";
  const file = typeof params.file === "string" ? params.file : null;
  const scrape = typeof params.scrape === "string" ? params.scrape : null;

  return (
    <>
      <PageHeader
        title="Admin"
        subtitle="The engine's markdown surfaces — edits apply to both the web pipeline and terminal mode"
      />
      <TabNav tabs={TABS} active={tab} hrefFor={(k) => (k === "standards" ? "/admin" : `/admin?tab=${k}`)} />
      {tab === "company" ? (
        <CompanyTab />
      ) : tab === "competitive" ? (
        <CompetitiveTab scrapeId={scrape} />
      ) : (
        <EditorTab area={tab} file={file} />
      )}
    </>
  );
}

async function EditorTab({ area, file }: { area: string; file: string | null }) {
  const files = await listAdminFiles(area);
  let content: string | null = null;
  let error: string | null = null;
  if (file) {
    try {
      content = await readAdminFile(area, file);
    } catch {
      error = `Could not read ${file}`;
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <Card title={`${area}/`} className="self-start">
        {files.length === 0 ? (
          <p className="text-sm text-slate-400">No editable files.</p>
        ) : (
          <ul className="space-y-0.5">
            {files.map((f) => (
              <li key={f.path}>
                <Link
                  href={`/admin?tab=${area}&file=${encodeURIComponent(f.path)}`}
                  className={cls(
                    "block truncate rounded px-2 py-1 text-sm transition-colors",
                    f.path === file
                      ? "bg-accent-soft font-medium text-accent"
                      : "text-slate-600 hover:bg-slate-100",
                  )}
                  title={f.path}
                >
                  {f.path}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {file && content !== null ? (
        <AdminEditor key={`${area}/${file}`} area={area} file={file} initialContent={content} />
      ) : error ? (
        <EmptyState title={error} />
      ) : (
        <EmptyState title="Pick a file to edit." hint="Changes are written straight to the repo file the agents read." />
      )}
    </div>
  );
}

async function CompanyTab() {
  let name = "—";
  let path = "—";
  let raw = "";
  try {
    const company = getCompany();
    name = company.companyName;
    path = company.path;
    raw = await readFile(company.path, "utf-8");
  } catch (err) {
    return (
      <EmptyState
        title="company.yaml could not be loaded."
        hint={err instanceof Error ? err.message : "Run /configure-company in terminal mode."}
      />
    );
  }
  return (
    <div className="max-w-3xl space-y-4">
      <Card title={`Configured company: ${name}`}>
        <p className="text-sm text-slate-500">
          Loaded from <span className="font-mono text-xs">{path}</span>. Reconfigure with the{" "}
          <span className="font-mono text-xs">/configure-company</span> agent in terminal mode — the
          web Company Setup flow lands with a later phase.
        </p>
      </Card>
      <Card title="company.yaml (read-only)">
        <pre className="max-h-[60vh] overflow-auto rounded-md bg-slate-900 p-4 font-mono text-xs leading-relaxed text-slate-200">
          {raw}
        </pre>
      </Card>
    </div>
  );
}
