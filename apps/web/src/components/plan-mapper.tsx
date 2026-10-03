"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Trash2 } from "lucide-react";
import { commitPlanAction, deletePlan, setValueMapping, updateMapping } from "@/lib/actions/plans";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { cn } from "@/lib/utils";
import { StatusPill } from "./kit";
import { Callout, SettingsGroup, SettingsRow } from "./plan-ui";

/**
 * Column mapping. Nothing about the shape of a plan is hardcoded: the fields
 * are auto-detected, and anything the detection got wrong is corrected here
 * rather than in code, so a differently-shaped workbook still imports.
 */

export interface MapperField {
  field: string;
  label: string;
  required: boolean;
  column: number | null;
  confidence: number;
}

export interface UnresolvedValue {
  field: "pageRole" | "funnel" | "priority" | "searchIntent" | "format";
  value: string;
  rows: number;
}

const CANONICAL: Record<Exclude<UnresolvedValue["field"], "format">, { value: string; label: string }[]> = {
  pageRole: [
    { value: "pillar", label: "Pillar page" },
    { value: "hub", label: "Subtopic hub" },
    { value: "cluster", label: "Cluster article" },
  ],
  funnel: [
    { value: "tofu", label: "Top (TOFU)" },
    { value: "mofu", label: "Middle (MOFU)" },
    { value: "bofu", label: "Bottom (BOFU)" },
  ],
  priority: [
    { value: "1", label: "P1" },
    { value: "2", label: "P2" },
    { value: "3", label: "P3" },
  ],
  searchIntent: [
    { value: "informational", label: "Informational" },
    { value: "commercial", label: "Commercial" },
    { value: "transactional", label: "Transactional" },
    { value: "navigational", label: "Navigational" },
  ],
};

const FIELD_LABEL: Record<UnresolvedValue["field"], string> = {
  pageRole: "Page role",
  funnel: "Funnel",
  priority: "Priority",
  searchIntent: "Search intent",
  format: "Article type",
};

const NONE = "__none";

