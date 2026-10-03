import type { Stage } from "@blogagent/engine";
import { logout } from "@/lib/actions/auth";
import { requireAuth } from "@/lib/auth";
import { getCompany, getDb } from "@/lib/db";
import { Sidebar } from "@/components/shell/sidebar";
import { CommandMenu } from "@/components/shell/command-menu";

export const dynamic = "force-dynamic";

const IN_FLIGHT: Stage[] = ["queued", "research", "interview", "evidence", "outline", "write", "hdcp", "edit", "verify", "schema", "design"];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  let companyName = "unconfigured";
  let needsYou = 0;
  let inFlight = 0;
  try {
    const company = getCompany();
    companyName = company.companyName;
    const db = await getDb();
    const companyId = company.companyId;
    // D59: open expert interviews and drafts in review wait on the operator.
    const [interviews, reviews, flight] = await Promise.all([
      db.articles.countDocuments({ companyId, "interview.status": "open" }),
      db.articles.countDocuments({ companyId, stage: "review" }),
      db.articles.countDocuments({ companyId, stage: { $in: IN_FLIGHT } }),
    ]);
    needsYou = interviews + reviews;
    inFlight = flight;
  } catch {
    // company.yaml missing/invalid (or Mongo down): surface in Settings rather than crash the shell
  }
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar
        companyName={companyName}
        authEnabled={Boolean(process.env.APP_PASSWORD)}
        needsYou={needsYou}
        inFlight={inFlight}
        logout={logout}
      />
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      <CommandMenu />
    </div>
  );
}
