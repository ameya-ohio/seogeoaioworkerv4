import { FileText } from "lucide-react";
import { getFormatLabels } from "@/lib/db";
import { listAdminFiles, readAdminFile, type AdminFile } from "@/lib/actions/admin";
import { getCtaSettings } from "@/lib/actions/ctas";
import { EmptyState, Page, type Crumb } from "@/components/kit";
import { AdminEditor, NewCaseStudy } from "@/components/admin-editor";
import { CtaForm } from "@/components/cta-form";
import { LiveRefresh } from "@/components/live-refresh";
import { FileList, type FileListGroup, type FileListItem } from "@/components/settings/file-list";
import {
  DEFAULT_SETTINGS_KEY,
  SETTINGS_CATEGORIES,
  SettingsNav,
  SettingsTitle,
  settingsCategory,
  settingsHref,
} from "@/components/settings/settings-ui";
import { CompanyTab } from "./company-tab";
import { CompetitiveTab, loadScrape } from "./competitive-tab";

export const dynamic = "force-dynamic";

/**
 * Settings (route /admin), like macOS System Settings: categories on the
 * left, the selected one on the right. ?tab= picks the category (company is
 * the default), &file= opens a file in the editors, &scrape= opens a run.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tab =
    typeof params.tab === "string" && SETTINGS_CATEGORIES.some((c) => c.key === params.tab) ? params.tab : DEFAULT_SETTINGS_KEY;
  const file = typeof params.file === "string" ? params.file : null;
  const scrape = typeof params.scrape === "string" ? params.scrape : null;
  const category = settingsCategory(tab);

  const crumbs: Crumb[] = [{ label: "Settings", href: "/admin" }, { label: category.label }];
  let actions: React.ReactNode;
  let pane: React.ReactNode;

  if (tab === "company") {
    pane = <CompanyTab />;
  } else if (tab === "ctas") {
    pane = <CtaTab />;
  } else if (tab === "competitive") {
    const doc = await loadScrape(scrape);
    if (doc) {
      crumbs[1] = { label: category.label, href: settingsHref("competitive") };
      crumbs.push({ label: doc.domain });
      if (doc.status === "queued" || doc.status === "running") actions = <LiveRefresh src="/api/scrape-events" />;
    }
    pane = <CompetitiveTab doc={doc} />;
  } else {
    const data = await loadEditor(tab, file);
    if (file) {
      crumbs[1] = { label: category.label, href: settingsHref(tab) };
      crumbs.push({ label: data.activeTitle ?? file });
    }
    pane = <EditorTab area={tab} file={file} data={data} />;
  }

  return (
    <Page crumbs={crumbs} actions={actions} width="wide">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <SettingsNav active={tab} />
        <div className="min-w-0 flex-1">{pane}</div>
      </div>
    </Page>
  );
}

async function CtaTab() {
  const { ctas, saved, updatedAt } = await getCtaSettings();
  return (
    <div className="flex max-w-[720px] flex-col gap-[26px]">
      <SettingsTitle category={settingsCategory("ctas")} />
      {/* Keyed on the save time: a save or a reset remounts the form with the stored values. */}
      <CtaForm key={updatedAt ?? "company-yaml"} ctas={ctas} saved={saved} {...(updatedAt ? { updatedAt } : {})} />
    </div>
  );
}

// ── file editors: standards, templates, agents, context ─────────────────

const STANDARDS: Record<string, string> = {
  "quality-bar.md": "Banned phrases, voice, fact-check",
  "banned-phrases.txt": "The machine-checked list",
  "seo-checklist.md": "Traditional SEO bar",
  "geo-checklist.md": "Generative engines",
  "aio-checklist.md": "AI answer engines",
  "schema-spec.md": "JSON-LD reference",
  "formats.json": "The article types",
};

/** Pipeline phases in order (CLAUDE.md), with their phase numbers. */
const AGENTS: Record<string, [phase: string, name: string]> = {
  "researcher.md": ["1", "Researcher"],
  "interviewer.md": ["2", "Interviewer"],
  "pov-writer.md": ["2", "POV writer"],
  "evidence.md": ["2.5", "Evidence"],
  "strategist.md": ["3", "Strategist"],
  "writer.md": ["4", "Writer"],
  "hdcp.md": ["5", "HDCP"],
  "editor.md": ["6", "Editor"],
  "technical-reviewer.md": ["7", "Technical reviewer"],
  "schema-builder.md": ["8", "Schema builder"],
  "header-designer.md": ["9", "Header designer"],
};

const AGENT_ORDER = Object.keys(AGENTS);

function baseName(path: string): string {
  return path.split("/").pop() ?? path;
}