export function PlanMapper({
  planId,
  sheets,
  activeSheet,
  headers,
  fields,
  unresolved,
  blocking,
  formatOptions,
}: {
  planId: string;
  sheets: { name: string; rows: number }[];
  activeSheet: string;
  headers: string[];
  fields: MapperField[];
  unresolved: UnresolvedValue[];
  blocking: string[];
  /** D45: the formats.json formats an unknown Article Type label can map to. */
  formatOptions: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enrich, setEnrich] = useState(true);

  const run = (fn: () => Promise<{ error?: string; message?: string }>, after?: () => void) => {
    startTransition(async () => {
      const res = await fn();
      if (res.error) toast.error(res.error);
      else {
        if (res.message) toast.success(res.message);
        after?.();
      }
    });
  };

  const guessed = fields.filter((f) => f.column !== null && f.confidence < 3).length;

  return (
    <div className="flex flex-col gap-7">
      {sheets.length > 0 && (
        <SettingsGroup title="Sheet" footer="The sheet that holds one row per planned article.">
          <div className="flex flex-wrap gap-1.5 p-3">
            {sheets.map((s) => {
              const on = s.name === activeSheet;
              return (
                <button
                  key={s.name}
                  type="button"
                  aria-pressed={on}
                  disabled={pending}
                  onClick={() => run(() => updateMapping(planId, { sheet: s.name }))}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] transition-colors disabled:opacity-50",
                    on
                      ? "bg-primary-soft font-semibold text-primary"
                      : "text-label-2 shadow-[inset_0_0_0_0.5px_var(--separator-strong)] hover:bg-fill-2 hover:text-label",
                  )}
                >
                  {s.name}
                  <span className="text-xs tabular-nums opacity-70">{s.rows}</span>
                </button>
              );
            })}
          </div>
        </SettingsGroup>
      )}

      <SettingsGroup
        title="Columns"
        footer={guessed > 0 ? `${guessed} column${guessed === 1 ? " was" : "s were"} guessed from their values. Check them before you import.` : undefined}
      >
        {fields.map((f) => {
          const isGuess = f.column !== null && f.confidence < 3;
          const id = `map-${f.field}`;
          return (
            <SettingsRow
              key={f.field}
              htmlFor={id}
              label={
                <>
                  {f.label}
                  {f.required && <span className="ml-1.5 text-xs font-normal text-label-3">Required</span>}
                </>
              }
              hint={isGuess ? <StatusPill family="needs" className="mt-0.5">Guessed, check this</StatusPill> : undefined}
            >
              <Select
                disabled={pending}
                value={f.column === null ? NONE : String(f.column)}
                onValueChange={(v) =>
                  run(() => updateMapping(planId, { columns: { [f.field]: v === NONE ? null : Number(v) } }))
                }
              >
                <SelectTrigger
                  id={id}
                  className={cn(
                    "w-[220px] max-w-full border-0 bg-fill-2 text-[13px]",
                    isGuess ? "shadow-[inset_0_0_0_1.5px_var(--needs)]" : "shadow-[inset_0_0_0_0.5px_var(--separator-strong)]",
                  )}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not mapped</SelectItem>
                  {headers.map((h, i) => (
                    <SelectItem key={`${h}-${i}`} value={String(i)}>
                      {h || `(column ${i + 1})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingsRow>
          );
        })}
      </SettingsGroup>

      {unresolved.length > 0 && (
        <SettingsGroup
          title="Values we could not place"
          footer="These appear in the sheet but match nothing known. A page role must be assigned; the rest fall back to a sensible default (an unmapped article type uses the generic format guide)."
        >
          {unresolved.map((u) => (
            <SettingsRow
              key={`${u.field}-${u.value}`}
              label={<code className="rounded-md bg-fill-2 px-1.5 py-0.5 font-mono text-xs">{u.value}</code>}
              hint={`${FIELD_LABEL[u.field]} · ${u.rows} row${u.rows === 1 ? "" : "s"}`}
            >
              <Select
                disabled={pending}
                onValueChange={(v) => v && run(() => setValueMapping(planId, u.field, u.value, v))}
              >
                <SelectTrigger
                  aria-label={`What "${u.value}" means`}
                  className="w-[220px] max-w-full border-0 bg-fill-2 text-[13px] shadow-[inset_0_0_0_0.5px_var(--separator-strong)]"
                >
                  <SelectValue placeholder="Means…" />
                </SelectTrigger>
                <SelectContent>
                  {(u.field === "format" ? formatOptions : CANONICAL[u.field]).map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingsRow>
          ))}
        </SettingsGroup>
      )}

      <SettingsGroup
        title="Import"
        footer="Creating the plan writes no articles and spends nothing. Production only starts when you set a cadence or send articles by hand."
      >
        <SettingsRow
          htmlFor="map-enrich"
          label="Sharpen briefs with a cheap model pass"
          hint="Runs after import; every brief is usable without it."
        >
          <Switch id="map-enrich" checked={enrich} onCheckedChange={setEnrich} disabled={pending} />
        </SettingsRow>
        <div className="flex flex-col gap-3 px-4 py-3.5">
          {blocking.length > 0 && (
            <Callout icon={AlertTriangle} title="Fix the problems in the report first">
              Importing now would create articles you would have to unpick later.
            </Callout>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={pending || blocking.length > 0} onClick={() => run(() => commitPlanAction(planId, { enrich }))}>
              {pending ? "Working…" : "Create the plan"}
            </Button>
            <span className="flex-1" />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" disabled={pending}>
                  <Trash2 data-icon="inline-start" />
                  Discard
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Discard this draft?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The uploaded sheet and its mapping are deleted. No articles were created from it.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep draft</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => run(() => deletePlan(planId), () => router.push("/plans"))}
                  >
                    Discard draft
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </SettingsGroup>
    </div>
  );
}
