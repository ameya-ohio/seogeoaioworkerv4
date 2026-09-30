import Anthropic from "@anthropic-ai/sdk";
import {
  appendExpertMessage,
  appendInterviewerReply,
  estimateCostUsd,
  parseCaptured,
  toChatMessages,
  visibleSoFar,
} from "@blogagent/engine";
import { isAuthed } from "@/lib/auth";
import { getCompany, getDb } from "@/lib/db";
import { interviewChatModel, interviewSystem } from "@/lib/interview";

export const dynamic = "force-dynamic";

const MAX_MESSAGE_CHARS = 8000;

let client: Anthropic | undefined;

/**
 * D59: one expert-interview turn. POST {message} records the expert's answer,
 * then streams the interviewer's reply as plain text. The trailing
 * <captured> block is held back from the stream and saved as the live
 * checklist. POST {retry: true} re-asks for a reply without adding a
 * message, after a reply that failed.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  if (!(await isAuthed())) return new Response("unauthorized", { status: 401 });
  const { slug } = await params;
  const body = (await request.json().catch(() => ({}))) as { message?: unknown; retry?: unknown };
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const retry = body.retry === true;
  if (!retry && !message) return new Response("message is required", { status: 400 });
  if (message.length > MAX_MESSAGE_CHARS) return new Response("message is too long", { status: 413 });

  const company = getCompany();
  const db = await getDb();
  const found = await db.articles.findOne({ companyId: company.companyId, slug });
  if (!found?._id || found.interview?.status !== "open") {
    return new Response("this interview isn't open", { status: 409 });
  }
  if (!retry && !(await appendExpertMessage(db, found._id, message))) {
    return new Response("this interview isn't open", { status: 409 });
  }
  const article = (await db.articles.findOne({ _id: found._id })) ?? found;
  if (!article.interview) return new Response("this interview isn't open", { status: 409 });

  const model = interviewChatModel();
  const system = await interviewSystem(article);
  const messages = toChatMessages(article.interview.messages);
  client ??= new Anthropic();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = "";
      let sent = 0;
      try {
        const api = client!.beta.messages.stream({
          model,
          max_tokens: 4000,
          thinking: { type: "adaptive" },
          output_config: { effort: "medium" },
          system,
          messages,
          // A security topic can trip a classifier; the fallback model answers instead.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        });
        api.on("text", (delta) => {
          full += delta;
          const visible = visibleSoFar(full);
          if (visible.length > sent) {
            controller.enqueue(encoder.encode(visible.slice(sent)));
            sent = visible.length;
          }
        });
        const final = await api.finalMessage();
        if (final.stop_reason === "refusal") {
          controller.enqueue(encoder.encode("\n\n[The interviewer couldn't answer this turn. Rephrase, or press Retry.]"));
          controller.close();
          return;
        }
        const { text, captured } = parseCaptured(full);
        // Anything the stream held back that turned out not to be a captured block.
        if (text.length > sent) controller.enqueue(encoder.encode(text.slice(sent)));
        const served = final.model;
        const costUsd = estimateCostUsd(served, {
          inputTokens: final.usage.input_tokens,
          outputTokens: final.usage.output_tokens,
          cacheReadTokens: final.usage.cache_read_input_tokens ?? 0,
          cacheCreationTokens: final.usage.cache_creation_input_tokens ?? 0,
        });
        await appendInterviewerReply(db, article, text, captured, costUsd);
        if (costUsd !== undefined) {
          await db.apiCosts.insertOne({
            companyId: company.companyId,
            provider: "anthropic",
            endpoint: "interview.turn",
            costUsd,
            at: new Date(),
            meta: { slug, model: served },
          });
        }
        controller.close();
      } catch (err) {
        const detail =
          err instanceof Anthropic.RateLimitError
            ? "rate limited — wait a moment"
            : err instanceof Anthropic.APIError
              ? `API error ${err.status ?? ""}`.trim()
              : err instanceof Error
                ? err.message
                : String(err);
        controller.enqueue(encoder.encode(`\n\n[Reply failed (${detail}). Your answer is saved — press Retry.]`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache, no-transform" },
  });
}
