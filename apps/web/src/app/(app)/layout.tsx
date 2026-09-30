import { logout } from "@/lib/actions/auth";
import { requireAuth } from "@/lib/auth";
import { getCompany, getDb } from "@/lib/db";
import { SideNav } from "@/components/sidenav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  let companyName = "unconfigured";
  let interviews = 0;
  try {
    const company = getCompany();
    companyName = company.companyName;
    // D59: open expert interviews wait on the operator — badge them in the nav.
    const db = await getDb();
    interviews = await db.articles.countDocuments({ companyId: company.companyId, "interview.status": "open" });
  } catch {
    // company.yaml missing/invalid (or Mongo down) — surface in Admin rather than crash the shell
  }
  return (
    <div className="flex min-h-screen">
      <SideNav
        companyName={companyName}
        authEnabled={Boolean(process.env.APP_PASSWORD)}
        interviews={interviews}
        logout={logout}
      />
      <main className="min-w-0 flex-1 px-8 py-6">{children}</main>
    </div>
  );
}
