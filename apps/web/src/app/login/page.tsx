import { getCompany } from "@/lib/db";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  let companyName: string | null = null;
  try {
    companyName = getCompany().companyName || null;
  } catch {
    /* company.yaml missing: sign in still works */
  }
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-window px-4 py-6"
      style={{ backgroundImage: "radial-gradient(900px 520px at 50% 0%, color-mix(in srgb, var(--primary) 9%, transparent), transparent 70%)" }}
    >
      <LoginForm companyName={companyName} />
    </main>
  );
}
