import { ObjectId } from "mongodb";
import { isAuthed } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { toUiClusterEvent } from "@/lib/ui-types";

export const dynamic = "force-dynamic";

/**
 * SSE stream of cluster-run events (4D) — the cluster_events sibling of
 * /api/events: tail by _id, push each new event, keepalive comments between.
 */
export async function GET(request: Request): Promise<Response> {
  if (!(await isAuthed())) return new Response("unauthorized", { status: 401 });
  const db = await getDb();

  let lastId: ObjectId | null = null;
  const latest = await db.clusterEvents.find().sort({ _id: -1 }).limit(1).toArray();
  if (latest[0]?._id) lastId = latest[0]._id;

  const encoder = new TextEncoder();
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const poll = async () => {
        if (closed) return;
        try {
          const filter = lastId ? { _id: { $gt: lastId } } : {};
          const fresh = await db.clusterEvents.find(filter).sort({ _id: 1 }).limit(100).toArray();
          for (const doc of fresh) {
            if (doc._id) lastId = doc._id;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(toUiClusterEvent(doc))}\n\n`));
          }
          if (fresh.length === 0) {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          }
        } catch {
          // Mongo hiccup — keep the stream alive and retry next tick.
        }
        if (!closed) timer = setTimeout(poll, 2000);
      };
      void poll();
    },
    cancel() {
      closed = true;
      if (timer) clearTimeout(timer);
    },
  });

  request.signal.addEventListener("abort", () => {
    closed = true;
    if (timer) clearTimeout(timer);
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
