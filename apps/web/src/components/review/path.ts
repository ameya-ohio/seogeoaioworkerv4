import { hostPath, when, type ReviewArticle } from "./model";

/**
 * The article's path to live for the configured publish target (D52):
 * Framer export, HubSpot, or neither (approve only). The same rules decide
 * the toolbar's one primary action and the Audit panel's "Path to live".
 */

export type StepKey = "notes" | "signoff" | "download" | "markLive" | "send" | "goLive" | "approve";

export interface PathStep {
  key: StepKey;
  title: string;
  hint: string;
  done: boolean;
}

export function canPublish(a: ReviewArticle): boolean {
  return ["review", "approved", "published"].includes(a.stage);
}

export function needsSignoff(a: ReviewArticle): boolean {
  return a.signoffRequired && !a.signoff;
}

export function hubspotLive(a: ReviewArticle): boolean {
  return a.hubspot?.state === "PUBLISHED";
}

export function pathSteps(a: ReviewArticle, notes: number): PathStep[] {
  const notesStep: PathStep = {
    key: "notes",
    title: "Resolve notes",
    hint: notes > 0 ? `${notes} left in the text` : "None left in the text",
    done: notes === 0,
  };
  if (a.publishTarget === "framer-export") {
    return [
      notesStep,
      ...(a.signoffRequired
        ? [
            {
              key: "signoff" as const,
              title: "Sign off",
              hint: a.signoff ? `Signed off by ${a.signoff.by}, ${when(a.signoff.at)}` : `${a.formatLabel} pages need a human sign-off before export`,
              done: Boolean(a.signoff),
            },
          ]
        : []),
      {
        key: "download",
        title: "Download Framer package",
        hint: a.exportedAt ? `Downloaded ${when(a.exportedAt)}` : "Paste-ready HTML, markdown, head tags, meta and hero",
        done: Boolean(a.exportedAt) || Boolean(a.live),
      },
      {
        key: "markLive",
        title: "Mark live",
        hint: a.live ? `Live at ${hostPath(a.live.url)}` : "Checks the page answers at its URL",
        done: Boolean(a.live),
      },
    ];
  }
  if (a.hubspotConfig.configured) {
    const hs = a.hubspot;
    return [
      notesStep,
      {
        key: "send",
        title: "Send to HubSpot",
        hint: hs ? `Post created · ${hs.state.toLowerCase()}` : "Creates the post in HubSpot as a draft",
        done: Boolean(hs),
      },
      {
        key: "goLive",
        title: "Go live",
        hint: hubspotLive(a) ? "Published on HubSpot" : "Publishes the post on HubSpot",
        done: hubspotLive(a),
      },
    ];
  }
  return [
    notesStep,
    {
      key: "approve",
      title: "Approve",
      hint: `HubSpot isn't configured (${a.hubspotConfig.tokenEnv}), so publishing happens outside the app`,
      done: a.stage === "approved" || a.stage === "published",
    },
  ];
}

/** The step the primary button performs, or null when there's nothing left to do here. */
export function nextStep(a: ReviewArticle, notes: number): StepKey | null {
  if (notes > 0) return "notes";
  if (a.publishTarget === "framer-export") {
    if (!canPublish(a)) return null;
    if (needsSignoff(a)) return "signoff";
    if (!a.exportedAt && !a.live) return "download";
    if (!a.live) return "markLive";
    return null;
  }
  if (a.hubspotConfig.configured) {
    if (!canPublish(a)) return null;
    if (!a.hubspot) return "send";
    if (!hubspotLive(a)) return "goLive";
    return null;
  }
  return a.stage === "review" ? "approve" : null;
}