function humanize(slug: string): string {
  const s = slug.replace(/\.[a-z]+$/i, "").replace(/[-_]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function folderOf(path: string): string {
  const i = path.indexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

async function groupFiles(area: string, files: AdminFile[]): Promise<FileListGroup[]> {
  const item = (f: AdminFile, extra: Partial<FileListItem> = {}): FileListItem => ({
    path: f.path,
    ...(f.source === "app" ? { edited: true } : {}),
    ...extra,
  });

  if (area === "standards") {
    const known = Object.keys(STANDARDS);
    const sorted = [...files].sort((a, b) => {
      const ia = known.indexOf(a.path);
      const ib = known.indexOf(b.path);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.path.localeCompare(b.path);
    });
    return [{ items: sorted.map((f) => item(f, STANDARDS[f.path] ? { sub: STANDARDS[f.path] } : {})) }];
  }

  if (area === "agents") {
    const pipeline = files
      .filter((f) => AGENTS[f.path])
      .sort((a, b) => AGENT_ORDER.indexOf(a.path) - AGENT_ORDER.indexOf(b.path))
      .map((f) => {
        const [phase, name] = AGENTS[f.path]!;
        return item(f, { phase, title: name, sub: f.path });
      });
    const other = files.filter((f) => !AGENTS[f.path]).map((f) => item(f, { title: humanize(baseName(f.path)), sub: f.path }));
    return [
      ...(pipeline.length ? [{ title: "Pipeline, in order", items: pipeline }] : []),
      ...(other.length ? [{ title: "Outside the pipeline", items: other }] : []),
    ];
  }

  if (area === "templates") {
    let labels: Record<string, string> = {};
    try {
      labels = await getFormatLabels();
    } catch {
      /* fall back to file names */
    }
    const byFolder = new Map<string, AdminFile[]>();
    for (const f of files) byFolder.set(folderOf(f.path), [...(byFolder.get(folderOf(f.path)) ?? []), f]);
    const groups: FileListGroup[] = [];
    const root = byFolder.get("");
    if (root) groups.push({ title: "Article", items: root.map((f) => item(f)) });
    const formats = byFolder.get("formats");
    if (formats) {
      const items = formats
        .map((f) => {
          const slug = baseName(f.path).replace(/\.md$/i, "");
          const title = labels[slug] ?? (slug === "generic" ? "Generic (fallback)" : humanize(slug));
          return item(f, { title, sub: baseName(f.path) });
        })
        .sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""));
      groups.push({ title: `Formats · ${items.length}`, items });
    }
    const research = byFolder.get("research");
    if (research) {
      groups.push({
        title: `Research playbooks · ${research.length}`,
        items: research.map((f) => item(f, { title: humanize(baseName(f.path)), sub: baseName(f.path) })),
      });
    }
    for (const [folder, list] of byFolder) {
      if (folder === "" || folder === "formats" || folder === "research") continue;
      groups.push({ title: humanize(folder), items: list.map((f) => item(f)) });
    }
    return groups;
  }

  // context (and anything else): by folder, root files first.
  const byFolder = new Map<string, AdminFile[]>();
  for (const f of files) byFolder.set(folderOf(f.path), [...(byFolder.get(folderOf(f.path)) ?? []), f]);
  return [...byFolder.entries()]
    .sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)))
    .map(([folder, list]) => ({
      title: folder === "" ? "General" : humanize(folder),
      items: list.map((f) => item(f, folder === "" ? {} : { title: f.path.slice(folder.length + 1), mono: true })),
    }));
}

interface EditorData {
  groups: FileListGroup[];
  content: string | null;
  error: string | null;
  edited: boolean;
  activeTitle: string | null;
}

async function loadEditor(area: string, file: string | null): Promise<EditorData> {
  const files = await listAdminFiles(area);
  const groups = await groupFiles(area, files);
  let content: string | null = null;
  let error: string | null = null;
  if (file) {
    try {
      content = await readAdminFile(area, file);
    } catch {
      error = `Could not read ${file}`;
    }
  }
  const active = file ? groups.flatMap((g) => g.items).find((i) => i.path === file) : undefined;
  return {
    groups,
    content,
    error,
    edited: files.some((f) => f.path === file && f.source === "app"),
    activeTitle: active ? (active.title && !active.mono ? active.title : baseName(active.path)) : file ? baseName(file) : null,
  };
}

function EditorTab({ area, file, data }: { area: string; file: string | null; data: EditorData }) {
  return (
    <div className="flex flex-col gap-[26px]">
      <SettingsTitle category={settingsCategory(area)} />
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        <FileList area={area} groups={data.groups} active={file}>
          {area === "context" && <NewCaseStudy />}
        </FileList>
        {file && data.content !== null ? (
          <AdminEditor key={`${area}/${file}`} area={area} file={file} initialContent={data.content} edited={data.edited} />
        ) : (
          <div className="min-w-0 flex-1 rounded-xl bg-surface shadow-card">
            <EmptyState
              icon={FileText}
              title={data.error ?? "Choose a file to edit"}
              hint="Saved changes are stored in the app and reach the pipeline from the next article run, in the web app and in terminal mode."
            />
          </div>
        )}
      </div>
    </div>
  );
}
