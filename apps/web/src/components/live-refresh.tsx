"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Subscribes to /api/events (SSE). Each pipeline event triggers a throttled
 * router.refresh(), so the server-rendered Work board stays live without
 * client-side data fetching.
 */
export function LiveRefresh({ src = "/api/events" }: { src?: string }) {
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
    <p className="flex items-center gap-1.5 text-xs text-slate-400">
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-500" : "bg-slate-300"}`}
      />
      {connected ? "live — updates stream in as the worker reports" : "connecting to event stream…"}
    </p>
  );
}
