"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Subscribes to an SSE stream (default /api/events). Each event triggers a
 * throttled router.refresh(), so server-rendered views stay live without
 * client-side data fetching. Renders a small "Live" pill.
 */
export function LiveRefresh({ src = "/api/events", label = true }: { src?: string; label?: boolean }) {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const source = new EventSource(src);
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = () => {
      if (throttleRef.current) return;
      throttleRef.current = setTimeout(() => {
        throttleRef.current = null;
        router.refresh();
      }, 750);
    };
    return () => {
      source.close();
      if (throttleRef.current) clearTimeout(throttleRef.current);
    };
  }, [router, src]);

  return (
    <span
      title={connected ? "Updates stream in as the worker reports" : "Connecting to the event stream…"}
      className="inline-flex h-7 items-center gap-2 rounded-full bg-fill-2 px-3 text-xs font-medium text-label-2"
    >
      <span aria-hidden className={cn("inline-block size-[7px] rounded-full", connected ? "bg-done" : "bg-idle")} />
      {label && (connected ? "Live" : "Connecting…")}
    </span>
  );
}
