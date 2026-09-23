import type { ClusterDoc, ThemeDoc } from "./types.js";

/**
 * Validation of the final cluster output against the spec's output schema
 * (agents/topic-cluster-generator.md §Output Schema). This is the cluster
 * run's gate: the runner assembles the output from stored stage results and
 * this check must come back clean before the run counts as succeeded.
 */
export function validateClusterOutput(output: Record<string, unknown>): string[] {
  const problems: string[] = [];
  const str = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
  const arr = (v: unknown): v is unknown[] => Array.isArray(v);

  if (!str(output["seed"])) problems.push("seed missing");

  if (!arr(output["prompts"]) || output["prompts"].length === 0) {
    problems.push("prompts missing or empty");
  } else {
    output["prompts"].forEach((p, i) => {
      const rec = p as Record<string, unknown>;
      for (const key of ["id", "text", "persona", "stage"]) {
        if (!str(rec?.[key])) problems.push(`prompts[${i}].${key} missing`);
      }
    });
  }

  const themes = output["themes"];
  if (!arr(themes) || themes.length === 0) {
    problems.push("themes missing or empty");
  } else {
    themes.forEach((t, i) => {
      const rec = t as Record<string, unknown>;
      const label = str(rec?.["name"]) ? `theme "${rec["name"]}"` : `themes[${i}]`;
      if (!str(rec?.["name"])) problems.push(`themes[${i}].name missing`);
      if (typeof rec?.["stability"] !== "number" || rec["stability"] < 0 || rec["stability"] > 1) {
        problems.push(`${label}: stability must be a number in [0, 1]`);
      }
      if (typeof rec?.["breadth"] !== "number") problems.push(`${label}: breadth missing`);
      if (!["core", "secondary", "noise"].includes(rec?.["tier"] as string)) {
        problems.push(`${label}: tier must be core|secondary|noise`);
      }
      const subQueries = rec?.["sub_queries"];
      if (!arr(subQueries)) {
        problems.push(`${label}: sub_queries missing`);
      } else {
        subQueries.forEach((sq, j) => {
          const sqr = sq as Record<string, unknown>;
          if (!str(sqr?.["text"])) problems.push(`${label}: sub_queries[${j}].text missing`);
          if (!str(sqr?.["type"])) problems.push(`${label}: sub_queries[${j}].type missing`);
          if (!str(sqr?.["source"])) problems.push(`${label}: sub_queries[${j}].source missing`);
          if (typeof sqr?.["run"] !== "number") problems.push(`${label}: sub_queries[${j}].run missing`);
        });
      }
      if (!["owned", "buried", "missing"].includes(rec?.["gap_status"] as string)) {
        problems.push(`${label}: gap_status must be owned|buried|missing`);
      }
      const scores = rec?.["scores"] as Record<string, unknown> | undefined;
      if (!scores || typeof scores !== "object") {
        problems.push(`${label}: scores missing`);
      } else {
        for (const key of ["decisiveness", "gap", "right_to_win", "stability", "openness", "total"]) {
          if (typeof scores[key] !== "number") problems.push(`${label}: scores.${key} missing`);
        }
        if (typeof scores["total"] === "number" && (scores["total"] < 0 || scores["total"] > 45)) {
          problems.push(`${label}: scores.total out of the 0–45 range`);
        }
      }
      if (!["spoke", "section", "non_blog", "off_site"].includes(rec?.["architecture"] as string)) {
        problems.push(`${label}: architecture must be spoke|section|non_blog|off_site`);
      }
      if (rec?.["architecture"] === "section" && !str(rec?.["parent_spoke"])) {
        problems.push(`${label}: section without parent_spoke`);
      }
    });
  }

  const hub = output["hub"] as Record<string, unknown> | undefined;
  if (!hub || !str(hub["title"])) problems.push("hub.title missing");
  if (!arr(hub?.["theme_summaries"]) || (hub?.["theme_summaries"] as unknown[]).length === 0) {
    problems.push("hub.theme_summaries missing or empty");
  }

  if (!arr(output["spoke_briefs"])) problems.push("spoke_briefs missing");

  return problems;
}

/** Assemble the spec-schema output JSON from the stored run + theme docs. */
export function assembleClusterOutput(cluster: ClusterDoc, themes: ThemeDoc[]): Record<string, unknown> {
  return {
    seed: cluster.seed,
    prompts: (cluster.prompts ?? []).map((p) => ({
      id: p.id,
      text: p.text,
      persona: p.persona,
      stage: p.stage,
    })),
    themes: themes.map((t) => ({
      name: t.name,
      stability: t.stability,
      breadth: t.breadth,
      tier: t.tier,
      sub_queries: t.subQueries.map((sq) => ({
        text: sq.text,
        type: sq.type,
        source: sq.source,
        run: sq.run,
      })),
      mapped_questions: t.mappedQuestions.map((q) => ({
        text: q.text,
        type: q.qType,
        source: q.source,
      })),
      gap_status: t.gapStatus ?? "missing",
      owner_asset: t.ownerAsset ?? "",
      scores: {
        decisiveness: t.scores?.decisiveness ?? 0,
        gap: t.scores?.gap ?? 0,
        right_to_win: t.scores?.rightToWin ?? 0,
        stability: t.scores?.stability ?? 0,
        openness: t.scores?.openness ?? 0,
        total: t.scores?.total ?? 0,
      },
      rationale: t.rationale ?? {},
      ...(t.awarenessPlay ? { awareness_play: true } : {}),
      architecture: t.architecture ?? "section",
      parent_spoke: t.parentSpoke ?? "",
    })),
    hub: {
      title: cluster.hub?.title ?? "",
      theme_summaries: (cluster.hub?.themeSummaries ?? []).map((s) => ({
        theme: s.theme,
        summary: s.summary,
      })),
    },
    spoke_briefs: (cluster.spokeBriefs ?? []).map((b) => ({
      theme: b.themeName,
      working_title: b.workingTitle,
      primary_query_target: b.primaryQueryTarget,
      ...(b.queryTargetAlternates?.length
        ? { query_target_alternates: b.queryTargetAlternates }
        : {}),
      persona: b.persona,
      buying_stage: b.buyingStage,
      representative_sub_queries: b.representativeSubQueries,
      h2_outline: b.h2Outline,
      evidence: {
        proprietary: b.evidence.proprietary,
        external: b.evidence.external.map((e) => ({
          requirement: e.requirement,
          ...(e.sourceUrl ? { source_url: e.sourceUrl } : {}),
        })),
        quotable_stat_candidate: b.evidence.quotableStatCandidate,
      },
      differentiation_angle: b.differentiationAngle,
      internal_links: { hub: b.internalLinks.hub, siblings: b.internalLinks.siblings },
      length_band: b.lengthBand,
      schema: b.schemaTypes,
      priority_score: b.priorityScore,
      markdown: b.markdown,
    })),
  };
}
