"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ListChecks, Send } from "lucide-react";
import { sendKeywordsToPipeline } from "@/lib/actions/keywords";
import type { UiKeyword } from "@/lib/ui-types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { Card, EmptyState, KeywordStatusBadge, cls, tableCls } from "./kit";
import { toastSendResult } from "./keywords-table";

/** Select tab (3.5): stage keywords → batch "send to pipeline". */
export function SelectTable({ rows }: { rows: UiKeyword[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someSelected = !allSelected && rows.some((r) => selected.has(r.id));

  const send = () =>
    startTransition(async () => {
      try {
        const res = await sendKeywordsToPipeline([...selected]);
        setSelected(new Set());
        toastSendResult(res, () => router.push("/production"));
      } catch {
        toast.error("Couldn't send to the pipeline. Try again.");
      }
    });

  if (rows.length === 0) {
    return (
      <div className="mx-auto max-w-4xl rounded-xl bg-surface shadow-card">
        <EmptyState
          icon={ListChecks}
          title="Nothing staged"
          hint="Keywords with status idea or queued appear here. Add them on the Keywords screen or upload a CSV."
          action={
            <Button variant="secondary" asChild>
              <Link href="/keywords">Open Keywords</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-label-2">One article and one queued pipeline run per keyword.</p>
        <Button onClick={send} disabled={pending || selected.size === 0}>
          <Send data-icon="inline-start" />
          {pending ? "Queuing…" : selected.size ? `Send ${selected.size} to pipeline` : "Send to pipeline"}
        </Button>
      </div>
      <Card flush>
        <div className="overflow-x-auto">
          <table className={tableCls.table}>
            <thead>
              <tr>
                <th scope="col" className={cls(tableCls.th, "w-10")}>
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                    aria-label="Select all"
                  />
                </th>
                <th scope="col" className={tableCls.th}>Keyword</th>
                <th scope="col" className={tableCls.th}>Source</th>
                <th scope="col" className={cls(tableCls.th, "text-right")}>Volume</th>
                <th scope="col" className={cls(tableCls.th, "text-right")}>Priority</th>
                <th scope="col" className={tableCls.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const on = selected.has(row.id);
                return (
                  <tr key={row.id} aria-selected={on} className={cn(tableCls.tr, on && "bg-primary-soft hover:bg-primary-soft")}>
                    <td className={tableCls.td}>
                      <Checkbox
                        checked={on}
                        onCheckedChange={() =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(row.id)) next.delete(row.id);
                            else next.add(row.id);
                            return next;
                          })
                        }
                        aria-label={`Select ${row.text}`}
                      />
                    </td>
                    <td className={cls(tableCls.td, "font-semibold")}>{row.text}</td>
                    <td className={cls(tableCls.td, "text-label-2 capitalize")}>{row.source}</td>
                    <td className={cls(tableCls.td, "text-right text-label-2 tabular-nums")}>
                      {row.volume !== null ? row.volume.toLocaleString() : "—"}
                    </td>
                    <td className={cls(tableCls.td, "text-right text-label-2 tabular-nums")}>{row.priority ?? "—"}</td>
                    <td className={tableCls.td}>
                      <KeywordStatusBadge status={row.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
