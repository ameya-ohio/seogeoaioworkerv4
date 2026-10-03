"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** The operator password form (D5). */
export function LoginForm({ companyName }: { companyName: string | null }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {});
  const initial = (companyName ?? "Content Engine").trim().charAt(0).toUpperCase() || "C";
  return (
    <form
      action={formAction}
      className="flex w-full max-w-[380px] flex-col items-center gap-[22px] rounded-[22px] bg-surface px-8 pt-9 pb-7 shadow-pop"
    >
      <span
        aria-hidden
        className="inline-flex size-[52px] items-center justify-center rounded-[14px] bg-label text-2xl font-bold text-window"
      >
        {initial}
      </span>
      <div className="text-center">
        <h1 className="text-[22px] leading-7 font-bold tracking-[-0.01em]">Content Engine</h1>
        {companyName && <p className="mt-0.5 text-sm text-label-2">{companyName}</p>}
      </div>
      <div className="flex w-full flex-col gap-1.5">
        <label htmlFor="password" className="text-xs font-semibold text-label-2">
          Team password
        </label>
        <input
          id="password"
          type="password"
          name="password"
          autoFocus
          autoComplete="current-password"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "login-error" : undefined}
          className={cn(
            "h-10 w-full rounded-[10px] border-0 bg-fill-2 px-3 text-[15px] text-label shadow-[inset_0_0_0_0.5px_var(--separator-strong)] transition-shadow focus:shadow-[inset_0_0_0_0.5px_var(--separator-strong),0_0_0_3px_var(--ring)] focus:outline-none",
            state.error && "shadow-[inset_0_0_0_1px_var(--problem)]",
          )}
        />
        {state.error && (
          <p id="login-error" role="alert" className="text-[13px] text-problem-fg">
            {state.error}
          </p>
        )}
      </div>
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-center text-xs text-label-2">Ask your workspace admin if you don&apos;t have the password.</p>
    </form>
  );
}
