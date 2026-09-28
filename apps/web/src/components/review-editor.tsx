"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  approveArticle,
  publishArticleLive,
  refreshArticleFromHubSpot,
  rerunPhase,
  saveArticleMarkdown,
  sendArticleToHubSpot,
} from "@/lib/actions/content";
import type { CheckLine, TechnicalIssue } from "@blogagent/engine";
import type { UiRun } from "@/lib/ui-types";
import { buttonCls, cls, inputCls } from "./ui";

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
  /** HubSpot post for this article (roadmap Phase 5), once sent. */
  hubspot: { postId: string; url: string | null; state: string; syncedAt: string | null } | null;
  hubspotConfig: { configured: boolean; tokenEnv: string };
  hasHeader: boolean;
  activeRun: UiRun | null;
  runs: UiRun[];
}

const PHASES = ["research", "outline", "write", "edit", "schema", "design"];

/** Body only: frontmatter, json-ld fence, and HTML comments stripped. */
function previewBody(markdown: string): string {
  return markdown
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
    .replace(/```json-ld[\s\S]*?```/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
}

type SideTab = "preview" | "research" | "outline" | "draft" | "audit" | "review" | "header" | "runs";

export function ReviewEditor({ article }: { article: ReviewArticle }) {
  const router = useRouter();
  const [content, setContent] = useState(article.markdown);
  const [tab, setTab] = useState<SideTab>("preview");
  const [rerunFrom, setRerunFrom] = useState("edit");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = content !== article.markdown;

  const preview = useMemo(() => previewBody(content), [content]);

  const act = (fn: () => Promise<{ error?: string; savedAt?: string; warnings?: string[] }>, okMsg: string) =>
    startTransition(async () => {
      const res = await fn();
      setMessage(res.error ? res.error : [okMsg, ...(res.warnings ?? []).map((w) => `⚠ ${w}`)].join(" "));
      if (!res.error) router.refresh();
    });

  const hs = article.hubspot;
  const live = hs?.state === "PUBLISHED";
  const canPublish = ["review", "approved", "published"].includes(article.stage);
  const goLive = () => {
    if (
      !window.confirm(
        `Publish "${article.title}" on HubSpot?\n\nIt becomes public${hs?.url ? ` at ${hs.url}` : ""}. Unpublishing afterwards has to be done in HubSpot.`,
      )
    )
      return;
    act(() => publishArticleLive(article.slug), "Published on HubSpot.");
  };
  const sendToHubSpot = () => {
    if (live && !window.confirm(`This post is live on HubSpot. Update the LIVE post with your current article?`)) return;
    act(() => sendArticleToHubSpot(article.slug), hs ? "HubSpot post updated." : "HubSpot draft created.");
  };

  const sideTabs: { key: SideTab; label: string; disabled?: boolean }[] = [
    { key: "preview", label: "Preview" },
    { key: "research", label: "Research", disabled: !article.researchNotes },
    { key: "outline", label: "Outline", disabled: !article.outline },
    { key: "draft", label: "First draft", disabled: !article.draft },
    { key: "audit", label: "Audit", disabled: !article.audit && !article.citations },
    { key: "review", label: "Tech review", disabled: !article.technicalReview && !article.editPreAudit },
    { key: "header", label: "Header", disabled: !article.hasHeader },
    { key: "runs", label: "Runs", disabled: article.runs.length === 0 },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => act(() => saveArticleMarkdown(article.slug, content), "Saved.")}
          disabled={pending || !dirty}
          className={buttonCls("primary")}
        >
          {pending ? "Working…" : dirty ? "Save changes" : "Saved"}
        </button>
        {article.hubspotConfig.configured ? (
          canPublish && (
            <>
              <button
                onClick={sendToHubSpot}
                disabled={pending || dirty || Boolean(article.activeRun)}
                title={dirty ? "Save your edits first" : hs ? "Push the current article to the HubSpot post" : "Create the post in HubSpot as a draft"}
                className={buttonCls("secondary")}
              >
                {hs ? "Update HubSpot post" : "Send to HubSpot as draft"}
              </button>
              {hs && !live && (
                <button onClick={goLive} disabled={pending || dirty} className={buttonCls("primary")}>
                  Go live
                </button>
              )}
              {hs && (
                <button
                  onClick={() => act(() => refreshArticleFromHubSpot(article.slug), "Synced from HubSpot.")}
                  disabled={pending}
                  className={buttonCls("ghost")}
                >
                  Refresh
                </button>
              )}
              {hs && (
                <span className="text-xs text-slate-500">
                  HubSpot: <span className={cls("font-medium", live ? "text-emerald-700" : "text-amber-700")}>{hs.state}</span>
                  {hs.url && (
                    <>
                      {" · "}
                      <a href={hs.url} target="_blank" rel="noopener" className="underline">
                        {live ? "view live" : "post URL"}
                      </a>
                    </>
                  )}
                </span>
              )}
            </>
          )
        ) : (
          article.stage === "review" && (
            <button
              onClick={() => act(() => approveArticle(article.slug), "Approved for publish.")}
              disabled={pending || dirty}
              title={
                dirty
                  ? "Save your edits first"
                  : `HubSpot isn't configured — set ${article.hubspotConfig.tokenEnv} on the web service to publish from here`
              }
              className={buttonCls("secondary")}
            >
              Approve (HubSpot not configured)
            </button>
          )
        )}
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <select
          value={rerunFrom}
          onChange={(e) => setRerunFrom(e.target.value)}
          className={cls(inputCls, "py-1.5")}
          aria-label="Phase to re-run from"
        >
          {PHASES.map((p) => (
            <option key={p} value={p}>
              re-run from {p}
            </option>
          ))}
        </select>
        <button
          onClick={() =>
            act(() => rerunPhase(article.slug, rerunFrom), `Re-run queued from ${rerunFrom}.`)
          }
          disabled={pending || Boolean(article.activeRun)}
          title={article.activeRun ? "A run is already active for this article" : undefined}
          className={buttonCls("secondary")}
        >
          Queue re-run
        </button>
        {article.activeRun && (
          <span className="text-xs text-slate-500">
            active run: {article.activeRun.status}
            {article.activeRun.currentPhase ? ` · ${article.activeRun.currentPhase}` : ""}
          </span>
        )}
        {message && <span className="text-sm text-slate-600">{message}</span>}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
            article.md {dirty && <span className="text-amber-600">· unsaved</span>}
          </p>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
            className="h-[70vh] w-full resize-y rounded-lg border border-slate-300 bg-white p-4 font-mono text-xs leading-relaxed text-slate-800 focus:border-accent focus:outline-none"
          />
        </div>
        <div className="min-w-0">
          <div className="mb-1.5 flex gap-1">
            {sideTabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                disabled={t.disabled}
                className={cls(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  tab === t.key
                    ? "bg-accent-soft text-accent"
                    : t.disabled
                      ? "cursor-not-allowed text-slate-300"
                      : "text-slate-500 hover:bg-slate-100",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="h-[70vh] overflow-auto rounded-lg border border-slate-200 bg-white p-5">
            {tab === "preview" && (
              <div className="prose-article">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{preview}</ReactMarkdown>
              </div>
            )}
            {tab === "research" && article.researchNotes && (
              <div className="prose-article">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{article.researchNotes}</ReactMarkdown>
              </div>
            )}
            {tab === "outline" && article.outline && (
              <div className="prose-article">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{article.outline}</ReactMarkdown>
              </div>
            )}
            {tab === "draft" && article.draft && (
              <pre className="whitespace-pre-wrap font-mono text-xs text-slate-700">{article.draft}</pre>
            )}
            {tab === "audit" && (
              <div className="space-y-4">
                <CheckList title="SEO audit (seo_audit.py)" checks={article.audit} />
                <CheckList title="Schema validation (validate_schema.py)" checks={article.schemaValidation} />
                <CheckList title="Citation verification — live sources (D34)" checks={article.citations} />
                <CheckList title="Internal links (D35)" checks={article.links} />
              </div>
            )}
            {tab === "review" && (
              <TechReviewPanel
                review={article.technicalReview}
                preAudit={article.editPreAudit}
                markdown={content}
              />
            )}
            {tab === "header" && article.hasHeader && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={`/api/storage/articles/${article.folder}/header.png`}
                alt={`Header image for ${article.title}`}
                className="w-full rounded-md border border-slate-200"
              />
            )}
            {tab === "runs" && <RunHistory runs={article.runs} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckList({ title, checks }: { title: string; checks: CheckLine[] | null }) {
  if (!checks) return null;
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      <ul className="space-y-1">
        {checks.map((c, i) => (
          <li key={i} className="flex gap-2 text-xs">
            <span
              className={cls(
                "w-10 shrink-0 font-mono font-semibold",
                c.level === "pass" && "text-emerald-600",
                c.level === "warn" && "text-amber-600",
                c.level === "fail" && "text-red-600",
              )}
            >
              {c.level.toUpperCase()}
            </span>
            <span className="text-slate-700">{c.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Same normalization the worker uses to match a finding's quote to the draft. */
function normalizeQuote(s: string): string {
  return s
    .replace(/[*_`]/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const KIND_LABEL: Record<TechnicalIssue["kind"], string> = {
  technical_error: "Technical error",
  contradiction: "Contradiction",
  outdated: "Outdated",
  unsupported_number: "Unsupported number",
};

function TechReviewPanel({
  review,
  preAudit,
  markdown,
}: {
  review: ReviewArticle["technicalReview"];
  preAudit: string[] | null;
  markdown: string;
}) {
  // A finding whose quoted text no longer appears was rewritten or cut —
  // the cheap way to see what the Editor actually changed.
  const current = normalizeQuote(markdown);
  const stillPresent = (quote: string) => current.includes(normalizeQuote(quote));
  const technical = new Set(review?.issues.map((i) => i.quote) ?? []);
  const otherItems = (preAudit ?? []).filter((item) => ![...technical].some((q) => item.includes(`"${q}"`)));
  return (
    <div className="space-y-5">
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Technical review of the draft
        </p>
        {!review ? (
          <p className="text-xs text-slate-500">No technical review ran for this article.</p>
        ) : (
          <>
            <p className="mb-3 text-xs text-slate-500">
              {review.model} · {new Date(review.ranAt).toLocaleString()}
              {review.costUsd != null && ` · $${review.costUsd.toFixed(3)}`}
              {review.droppedUnquoted > 0 && ` · ${review.droppedUnquoted} dropped (quote not in draft)`}
            </p>
            {review.skipped && <p className="text-xs text-amber-700">Skipped: {review.skipped}</p>}
            {!review.skipped && review.issues.length === 0 && (
              <p className="text-xs text-emerald-700">No issues found.</p>
            )}
            <ul className="space-y-3">
              {review.issues.map((issue, i) => {
                const open = stillPresent(issue.quote);
                return (
                  <li key={i} className="rounded-md border border-slate-200 p-3 text-xs">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-700">{KIND_LABEL[issue.kind]}</span>
                      <span className={cls("font-medium", open ? "text-amber-700" : "text-emerald-700")}>
                        {open ? "still in article" : "changed"}
                      </span>
                    </div>
                    <blockquote className="mb-1 border-l-2 border-slate-300 pl-2 italic text-slate-600">
                      {issue.quote}
                    </blockquote>
                    <p className="text-slate-700">{issue.problem}</p>
                    <p className="mt-1 text-slate-500">Fix: {issue.fix}</p>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
      {otherItems.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Also handed to the Editor (pre-audit)
          </p>
          <ul className="space-y-1">
            {otherItems.map((item, i) => (
              <li key={i} className="text-xs text-slate-700">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function RunHistory({ runs }: { runs: UiRun[] }) {
  return (
    <div className="space-y-4">
      {runs.map((run) => (
        <div key={run.id} className="rounded-md border border-slate-200 p-3">
          <p className="text-xs font-semibold text-slate-700">
            {run.status} · from {run.fromStage} · attempt {run.attempts}/{run.maxAttempts} ·{" "}
            {new Date(run.queuedAt).toLocaleString()}
          </p>
          {run.error && <p className="mt-1 text-xs text-red-600">{run.error}</p>}
          <ul className="mt-2 space-y-1">
            {run.phaseResults.map((pr, i) => (
              <li key={i} className="flex flex-wrap gap-2 text-xs text-slate-600">
                <span className="w-16 font-mono">{pr.phase}</span>
                <span
                  className={cls(
                    pr.status === "succeeded" && "text-emerald-600",
                    pr.status === "failed" && "text-red-600",
                  )}
                >
                  {pr.status}
                </span>
                <span className="text-slate-400">attempt {pr.attempt}</span>
                {pr.costUsd != null && <span className="text-slate-400">${pr.costUsd.toFixed(2)}</span>}
                {pr.gateProblems.length > 0 && (
                  <span className="text-amber-700">{pr.gateProblems.join("; ")}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
