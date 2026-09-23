"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, expectedToken } from "../auth";

export interface LoginState {
  error?: string;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");
  const expected = expectedToken();
  if (expected === null) redirect("/");
  if (!password || password !== process.env.APP_PASSWORD) {
    return { error: "Wrong password." };
  }
  (await cookies()).set(AUTH_COOKIE, expected, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  redirect("/");
}

export async function logout(): Promise<void> {
  (await cookies()).delete(AUTH_COOKIE);
  redirect("/login");
}
