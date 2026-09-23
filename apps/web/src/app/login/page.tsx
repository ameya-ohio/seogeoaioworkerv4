"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/lib/actions/auth";
import { buttonCls, inputCls } from "@/components/ui";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <form
        action={formAction}
        className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-xl"
      >
        <h1 className="text-lg font-bold text-white">Content Engine</h1>
        <p className="mt-1 text-sm text-slate-300">Enter the operator password.</p>
        <input
          type="password"
          name="password"
          autoFocus
          placeholder="Password"
          className={`${inputCls} mt-4 w-full`}
        />
        {state.error && <p className="mt-2 text-sm text-red-400">{state.error}</p>}
        <button type="submit" disabled={pending} className={buttonCls("primary", "mt-4 w-full justify-center")}>
          {pending ? "Checking…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
