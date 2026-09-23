import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { ObjectId } from "mongodb";
import {
  CLUSTER_STAGES,
  buildCompetitorGapDigest,
  computeBreadth,
  computeStability,
  computeThemeScores,
  emitClusterEvent,
  extractJson,
  failClusterRun,
  getThemesForCluster,
  isAwarenessPlay,
  latestScrapesByDomain,
  normalizeLengthBand,
  ownDomainsFromConfig,
  parseArchitectureResponse,
  parseBriefResponse,
  parseClusteringResponse,
  parseExpansionResponse,
  parseFanoutResponse,
  parseGapMapResponse,
  parseQuestionsResponse,
  parseScoresResponse,
  parseTypeClassification,
  renderBriefMarkdown,
  replaceThemes,
  saveClusterStage,
  completeClusterRun,
  tierForStability,
  updateClusterUsage,
  updateTheme,
  validateArchitecture,
  validateClusterOutput,
  assembleClusterOutput,
  QUESTION_WEIGHTS,
  type ArchitectureAssignment,
  type ClusterDoc,
  type ClusterStage,
  type EngineDb,
  type FanoutSubQuery,
  type LlmSurfaceSnapshot,
  type MinedQuestion,
  type Parsed,
  type SerpSnapshot,
  type SpokeBrief,
  type ThemeDoc,
} from "@blogagent/engine";
import type { WorkerConfig } from "./config.js";
import type { FanoutObserver, LlmClient } from "./llm.js";

/**
 * The Topic & Cluster Generator runner (roadmap 4.7–4.11). The spec at
 * agents/topic-cluster-generator.md is the system prompt for every LLM
 * stage call (D2/D10: specs are the single source of behavior); this file
 * supplies run wiring, the deterministic math (via the engine's scoring
 * module), and persistence. All stage calls are direct Messages API
 * invocations (D25) — bulk fan-out generation runs on the cheap tier (D26).
 */

/** The endpoint slice of DataForSeoClient the validation stages consume. */
export interface SerpClientLike {
  serpOrganicLive(params: {
    keyword: string;
    locationCode: number;
    languageCode: string;
    depth?: number;
  }): Promise<SerpSnapshot>;
  llmResponseLive(params: {
    provider: "chat_gpt" | "claude" | "gemini" | "perplexity";
    prompt: string;
  }): Promise<LlmSurfaceSnapshot>;
}

export interface ClusterDeps {
  db: EngineDb;
  cfg: WorkerConfig;
  llm: LlmClient;
  /** Observed fan-out via Gemini grounding; null → simulated mode (D30). */
  observer: FanoutObserver | null;
  /** SERP + AI-surface validation; null → validation recorded as skipped. */
  serpClient: SerpClientLike | null;
  /**
   * True when the client points at the DataForSEO sandbox. Sandbox responses
   * are canned dummy data (the first live smoke got pizza PAA questions for
   * an identity-security seed) — good for verifying auth/parsing/cost
   * mechanics, never usable as evidence. In sandbox mode the runner pings
   * the API once for integration proof and otherwise behaves as if no
   * client were present.
   */
  serpSandbox: boolean;
  market: { locationCode: number; languageCode: string };
  companyName: string;
  log: (msg: string) => void;
}

const NO_SURFACE_DATA_OPENNESS = 3;

async function loadSpec(cfg: WorkerConfig): Promise<string> {
  return readFile(join(cfg.repoRoot, "agents", "topic-cluster-generator.md"), "utf-8");
}

/** Phase 0 (spec): company context from context/ docs + the content inventory. */
async function loadCompanyContext(deps: ClusterDeps): Promise<string> {
  const { cfg, db } = deps;
  const sections: string[] = [`Company: ${deps.companyName}`];
  for (const area of ["brand", "sales", "marketing"]) {
    const dir = join(cfg.repoRoot, "context", area);
    if (!existsSync(dir)) continue;
    const files = (await readdir(dir)).filter((f) => f.endsWith(".md")).sort();
    for (const file of files.slice(0, 5)) {
      const text = await readFile(join(dir, file), "utf-8");
      sections.push(`--- context/${area}/${file} ---\n${text.slice(0, 4000)}`);
    }
  }
  const inventory = await contentInventory(db);
  sections.push(
    `--- Existing content inventory (${inventory.length} pieces) ---\n${inventory
      .map((i) => `- "${i.title}" (slug: ${i.slug}, stage: ${i.stage}${i.url ? `, url: ${i.url}` : ""})`)
      .join("\n")}`,
  );
  return sections.join("\n\n");
}

interface InventoryItem {
  title: string;
  slug: string;
  stage: string;
  url?: string;
}

async function contentInventory(db: EngineDb): Promise<InventoryItem[]> {
  const docs = await db.articles
    .find({}, { projection: { slug: 1, stage: 1, topic: 1, frontmatter: 1, hubspot: 1 } })
    .sort({ createdAt: -1 })
    .limit(200)
    .toArray();
  return docs.map((d) => {
    const title = typeof d.frontmatter?.["title"] === "string" && d.frontmatter["title"]
      ? (d.frontmatter["title"] as string)
      : d.topic;
    const url = d.hubspot?.url;
    return { title, slug: d.slug, stage: d.stage, ...(url ? { url } : {}) };
  });
}

interface StageCtx {
  deps: ClusterDeps;
  clusterId: ObjectId;
  spec: string;
  companyContext: string;
}

async function fresh(ctx: StageCtx): Promise<ClusterDoc> {
  const doc = await ctx.deps.db.clusters.findOne({ _id: ctx.clusterId });
  if (!doc) throw new Error(`cluster ${ctx.clusterId.toHexString()} disappeared`);
  return doc;
}

/** One main-tier LLM call with usage accounting. */
async function callMain(ctx: StageCtx, cluster: ClusterDoc, prompt: string): Promise<string> {
  const res = await ctx.deps.llm.complete({
    model: cluster.models.main,
    system: ctx.spec,
    prompt,
    maxTokens: 16000,
  });
  await updateClusterUsage(ctx.deps.db, ctx.clusterId, {
    llmCalls: 1,
    inputTokens: res.inputTokens,
    outputTokens: res.outputTokens,
  });
  return res.text;
}

