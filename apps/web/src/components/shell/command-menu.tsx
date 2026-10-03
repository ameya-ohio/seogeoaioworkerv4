"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Activity,
  BookOpen,
  Compass,
  FileText,
  Hash,
  Layers,
  Moon,
  Plus,
  SlidersHorizontal,
  Sun,
  SunMedium,
  Upload,
} from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { searchEverything, type SearchHit } from "@/lib/actions/search";

const OPEN_EVENT = "content-engine:command-menu";

/** Opens the ⌘K menu from anywhere (sidebar search button, mobile bar). */
export function openCommandMenu() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

const PAGES = [
  { label: "Today", href: "/", icon: SunMedium },
  { label: "Keywords", href: "/keywords", icon: Hash },
  { label: "Strategy", href: "/strategy", icon: Compass },
  { label: "Content plans", href: "/plans", icon: Layers },
  { label: "Production", href: "/production", icon: Activity },
  { label: "Articles", href: "/articles", icon: BookOpen },
  { label: "Settings", href: "/admin", icon: SlidersHorizontal },
];

const KIND_ICON = { article: FileText, keyword: Hash, plan: Layers } as const;
const KIND_GROUP = { article: "Articles", keyword: "Keywords", plan: "Content plans" } as const;

export function CommandMenu() {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [, startSearch] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => startSearch(async () => setHits(await searchEverything(query))), 150);
    return () => clearTimeout(t);
  }, [query]);

  const go = (href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };

  const groups = (["article", "keyword", "plan"] as const)
    .map((kind) => ({ kind, items: hits.filter((h) => h.kind === kind) }))
    .filter((g) => g.items.length > 0);

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Search and commands"
      description="Jump to an article, keyword or plan, or run an action."
      className="top-[12vh] sm:max-w-[640px]"
    >
      <Command className="rounded-none! bg-transparent p-0">
      <CommandInput placeholder="Search articles, keywords, plans…" value={query} onValueChange={setQuery} />
      <CommandList className="max-h-[min(420px,60vh)]">
        <CommandEmpty>No matches.</CommandEmpty>
        {groups.map((g) => (
          <CommandGroup key={g.kind} heading={KIND_GROUP[g.kind]}>
            {g.items.map((h) => {
              const Icon = KIND_ICON[h.kind];
              return (
                <CommandItem key={`${h.kind}-${h.id}`} value={`${query} ${h.kind} ${h.title} ${h.id}`} onSelect={() => go(h.href)}>
                  <Icon />
                  <span className="truncate">{h.title}</span>
                  <CommandShortcut className="tracking-normal capitalize">{h.meta}</CommandShortcut>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => go(query.trim() ? `/strategy?topic=${encodeURIComponent(query.trim())}` : "/strategy")}>
            <Plus />
            {query.trim() ? `New article about “${query.trim()}”` : "New article…"}
          </CommandItem>
          <CommandItem onSelect={() => go("/plans")}>
            <Upload />
            Import a content plan…
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setTheme(resolvedTheme === "dark" ? "light" : "dark");
              setOpen(false);
            }}
          >
            {resolvedTheme === "dark" ? <Sun /> : <Moon />}
            {resolvedTheme === "dark" ? "Switch to light appearance" : "Switch to dark appearance"}
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Go to">
          {PAGES.map((p) => (
            <CommandItem key={p.href} onSelect={() => go(p.href)}>
              <p.icon />
              {p.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
      </Command>
    </CommandDialog>
  );
}
