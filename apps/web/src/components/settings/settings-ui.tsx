import Link from "next/link";
import { Bot, Building2, Folder, LayoutTemplate, ListChecks, Megaphone, Target, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Caption } from "@/components/kit";

/**
 * Settings (route /admin), laid out like macOS System Settings: a category
 * list with colored icon tiles on the left, grouped inset sections on the
 * right. Server-safe: no hooks, so client forms can use the row pieces too.
 */

export type SettingsKey = "company" | "ctas" | "competitive" | "standards" | "templates" | "agents" | "context";

export interface SettingsCategory {
  key: SettingsKey;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Fixed tile color, like System Settings (white icon on a saturated tile). */
  tile: string;
}

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    key: "company",
    label: "Company",
    description: "Who the engine writes for. Every phase reads these.",
    icon: Building2,
    tile: "bg-[#0a6cd6]",
  },
  {
    key: "ctas",
    label: "Calls to action",
    description: "Every page closes on its funnel stage's call to action, and the edit gate checks the link is there.",
    icon: Megaphone,
    tile: "bg-[#c25e00]",
  },
  {
    key: "competitive",
    label: "Competitors",
    description: "Competitor blogs the engine reads to find content gaps.",
    icon: Target,
    tile: "bg-[#c8261d]",
  },
  {
    key: "standards",
    label: "Standards",
    description: "The bar every article is checked against. The Editor walks these lists; the audit enforces them.",
    icon: ListChecks,
    tile: "bg-[#1e7d3a]",
  },
  {
    key: "templates",
    label: "Templates",
    description: "How each article type is shaped, and how research is gathered for it.",
    icon: LayoutTemplate,
    tile: "bg-[#7a3fc4]",
  },
  {
    key: "agents",
    label: "Agents",
    description: "The instructions each phase follows. Changes apply to every article from the next run.",
    icon: Bot,
    tile: "bg-[#5a5a63]",
  },
  {
    key: "context",
    label: "Context",
    description: "What the company knows: brand, voice, sales material and case studies. Phases read what is relevant.",
    icon: Folder,
    tile: "bg-[#0b7a8a]",
  },
];

export const DEFAULT_SETTINGS_KEY: SettingsKey = "company";

export function settingsCategory(key: string): SettingsCategory {
  return SETTINGS_CATEGORIES.find((c) => c.key === key) ?? SETTINGS_CATEGORIES[0]!;
}

export function settingsHref(key: string, extra?: Record<string, string>): string {
  const q = new URLSearchParams();
  if (key !== DEFAULT_SETTINGS_KEY) q.set("tab", key);
  for (const [k, v] of Object.entries(extra ?? {})) q.set(k, v);
  const s = q.toString();
  return s ? `/admin?${s}` : "/admin";
}

/** The colored rounded-square tile with a white icon. */
export function IconTile({ category, size = "sm" }: { category: SettingsCategory; size?: "sm" | "lg" }) {
  const Icon = category.icon;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center text-white",
        category.tile,
        size === "lg" ? "size-11 rounded-[11px]" : "size-6 rounded-[6px]",
      )}
    >
      <Icon className={size === "lg" ? "size-6 stroke-[1.6]" : "size-[15px] stroke-[1.8]"} />
    </span>
  );
}

/** Left category list. Horizontal and scrollable on narrow screens. */
export function SettingsNav({ active }: { active: string }) {
  return (
    <nav aria-label="Settings" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:w-[210px] lg:shrink-0 lg:overflow-visible lg:px-0">
      <ul className="flex gap-0.5 lg:flex-col">
        {SETTINGS_CATEGORIES.map((c) => {
          const on = c.key === active;
          return (
            <li key={c.key}>
              <Link
                href={settingsHref(c.key)}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex h-[34px] items-center gap-2.5 rounded-lg px-2 text-[13px] whitespace-nowrap text-label transition-colors",
                  on ? "bg-fill font-semibold" : "hover:bg-fill-2",
                )}
              >
                <IconTile category={c} />
                {c.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Large icon tile, title and one-line description at the top of the pane. */
export function SettingsTitle({
  category,
  title,
  description,
  actions,
}: {
  category: SettingsCategory;
  title?: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3.5">
      <IconTile category={category} size="lg" />
      <div className="min-w-0 flex-[1_1_260px]">
        <h1 className="text-[22px] leading-7 font-bold tracking-[-0.01em]">{title ?? category.label}</h1>
        <p className="text-[13px] leading-[18px] text-label-2 text-pretty">{description ?? category.description}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** An inset group: caption heading, a card of rows, an optional footnote. */
export function SettingsGroup({
  title,
  aside,
  footnote,
  children,
  className,
}: {
  title?: React.ReactNode;
  aside?: React.ReactNode;
  footnote?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-1.5", className)}>
      {(title || aside) && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4">
          {title ? <Caption>{title}</Caption> : <span />}
          {aside && <span className="text-xs text-label-2">{aside}</span>}
        </div>
      )}
      <div className="overflow-hidden rounded-xl bg-surface shadow-card">{children}</div>
      {footnote && <p className="mx-4 mt-1 text-xs leading-4 text-label-2 text-pretty">{footnote}</p>}
    </section>
  );
}

/** Label left, control right; rows are separated by hairlines. */
export function SettingsRow({
  label,
  htmlFor,
  sub,
  stack = false,
  children,
  className,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  sub?: React.ReactNode;
  stack?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const head = (
    <span className="flex flex-col gap-0.5 sm:flex-[0_0_200px]">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-[13px] font-medium">
          {label}
        </label>
      ) : (
        <span className="text-[13px] font-medium">{label}</span>
      )}
      {sub && <span className="text-xs text-label-2 text-pretty">{sub}</span>}
    </span>
  );
  return (
    <div
      className={cn(
        "border-b-[0.5px] border-separator px-4 last:border-b-0",
        stack ? "flex flex-col gap-2 py-3" : "flex min-h-12 flex-wrap items-center gap-x-5 gap-y-2 py-2",
        className,
      )}
    >
      {head}
      {stack ? children : <div className="flex min-w-0 flex-[1_1_260px] justify-end">{children}</div>}
    </div>
  );
}

/** Read-only value on the right side of a row. */
export function SettingsValue({ children, mono, muted }: { children: React.ReactNode; mono?: boolean; muted?: boolean }) {
  return (
    <span
      className={cn(
        "min-w-0 text-right break-words text-pretty",
        mono ? "font-mono text-xs" : "text-[13px] leading-[18px]",
        muted ? "text-label-3" : "text-label",
      )}
    >
      {children}
    </span>
  );
}