/** Main call + parse, with one feedback retry (the gate-feedback pattern). */
async function callAndParse<T>(
  ctx: StageCtx,
  cluster: ClusterDoc,
  prompt: string,
  parse: (text: string) => Parsed<T>,
): Promise<T> {
  let lastProblems: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const feedback =
      lastProblems.length > 0
        ? `\n\nFEEDBACK — your previous response had these problems. Fix every one:\n${lastProblems
            .map((p) => `- ${p}`)
            .join("\n")}`
        : "";
    const text = await callMain(ctx, cluster, prompt + feedback);
    const parsed = parse(text);
    if (parsed.value !== undefined) return parsed.value;
    lastProblems = parsed.problems;
    // Surface what came back — parse failures are undebuggable otherwise
    // (a truncated 16k response looks identical to an empty one in the error).
    ctx.deps.log(
      `[cluster ${ctx.clusterId.toHexString()}] unusable response (attempt ${attempt}, ${text.length} chars): ` +
        `head="${text.slice(0, 200).replace(/\n/g, "\\n")}" tail="${text.slice(-200).replace(/\n/g, "\\n")}"`,
    );
  }
  throw new Error(`stage response unusable after retry: ${lastProblems.join("; ")}`);
}

const jsonOnly =
  "Respond with JSON only — no prose before or after. Do not fabricate data; label sources honestly.";

// ---------------------------------------------------------------------------
// Stage 1 — expansion (spec §0–1): entity/term map + realistic prompts.
// ---------------------------------------------------------------------------
async function stageExpansion(ctx: StageCtx): Promise<void> {
  const cluster = await fresh(ctx);
  const prompt = [
    `TASK — Phase 0 + Phase 1 only (Load Context, Seed Expansion).`,
    ``,
    `Seed: "${cluster.seed}"`,
    ``,
    `COMPANY CONTEXT:`,
    ctx.companyContext,
    ``,
    `Produce the entity/term map (15–20 terms across the spec's categories, each`,
    `tagged with intent) and 6–8 realistic AI-user prompts varying persona,`,
    `constraints, qualifiers, and buying stage. At least half the prompts must`,
    `contain a comparison, a constraint, or a qualifier.`,
    ``,
    `${jsonOnly}`,
    `Schema: {"terms": [{"term": "", "category": "primary_seed|equivalent_phrasing|canonical_term|entity|persona_terminology|adjacent_concept", "intent": "informational|commercial|transactional|navigational"}],`,
    ` "prompts": [{"id": "p1", "text": "", "persona": "", "stage": "problem-aware|solution-aware|vendor-evaluation"}]}`,
  ].join("\n");
  const value = await callAndParse(ctx, cluster, prompt, parseExpansionResponse);
  await saveClusterStage(ctx.deps.db, ctx.clusterId, "expansion", "fanout", {
    entityMap: value.terms,
    prompts: value.prompts,
  });
}

// ---------------------------------------------------------------------------
// Stage 2 — fanout (spec §2): K varied runs per prompt, observed or simulated.
// ---------------------------------------------------------------------------
const RUN_FRAMINGS = [
  "Frame the request exactly as written.",
  "Frame it as a skeptical evaluator comparing options.",
  "Frame it as someone worried about risk, compliance, and hidden costs.",
  "Frame it as a hands-on implementer who cares about integrations and setup.",
  "Frame it as an executive who needs the business case and proof.",
];

async function stageFanout(ctx: StageCtx): Promise<void> {
  const { deps } = ctx;
  const cluster = await fresh(ctx);
  const prompts = cluster.prompts ?? [];
  if (prompts.length === 0) throw new Error("fanout: no prompts on cluster doc");
  const mode: "observed" | "simulated" = deps.observer ? "observed" : "simulated";
  const generations: FanoutSubQuery[] = [];

  for (const p of prompts) {
    const perPrompt: FanoutSubQuery[] = [];
    for (let run = 1; run <= cluster.k; run++) {
      const framing = RUN_FRAMINGS[(run - 1) % RUN_FRAMINGS.length] as string;
      if (deps.observer) {
        const queries = (await deps.observer.observe(`${framing}\n\n${p.text}`)).slice(0, 15);
        for (const q of queries) {
          perPrompt.push({ promptId: p.id, run, type: "equivalent", text: q, source: "observed:gemini" });
        }
      } else {
        const res = await deps.llm.complete({
          model: cluster.models.fanout,
          system: ctx.spec,
          prompt: [
            `TASK — Phase 2 (Fan-Out Generation), simulated mode, run ${run} of ${cluster.k}.`,
            framing,
            ``,
            `User prompt: "${p.text}"`,
            `(persona: ${p.persona}, stage: ${p.stage})`,
            ``,
            `Generate 8–14 sub-queries a search engine would fan this prompt out into,`,
            `across all applicable types from your spec's §2.2 table. Vary this run's`,
            `framing — do not repeat earlier runs verbatim.`,
            ``,
            `${jsonOnly}`,
            `Schema: [{"text": "", "type": "equivalent|specification|generalization|follow_up|canonicalization|entailment|clarification|translation"}]`,
          ].join("\n"),
          maxTokens: 2000,
          temperature: 1,
        });
        await updateClusterUsage(deps.db, ctx.clusterId, {
          llmCalls: 1,
          inputTokens: res.inputTokens,
          outputTokens: res.outputTokens,
        });
        const parsed = parseFanoutResponse(res.text);
        for (const sqr of (parsed.value ?? []).slice(0, 15)) {
          perPrompt.push({ promptId: p.id, run, type: sqr.type, text: sqr.text, source: "simulated" });
        }
      }
    }

    // Observed queries arrive untyped — classify them in one cheap call.
    if (deps.observer && perPrompt.length > 0) {
      const res = await deps.llm.complete({
        model: cluster.models.fanout,
        system: ctx.spec,
        prompt: [
          `TASK — classify each observed sub-query into one of the 8 types from §2.2.`,
          `Original prompt: "${p.text}"`,
          ``,
          perPrompt.map((sq, i) => `${i}: ${sq.text}`).join("\n"),
          ``,
          `${jsonOnly}`,
          `Schema: an array of type strings aligned with the input order.`,
        ].join("\n"),
        maxTokens: 1500,
      });
      await updateClusterUsage(deps.db, ctx.clusterId, {
        llmCalls: 1,
        inputTokens: res.inputTokens,
        outputTokens: res.outputTokens,
      });
      const types = parseTypeClassification(res.text, perPrompt.length).value ?? [];
      perPrompt.forEach((sq, i) => {
        sq.type = types[i] ?? "equivalent";
      });
    }

    generations.push(...perPrompt);
    // Persist progressively so a crash never loses completed prompts.
    await deps.db.clusters.updateOne(
      { _id: ctx.clusterId },
      { $set: { generations, mode, updatedAt: new Date() } },
    );
    deps.log(`[cluster ${ctx.clusterId.toHexString()}] fanout ${p.id}: ${perPrompt.length} sub-queries (${mode})`);
  }

  if (generations.length === 0) throw new Error("fanout produced no sub-queries");
  await saveClusterStage(ctx.deps.db, ctx.clusterId, "fanout", "clustering", {
    generations,
    mode,
  });
}

