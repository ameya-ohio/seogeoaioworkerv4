import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import {
  buildInterviewContext,
  cfgGet,
  CTA_SETTINGS_KEY,
  mergeCtaSettings,
  renderPageSpec,
  repoFileReader,
  resolvePageRules,
  type ArticleDoc,
} from "@blogagent/engine";
import { getCompany, getDb, getFormats } from "./db";
import { repoRoot } from "./repo";

/**
 * D59: the interviewer's system prompt for a chat turn — agents/interviewer.md
 * plus the same context the worker opened the interview with, read through
 * the repo_files overlay. The web container never runs applyRepoFiles, so a
 * plain disk read here would miss every Admin-saved case study and proof point.
 */
export async function interviewSystem(article: ArticleDoc): Promise<Anthropic.TextBlockParam[]> {
  const company = getCompany();
  const db = await getDb();
  const files = await repoFileReader(db, company.companyId, repoRoot());
  const spec = await files.read("agents/interviewer.md");
  if (!spec) throw new Error("agents/interviewer.md is missing");
  const context: { path: string; content: string }[] = [];
  for (const path of ["context/brand/positioning.md", "context/sales/value-props.md", "context/sales/icp.md"]) {
    const content = await files.read(path);
    if (content?.trim()) context.push({ path, content });
  }
  const proofPoints = await files.read("context/sales/proof-points.md");
  const competitive = await files.read("context/sales/competitive-landscape.md");
  const description = cfgGet<string | undefined>(company, "company.description", undefined);
  // The page's facets and CTA, as the worker's page.md states them (without the format guide).
  const ctas = mergeCtaSettings(company.raw, (await db.settings.findOne({ companyId: company.companyId, key: CTA_SETTINGS_KEY }))?.value);
  const pageMd = renderPageSpec(resolvePageRules(await getFormats(), article.facets, { ctas }), "");
  const text = buildInterviewContext({
    companyName: company.companyName,
    ...(description ? { companyDescription: description } : {}),
    topic: article.topic,
    ...(article.targetKeyword ? { keyword: article.targetKeyword } : {}),
    researchNotes: article.artifacts.researchNotes ?? "",
    pageMd,
    // D61 interviews are built from research; an interview opened after an
    // outline (before D61) keeps that outline as context.
    ...(article.interview?.basis !== "research" && article.artifacts.outline ? { outline: article.artifacts.outline } : {}),
    ...(article.brief?.spec?.companyPosition ? { companyPosition: article.brief.spec.companyPosition } : {}),
    context,
    caseStudies: await files.list("context/case-studies"),
    ...(proofPoints ? { proofPoints } : {}),
    ...(competitive ? { competitive } : {}),
    ...(article.interview?.plan ? { plan: article.interview.plan } : {}),
  });
  // Identical across the turns of one interview, so it caches.
  return [
    { type: "text", text: spec },
    { type: "text", text, cache_control: { type: "ephemeral" } },
  ];
}

/** Chat model (D59): fast enough to feel like a conversation. */
export function interviewChatModel(): string {
  return process.env.INTERVIEW_CHAT_MODEL ?? "claude-sonnet-5-5";
}
