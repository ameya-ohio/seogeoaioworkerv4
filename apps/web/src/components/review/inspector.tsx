"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { CheckLine, LinkPlanComparison, TechnicalIssue } from "@blogagent/engine";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  History,
  ImageIcon,
  Link2,
  ListChecks,
  ListTree,
  MessageSquare,
  ShieldCheck,
  SlidersHorizontal,
  Wand2,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { UiRun } from "@/lib/ui-types";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Caption, MoreLink, PHASE_ORDER, PhaseStepper, Status, StatusPill, type PhaseState, type StatusFamily } from "@/components/kit";
import { FACET_OPTIONS } from "@/components/facets";
import { cn } from "@/lib/utils";
import { KIND_LABEL, PHASES, headerUrl, normalizeQuote, when, type ReviewArticle } from "./model";
import { pathSteps, type StepKey } from "./path";

export type InspectorTab =
  | "audit"
  | "facets"
  | "links"
  | "research"
  | "outline"
  | "interview"
  | "review"
  | "hdcp"
  | "header"
  | "runs";

export function inspectorTabs(a: ReviewArticle): { key: InspectorTab; label: string; icon: LucideIcon; disabled: boolean }[] {
  return [
    { key: "audit", label: "Audit", icon: ListChecks, disabled: false },
    { key: "facets", label: "Facets", icon: SlidersHorizontal, disabled: false },
    { key: "links", label: "Internal links", icon: Link2, disabled: !a.linkPlan },
    { key: "research", label: "Research notes", icon: BookOpen, disabled: !a.researchNotes },
    { key: "outline", label: "Strategist outline", icon: ListTree, disabled: !a.outline },
    { key: "interview", label: "Interview", icon: MessageSquare, disabled: !a.interview },
    {
      key: "review",
      label: a.verification ? "Verification" : "Tech review",
      icon: ShieldCheck,
      disabled: !a.verification && !a.technicalReview && !a.editPreAudit,
    },
    { key: "hdcp", label: "HDCP", icon: Wand2, disabled: !a.hdcp },
    { key: "header", label: "Header image", icon: ImageIcon, disabled: !a.hasHeader },
    { key: "runs", label: "Runs", icon: History, disabled: a.runs.length === 0 },
  ];
}

