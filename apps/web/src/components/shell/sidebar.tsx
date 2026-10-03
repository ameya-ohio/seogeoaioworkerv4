"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useTheme } from "next-themes";
import {
  BookOpen,
  Compass,
  Hash,
  Layers,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Search,
  SlidersHorizontal,
  Sun,
  SunMedium,
  Activity,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/kbd";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { openCommandMenu } from "./command-menu";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: "needs" | "count";
}

const GROUPS: { title?: string; items: NavItem[] }[] = [
  { items: [{ href: "/", label: "Today", icon: SunMedium, badge: "needs" }] },
  {
    title: "Plan",
    items: [
      { href: "/keywords", label: "Keywords", icon: Hash },
      { href: "/strategy", label: "Strategy", icon: Compass },
      { href: "/plans", label: "Content plans", icon: Layers },
    ],
  },
  { title: "Make", items: [{ href: "/production", label: "Production", icon: Activity, badge: "count" }] },
  { title: "Library", items: [{ href: "/articles", label: "Articles", icon: BookOpen }] },
];

export interface SidebarProps {
  companyName: string;
  authEnabled: boolean;
  /** Things waiting on the operator: open interviews + drafts in review. */
  needsYou: number;
  /** Articles moving through the pipeline. */
  inFlight: number;
  logout: () => Promise<void>;
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLink({ item, pathname, needsYou, inFlight, onNavigate }: { item: NavItem; pathname: string; needsYou: number; inFlight: number; onNavigate?: () => void }) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-label transition-colors",
        active ? "bg-fill font-semibold" : "hover:bg-fill-2",
      )}
    >
      <Icon aria-hidden className={cn("size-[17px] stroke-[1.7]", active ? "text-primary" : "text-label-2")} />
      <span className="flex-1">{item.label}</span>
      {item.badge === "needs" && needsYou > 0 && (
        <span
          title={`${needsYou} waiting on you`}
          className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-needs px-1.5 text-[11px] font-bold text-white"
        >
          {needsYou}
        </span>
      )}
      {item.badge === "count" && inFlight > 0 && <span className="text-xs text-label-2 tabular-nums">{inFlight}</span>}
    </Link>
  );
}

function ThemeTrigger() {
  const { theme } = useTheme();
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const label = theme === "dark" ? "Dark" : theme === "light" ? "Light" : "Auto";
  return (
    <DropdownMenuTrigger asChild>
      <button type="button" className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-label transition-colors hover:bg-fill-2">
        <Icon aria-hidden className="size-[17px] stroke-[1.7] text-label-2" />
        <span className="flex-1 text-left">Appearance</span>
        <span className="text-xs text-label-2">{label}</span>
      </button>
    </DropdownMenuTrigger>
  );
}

function SidebarBody({ companyName, authEnabled, needsYou, inFlight, logout, onNavigate }: SidebarProps & { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const initial = companyName.trim().charAt(0).toUpperCase() || "C";
  return (
    <div className="flex h-full flex-col gap-[18px] px-3 py-3.5">
      <div className="flex items-center gap-2.5 px-1.5 py-1">
        <span aria-hidden className="inline-flex size-[30px] items-center justify-center rounded-lg bg-label text-[15px] font-bold text-window">
          {initial}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-[13px] font-semibold">Content Engine</span>
          <span className="truncate text-xs text-label-2">{companyName}</span>
        </span>
      </div>

      <button
        type="button"
        onClick={() => {
          onNavigate?.();
          openCommandMenu();
        }}
        className="flex h-[30px] items-center gap-2 rounded-lg bg-fill-2 pr-2 pl-2.5 text-[13px] text-label-2 shadow-[inset_0_0_0_0.5px_var(--separator)] transition-colors hover:bg-fill"
      >
        <Search aria-hidden className="size-[15px]" />
        <span className="flex-1 text-left">Search</span>
        <Kbd>⌘K</Kbd>
      </button>

      <nav aria-label="Main" className="flex flex-col gap-4">
        {GROUPS.map((g, i) => (
          <div key={i} className="flex flex-col gap-px">
            {g.title && <p className="mb-1 px-2.5 text-[11px] font-semibold text-label-2">{g.title}</p>}
            {g.items.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} needsYou={needsYou} inFlight={inFlight} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-1">
        <NavLink item={{ href: "/admin", label: "Settings", icon: SlidersHorizontal }} pathname={pathname} needsYou={0} inFlight={0} onNavigate={onNavigate} />
        <DropdownMenu>
            <ThemeTrigger />
            <DropdownMenuContent align="start" side="top" className="w-44">
              <DropdownMenuLabel>Appearance</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
                <DropdownMenuRadioItem value="system">Match system</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              {authEnabled && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <form action={logout} className="w-full">
                      <button type="submit" className="flex w-full items-center gap-2">
                        <LogOut className="size-4" /> Sign out
                      </button>
                    </form>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

/** Translucent sidebar on wide screens; a sheet behind a menu button on phones. */
export function Sidebar(props: SidebarProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 border-r-[0.5px] border-separator-strong bg-sidebar backdrop-blur-xl md:block">
        <SidebarBody {...props} />
      </aside>
      <div className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b-[0.5px] border-separator-strong bg-bar px-3 backdrop-blur-xl md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button type="button" aria-label="Open navigation" className="inline-flex size-9 items-center justify-center rounded-lg text-label-2 hover:bg-fill-2">
              <Menu className="size-5" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[264px] border-0 bg-window p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SidebarBody {...props} onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <span className="text-[13px] font-semibold">Content Engine</span>
        <span className="flex-1" />
        <button type="button" aria-label="Search" onClick={openCommandMenu} className="inline-flex size-9 items-center justify-center rounded-lg text-label-2 hover:bg-fill-2">
          <Search className="size-[18px]" />
        </button>
      </div>
    </>
  );
}
