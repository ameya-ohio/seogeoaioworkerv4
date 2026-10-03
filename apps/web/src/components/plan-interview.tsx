"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setPlanInterview } from "@/lib/actions/interview";
import { Switch } from "@/components/ui/switch";
import { SettingsRow } from "./plan-ui";

/**
 * D59: whether this plan's articles stop for the expert interview after
 * research. Unattended cadences usually skip it; applies to articles queued
 * from now on. Renders one settings row (place it inside a SettingsGroup).
 */
export function PlanInterviewToggle({ planId, mode }: { planId: string; mode: "pause" | "skip" }) {
  const [current, setCurrent] = useState(mode);
  const [pending, startTransition] = useTransition();
  const choose = (next: "pause" | "skip") =>
    startTransition(async () => {
      const res = await setPlanInterview(planId, next);
      if (res.error) toast.error(res.error);
      else {
        setCurrent(next);
        toast.success(next === "pause" ? "Articles will stop for the expert interview." : "Articles will skip the expert interview.");
      }
    });
  return (
    <SettingsRow
      htmlFor="plan-interview"
      label="Stop for the expert interview"
      hint={
        current === "pause"
          ? "Each article waits for your answers after research. Applies to articles queued from now on."
          : "Articles go straight from research to the outline. Applies to articles queued from now on."
      }
    >
      <Switch
        id="plan-interview"
        checked={current === "pause"}
        disabled={pending}
        onCheckedChange={(on) => choose(on ? "pause" : "skip")}
      />
    </SettingsRow>
  );
}
