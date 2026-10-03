"use client";

import { useId, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { inputCls } from "../kit";
import { FILTER_LABEL, SORT_KEYS, SORT_LABEL, nextSort, type FilterKey, type FilterOption, type SortKey, type ViewState } from "./items-model";

// ── filter field: one pill per column ────────────────────────────────────

export function FilterField({
  k,
  options,
  selected,
  selectedLabels,
  onToggle,
  onClear,
}: {
  k: FilterKey;
  options: FilterOption[];
  selected: string[];
  selectedLabels: string[];
  onToggle: (v: string) => void;
  onClear: () => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const uid = useId();
  const active = selected.length > 0;
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQ("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={active ? `${FILTER_LABEL[k]}: ${selectedLabels.join(", ")}` : `Filter by ${FILTER_LABEL[k]}`}
          className={cn(
            "inline-flex h-7 max-w-[280px] items-center gap-1.5 rounded-full pr-2 pl-3 text-xs whitespace-nowrap transition-colors",
            active
              ? "bg-primary-soft text-primary"
              : open
                ? "bg-fill text-label"
                : "text-label-2 shadow-[inset_0_0_0_0.5px_var(--separator-strong)] hover:bg-fill-2 hover:text-label",
          )}
        >
          <span className={cn(active && "font-semibold")}>{FILTER_LABEL[k]}</span>
          {active && <span className="min-w-0 truncate">{selectedLabels.join(", ")}</span>}
          <ChevronDown aria-hidden className="size-3 shrink-0 stroke-[2.2]" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-1.5 rounded-xl p-2">
        <div className="flex items-baseline justify-between gap-2 px-2 pt-0.5 pb-1">
          <span className="text-[13px] font-semibold">{FILTER_LABEL[k]}</span>
          {active ? (
            <button type="button" onClick={onClear} className="text-xs font-medium text-primary hover:underline">
              Clear
            </button>
          ) : (
            <span className="text-[11px] text-label-2">Counts use your other filters</span>
          )}
        </div>
        {options.length > 8 && (
          <input
            className={cn(inputCls, "h-7 w-full text-xs")}
            placeholder="Find…"
            aria-label={`Find a ${FILTER_LABEL[k].toLowerCase()}`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        )}
        <ul className="max-h-72 overflow-y-auto">
          {shown.map((o, i) => {
            const on = selected.includes(o.value);
            const id = `${uid}-${i}`;
            return (
              <li key={o.value}>
                <label
                  htmlFor={id}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors hover:bg-fill-2",
                    o.count === 0 && !on ? "text-label-3" : "text-label",
                  )}
                >
                  <Checkbox id={id} checked={on} onCheckedChange={() => onToggle(o.value)} />
                  <span className="min-w-0 flex-1 truncate" title={o.label}>
                    {o.label}
                  </span>
                  <span className={cn("text-xs tabular-nums", o.count === 0 && !on ? "text-label-3" : "text-label-2")}>{o.count}</span>
                </label>
              </li>
            );
          })}
          {shown.length === 0 && <li className="px-2 py-1.5 text-xs text-label-2">No values.</li>}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

// ── sort menu ─────────────────────────────────────────────────────────────

export function sortSummary(sort: ViewState["sort"]): string {
  if (sort.length === 0) return SORT_LABEL.sequence;
  return sort.map((s) => SORT_LABEL[s.key]).join(", then ");
}

export function SortMenu({ sort, onChange }: { sort: ViewState["sort"]; onChange: (sort: ViewState["sort"]) => void }) {
  const unused = SORT_KEYS.filter((k) => !sort.some((s) => s.key === k));
  const primaryDir = sort[0]?.dir ?? 1;
  const Dir = primaryDir === 1 ? ArrowUp : ArrowDown;

  const keep = (e: Event) => e.preventDefault();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="max-w-[320px] text-label-2" aria-label={`Sort: ${sortSummary(sort)}`}>
          {sort.length ? <Dir data-icon="inline-start" className="text-primary" /> : <ArrowUpDown data-icon="inline-start" />}
          <span className="truncate">{sortSummary(sort)}</span>
          <ChevronDown data-icon="inline-end" className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs font-semibold text-label-2">Sort by</DropdownMenuLabel>
        {SORT_KEYS.map((k) => {
          const i = sort.findIndex((s) => s.key === k);
          const s = i === -1 ? null : sort[i];
          return (
            <DropdownMenuItem key={k} onSelect={(e) => {
                keep(e);
                onChange(nextSort(sort, k, false));
              }} className="text-[13px]">
              <span className="flex size-4 items-center justify-center">
                {s && (
                  <span className="inline-flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground tabular-nums">
                    {i + 1}
                  </span>
                )}
              </span>
              <span className={cn("flex-1", s && "font-semibold")}>{SORT_LABEL[k]}</span>
              {s && (s.dir === 1 ? <ArrowUp className="size-3.5 text-primary" aria-label="ascending" /> : <ArrowDown className="size-3.5 text-primary" aria-label="descending" />)}
            </DropdownMenuItem>
          );
        })}
        {sort.length > 0 && unused.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="text-[13px]">
                <span className="size-4" />
                Then by
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-48">
                {unused.map((k) => (
                  <DropdownMenuItem key={k} className="text-[13px]" onSelect={() => onChange(nextSort(sort, k as SortKey, true))}>
                    {SORT_LABEL[k]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}
        <DropdownMenuSeparator />
        <p className="px-2 py-1 text-[11px] leading-[15px] text-label-2">
          Click a sort key again to reverse it, and a third time to remove it.
        </p>
        {sort.length > 0 && (
          <DropdownMenuItem className="text-[13px]" onSelect={() => onChange([])}>
            <RotateCcw className="size-3.5" />
            Back to build order
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