// ---------------------------------------------------------------------------
// Stage 3 — clustering (spec §3): themes by underlying need + stability math.
// ---------------------------------------------------------------------------
async function stageClustering(ctx: StageCtx): Promise<void> {
  const cluster = await fresh(ctx);
  const generations = cluster.generations ?? [];
  if (generations.length === 0) throw new Error("clustering: no generations on cluster doc");

  // A live fan-out logs hundreds of entries, but most are the same text
  // repeated across runs — that repetition is the stability signal, not
  // information the model needs. Cluster over UNIQUE texts (keeps the call
  // well under the output-token ceiling; a 527-entry log truncated mid-JSON
  // in the first live smoke), then expand each unique back to its full
  // generation set so the stability/breadth math sees every occurrence.
  const uniques: { text: string; subQueries: FanoutSubQuery[] }[] = [];
  const byText = new Map<string, number>();
  for (const sq of generations) {
    const key = sq.text.toLowerCase().trim();
    const idx = byText.get(key);
    if (idx === undefined) {
      byText.set(key, uniques.length);
      uniques.push({ text: sq.text, subQueries: [sq] });
    } else {
      (uniques[idx] as { subQueries: FanoutSubQuery[] }).subQueries.push(sq);
    }
  }
  const listing = uniques
    .map((u, i) => {
      const runs = [...new Set(u.subQueries.map((sq) => sq.run))].sort().join(",");
      const types = [...new Set(u.subQueries.map((sq) => sq.type))].join(",");
      return `${i}: [runs ${runs}] [types ${types}] ${u.text}`;
    })
    .join("\n");
  const prompt = [
    `TASK — Phase 3.1 only (Cluster). Group the logged sub-queries below into`,
    `themes by underlying need, not shared words. Name each theme as a short`,
    `noun phrase. Use the spec's B2B theme-type checklist as a checklist, not a`,
    `template. Every sub-query index may appear in at most one theme; leave`,
    `genuinely unrelated one-offs unassigned.`,
    ``,
    `Seed: "${cluster.seed}"`,
    ``,
    `SUB-QUERY LOG (${uniques.length} unique sub-queries; run/type annotations are informational):`,
    listing,
    ``,
    `${jsonOnly}`,
    `Respond compactly: theme names + index arrays only, nothing else.`,
    `Schema: {"themes": [{"name": "", "sub_query_indexes": [0, 5]}]}`,
    `Do NOT compute stability or tiers — that is done in code from your grouping.`,
  ].join("\n");
  const value = await callAndParse(ctx, cluster, prompt, (t) =>
    parseClusteringResponse(t, uniques.length),
  );

  const themes = value.map((t) => {
    const subQueries = t.subQueryIndexes.flatMap((i) => uniques[i]?.subQueries ?? []);
    const stability = computeStability(subQueries, cluster.k);
    return {
      name: t.name,
      stability,
      breadth: computeBreadth(subQueries),
      tier: tierForStability(stability),
      subQueries,
      mappedQuestions: [] as MinedQuestion[],
    };
  });
  await replaceThemes(ctx.deps.db, ctx.clusterId, cluster.companyId, themes);
  await saveClusterStage(ctx.deps.db, ctx.clusterId, "clustering", "questions", {});
  ctx.deps.log(
    `[cluster ${ctx.clusterId.toHexString()}] ${themes.length} themes (${themes.filter((t) => t.tier === "core").length} core)`,
  );
}