export function Inspector({
  article,
  tab,
  onTab,
  content,
  notes,
  current,
  pending,
  onSaveFacets,
}: {
  article: ReviewArticle;
  tab: InspectorTab;
  onTab: (t: InspectorTab) => void;
  content: string;
  notes: number;
  current: StepKey | null;
  pending: boolean;
  onSaveFacets: (f: { pageRole: string; articleType: string; searchIntent: string; funnel: string }) => void;
}) {
  const tabs = inspectorTabs(article);
  const active = tabs.find((t) => t.key === tab) ?? tabs[0]!;
  return (
    <>
      <div role="tablist" aria-label="Inspector" className="flex flex-wrap gap-0.5 border-b-[0.5px] border-separator-strong px-3 py-2">
        {tabs.map((t) => {
          const on = t.key === tab;
          return (
            <Tooltip key={t.key}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  role="tab"
                  aria-selected={on}
                  aria-label={t.label}
                  aria-disabled={t.disabled || undefined}
                  onClick={() => !t.disabled && onTab(t.key)}
                  className={cn(
                    "inline-flex size-8 items-center justify-center rounded-lg transition-colors focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none",
                    on ? "bg-primary-soft text-primary" : "text-label-2 hover:bg-fill-2 hover:text-label",
                    t.disabled && "cursor-not-allowed opacity-35 hover:bg-transparent",
                  )}
                >
                  <t.icon aria-hidden className="size-[17px] stroke-[1.6]" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t.disabled ? `${t.label}: nothing yet` : t.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      <div role="tabpanel" aria-label={active.label} className="flex flex-col gap-4 px-[18px] pt-[18px] pb-8">
        <h2 className="text-[17px] leading-[22px] font-semibold">{active.label}</h2>
        {tab === "audit" && <AuditPanel article={article} notes={notes} current={current} />}
        {tab === "facets" && <FacetsPanel article={article} pending={pending} onSave={onSaveFacets} />}
        {tab === "links" && article.linkPlan && <LinkPlanPanel plan={article.linkPlan} />}
        {tab === "research" && article.researchNotes && <Markdown text={article.researchNotes} />}
        {tab === "outline" && article.outline && <Markdown text={article.outline} />}
        {tab === "interview" && article.interview && (
          <div className="flex flex-col gap-4">
            {article.interview.status === "open" && (
              <div className="flex flex-col gap-2 rounded-xl bg-needs-bg p-3.5">
                <p className="text-[13px] text-needs-fg">The interview is still open.</p>
                <MoreLink href={`/production/interview/${article.slug}`}>Continue the interview</MoreLink>
              </div>
            )}
            {article.interview.pov && <Markdown text={article.interview.pov} />}
            <Markdown text={article.interview.transcript} />
          </div>
        )}
        {tab === "review" && article.verification && <VerificationPanel verification={article.verification} />}
        {tab === "review" && !article.verification && (
          <TechReviewPanel review={article.technicalReview} preAudit={article.editPreAudit} markdown={content} />
        )}
        {tab === "hdcp" && <HdcpPanel hdcp={article.hdcp} markdown={content} />}
        {tab === "header" && article.hasHeader && (
          <div className="flex flex-col gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={headerUrl(article)} alt={`Header image for ${article.title}`} className="w-full rounded-[10px] shadow-card" />
            <a
              href={headerUrl(article)}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline"
            >
              Open full size
              <ExternalLink aria-hidden className="size-3.5" />
            </a>
          </div>
        )}
        {tab === "runs" && <RunHistory runs={article.runs} />}
      </div>
    </>
  );
}

function Markdown({ text }: { text: string }) {
  return (
    <div className="prose-article">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

function Meta({ children }: { children: React.ReactNode }) {
  return <p className="text-xs leading-4 text-label-2 tabular-nums">{children}</p>;
}

function IssueCard({ issue, status }: { issue: TechnicalIssue; status?: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-1.5 rounded-[10px] bg-fill-2 p-3 text-[13px] leading-[18px]">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-label">{KIND_LABEL[issue.kind]}</span>
        {status}
      </div>
      <blockquote className="border-l-2 border-separator-strong pl-2.5 text-label-2 italic">{issue.quote}</blockquote>
      <p className="text-label">{issue.problem}</p>
      <p className="text-label-2">
        <span className="font-medium">Fix:</span> {issue.fix}
      </p>
    </li>
  );
}

// ── audit ────────────────────────────────────────────────────────────────

const LEVEL_ORDER = { fail: 0, warn: 1, pass: 2 } as const;

function CheckIcon({ level }: { level: CheckLine["level"] }) {
  if (level === "pass") return <Check aria-label="Pass" className="mt-px size-3.5 shrink-0 stroke-[2.2] text-done-fg" />;
  if (level === "warn") return <AlertTriangle aria-label="Warning" className="mt-px size-3.5 shrink-0 text-needs-fg" />;
  return <XCircle aria-label="Fail" className="mt-px size-3.5 shrink-0 text-problem-fg" />;
}

function AuditGroup({ name, detail, checks }: { name: string; detail: string; checks: CheckLine[] }) {
  const fail = checks.filter((c) => c.level === "fail").length;
  const warn = checks.filter((c) => c.level === "warn").length;
  const pass = checks.length - fail - warn;
  const [open, setOpen] = useState(fail + warn > 0);
  const sorted = [...checks].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b-[0.5px] border-separator last:border-0">
      <CollapsibleTrigger className="flex w-full items-center gap-2.5 py-2.5 text-left">
        <ChevronRight aria-hidden className={cn("size-3.5 shrink-0 text-label-3 transition-transform", open && "rotate-90")} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[13px] font-semibold text-label">{name}</span>
          <span className="truncate text-[11px] text-label-3">{detail}</span>
        </span>
        <span className="text-xs text-label-2 tabular-nums">
          {pass}/{checks.length}
        </span>
        {fail === 0 && warn === 0 ? (
          <CheckCircle2 aria-label="All pass" className="size-4 text-done-fg" />
        ) : (
          <span className="flex gap-1">
            {fail > 0 && <StatusPill family="problem">{fail} fail</StatusPill>}
            {warn > 0 && <StatusPill family="needs">{warn} warn</StatusPill>}
          </span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="flex flex-col gap-2 pb-3 pl-6">
          {sorted.map((c, i) => (
            <li key={i} className="flex gap-2 text-xs leading-[17px]">
              <CheckIcon level={c.level} />
              <span className={cn("min-w-0 break-words", c.level === "pass" ? "text-label-2" : "text-label")}>{c.message}</span>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

function AuditPanel({ article, notes, current }: { article: ReviewArticle; notes: number; current: StepKey | null }) {
  const groups = [
    { name: "SEO audit", detail: "seo_audit.py", checks: article.audit },
    { name: "Schema validation", detail: "validate_schema.py", checks: article.schemaValidation },
    { name: "Citations", detail: "Live sources checked against each claim (D34)", checks: article.citations },
    { name: "Internal links", detail: "Every link resolves (D35)", checks: article.links },
  ].filter((g): g is { name: string; detail: string; checks: CheckLine[] } => Boolean(g.checks));
  const all = groups.flatMap((g) => g.checks);
  const count = (l: CheckLine["level"]) => all.filter((c) => c.level === l).length;
  const tiles: { n: number; label: string; color: string }[] = [
    { n: count("pass"), label: "Pass", color: "text-done-fg" },
    { n: count("warn"), label: "Warn", color: count("warn") ? "text-needs-fg" : "text-label-2" },
    { n: count("fail"), label: "Fail", color: count("fail") ? "text-problem-fg" : "text-label-2" },
  ];
  const steps = pathSteps(article, notes);
  return (
    <div className="flex flex-col gap-5">
      {groups.length === 0 ? (
        <p className="text-[13px] text-label-2">No audit has run on this article yet.</p>
      ) : (
        <>
          <div className="flex gap-2">
            {tiles.map((t) => (
              <div key={t.label} className="flex-1 rounded-[10px] bg-surface px-3 py-2.5 shadow-card">
                <div className={cn("text-[22px] leading-[26px] font-bold tabular-nums", t.color)}>{t.n}</div>
                <div className="text-xs text-label-2">{t.label}</div>
              </div>
            ))}
          </div>
          <div>
            {groups.map((g) => (
              <AuditGroup key={g.name} {...g} />
            ))}
          </div>
        </>
      )}
      <section aria-labelledby="path-to-live" className="flex flex-col gap-3 pt-1">
        <Caption>
          <span id="path-to-live">Path to live</span>
        </Caption>
        <ol className="flex flex-col gap-3">
          {steps.map((s, i) => {
            const isCurrent = s.key === current;
            return (
              <li key={s.key} className="flex items-start gap-3" aria-current={isCurrent ? "step" : undefined}>
                <span
                  className={cn(
                    "inline-flex size-[22px] shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                    s.done
                      ? "bg-done-bg text-done-fg"
                      : isCurrent
                        ? "bg-primary font-bold text-primary-foreground"
                        : "text-label-2 shadow-[inset_0_0_0_1.5px_var(--separator-strong)]",
                  )}
                >
                  {s.done ? <Check aria-label="Done" className="size-3.5 stroke-[2.4]" /> : i + 1}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className={cn("text-[13px] font-semibold", isCurrent ? "text-label" : "text-label-2")}>{s.title}</span>
                  <span className="text-xs break-words text-label-2">{s.hint}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

// ── internal links ───────────────────────────────────────────────────────

const LINK_STATUS: Record<LinkPlanComparison["planned"][number]["status"], { label: string; family: StatusFamily }> = {
  used: { label: "As planned", family: "done" },
  anchor_changed: { label: "Anchor changed", family: "problem" },
  missing: { label: "Missing", family: "problem" },
};

function LinkPlanPanel({ plan }: { plan: LinkPlanComparison }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] leading-[18px] text-label-2">
        The Strategist planned these links against what each page covers. Every later phase must keep each planned anchor and URL exactly,
        so this is where you check that a link fits: does the anchor say what the page delivers, and does the reader need match? Status
        reflects the last saved version.
      </p>
      <ul className="flex flex-col gap-2">
        {plan.planned.map((p) => (
          <li key={p.url} className="flex flex-col gap-1 rounded-[10px] bg-fill-2 p-3 text-xs leading-[17px]">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[13px] font-semibold text-label">“{p.anchor}”</p>
              <Status family={LINK_STATUS[p.status].family} className="text-xs">
                {LINK_STATUS[p.status].label}
              </Status>
            </div>
            {p.status === "anchor_changed" && <p className="text-problem-fg">The article uses “{p.used}”.</p>}
            <p className="font-mono break-all text-label-2">{p.url}</p>
            <p className="text-label">
              <span className="text-label-2">Section:</span> {p.section}
            </p>
            <p className="text-label">
              <span className="text-label-2">Reader need:</span> {p.need}
            </p>
          </li>
        ))}
      </ul>
      {plan.unplanned.length > 0 && (
        <div className="flex flex-col gap-2">
          <Caption className="text-problem-fg">Not in the plan</Caption>
          <ul className="flex flex-col gap-1.5 text-xs text-label">
            {plan.unplanned.map((u) => (
              <li key={u.url} className="flex items-start gap-1.5 break-all">
                <span>“{u.anchor}”</span>
                <ArrowRight aria-label="links to" className="mt-0.5 size-3 shrink-0 text-label-3" />
                <span className="font-mono text-label-2">{u.url}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── verification / tech review ───────────────────────────────────────────

function VerificationPanel({ verification }: { verification: NonNullable<ReviewArticle["verification"]> }) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-[13px] leading-[18px] text-label-2">
        The expert review read the final text after the Editor, a fix pass resolved what it found, and a confirm round checked the fixes.{" "}
        {verification.unresolved > 0
          ? `${verification.unresolved} issue(s) are left in the article as [VERIFY: …] notes; the export refuses until you resolve them.`
          : "Nothing was left open."}
      </p>
      {verification.rounds.length === 0 && <p className="text-[13px] text-label-2">The technical review was off; only the Edit checks ran.</p>}
      {verification.rounds.map((r) => (
        <section key={r.round} className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <Caption>
              Round {r.round} · {r.mode === "review" ? "Review" : "Confirm"}
            </Caption>
            {r.fixed && <StatusPill family="done">Fixed</StatusPill>}
          </div>
          <Meta>
            {r.model} · {when(r.at)}
            {r.costUsd != null && ` · $${r.costUsd.toFixed(3)}`}
          </Meta>
          {r.skipped && <p className="text-[13px] text-needs-fg">Skipped: {r.skipped}</p>}
          {!r.skipped && r.issues.length === 0 && <Status family="done">No issues</Status>}
          {r.issues.length > 0 && (
            <ul className="flex flex-col gap-2">
              {r.issues.map((issue, i) => (
                <IssueCard key={i} issue={issue} />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

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
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <Caption>Technical review of the draft</Caption>
        {!review ? (
          <p className="text-[13px] text-label-2">No technical review ran for this article.</p>
        ) : (
          <>
            <Meta>
              {review.model} · {when(review.ranAt)}
              {review.costUsd != null && ` · $${review.costUsd.toFixed(3)}`}
              {review.droppedUnquoted > 0 && ` · ${review.droppedUnquoted} dropped (quote not in draft)`}
            </Meta>
            {review.skipped && <p className="text-[13px] text-needs-fg">Skipped: {review.skipped}</p>}
            {!review.skipped && review.issues.length === 0 && <Status family="done">No issues found</Status>}
            {review.issues.length > 0 && (
              <ul className="flex flex-col gap-2">
                {review.issues.map((issue, i) => {
                  const open = stillPresent(issue.quote);
                  return (
                    <IssueCard
                      key={i}
                      issue={issue}
                      status={
                        <Status family={open ? "needs" : "done"} className="text-xs">
                          {open ? "Still in article" : "Changed"}
                        </Status>
                      }
                    />
                  );
                })}
              </ul>
            )}
          </>
        )}
      </section>
      {otherItems.length > 0 && (
        <section className="flex flex-col gap-2">
          <Caption>Also handed to the Editor (pre-audit)</Caption>
          <ul className="flex list-disc flex-col gap-1 pl-4 text-xs leading-[17px] text-label">
            {otherItems.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ── runs ─────────────────────────────────────────────────────────────────

const RUN_FAMILY: Record<string, StatusFamily> = {
  queued: "idle",
  running: "working",
  succeeded: "done",
  failed: "problem",
  awaiting_input: "needs",
  cancelled: "idle",
};

const RUN_LABEL: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  awaiting_input: "Waiting for input",
  cancelled: "Cancelled",
};

const phaseLabel = (p: string) => PHASES.find((x) => x.key === p)?.label ?? p;

function runStates(run: UiRun): PhaseState[] {
  const order = PHASE_ORDER as readonly string[];
  const from = order.indexOf(run.fromStage);
  return order.map((phase, i) => {
    const results = run.phaseResults.filter((r) => r.phase === phase);
    const latest = results[results.length - 1];
    if (latest) {
      if (latest.status === "succeeded" || latest.status === "skipped") return "done";
      if (latest.status === "failed") return run.status === "running" ? "current" : "failed";
      if (latest.status === "awaiting_input") return "waiting";
      return run.status === "running" ? "current" : "pending";
    }
    if (run.currentPhase === phase && run.status === "running") return "current";
    return from > i ? "done" : "pending";
  });
}

function RunHistory({ runs }: { runs: UiRun[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {runs.map((run) => (
        <li key={run.id} className="flex flex-col gap-2.5 rounded-[10px] bg-fill-2 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Status family={RUN_FAMILY[run.status] ?? "idle"} colored>
              {RUN_LABEL[run.status] ?? run.status}
            </Status>
            <PhaseStepper states={runStates(run)} />
          </div>
          <Meta>
            From {phaseLabel(run.fromStage)} · attempt {run.attempts}/{run.maxAttempts} · {when(run.queuedAt)}
          </Meta>
          {run.error && <p className="rounded-lg bg-problem-bg px-2.5 py-2 text-xs break-words text-problem-fg">{run.error}</p>}
          {run.phaseResults.length > 0 && (
            <ul className="flex flex-col gap-1 border-t-[0.5px] border-separator pt-2">
              {run.phaseResults.map((pr, i) => (
                <li key={i} className="grid grid-cols-[4.5rem_1fr_auto] items-start gap-x-2 text-xs leading-[17px]">
                  <span className="font-medium text-label">{phaseLabel(pr.phase)}</span>
                  <span className="flex min-w-0 flex-col">
                    <span
                      className={cn(
                        pr.status === "succeeded" ? "text-done-fg" : pr.status === "failed" ? "text-problem-fg" : "text-label-2",
                      )}
                    >
                      {pr.status}
                      <span className="text-label-3"> · attempt {pr.attempt}</span>
                    </span>
                    {pr.gateProblems.length > 0 && <span className="break-words text-needs-fg">{pr.gateProblems.join("; ")}</span>}
                  </span>
                  <span className="text-label-3 tabular-nums">{pr.costUsd != null ? `$${pr.costUsd.toFixed(2)}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

// ── facets ───────────────────────────────────────────────────────────────

function FacetsPanel({
  article,
  pending,
  onSave,
}: {
  article: ReviewArticle;
  pending: boolean;
  onSave: (f: { pageRole: string; articleType: string; searchIntent: string; funnel: string }) => void;
}) {
  const f = article.facets;
  const [pageRole, setPageRole] = useState(f?.pageRole ?? "cluster");
  const [articleType, setArticleType] = useState(f?.articleType ?? "generic");
  const [searchIntent, setSearchIntent] = useState(f?.searchIntent ?? "informational");
  const [funnel, setFunnel] = useState(f?.funnel ?? "mofu");
  const changed =
    !f || pageRole !== f.pageRole || articleType !== f.articleType || searchIntent !== f.searchIntent || funnel !== f.funnel;
  const field = (id: string, label: string, value: string, set: (v: string) => void, options: readonly { value: string; label: string }[]) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-label-2">
        {label}
      </Label>
      <Select value={value} onValueChange={set}>
        <SelectTrigger id={id} className="w-full bg-fill-2 text-[13px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
  const rows: [string, React.ReactNode, boolean?][] = article.rules
    ? [
        ["Path", article.path ?? "Not reserved", true],
        ["Canonical", article.canonicalUrl ?? "Not set", true],
        ["Length band", article.rules.lengthBand],
        ["Key takeaways", article.rules.takeaways],
        ["FAQ", article.rules.faq],
        ["Closing CTA", article.rules.cta],
        ["Schema", article.rules.schema.join(", ")],
      ]
    : [];
  return (
    <div className="flex flex-col gap-5">
      <p className="text-[13px] leading-[18px] text-label-2">
        {f ? `Set by ${f.source}.` : "No facets yet. The Strategist chooses them on the next outline run, or set them here."} Page role sets
        the skeleton, article type the body, intent what the search results expect, and funnel the CTA (D45–D50).
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {field("facet-role", "Page role", pageRole, setPageRole, FACET_OPTIONS.pageRole)}
        {field("facet-type", "Article type", articleType, setArticleType, article.formatOptions)}
        {field("facet-intent", "Search intent", searchIntent, setSearchIntent, FACET_OPTIONS.searchIntent)}
        {field("facet-funnel", "Funnel", funnel, setFunnel, FACET_OPTIONS.funnel)}
      </div>
      <div>
        <Button variant="tinted" disabled={pending || !changed} onClick={() => onSave({ pageRole, articleType, searchIntent, funnel })}>
          Save facets
        </Button>
      </div>
      {rows.length > 0 && (
        <section className="flex flex-col gap-2">
          <Caption>What these resolve to</Caption>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-[10px] bg-fill-2 p-3 text-xs leading-[17px]">
            {rows.map(([k, v, mono]) => (
              <div key={k} className="contents">
                <dt className="text-label-2">{k}</dt>
                <dd className={cn("min-w-0 break-all text-label", mono && "font-mono")}>{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}

// ── HDCP ─────────────────────────────────────────────────────────────────

function HdcpPanel({ hdcp, markdown }: { hdcp: ReviewArticle["hdcp"]; markdown: string }) {
  if (!hdcp) return <p className="text-[13px] text-label-2">HDCP hasn&apos;t run on this article.</p>;
  const openFlags = markdown.match(/\[(?:NEEDS SOURCE|NEEDS RESEARCH|HUMAN INPUT|VERIFY):[^\]]*\]/g) ?? [];
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-1.5">
        <Caption>Diagnosis</Caption>
        <Meta>
          {hdcp.model} · {when(hdcp.ranAt)}
        </Meta>
        <p className="text-[13px] leading-[19px] whitespace-pre-line text-label">{hdcp.diagnosis}</p>
      </section>
      {(hdcp.editorNotes || openFlags.length > 0) && (
        <section className="flex flex-col gap-2 rounded-xl bg-needs-bg p-3.5">
          <Caption className="text-needs-fg">For the editor</Caption>
          {hdcp.editorNotes && <p className="text-[13px] leading-[19px] whitespace-pre-line text-label">{hdcp.editorNotes}</p>}
          {openFlags.length > 0 && (
            <>
              <p className="text-xs font-semibold text-needs-fg">
                {openFlags.length} flag{openFlags.length === 1 ? "" : "s"} still in the article. The export is blocked until they&apos;re
                resolved.
              </p>
              <ul className="flex list-disc flex-col gap-1 pl-4 text-xs text-label">
                {openFlags.map((flag, i) => (
                  <li key={i} className="font-mono break-words">
                    {flag}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
      {hdcp.changes.length > 0 && (
        <section className="flex flex-col gap-2">
          <Caption>Changes made · {hdcp.changes.length}</Caption>
          <ul className="flex list-disc flex-col gap-1 pl-4 text-xs leading-[17px] text-label">
            {hdcp.changes.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </section>
      )}
      {hdcp.cuts.length > 0 && (
        <section className="flex flex-col gap-2">
          <Caption>Cut · {hdcp.cuts.length}</Caption>
          <ul className="flex flex-col gap-1.5 text-xs leading-[17px] text-label">
            {hdcp.cuts.map((c, i) => (
              <li key={i}>
                <span className="text-label-2">{c.reason}:</span> {c.content}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
