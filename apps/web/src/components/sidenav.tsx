"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cls } from "./ui";

const NAV = [
  { href: "/keywords", label: "Target Keywords" },
  { href: "/strategy", label: "Content Strategy" },
  { href: "/production", label: "Production" },
  { href: "/articles", label: "Articles" },
  { href: "/admin", label: "Admin" },
];

export function SideNav({
  companyName,
  authEnabled,
  logout,
}: {
  companyName: string;
  authEnabled: boolean;
  logout: () => Promise<void>;
}) {
  const pathname = usePathname();
  return (
    <aside className="flex w-56 shrink-0 flex-col bg-slate-900 text-slate-100">
      <div className="px-4 py-5">
        <div className="text-sm font-bold tracking-wide">Content Engine</div>
        <div className="mt-0.5 truncate text-xs text-slate-400">{companyName}</div>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 px-2">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cls(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-slate-700 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      {authEnabled && (
        <form action={logout} className="px-2 pb-4">
          <button
            type="submit"
            className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            Sign out
          </button>
        </form>
      )}
    </aside>
  );
}
