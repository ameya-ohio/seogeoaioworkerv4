"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { PHASES } from "./model";

/** D51: who signs off a vendor-format page before export. */
export function SignOffDialog({
  open,
  onOpenChange,
  formatLabel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  formatLabel: string;
  onSubmit: (by: string, note: string) => void;
}) {
  const [by, setBy] = useState("");
  const [note, setNote] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!by.trim()) return;
            onOpenChange(false);
            onSubmit(by.trim(), note.trim());
          }}
        >
          <DialogHeader>
            <DialogTitle>Sign off this page</DialogTitle>
            <DialogDescription>
              {formatLabel} pages need a person to sign off before they can be exported (D51). The name and time are recorded on the article.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="signoff-by">Your name</Label>
            <Input id="signoff-by" value={by} onChange={(e) => setBy(e.target.value)} autoFocus required autoComplete="name" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="signoff-note">
              Note <span className="font-normal text-label-2">(optional)</span>
            </Label>
            <Textarea id="signoff-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!by.trim()}>
              Sign off
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** D52: the page's URL on the site, checked before the article counts as published. */
export function MarkLiveDialog({
  open,
  onOpenChange,
  defaultUrl,
  recheck,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultUrl: string;
  recheck: boolean;
  onSubmit: (url: string) => void;
}) {
  const [url, setUrl] = useState(defaultUrl);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setUrl(defaultUrl);
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!url.trim()) return;
            onOpenChange(false);
            onSubmit(url.trim());
          }}
        >
          <DialogHeader>
            <DialogTitle>{recheck ? "Re-check the live URL" : "Mark live"}</DialogTitle>
            <DialogDescription>
              The page&apos;s URL on the site. It&apos;s checked before the article counts as published.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="live-url">Page URL</Label>
            <Input
              id="live-url"
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoFocus
              required
              className="font-mono text-[13px]"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!url.trim()}>
              {recheck ? "Check URL" : "Mark live"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A yes/no confirmation for an action that can't be undone from here. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  action,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: React.ReactNode;
  action: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{action}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const REWRITES_TEXT = new Set(["research", "interview", "evidence", "outline", "write", "hdcp", "edit", "verify"]);

/** Pick a phase and see what re-running from it redoes before queueing it. */
export function RerunDialog({
  open,
  onOpenChange,
  dirty,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  dirty: boolean;
  onSubmit: (phase: string) => void;
}) {
  const [phase, setPhase] = useState("edit");
  const from = PHASES.findIndex((p) => p.key === phase);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onOpenChange(false);
            onSubmit(phase);
          }}
        >
          <DialogHeader>
            <DialogTitle>Re-run from a phase</DialogTitle>
            <DialogDescription>
              The worker runs the phase you pick and every phase after it, then the article comes back here for review.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rerun-phase">Start from</Label>
            <Select value={phase} onValueChange={setPhase}>
              <SelectTrigger id="rerun-phase" className="w-full bg-fill-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {PHASES.map((p) => (
                  <SelectItem key={p.key} value={p.key}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-label-2">What will be redone</p>
            <ol className="flex flex-col gap-1 rounded-[10px] bg-fill-2 p-3">
              {PHASES.map((p, i) => {
                const redo = i >= from;
                return (
                  <li key={p.key} className={cn("flex items-baseline gap-2 text-[13px]", !redo && "text-label-3")}>
                    <span className={cn("w-16 shrink-0 font-medium", redo ? "text-label" : "text-label-3")}>{p.label}</span>
                    <span className={redo ? "text-label-2" : "line-through decoration-label-3"}>{p.does}</span>
                  </li>
                );
              })}
            </ol>
            <p className="text-[13px] leading-[18px] text-label-2">
              {REWRITES_TEXT.has(phase)
                ? "The article text is rewritten from this phase on, so edits saved here are replaced."
                : "The article text is kept; only the later build steps run again."}
              {dirty && " Your unsaved edits are not part of the re-run."}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">
              <RotateCcw data-icon="inline-start" />
              Queue re-run
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
