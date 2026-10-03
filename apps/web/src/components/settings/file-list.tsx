"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Caption, inputCls } from "@/components/kit";

export interface FileListItem {
  path: string;
  /** Display name; the path is used when absent. */
  title?: string;
  sub?: string;
  /** Phase number shown before the title (agents). */
  phase?: string;
  /** Monospace title; defaults to true when the item has no display title. */
  mono?: boolean;
  /** Saved from the web app (Mongo) rather than the shipped repo file. */
  edited?: boolean;
}

export interface FileListGroup {
  title?: string;
  items: FileListItem[];
}

/** The editable files of one settings area, filterable, grouped where natural. */
export function FileList({
  area,
  groups,
  active,
  children,
}: {
  area: string;
  groups: FileListGroup[];
  active: string | null;
  /** Extra content under the list (Context: the new case study form). */
  children?: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const activeRef = useRef<HTMLLIElement>(null);
  // The list scrolls on its own; keep the open file in view.
  useEffect(() => {
    const el = activeRef.current;
    const box = el?.closest<HTMLElement>("[data-file-scroll]");
    if (el && box) box.scrollTop = Math.max(0, el.offsetTop - box.clientHeight / 2);
  }, [active]);
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter((it) => `${it.title ?? ""} ${it.path} ${it.sub ?? ""}`.toLowerCase().includes(q)),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, query]);

  return (
    <div className="flex flex-col gap-2 xl:w-[250px] xl:shrink-0">
      <label className="relative block">
        <span className="sr-only">Filter files</span>
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-label-3" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter files"
          className={cn(inputCls, "w-full pl-8")}
        />
      </label>
      <div data-file-scroll className="relative max-h-[40vh] overflow-y-auto rounded-xl bg-surface p-1 shadow-card xl:max-h-[72vh]">
        {total === 0 ? (
          <p className="px-2.5 py-3 text-[13px] text-label-2">No editable files.</p>
        ) : shown.length === 0 ? (
          <p className="px-2.5 py-3 text-[13px] text-label-2">No files match.</p>
        ) : (
          shown.map((g, gi) => (
            <div key={g.title ?? gi}>
              {g.title && <Caption className="px-2.5 pt-2.5 pb-1">{g.title}</Caption>}
              <ul className="flex flex-col gap-px">
                {g.items.map((it) => {
                  const on = it.path === active;
                  const title = it.title ?? it.path;
                  const mono = it.mono ?? !it.title;
                  return (
                    <li key={it.path} ref={on ? activeRef : undefined}>
                      <Link
                        href={`/admin?tab=${area}&file=${encodeURIComponent(it.path)}`}
                        aria-current={on ? "page" : undefined}
                        title={it.path}
                        className={cn(
                          "flex flex-col gap-0.5 rounded-lg px-2.5 py-[7px] transition-colors",
                          on ? "bg-primary-soft" : "hover:bg-fill-2",
                        )}
                      >
                        <span className="flex items-center justify-between gap-1.5">
                          <span className="flex min-w-0 items-baseline gap-2">
                            {it.phase && <span className="w-6 shrink-0 text-xs text-label-2 tabular-nums">{it.phase}</span>}
                            <span
                              className={cn(
                                "truncate",
                                mono ? "font-mono text-xs" : "text-[13px] font-medium",
                                on ? "text-primary" : "text-label",
                              )}
                            >
                              {title}
                            </span>
                          </span>
                          {it.edited && (
                            <span className="shrink-0 rounded-full bg-fill px-1.5 py-px text-[10px] font-semibold text-label-2">
                              Edited in app
                            </span>
                          )}
                        </span>
                        {it.sub && (
                          <span className={cn("truncate text-[11px] leading-[14px] text-label-2", it.phase && "pl-8")}>{it.sub}</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>
      {children}
    </div>
  );
}
