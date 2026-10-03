"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { FileSpreadsheet, UploadCloud, X } from "lucide-react";
import { uploadPlan, type PlanFormState } from "@/lib/actions/plans";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ACCEPT = [".xlsx", ".xlsm", ".csv"];

/**
 * Upload form, as a drop zone. Parsing happens on the server, so the file is
 * posted straight through the server action rather than being read in the
 * browser.
 */
export function PlanUploadForm() {
  const [state, formAction, pending] = useActionState<PlanFormState, FormData>(uploadPlan, {});
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);

  // React resets the form after the action runs; keep the chosen file in step.
  useEffect(() => {
    if (state.error) setFile(null);
  }, [state]);

  const accept = (f: File | undefined | null) => {
    if (!f || !input.current) return;
    if (!ACCEPT.some((ext) => f.name.toLowerCase().endsWith(ext))) return;
    const dt = new DataTransfer();
    dt.items.add(f);
    input.current.files = dt.files;
    setFile(f);
  };

  const clear = () => {
    if (input.current) input.current.value = "";
    setFile(null);
  };

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label
        htmlFor="plan-file"
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          accept(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-[14px] bg-surface px-6 py-9 text-center shadow-card transition-colors",
          "outline-[1.5px] -outline-offset-8 outline-separator-strong outline-dashed",
          over && "bg-primary-soft outline-primary",
          "has-[input:focus-visible]:outline-primary",
        )}
      >
        <input
          ref={input}
          id="plan-file"
          type="file"
          name="file"
          accept={ACCEPT.join(",")}
          required
          className="sr-only"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <>
            <FileSpreadsheet aria-hidden className="size-9 stroke-[1.3] text-primary" />
            <span className="text-[15px] font-semibold text-label">{file.name}</span>
            <span className="text-[13px] text-label-2">{(file.size / 1024).toFixed(0)} KB · ready to analyse</span>
          </>
        ) : (
          <>
            <UploadCloud aria-hidden className="size-9 stroke-[1.3] text-label-3" />
            <span className="text-[15px] font-semibold text-label">Drop a content plan here, or choose a file</span>
            <span className="max-w-md text-[13px] leading-[18px] text-label-2 text-pretty">
              An .xlsx or .csv where each row is a planned article. Nothing is created until you review the parsed result
              and commit.
            </span>
          </>
        )}
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || !file}>
          {pending ? "Reading…" : "Upload and analyse"}
        </Button>
        {file && !pending && (
          <Button type="button" variant="ghost" onClick={clear}>
            <X data-icon="inline-start" />
            Remove file
          </Button>
        )}
        <span className="text-xs text-label-2">Columns are detected automatically; you can correct them on the next screen.</span>
      </div>
      {state.error && (
        <p role="alert" className="text-[13px] text-problem-fg">
          {state.error}
        </p>
      )}
    </form>
  );
}
