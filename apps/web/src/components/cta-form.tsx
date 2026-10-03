"use client";

import { useState, useTransition } from "react";
import type { CtaSettings } from "@blogagent/engine";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { resetCtaSettings, saveCtaSettings, type CtaFormState } from "@/lib/actions/ctas";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { StatusDot, inputCls } from "./kit";
import { SettingsGroup, SettingsRow } from "./settings/settings-ui";

const STAGES = [
  { key: "tofu", label: "Top of funnel", hint: "Definitions, explainers, thought leadership, stats" },
  { key: "mofu", label: "Middle of funnel", hint: "Deep dives, how-tos, comparisons, assessments" },
  { key: "bofu", label: "Bottom of funnel", hint: "Tools, buyer's guides, vendor comparisons" },
] as const;

type StageKey = (typeof STAGES)[number]["key"];
type Values = Record<StageKey, { label: string; url: string; blurb: string }>;

function initialValues(ctas: CtaSettings): Values {
  const pick = (k: StageKey) => ({ label: ctas[k]?.label ?? "", url: ctas[k]?.url ?? "", blurb: ctas[k]?.blurb ?? "" });
  return { tofu: pick("tofu"), mofu: pick("mofu"), bofu: pick("bofu") };
}

/**
 * Settings › Calls to action (D50): the closing CTA each funnel stage links to.
 * The page keys this form on the saved timestamp, so a save or a reset
 * remounts it with the stored values.
 */
export function CtaForm({ ctas, saved, updatedAt }: { ctas: CtaSettings; saved: boolean; updatedAt?: string }) {
  const initial = initialValues(ctas);
  const [values, setValues] = useState<Values>(initial);
  const [state, setState] = useState<CtaFormState>({});
  const [pending, startSave] = useTransition();
  const [resetting, startReset] = useTransition();
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);

  const set = (k: StageKey, field: keyof Values[StageKey], v: string) =>
    setValues((cur) => ({ ...cur, [k]: { ...cur[k], [field]: v } }));

  const reset = () =>
    startReset(async () => {
      const res = await resetCtaSettings();
      if (res.error) toast.error(res.error);
      else if (res.message) toast.success(res.message);
    });

  // Submitted by hand (not <form action>) so React doesn't reset the
  // controlled fields when the server rejects a value.
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startSave(async () => {
      const res = await saveCtaSettings({}, form);
      setState(res);
      if (res.message) toast.success(res.message);
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-[26px]">
      <div className="flex flex-wrap items-center gap-2.5 rounded-xl bg-surface px-3.5 py-2.5 shadow-card">
        <StatusDot family={saved ? "done" : "idle"} className="size-[7px]" />
        <span className="min-w-0 flex-1 text-[13px] text-pretty">
          {saved ? (
            <>
              Saved in the app
              {updatedAt ? ` on ${new Date(updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}. These
              override <span className="font-mono text-xs">company.yaml</span>.
            </>
          ) : (
            <>
              From <span className="font-mono text-xs">company.yaml</span>. Saving here stores the set in the app, and it wins from then on.
            </>
          )}
        </span>
        {saved && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="ghost" size="sm" disabled={resetting}>
                {resetting ? "Resetting…" : "Reset to company.yaml"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset to company.yaml?</AlertDialogTitle>
                <AlertDialogDescription>
                  The calls to action saved in the app are removed. The next article run uses the ones in company.yaml.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={reset}>
                  Reset
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {STAGES.map((s) => {
        const v = values[s.key];
        const id = (f: string) => `cta-${s.key}-${f}`;
        return (
          <SettingsGroup key={s.key} title={s.label} aside={s.hint}>
            <SettingsRow label="Link text" htmlFor={id("label")}>
              <input
                id={id("label")}
                name={`${s.key}.label`}
                value={v.label}
                onChange={(e) => set(s.key, "label", e.target.value)}
                placeholder="e.g. Book a demo"
                className={cn(inputCls, "w-full")}
              />
            </SettingsRow>
            <SettingsRow label="Link URL" htmlFor={id("url")}>
              <input
                id={id("url")}
                name={`${s.key}.url`}
                type="url"
                required
                value={v.url}
                onChange={(e) => set(s.key, "url", e.target.value)}
                placeholder="https://"
                className={cn(inputCls, "w-full font-mono text-xs")}
              />
            </SettingsRow>
            <SettingsRow label="What the reader gets" htmlFor={id("blurb")} sub="Given to the Writer">
              <input
                id={id("blurb")}
                name={`${s.key}.blurb`}
                value={v.blurb}
                onChange={(e) => set(s.key, "blurb", e.target.value)}
                placeholder="Optional"
                className={cn(inputCls, "w-full")}
              />
            </SettingsRow>
            <div className="flex flex-wrap items-center justify-between gap-2 bg-fill-2 px-4 py-3">
              <span className="text-xs text-label-2">Every {s.label.toLowerCase()} page ends with</span>
              {v.url ? (
                <a
                  href={v.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-w-0 items-center gap-1 text-[13px] font-semibold text-primary hover:underline"
                >
                  <span className="truncate">{v.label || v.url}</span>
                  <ExternalLink aria-hidden className="size-3.5 shrink-0" />
                </a>
              ) : (
                <span className="text-[13px] text-label-3">No link yet</span>
              )}
            </div>
          </SettingsGroup>
        );
      })}

      {state.error && (
        <p role="alert" className="rounded-xl bg-problem-bg px-3.5 py-2.5 text-[13px] text-problem-fg">
          {state.error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        {dirty && (
          <Button type="button" variant="ghost" disabled={pending} onClick={() => setValues(initial)}>
            Discard
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
