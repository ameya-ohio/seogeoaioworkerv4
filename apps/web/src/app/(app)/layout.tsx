import { logout } from "@/lib/actions/auth";
import { requireAuth } from "@/lib/auth";
import { getCompany } from "@/lib/db";
import { SideNav } from "@/components/sidenav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  let companyName = "unconfigured";
  try {
    companyName = getCompany().companyName;
  } catch {
    // company.yaml missing/invalid — surface in Admin rather than crash the shell
  }
  return (
    <div className="flex min-h-screen">
      <SideNav
        companyName={companyName}
        authEnabled={Boolean(process.env.APP_PASSWORD)}
        logout={logout}
      />
      <main className="min-w-0 flex-1 px-8 py-6">{children}</main>
    </div>
  );
}
