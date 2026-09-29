"use client";

import { useActionState, useTransition, useState } from "react";
import type { CtaSettings } from "@blogagent/engine";
import { resetCtaSettings, saveCtaSettings, type CtaFormState } from "@/lib/actions/ctas";
import { Card, buttonCls, cls, inputCls } from "./ui";

const STAGES = [
  { key: "tofu", label: "TOFU", hint: "Awareness pages — definitions, explainers, thought leadership, stats" },
  { key: "mofu", label: "MOFU", hint: "Consideration pages — deep-dives, how-tos, comparisons, assessments" },
  { key: "bofu", label: "BOFU", hint: "Decision pages — tools, buyer's guides, vendor comparisons" },
] as const;

/** Admin › CTAs (D50): the closing CTA each funnel stage links to. */
export function CtaForm({ ctas, saved, updatedAt }: { ctas: CtaSettings; saved: boolean; updatedAt?: string }) {
  const [state, formAction, pending] = useActionState<CtaFormState, FormData>(saveCtaSettings, {});
  const [resetMsg, setResetMsg] = useState<CtaFormState>({});
  const [resetting, startReset] = useTransition();
  const shown = resetMsg.message ? resetMsg : state;

  return (
    <Card title="Closing CTA by funnel stage">
      <form action={formAction} className="space-y-5">
        <p className="text-xs leading-relaxed text-slate-500">
          Every page closes on its funnel stage&apos;s CTA, and the edit gate checks the link is there.
          {saved
            ? ` These values are saved in the app${updatedAt ? ` (last saved ${new Date(updatedAt).toLocaleString()})` : ""} and override company.yaml.`
            : " These values come from company.yaml until you save here."}
        </p>
        {STAGES.map((s) => {
          const cta = ctas[s.key];
          return (
            <fieldset key={s.key} className="space-y-2 rounded-md border border-slate-200 p-3">
              <legend className="px-1 text-sm font-semibold text-slate-700">
                {s.label} <span className="font-normal text-slate-400">— {s.hint}</span>
              </legend>
              <label className="block text-xs font-medium text-slate-600">
                Link URL
                <input
                  name={`${s.key}.url`}
                  type="url"
                  required
                  defaultValue={cta?.url ?? ""}
                  placeholder="https://"
                  className={cls(inputCls, "mt-1 w-full")}
                />
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-xs font-medium text-slate-600">
                  Link text
                  <input
                    name={`${s.key}.label`}
                    defaultValue={cta?.label ?? ""}
                    placeholder="e.g. Book a demo"
                    className={cls(inputCls, "mt-1 w-full")}
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  What the reader gets (for the Writer)
                  <input
                    name={`${s.key}.blurb`}
                    defaultValue={cta?.blurb ?? ""}
                    placeholder="optional"
                    className={cls(inputCls, "mt-1 w-full")}
                  />
                </label>
              </div>
            </fieldset>
          );
        })}
        {shown.error && <p className="text-sm text-red-600">{shown.error}</p>}
        {shown.message && <p className="text-sm text-emerald-700">{shown.message}</p>}
        <div className="flex items-center justify-between">
          {saved ? (
            <button
              type="button"
              disabled={resetting}
              onClick={() => startReset(async () => setResetMsg(await resetCtaSettings()))}
              className={buttonCls("ghost")}
            >
              {resetting ? "Resetting…" : "Reset to company.yaml"}
            </button>
          ) : (
            <span />
          )}
          <button type="submit" disabled={pending} className={buttonCls("primary")}>
            {pending ? "Saving…" : "Save CTAs"}
          </button>
        </div>
      </form>
    </Card>
  );
}