// ---------------------------------------------------------------------------
// Stage 4 — questions (spec §4): PAA + community/company, mapped to themes.
// ---------------------------------------------------------------------------
function representativeSubQueries(theme: ThemeDoc, limit = 8): string[] {
  const counts = new Map<string, { text: string; count: number; firstRun: number }>();
  for (const sq of theme.subQueries) {
    const key = sq.text.toLowerCase().trim();
    const cur = counts.get(key);
    if (cur) {
      cur.count += 1;
      cur.firstRun = Math.min(cur.firstRun, sq.run);
    } else {
      counts.set(key, { text: sq.text, count: 1, firstRun: sq.run });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.firstRun - b.firstRun)
    .slice(0, limit)
    .map((c) => c.text);
}

async function stageQuestions(ctx: StageCtx): Promise<void> {
  const { deps } = ctx;
  const cluster = await fresh(ctx);
  const themes = await getThemesForCluster(deps.db, ctx.clusterId);
  const themeNames = themes.map((t) => t.name);

  // Real PAA questions where a LIVE SERP client is available (source: serp).
  // Sandbox mode: one ping proves the integration; its dummy content is
  // discarded so it can never masquerade as evidence.
  const paaQuestions: { text: string; source: "serp" }[] = [];
  if (deps.serpClient && deps.serpSandbox) {
    try {
      const ping = await deps.serpClient.serpOrganicLive({
        keyword: cluster.seed,
        locationCode: deps.market.locationCode,
        languageCode: deps.market.languageCode,
      });
      await updateClusterUsage(deps.db, ctx.clusterId, { dataForSeoCalls: 1 });
      deps.log(
        `[cluster ${ctx.clusterId.toHexString()}] DataForSEO sandbox ping ok ` +
          `(${ping.items.length} organic, ${ping.peopleAlsoAsk.length} PAA — dummy data discarded)`,
      );
    } catch (err) {
      deps.log(`[cluster] DataForSEO sandbox ping failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  if (deps.serpClient && !deps.serpSandbox) {
    const targets = [
      cluster.seed,
      ...themes
        .filter((t) => t.tier === "core")
        .slice(0, 2)
        .map((t) => representativeSubQueries(t, 1)[0])
        .filter((t): t is string => Boolean(t)),
    ];
    for (const keyword of targets) {
      try {
        const snap = await deps.serpClient.serpOrganicLive({
          keyword,
          locationCode: deps.market.locationCode,
          languageCode: deps.market.languageCode,
        });
        await updateClusterUsage(deps.db, ctx.clusterId, { dataForSeoCalls: 1 });
        for (const q of snap.peopleAlsoAsk) paaQuestions.push({ text: q, source: "serp" });
      } catch (err) {
        deps.log(`[cluster] PAA lookup failed for "${keyword}": ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  const havePaa = paaQuestions.length > 0 && !deps.serpSandbox;
  const prompt = [
    `TASK — Phase 4 only (Question Mining). Map real questions to the themes`,
    `below and classify each (what/how/why/which_best/vs/cost_roi).`,
    ``,
    `Seed: "${cluster.seed}"`,
    `Themes: ${themeNames.join(" | ")}`,
    ``,
    havePaa
      ? `REAL People-Also-Ask questions (source: serp):\n${paaQuestions.map((q) => `- ${q.text}`).join("\n")}`
      : `No live PAA/community access is available. Propose 10–15 realistic buyer`
        + ` questions from the company context and seed. They will be labeled`
        + ` source: "simulated" — do not present them as scraped data.`,
    ``,
    `COMPANY CONTEXT (for sales-call themes and objections — source: company):`,
    ctx.companyContext.slice(0, 6000),
    ``,
    `A question that fits no existing theme indicates a missed theme: assign it`,
    `theme "NEW: <short noun phrase>".`,
    ``,
    `${jsonOnly}`,
    `Schema: {"questions": [{"text": "", "type": "what|how|why|which_best|vs|cost_roi", "theme": ""}]}`,
  ].join("\n");
  const parsed = await callAndParse(ctx, cluster, prompt, parseQuestionsResponse);
  if (parsed.length === 0) {
    deps.log(`[cluster ${ctx.clusterId.toHexString()}] no questions mapped — proceeding without`);
  }

  const paaSet = new Set(paaQuestions.map((q) => q.text.toLowerCase().trim()));
  const questions: MinedQuestion[] = [];
  const byTheme = new Map<string, MinedQuestion[]>();
  for (const q of parsed) {
    let themeName = q.theme;
    let questionMined = false;
    if (themeName.toLowerCase().startsWith("new:")) {
      themeName = themeName.slice(4).trim();
      questionMined = true;
    }
    const source: MinedQuestion["source"] = paaSet.has(q.text.toLowerCase().trim())
      ? "serp"
      : havePaa
        ? "company"
        : "simulated";
    const question: MinedQuestion = { text: q.text, source, qType: q.qType, theme: themeName };
    questions.push(question);
    const list = byTheme.get(themeName) ?? [];
    list.push(question);
    byTheme.set(themeName, list);
    if (questionMined && !themeNames.some((n) => n.toLowerCase() === themeName.toLowerCase())) {
      themeNames.push(themeName);
      const now = new Date();
      await deps.db.themes.insertOne({
        companyId: cluster.companyId,
        clusterId: ctx.clusterId,
        name: themeName,
        stability: 0,
        breadth: 0,
        tier: "secondary",
        questionMined: true,
        subQueries: [],
        mappedQuestions: [],
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  for (const theme of await getThemesForCluster(deps.db, ctx.clusterId)) {
    const mapped = byTheme.get(theme.name) ?? [];
    if (mapped.length > 0 && theme._id) {
      await updateTheme(deps.db, theme._id, { mappedQuestions: mapped });
    }
  }
  await saveClusterStage(ctx.deps.db, ctx.clusterId, "questions", "validation", { questions });
}

// ---------------------------------------------------------------------------
// Stage 5 — validation (spec §5): SERP + AI-surface checks per core theme.
// ---------------------------------------------------------------------------
function themesToValidate(themes: ThemeDoc[], max: number): ThemeDoc[] {
  const highWeight = (t: ThemeDoc) =>
    t.mappedQuestions.some((q) => QUESTION_WEIGHTS[q.qType] !== "medium");
  return [
    ...themes.filter((t) => t.tier === "core"),
    ...themes.filter((t) => t.tier === "secondary" && highWeight(t)),
  ].slice(0, max);
}

async function stageValidation(ctx: StageCtx): Promise<void> {
  const { deps } = ctx;
  const cluster = await fresh(ctx);
  const themes = await getThemesForCluster(deps.db, ctx.clusterId);
  const targets = themesToValidate(themes, deps.cfg.cluster.maxValidations);

  if (!deps.serpClient || deps.serpSandbox) {
    // Sandbox: one LLM-responses ping proves that integration too, then the
    // dummy content is discarded — sandbox data is never evidence.
    if (deps.serpClient && deps.serpSandbox) {
      try {
        const ping = await deps.serpClient.llmResponseLive({
          provider: "chat_gpt",
          prompt: cluster.seed,
        });
        await updateClusterUsage(deps.db, ctx.clusterId, { dataForSeoCalls: 1 });
        deps.log(
          `[cluster ${ctx.clusterId.toHexString()}] LLM-responses sandbox ping ok ` +
            `(${ping.citedUrls.length} cited urls — dummy data discarded)`,
        );
      } catch (err) {
        deps.log(`[cluster] LLM-responses sandbox ping failed: ${err instanceof Error ? err.message : err}`);
      }
    }
    const reason = deps.serpClient
      ? "DataForSEO sandbox mode — dummy data not usable as evidence; checks skipped"
      : "no DataForSEO credentials — SERP and AI-surface checks skipped";
    for (const theme of targets) {
      if (theme._id) {
        await updateTheme(deps.db, theme._id, { validation: { skipped: reason } });
      }
    }
    await saveClusterStage(deps.db, ctx.clusterId, "validation", "gap_map", {});
    deps.log(`[cluster ${ctx.clusterId.toHexString()}] validation skipped (${reason})`);
    return;
  }

  const serpData: { theme: string; snapshots: SerpSnapshot[] }[] = [];
  for (const theme of targets) {
    const reps = representativeSubQueries(theme, 2);
    const snapshots: SerpSnapshot[] = [];
    const aiSurfaces: LlmSurfaceSnapshot[] = [];
    for (const rep of reps.slice(0, deps.cfg.cluster.serpChecksPerTheme)) {
      try {
        const snap = await deps.serpClient.serpOrganicLive({
          keyword: rep,
          locationCode: deps.market.locationCode,
          languageCode: deps.market.languageCode,
        });
        await updateClusterUsage(deps.db, ctx.clusterId, { dataForSeoCalls: 1 });
        snapshots.push(snap);
      } catch (err) {
        deps.log(`[cluster] SERP check failed for "${rep}": ${err instanceof Error ? err.message : err}`);
      }
    }
    const surfacePrompt = theme.mappedQuestions[0]?.text ?? reps[0];
    if (surfacePrompt) {
      for (const provider of ["chat_gpt", "gemini"] as const) {
        try {
          const snap = await deps.serpClient.llmResponseLive({ provider, prompt: surfacePrompt });
          await updateClusterUsage(deps.db, ctx.clusterId, { dataForSeoCalls: 1 });
          aiSurfaces.push(snap);
        } catch (err) {
          deps.log(`[cluster] AI-surface check (${provider}) failed: ${err instanceof Error ? err.message : err}`);
        }
      }
    }
    if (theme._id) {
      await updateTheme(deps.db, theme._id, {
        validation: {
          serp: snapshots.map((s) => ({
            subQuery: s.keyword,
            results: s.items.slice(0, 5).map((i) => ({
              rank: i.rank,
              title: i.title,
              domain: i.domain,
              url: i.url,
            })),
            peopleAlsoAsk: s.peopleAlsoAsk,
            aiOverviewPresent: s.aiOverviewPresent,
          })),
          aiSurfaces: aiSurfaces.map((s) => ({
            surface: s.provider,
            prompt: s.prompt,
            citedDomains: s.citedDomains,
            citedUrls: s.citedUrls.slice(0, 20),
            answerExcerpt: s.answerText.slice(0, 500),
          })),
        },
      });
    }
    if (snapshots.length > 0) serpData.push({ theme: theme.name, snapshots });
  }

  // One analysis pass over all captured SERP data (format/depth/freshness/gaps).
  if (serpData.length > 0) {
    const prompt = [
      `TASK — Phase 5 SERP analysis only. For each theme below, summarize from the`,
      `captured top-5 data: dominant format, depth/specificity, freshness signals,`,
      `and gaps nobody covers. Do not calculate target word counts.`,
      ``,
      serpData
        .map(
          (d) =>
            `THEME "${d.theme}":\n${d.snapshots
              .map(
                (s) =>
                  `  query "${s.keyword}" (AI Overview: ${s.aiOverviewPresent ? "yes" : "no"}):\n${s.items
                    .slice(0, 5)
                    .map((i) => `    ${i.rank}. ${i.title} — ${i.domain}\n       ${i.description.slice(0, 160)}`)
                    .join("\n")}`,
              )
              .join("\n")}`,
        )
        .join("\n\n"),
      ``,
      `${jsonOnly}`,
      `Schema: {"themes": [{"theme": "", "analysis": ""}]}`,
    ].join("\n");
    const text = await callMain(ctx, cluster, prompt);
    const root = extractJson(text) as { themes?: { theme?: string; analysis?: string }[] } | undefined;
    for (const entry of root?.themes ?? []) {
      if (!entry.theme || !entry.analysis) continue;
      const theme = themes.find((t) => t.name === entry.theme);
      if (theme?._id && theme.validation?.serp) {
        const serp = theme.validation.serp.map((s) => ({ ...s, analysis: entry.analysis as string }));
        await updateTheme(deps.db, theme._id, {
          validation: { ...theme.validation, serp },
        });
      }
    }
  }

  await saveClusterStage(deps.db, ctx.clusterId, "validation", "gap_map", {});
}

// ---------------------------------------------------------------------------
// Stage 6 — gap map (spec §6): owner asset per theme vs the content inventory.
// ---------------------------------------------------------------------------
async function stageGapMap(ctx: StageCtx): Promise<void> {
  const { deps } = ctx;
  const cluster = await fresh(ctx);
  const themes = await getThemesForCluster(deps.db, ctx.clusterId);
  const inventory = await contentInventory(deps.db);
  // 6.3: competitor topic indexes sharpen the owned/buried/missing calls —
  // a theme competitors blanket while we have nothing is decisively missing.
  const companyDoc = await deps.db.companies.findOne({ companyId: cluster.companyId });
  const competitorDigest = buildCompetitorGapDigest(
    await latestScrapesByDomain(deps.db, cluster.companyId),
    {
      maxTopics: 15,
      maxSampledTopics: 0,
      excludeDomains: ownDomainsFromConfig(companyDoc?.config),
    },
  );
  const prompt = [
    `TASK — Phase 6 only (Gap Map). For every theme, assign owned/buried/missing`,
    `against the content inventory, name the owner asset when one exists, and`,
    `flag themes best owned by non-blog assets or off-site channels.`,
    ``,
    `THEMES:`,
    themes
      .map(
        (t) =>
          `- "${t.name}" (tier: ${t.tier}) — sub-queries: ${representativeSubQueries(t, 4).join("; ") || "(question-mined)"}`,
      )
      .join("\n"),
    ``,
    `CONTENT INVENTORY:`,
    inventory.length > 0
      ? inventory.map((i) => `- "${i.title}" (slug: ${i.slug}${i.url ? `, ${i.url}` : ""})`).join("\n")
      : `(empty — every theme is "missing" unless a non-blog asset obviously owns it)`,
    ...(competitorDigest
      ? [
          ``,
          `COMPETITOR COVERAGE (scraped topic indexes — context for how contested each theme is;`,
          `gap status is still judged against OUR inventory above):`,
          competitorDigest.slice(0, 6000),
        ]
      : []),
    ``,
    `${jsonOnly}`,
    `Schema: {"themes": [{"theme": "", "gap_status": "owned|buried|missing", "owner_asset": "", "non_blog_asset": "", "off_site_channel": ""}]}`,
  ].join("\n");
  const parsed = await callAndParse(ctx, cluster, prompt, parseGapMapResponse);
  for (const entry of parsed) {
    const theme = themes.find((t) => t.name.toLowerCase() === entry.theme.toLowerCase());
    if (!theme?._id) continue;
    await updateTheme(deps.db, theme._id, {
      gapStatus: entry.gapStatus,
      ...(entry.ownerAsset ? { ownerAsset: entry.ownerAsset } : {}),
      ...(entry.nonBlogAsset ? { nonBlogAsset: entry.nonBlogAsset } : {}),
      ...(entry.offSiteChannel ? { offSiteChannel: entry.offSiteChannel } : {}),
    });
  }
  // Any theme the model skipped defaults to missing (the conservative gap).
  for (const theme of await getThemesForCluster(deps.db, ctx.clusterId)) {
    if (!theme.gapStatus && theme._id) {
      await updateTheme(deps.db, theme._id, { gapStatus: "missing" });
    }
  }
  await saveClusterStage(deps.db, ctx.clusterId, "gap_map", "prioritization", {});
}

// ---------------------------------------------------------------------------
// Stage 7 — prioritization (spec §7): LLM judges 3 factors, code computes the 45.
// ---------------------------------------------------------------------------
async function stagePrioritization(ctx: StageCtx): Promise<void> {
  const { deps } = ctx;
  const cluster = await fresh(ctx);
  const themes = await getThemesForCluster(deps.db, ctx.clusterId);
  const dossier = themes
    .map((t) => {
      const analysis = t.validation?.serp?.[0]?.analysis;
      const surfaces = t.validation?.aiSurfaces
        ?.map((s) => `${s.surface} cites: ${s.citedDomains.slice(0, 6).join(", ") || "(none)"}`)
        .join(" | ");
      return [
        `- "${t.name}" (tier: ${t.tier}, stability: ${t.stability.toFixed(2)}, gap: ${t.gapStatus ?? "missing"})`,
        `  questions: ${t.mappedQuestions.map((q) => `${q.text} [${q.qType}]`).join("; ") || "(none)"}`,
        analysis ? `  SERP analysis: ${analysis.slice(0, 400)}` : `  SERP analysis: (not available)`,
        surfaces ? `  AI surfaces: ${surfaces}` : `  AI surfaces: (no data — validation skipped)`,
      ].join("\n");
    })
    .join("\n");
  const prompt = [
    `TASK — Phase 7 only (Prioritization). For each theme, judge decisiveness`,
    `(1–5), right_to_win (1–5), and openness (1–5) per your spec's rubric, each`,
    `with a one-line rationale. Do NOT compute gap, stability, or totals — code`,
    `does that. If a theme has no AI-surface data, set openness to ${NO_SURFACE_DATA_OPENNESS} and say so`,
    `in the rationale — never invent citation observations.`,
    ``,
    `COMPANY CONTEXT (for right-to-win: product fit + proprietary proof):`,
    ctx.companyContext.slice(0, 6000),
    ``,
    `THEMES:`,
    dossier,
    ``,
    `${jsonOnly}`,
    `Schema: {"themes": [{"theme": "", "decisiveness": 0, "right_to_win": 0, "openness": 0,`,
    ` "rationale": {"decisiveness": "", "right_to_win": "", "openness": ""}}]}`,
  ].join("\n");
  const parsed = await callAndParse(ctx, cluster, prompt, parseScoresResponse);
  for (const theme of themes) {
    if (!theme._id) continue;
    const entry = parsed.find((p) => p.theme.toLowerCase() === theme.name.toLowerCase());
    const judged = entry ?? {
      theme: theme.name,
      decisiveness: 3,
      rightToWin: 3,
      openness: NO_SURFACE_DATA_OPENNESS,
      rationale: { note: "model returned no entry — neutral defaults" },
    };
    const hasSurfaceData = (theme.validation?.aiSurfaces?.length ?? 0) > 0;
    const openness = hasSurfaceData ? judged.openness : NO_SURFACE_DATA_OPENNESS;
    const rationale = { ...judged.rationale };
    if (!hasSurfaceData) {
      rationale["openness"] = "no AI-surface data (validation skipped) — neutral default";
    }
    const scores = computeThemeScores({
      decisiveness: judged.decisiveness,
      gapStatus: theme.gapStatus ?? "missing",
      rightToWin: judged.rightToWin,
      stability: theme.stability,
      openness,
    });
    await updateTheme(deps.db, theme._id, {
      scores,
      rationale,
      awarenessPlay: isAwarenessPlay(judged.rightToWin),
    });
  }
  await saveClusterStage(deps.db, ctx.clusterId, "prioritization", "architecture", {});
}

// ---------------------------------------------------------------------------
// Stage 8 — architecture (spec §8): hub + spoke/section/non-blog/off-site,
// validated against the hard rules with one feedback retry.
// ---------------------------------------------------------------------------
async function stageArchitecture(ctx: StageCtx): Promise<void> {
  const { deps } = ctx;
  const cluster = await fresh(ctx);
  const themes = await getThemesForCluster(deps.db, ctx.clusterId);
  const inventory = await contentInventory(deps.db);
  const themeLines = themes
    .map(
      (t) =>
        `- "${t.name}": tier ${t.tier}, breadth ${t.breadth}, score ${t.scores?.total ?? 0}/45, gap ${t.gapStatus}` +
        `${t.nonBlogAsset ? `, non-blog flag: ${t.nonBlogAsset}` : ""}${t.offSiteChannel ? `, off-site flag: ${t.offSiteChannel}` : ""}` +
        `${t.awarenessPlay ? ", AWARENESS PLAY (low right-to-win)" : ""}, ${t.subQueries.length} sub-queries`,
    )
    .join("\n");

  let feedback: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const prompt = [
      `TASK — Phase 8 only (Cluster Architecture). Assign every non-noise theme a`,
      `spoke / section / non_blog / off_site per your spec's decision rules, give`,
      `each section a parent spoke, and define the hub (a routing page, not an`,
      `ultimate guide): title + a 2–3 sentence summary per theme. Check the`,
      `inventory for cannibalization before creating a spoke.`,
      ``,
      `Seed: "${cluster.seed}"`,
      `THEMES:`,
      themeLines,
      ``,
      `EXISTING INVENTORY (cannibalization check):`,
      inventory.map((i) => `- "${i.title}" (${i.slug})`).join("\n") || "(empty)",
      feedback.length > 0
        ? `\nFEEDBACK — your previous proposal broke these hard rules. Fix every one:\n${feedback.map((p) => `- ${p}`).join("\n")}`
        : ``,
      ``,
      `${jsonOnly}`,
      `Schema: {"assignments": [{"theme": "", "architecture": "spoke|section|non_blog|off_site", "parent_spoke": ""}],`,
      ` "hub": {"title": "", "theme_summaries": [{"theme": "", "summary": ""}]}}`,
    ].join("\n");
    const text = await callMain(ctx, cluster, prompt);
    const parsed = parseArchitectureResponse(text);
    if (!parsed.value) {
      feedback = parsed.problems;
      continue;
    }

    const assignments: ArchitectureAssignment[] = [];
    const problems: string[] = [];
    for (const theme of themes) {
      const entry = parsed.value.assignments.find(
        (a) => a.theme.toLowerCase() === theme.name.toLowerCase(),
      );
      if (!entry) {
        if (theme.tier !== "noise") problems.push(`theme "${theme.name}" has no architecture assignment`);
        continue;
      }
      assignments.push({
        theme: theme.name,
        tier: theme.tier,
        architecture: entry.architecture,
        ...(entry.parentSpoke ? { parentSpoke: entry.parentSpoke } : {}),
        subQueryCount: theme.subQueries.length,
      });
    }
    problems.push(...validateArchitecture(assignments));
    if (problems.length > 0) {
      feedback = problems;
      continue;
    }

    for (const a of assignments) {
      const theme = themes.find((t) => t.name === a.theme);
      if (!theme?._id) continue;
      await updateTheme(deps.db, theme._id, {
        architecture: a.architecture,
        ...(a.parentSpoke ? { parentSpoke: a.parentSpoke } : {}),
      });
    }
    await saveClusterStage(deps.db, ctx.clusterId, "architecture", "briefs", {
      hub: parsed.value.hub,
    });
    return;
  }
  throw new Error(`architecture failed hard rules after retry: ${feedback.join("; ")}`);
}

// ---------------------------------------------------------------------------
// Stage 9 — briefs (spec §9): one answer-first brief per spoke, ranked.
// ---------------------------------------------------------------------------
/** Sibling candidates: spokes sharing sub-query vocabulary (spec hard rule). */
function siblingCandidates(spoke: ThemeDoc, spokes: ThemeDoc[]): string[] {
  const tokens = (t: ThemeDoc) =>
    new Set(
      t.subQueries
        .flatMap((sq) => sq.text.toLowerCase().split(/[^a-z0-9]+/))
        .filter((w) => w.length > 3),
    );
  const own = tokens(spoke);
  return spokes
    .filter((s) => s.name !== spoke.name)
    .filter((s) => {
      const overlap = [...tokens(s)].filter((w) => own.has(w));
      return overlap.length >= 2;
    })
    .map((s) => s.name);
}

async function stageBriefs(ctx: StageCtx): Promise<void> {
  const { deps } = ctx;
  const cluster = await fresh(ctx);
  const themes = await getThemesForCluster(deps.db, ctx.clusterId);
  const spokes = themes
    .filter((t) => t.architecture === "spoke")
    .sort((a, b) => (b.scores?.total ?? 0) - (a.scores?.total ?? 0));
  const hubTitle = cluster.hub?.title ?? cluster.seed;
  const briefs: SpokeBrief[] = [];

  for (const spoke of spokes) {
    const reps = representativeSubQueries(spoke, 8);
    const sections = themes.filter((t) => t.parentSpoke === spoke.name);
    const allowedSiblings = siblingCandidates(spoke, spokes);
    const serpAnalysis = spoke.validation?.serp?.[0]?.analysis;
    const prompt = [
      `TASK — Phase 9 only (Spoke Brief) for the spoke "${spoke.name}".`,
      ``,
      `Theme dossier:`,
      `- Persona signals: ${spoke.mappedQuestions.map((q) => q.text).join("; ") || "(none)"}`,
      `- Representative sub-queries (use their vocabulary for H2s): ${reps.join("; ")}`,
      `- Sections to fold in as H2s: ${sections.map((s) => s.name).join("; ") || "(none)"}`,
      `- Gap: ${spoke.gapStatus} | Score: ${spoke.scores?.total ?? 0}/45${spoke.awarenessPlay ? " | AWARENESS PLAY" : ""}`,
      serpAnalysis ? `- Phase 5 SERP analysis: ${serpAnalysis.slice(0, 500)}` : `- Phase 5 SERP analysis: (not available)`,
      ``,
      `COMPANY CONTEXT (proprietary proof + quotable stat candidates):`,
      ctx.companyContext.slice(0, 6000),
      ``,
      `Evidence rules: name proprietary proof only from the company context above.`,
      `External statistics are REQUIREMENTS for the writer to source — include a`,
      `source URL only if it appeared in the validation data; otherwise state the`,
      `requirement without a URL. Never invent statistics or URLs.`,
      `Internal links: hub "${hubTitle}"; siblings allowed ONLY from: ${allowedSiblings.join("; ") || "(none)"}.`,
      `Length band: default 800–2,000 words; justify anything outside it.`,
      ``,
      `primary_query_target (D32): the natural query a person would actually type`,
      `for this article — 2–6 words, like "PAM for hospitals". NEVER a sub-query`,
      `string. Also give 2–3 alternates.`,
      `required_passages (D33): the questions the sub-queries ask, in their`,
      `vocabulary — these are COVERAGE REQUIREMENTS the article must answer as`,
      `extractable passages, not the article's headings; the Strategist owns`,
      `structure.`,
      ``,
      `${jsonOnly}`,
      `Schema: {"working_title": "", "primary_query_target": "", "query_target_alternates": ["", ""],`,
      ` "persona": "", "buying_stage": "",`,
      ` "required_passages": ["questions in sub-query vocabulary"],`,
      ` "evidence": {"proprietary": [""], "external": [{"requirement": "", "source_url": ""}], "quotable_stat_candidate": ""},`,
      ` "differentiation_angle": "", "internal_links": {"siblings": [""]},`,
      ` "length_band": {"min": 800, "max": 2000, "justification": ""}, "schema": ["Article"]}`,
    ].join("\n");
    const parsed = await callAndParse(ctx, cluster, prompt, parseBriefResponse);
    const lengthBand = normalizeLengthBand(parsed.lengthBand);
    const siblings = parsed.siblingLinks.filter((s) =>
      allowedSiblings.some((a) => a.toLowerCase() === s.toLowerCase()),
    );
    const withoutMarkdown: Omit<SpokeBrief, "markdown"> = {
      themeName: spoke.name,
      workingTitle: parsed.workingTitle,
      primaryQueryTarget: parsed.primaryQueryTarget,
      ...(parsed.queryTargetAlternates.length > 0
        ? { queryTargetAlternates: parsed.queryTargetAlternates }
        : {}),
      persona: parsed.persona,
      buyingStage: parsed.buyingStage,
      representativeSubQueries: reps,
      h2Outline: parsed.h2Outline,
      evidence: parsed.evidence,
      differentiationAngle: parsed.differentiationAngle,
      internalLinks: { hub: hubTitle, siblings },
      lengthBand,
      schemaTypes: parsed.schemaTypes,
      priorityScore: spoke.scores?.total ?? 0,
    };
    briefs.push({ ...withoutMarkdown, markdown: renderBriefMarkdown(withoutMarkdown) });
    deps.log(`[cluster ${ctx.clusterId.toHexString()}] brief ready: "${parsed.workingTitle}"`);
  }

  await saveClusterStage(deps.db, ctx.clusterId, "briefs", "done", { spokeBriefs: briefs });
}

const STAGE_FNS: Record<ClusterStage, (ctx: StageCtx) => Promise<void>> = {
  expansion: stageExpansion,
  fanout: stageFanout,
  clustering: stageClustering,
  questions: stageQuestions,
  validation: stageValidation,
  gap_map: stageGapMap,
  prioritization: stagePrioritization,
  architecture: stageArchitecture,
  briefs: stageBriefs,
};

/**
 * Run one claimed cluster job from its current stage through completion.
 * Completed stages are skipped on retry; the final output is assembled from
 * the stored pieces and must pass the output-schema gate.
 */
export async function runCluster(deps: ClusterDeps, cluster: ClusterDoc): Promise<void> {
  const clusterId = cluster._id;
  if (!clusterId) throw new Error("cluster missing _id");
  const ctx: StageCtx = {
    deps,
    clusterId,
    spec: await loadSpec(deps.cfg),
    companyContext: await loadCompanyContext(deps),
  };
  const emit = (type: Parameters<typeof emitClusterEvent>[1]["type"], message: string, data?: Record<string, unknown>) =>
    emitClusterEvent(deps.db, { companyId: cluster.companyId, clusterId, type, message, ...(data ? { data } : {}) });

  await emit("cluster.started", `Cluster run started (attempt ${cluster.attempts}/${cluster.maxAttempts}) at stage ${cluster.stage}`);

  try {
    const startIdx = cluster.stage === "done" ? CLUSTER_STAGES.length : CLUSTER_STAGES.indexOf(cluster.stage);
    for (const stage of CLUSTER_STAGES.slice(Math.max(0, startIdx))) {
      if (cluster.completedStages.includes(stage)) continue;
      await emit("stage.started", `Stage ${stage} started`, { stage });
      await STAGE_FNS[stage](ctx);
      await emit("stage.succeeded", `Stage ${stage} complete`, { stage });
    }

    const finalCluster = await fresh(ctx);
    const themes = await getThemesForCluster(deps.db, clusterId);
    const output = assembleClusterOutput(finalCluster, themes);
    const problems = validateClusterOutput(output);
    if (problems.length > 0) {
      throw new Error(`output schema gate failed: ${problems.join("; ")}`);
    }
    await completeClusterRun(deps.db, clusterId, output, problems);
    await emit("cluster.succeeded", `Cluster complete: ${themes.length} themes, ${finalCluster.spokeBriefs?.length ?? 0} spoke briefs`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const disposition = await failClusterRun(deps.db, clusterId, message);
    await emit(
      disposition === "requeued" ? "cluster.retried" : "cluster.failed",
      disposition === "requeued" ? `Cluster requeued after error: ${message}` : `Cluster failed permanently: ${message}`,
    );
    throw err;
  }
}
