"use client";

import { useActionState } from "react";
import { uploadPlan, type PlanFormState } from "@/lib/actions/plans";
import { buttonCls, Card, inputCls } from "./ui";

/**
 * Upload form. Parsing happens on the server, so the file is posted straight
 * through the server action rather than being read in the browser.
 */
export function PlanUploadForm() {
  const [state, formAction, pending] = useActionState<PlanFormState, FormData>(uploadPlan, {});

  return (
    <Card title="Import a content plan">
      <form action={formAction} className="space-y-3">
        <p className="text-sm text-slate-600">
          An .xlsx or .csv where each row is a planned article. Nothing is created until you
          review the parsed result and commit.
        </p>
        <input
          type="file"
          name="file"
          accept=".xlsx,.xlsm,.csv"
          required
          className={inputCls}
        />
        <div className="flex items-center gap-3">
          <button type="submit" className={buttonCls("primary")} disabled={pending}>
            {pending ? "Reading…" : "Upload and analyse"}
          </button>
          <span className="text-xs text-slate-500">
            Columns are detected automatically; you can correct them on the next screen.
          </span>
        </div>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      </form>
    </Card>
  );
}
