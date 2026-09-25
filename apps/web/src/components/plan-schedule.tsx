"use client";

import { useState, useTransition } from "react";
import {
  runScheduleNow,
  saveSchedule,
  startSchedule,
  stopSchedule,
} from "@/lib/actions/plans";
import type { UiPreviewEntry, UiSchedule } from "@/lib/ui-types";
import { buttonCls, Card, cls, inputCls } from "./ui";
import { DAY_NAMES, ScheduleStatusBadge } from "./plan-ui";

const TIMEZONES = [
  "Europe/Zurich", "Europe/London", "Europe/Paris", "Europe/Berlin",
  "America/New_York", "America/Chicago", "America/Los_Angeles",
  "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney", "UTC",
];

export function PlanSchedule({
  planId,
  schedule,
  preview,
  caveat,
  remaining,
}: {
  planId: string;
  schedule: UiSchedule | null;
  preview: UiPreviewEntry[];
  caveat: string;
  remaining: number;
}) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [days, setDays] = useState<number[]>(schedule?.daysOfWeek ?? [1, 2, 3, 4, 5]);
  const [time, setTime] = useState(schedule?.timeOfDay ?? "07:00");
  const [tz, setTz] = useState(schedule?.timezone ?? "Europe/Zurich");
  const [batch, setBatch] = useState(schedule?.batchSize ?? 1);
  const [maxInFlight, setMaxInFlight] = useState(schedule?.limits.maxInFlight ?? 3);
  const [maxReview, setMaxReview] = useState(schedule?.limits.maxAwaitingReview ?? 10);
  const [maxTotal, setMaxTotal] = useState<string>(
    schedule?.limits.maxTotalArticles ? String(schedule.limits.maxTotalArticles) : "",
  );
  const [maxCost, setMaxCost] = useState<string>(
    schedule?.limits.maxCostUsd ? String(schedule.limits.maxCostUsd) : "",
  );
  const [requireApproval, setRequireApproval] = useState(schedule?.requireApproval ?? false);

  const run = (fn: () => Promise<{ error?: string; message?: string }>) => {
    setNotice(null);
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      else if (res.message) setNotice(res.message);
    });
  };

  const perWeek = batch * days.length;
  const weeksToFinish = perWeek > 0 ? Math.ceil(remaining / perWeek) : 0;

  return (
    <div className="space-y-4">
      <Card
        title="Cadence"
        actions={schedule ? <ScheduleStatusBadge status={schedule.status} /> : undefined}
      >
        <div className="space-y-4">
          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Days</span>
            <div className="flex flex-wrap gap-1.5">
              {DAY_NAMES.map((name, i) => (
                <button
                  key={name}
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    setDays((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i].sort()))
                  }
                  className={cls(
                    "rounded-md border px-2.5 py-1 text-sm",
                    days.includes(i)
                      ? "border-accent bg-accent-soft font-medium text-accent"
                      : "border-slate-200 bg-white text-slate-600",
                  )}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Time</span>
              <input
                type="time"
                className={inputCls}
                value={time}
                onChange={(e) => setTime(e.target.value)}
                disabled={pending}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Timezone</span>
              <select className={inputCls} value={tz} onChange={(e) => setTz(e.target.value)} disabled={pending}>
                {TIMEZONES.map((z) => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Articles per day</span>
              <input
                type="number"
                min={1}
                max={20}
                className={inputCls}
                value={batch}
                onChange={(e) => setBatch(Math.max(1, Number(e.target.value)))}
                disabled={pending}
              />
            </label>
          </div>

          <p className="rounded bg-slate-50 px-3 py-2 text-sm text-slate-700">
            About <span className="font-medium tabular-nums">{perWeek}</span> articles a week.{" "}
            {remaining > 0 && perWeek > 0 && (
              <>
                {remaining} left in scope, so roughly{" "}
                <span className="font-medium tabular-nums">{weeksToFinish}</span> week
                {weeksToFinish === 1 ? "" : "s"} to finish.
              </>
            )}
          </p>
        </div>
      </Card>

      <Card title="Brakes">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Max in flight</span>
            <input
              type="number" min={1} className={inputCls} value={maxInFlight}
              onChange={(e) => setMaxInFlight(Math.max(1, Number(e.target.value)))} disabled={pending}
            />
            <span className="mt-1 block text-xs text-slate-500">
              Articles being written at once.
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Max awaiting review</span>
            <input
              type="number" min={1} className={inputCls} value={maxReview}
              onChange={(e) => setMaxReview(Math.max(1, Number(e.target.value)))} disabled={pending}
            />
            <span className="mt-1 block text-xs text-slate-500">
              Generation pauses when your review queue is this deep. A skipped slot is not owed.
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Stop after N articles <span className="font-normal text-slate-400">(optional)</span>
            </span>
            <input
              type="number" min={1} className={inputCls} value={maxTotal} placeholder="no limit"
              onChange={(e) => setMaxTotal(e.target.value)} disabled={pending}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Stop after $N spent <span className="font-normal text-slate-400">(optional)</span>
            </span>
            <input
              type="number" min={1} className={inputCls} value={maxCost} placeholder="no limit"
              onChange={(e) => setMaxCost(e.target.value)} disabled={pending}
            />
          </label>
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox" className="mt-0.5" checked={requireApproval}
            onChange={(e) => setRequireApproval(e.target.checked)} disabled={pending}
          />
          <span>
            Wait for my approval of a parent page before producing its children.
            <span className="block text-xs text-slate-500">
              Off by default — otherwise the whole plan waits behind your approval of the pillar pages.
            </span>
          </span>
        </label>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={buttonCls("primary")}
            disabled={pending || days.length === 0}
            onClick={() =>
              run(() =>
                saveSchedule(planId, {
                  timezone: tz,
                  daysOfWeek: days,
                  timeOfDay: time,
                  batchSize: batch,
                  maxInFlight,
                  maxAwaitingReview: maxReview,
                  maxTotalArticles: maxTotal ? Number(maxTotal) : null,
                  maxCostUsd: maxCost ? Number(maxCost) : null,
                  requireApproval,
                }),
              )
            }
          >
            Save cadence
          </button>
          {schedule && schedule.status !== "active" && (
            <button type="button" className={buttonCls("secondary")} disabled={pending}
              onClick={() => run(() => startSchedule(planId))}>
              Start
            </button>
          )}
          {schedule?.status === "active" && (
            <>
              <button type="button" className={buttonCls("secondary")} disabled={pending}
                onClick={() => run(() => stopSchedule(planId))}>
                Pause
              </button>
              <button type="button" className={buttonCls("ghost")} disabled={pending}
                onClick={() => run(() => runScheduleNow(planId))}>
                Run one now
              </button>
            </>
          )}
        </div>
        {notice && <p className="mt-2 text-sm text-emerald-700">{notice}</p>}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {schedule?.pause && (
          <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Paused — {schedule.pause.detail}
          </p>
        )}
      </Card>

      <Card title="Next up">
        {preview.length === 0 ? (
          <p className="text-sm text-slate-500">
            Save a cadence to see when each article would be produced.
          </p>
        ) : (
          <>
            <ul className="space-y-1 text-sm">
              {preview.map((e) => (
                <li key={e.fireAt} className="flex gap-3">
                  <span className="w-36 shrink-0 tabular-nums text-slate-500">
                    {new Date(e.fireAt).toLocaleString(undefined, {
                      weekday: "short", month: "short", day: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </span>
                  <span className="min-w-0 flex-1">
                    {e.items.length === 0 ? (
                      <span className="text-slate-400">{e.note ?? "—"}</span>
                    ) : (
                      e.items.map((i) => (
                        <span key={i.slug} className="mr-2 block truncate text-slate-800">
                          <span className="tabular-nums text-slate-400">#{i.sequence}</span> {i.title}
                        </span>
                      ))
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-slate-500">{caveat}</p>
          </>
        )}
      </Card>
    </div>
  );
}
