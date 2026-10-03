"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pause, Play, PauseCircle, Zap } from "lucide-react";
import { runScheduleNow, saveSchedule, startSchedule, stopSchedule } from "@/lib/actions/plans";
import type { UiPreviewEntry, UiSchedule } from "@/lib/ui-types";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Caption, EmptyState, Status, inputCls } from "./kit";
import { Callout, DAY_NAMES, SettingsGroup, SettingsRow, describeDays, scheduleStatus } from "./plan-ui";

const TIMEZONES = [
  "Europe/Zurich",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC",
];

/** Monday-first, the way people read a week. */
const WEEK = [1, 2, 3, 4, 5, 6, 0];

const numberCls = cn(inputCls, "w-24 text-right tabular-nums");

function Token({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md bg-primary-soft px-1.5 py-px font-semibold text-primary">{children}</span>;
}

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

  const [days, setDays] = useState<number[]>(schedule?.daysOfWeek ?? [1, 2, 3, 4, 5]);
  const [time, setTime] = useState(schedule?.timeOfDay ?? "07:00");
  const [tz, setTz] = useState(schedule?.timezone ?? "Europe/Zurich");
  const [batch, setBatch] = useState(schedule?.batchSize ?? 1);
  const [maxInFlight, setMaxInFlight] = useState(schedule?.limits.maxInFlight ?? 3);
  const [maxReview, setMaxReview] = useState(schedule?.limits.maxAwaitingReview ?? 10);
  const [maxTotal, setMaxTotal] = useState<string>(schedule?.limits.maxTotalArticles ? String(schedule.limits.maxTotalArticles) : "");
  const [maxCost, setMaxCost] = useState<string>(schedule?.limits.maxCostUsd ? String(schedule.limits.maxCostUsd) : "");
  const [requireApproval, setRequireApproval] = useState(schedule?.requireApproval ?? false);

  const run = (fn: () => Promise<{ error?: string; message?: string }>) => {
    startTransition(async () => {
      const res = await fn();
      if (res.error) toast.error(res.error);
      else if (res.message) toast.success(res.message);
    });
  };

  const perWeek = batch * days.length;
  const weeksToFinish = perWeek > 0 ? Math.ceil(remaining / perWeek) : 0;
  const zones = TIMEZONES.includes(tz) ? TIMEZONES : [tz, ...TIMEZONES];

  const dirty =
    !schedule ||
    [...days].sort().join() !== [...schedule.daysOfWeek].sort().join() ||
    time !== schedule.timeOfDay ||
    tz !== schedule.timezone ||
    batch !== schedule.batchSize ||
    maxInFlight !== schedule.limits.maxInFlight ||
    maxReview !== schedule.limits.maxAwaitingReview ||
    maxTotal !== (schedule.limits.maxTotalArticles ? String(schedule.limits.maxTotalArticles) : "") ||
    maxCost !== (schedule.limits.maxCostUsd ? String(schedule.limits.maxCostUsd) : "") ||
    requireApproval !== schedule.requireApproval;

  const save = () =>
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
    );

  const state = schedule ? scheduleStatus(schedule.status) : { family: "idle" as const, label: "Not set up" };
  const active = schedule?.status === "active";

  return (
    <div className="flex flex-col gap-8">
      {/* Summary: the cadence as a sentence, and the one state button. */}
      <section className="flex flex-col gap-4 rounded-[14px] bg-surface p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Status family={state.family} pulse={false} colored>
              {state.label}
            </Status>
            {active && schedule?.nextFireAt && (
              <span className="text-xs text-label-2 tabular-nums">
                Next run{" "}
                {new Date(schedule.nextFireAt).toLocaleString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </span>
          <span className="flex flex-wrap items-center gap-2">
            {active && (
              <Button variant="secondary" disabled={pending} onClick={() => run(() => runScheduleNow(planId))}>
                <Zap data-icon="inline-start" />
                Run one now
              </Button>
            )}
            {schedule && !active && (
              <Button variant={dirty ? "secondary" : "default"} disabled={pending} onClick={() => run(() => startSchedule(planId))}>
                <Play data-icon="inline-start" />
                Start
              </Button>
            )}
            {active && (
              <Button variant={dirty ? "secondary" : "default"} disabled={pending} onClick={() => run(() => stopSchedule(planId))}>
                <Pause data-icon="inline-start" />
                Pause
              </Button>
            )}
          </span>
        </div>

        <p className="text-[19px] leading-[30px] tracking-[-0.01em] text-pretty">
          Build <Token>{batch}</Token> article{batch === 1 ? "" : "s"}{" "}
          {days.length === 0 ? (
            <Token>on no days yet</Token>
          ) : describeDays(days) === "every day" ? (
            <Token>every day</Token>
          ) : (
            <>
              every <Token>{describeDays(days)}</Token>
            </>
          )}{" "}
          at <Token>{time}</Token> <span className="text-label-2">{tz}</span>, and pause when <Token>{maxReview}</Token> are waiting
          for review.
        </p>
        <p className="text-[13px] text-label-2">
          About <span className="font-semibold text-label tabular-nums">{perWeek}</span> article{perWeek === 1 ? "" : "s"} a week.
          {remaining > 0 && perWeek > 0 && (
            <>
              {" "}
              {remaining} left in scope, so roughly <span className="font-semibold text-label tabular-nums">{weeksToFinish}</span> week
              {weeksToFinish === 1 ? "" : "s"} to finish.
            </>
          )}
          {dirty && schedule && <span className="text-needs-fg"> Unsaved changes.</span>}
        </p>
        {schedule?.pause && (
          <Callout icon={PauseCircle} title="Paused">
            {schedule.pause.detail}
          </Callout>
        )}
      </section>

      <SettingsGroup title="Schedule">
        <SettingsRow label="Days" hint="When the cadence fires.">
          <ToggleGroup
            type="multiple"
            spacing={0}
            aria-label="Days of the week"
            value={days.map(String)}
            onValueChange={(v) => setDays(v.map(Number).sort((a, b) => a - b))}
            disabled={pending}
            className="rounded-[9px] bg-fill p-0.5"
          >
            {WEEK.map((d) => (
              <ToggleGroupItem
                key={d}
                value={String(d)}
                size="sm"
                aria-label={DAY_NAMES[d]}
                className="h-7 min-w-10 rounded-[7px]! px-2 text-xs font-medium text-label-2 hover:bg-transparent hover:text-label aria-pressed:bg-raised data-[state=on]:bg-raised data-[state=on]:font-semibold data-[state=on]:text-label data-[state=on]:shadow-[0_1px_3px_rgb(0_0_0/0.12),0_0_0_0.5px_rgb(0_0_0/0.04)]"
              >
                {DAY_NAMES[d]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </SettingsRow>
        <SettingsRow label="Time" htmlFor="cad-time">
          <input id="cad-time" type="time" className={cn(inputCls, "w-32 tabular-nums")} value={time} onChange={(e) => setTime(e.target.value)} disabled={pending} />
        </SettingsRow>
        <SettingsRow label="Timezone" htmlFor="cad-tz">
          <Select value={tz} onValueChange={setTz} disabled={pending}>
            <SelectTrigger id="cad-tz" className="w-[220px] border-0 bg-fill-2 text-[13px] shadow-[inset_0_0_0_0.5px_var(--separator-strong)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {zones.map((z) => (
                <SelectItem key={z} value={z}>
                  {z}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
        <SettingsRow label="Articles per day" htmlFor="cad-batch">
          <input
            id="cad-batch"
            type="number"
            min={1}
            max={20}
            className={numberCls}
            value={batch}
            onChange={(e) => setBatch(Math.max(1, Number(e.target.value)))}
            disabled={pending}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Brakes">
        <SettingsRow label="Max in flight" hint="Articles being written at once." htmlFor="cad-inflight">
          <input
            id="cad-inflight"
            type="number"
            min={1}
            className={numberCls}
            value={maxInFlight}
            onChange={(e) => setMaxInFlight(Math.max(1, Number(e.target.value)))}
            disabled={pending}
          />
        </SettingsRow>
        <SettingsRow
          label="Max awaiting review"
          hint="Generation pauses when your review queue is this deep. A skipped slot is not owed."
          htmlFor="cad-review"
        >
          <input
            id="cad-review"
            type="number"
            min={1}
            className={numberCls}
            value={maxReview}
            onChange={(e) => setMaxReview(Math.max(1, Number(e.target.value)))}
            disabled={pending}
          />
        </SettingsRow>
        <SettingsRow label="Stop after this many articles" hint="Optional." htmlFor="cad-total">
          <input
            id="cad-total"
            type="number"
            min={1}
            className={numberCls}
            value={maxTotal}
            placeholder="No limit"
            onChange={(e) => setMaxTotal(e.target.value)}
            disabled={pending}
          />
        </SettingsRow>
        <SettingsRow label="Stop after this much spend" hint="Optional, in US dollars." htmlFor="cad-cost">
          <span className="relative inline-flex items-center">
            <span aria-hidden className="pointer-events-none absolute left-2.5 text-[13px] text-label-3">
              $
            </span>
            <input
              id="cad-cost"
              type="number"
              min={1}
              className={cn(numberCls, "pl-6")}
              value={maxCost}
              placeholder="No limit"
              onChange={(e) => setMaxCost(e.target.value)}
              disabled={pending}
            />
          </span>
        </SettingsRow>
        <SettingsRow
          label="Wait for my approval before a hub or pillar page"
          hint="Off by default; otherwise every hub waits until you've approved all its articles. Releases need approval either way."
          htmlFor="cad-approval"
        >
          <Switch id="cad-approval" checked={requireApproval} onCheckedChange={setRequireApproval} disabled={pending} />
        </SettingsRow>
      </SettingsGroup>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant={dirty || !schedule ? "default" : "secondary"} disabled={pending || days.length === 0} onClick={save}>
          Save cadence
        </Button>
        {days.length === 0 && <span className="text-xs text-needs-fg">Pick at least one day.</span>}
      </div>

      <section className="flex flex-col gap-1.5">
        <Caption className="px-4">Next up</Caption>
        <div className="overflow-hidden rounded-xl bg-surface shadow-card">
          {preview.length === 0 ? (
            <EmptyState title="No preview yet" hint="Save a cadence to see when each article would be produced." />
          ) : (
            <ul>
              {preview.map((e) => (
                <li key={e.fireAt} className="flex gap-4 border-b-[0.5px] border-separator px-4 py-2.5 last:border-0">
                  <time className="w-40 shrink-0 text-xs leading-5 text-label-2 tabular-nums">
                    {new Date(e.fireAt).toLocaleString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-[13px]">
                    {e.items.length === 0 ? (
                      <span className="text-label-2">{e.note ?? "Nothing ready"}</span>
                    ) : (
                      e.items.map((i) => (
                        <span key={i.slug} className="truncate">
                          <span className="mr-1.5 text-label-3 tabular-nums">#{i.sequence}</span>
                          {i.title}
                        </span>
                      ))
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {preview.length > 0 && <p className="px-4 pt-0.5 text-xs leading-4 text-label-2 text-pretty">{caveat}</p>}
      </section>
    </div>
  );
}
