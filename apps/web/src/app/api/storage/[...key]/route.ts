import { isAuthed } from "@/lib/auth";
import { getStorage } from "@/lib/db";

export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  svg: "image/svg+xml",
  html: "text/html; charset=utf-8",
  // Text renders inline in the browser (corpus browsing, 6.2).
  md: "text/plain; charset=utf-8",
  json: "application/json; charset=utf-8",
  log: "text/plain; charset=utf-8",
  txt: "text/plain; charset=utf-8",
};

const ALLOWED_PREFIXES = ["articles/", "competitive/"];

/** Serves stored files (header images, scraped corpora) regardless of storage driver. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
): Promise<Response> {
  if (!(await isAuthed())) return new Response("unauthorized", { status: 401 });
  const { key: parts } = await params;
  const key = parts.join("/");
  if (!ALLOWED_PREFIXES.some((p) => key.startsWith(p)) || key.includes("..")) {
    return new Response("not found", { status: 404 });
  }
  try {
    const buf = await getStorage().get(key);
    const ext = key.split(".").pop()?.toLowerCase() ?? "";
    const body = new Uint8Array(buf);
    return new Response(body, {
      headers: {
        "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
