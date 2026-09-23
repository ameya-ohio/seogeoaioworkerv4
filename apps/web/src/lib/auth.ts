import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Auth-light gate (D5): one shared password from APP_PASSWORD. The cookie
 * holds an HMAC derived from it, so rotating the password invalidates every
 * session. If APP_PASSWORD is unset the gate is open (local dev).
 */
export const AUTH_COOKIE = "bce_auth";

export function expectedToken(): string | null {
  const password = process.env.APP_PASSWORD;
  if (!password) return null;
  return createHmac("sha256", password).update("blogagent-web-session-v1").digest("hex");
}

export async function isAuthed(): Promise<boolean> {
  const expected = expectedToken();
  if (!expected) return true;
  const got = (await cookies()).get(AUTH_COOKIE)?.value ?? "";
  if (got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

/** Call at the top of every page/action that needs the gate. */
export async function requireAuth(): Promise<void> {
  if (!(await isAuthed())) redirect("/login");
}
