"use client";

import Link from "next/link";
import { Clock, FileText, FolderOpen, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Caption, EventLog, type LogEvent } from "./kit";

/** The quiet "More" menu on a Production row that has no contextual action. */
export function ProductionRowMenu({ slug, title }: { slug: string; title: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`More actions for ${title}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem asChild>
          <Link href={`/production/review/${slug}`}>
            <FileText />
            Open review
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/articles/${slug}`}>
            <FolderOpen />
            View artifacts
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const HOUR = 60 * 60 * 1000;

/**
 * Recent pipeline events in a sheet from the right. The server passes the
 * events in; LiveRefresh re-renders the page, so the list stays current.
 */
export function ActivitySheet({ events }: { events: LogEvent[] }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary">
          <Clock data-icon="inline-start" />
          Activity
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 bg-raised p-0 data-[side=right]:sm:max-w-[420px]">
        <SheetHeader className="px-5 pt-5 pb-3">
          <SheetTitle className="text-xl leading-[26px] font-semibold tracking-[-0.01em]">Activity</SheetTitle>
          <SheetDescription className="text-xs text-label-2">The latest pipeline events, newest first.</SheetDescription>
        </SheetHeader>
        <ActivityList events={events} />
      </SheetContent>
    </Sheet>
  );
}

function ActivityList({ events }: { events: LogEvent[] }) {
  // Rendered only while the sheet is open, so reading the clock here can't cause a hydration mismatch.
  const now = Date.now();
  const recent = events.filter((e) => now - new Date(e.ts).getTime() < HOUR);
  const earlier = events.filter((e) => now - new Date(e.ts).getTime() >= HOUR);
  if (events.length === 0) return <EventLog events={[]} empty="No pipeline events yet." />;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-6">
      {recent.length > 0 && (
        <section>
          <Caption className="px-5 pt-2 pb-1">This hour</Caption>
          <EventLog events={recent} className="[&>li]:px-5" />
        </section>
      )}
      {earlier.length > 0 && (
        <section>
          <Caption className="px-5 pt-4 pb-1">Earlier</Caption>
          <EventLog events={earlier} className="[&>li]:px-5" />
        </section>
      )}
    </div>
  );
}
