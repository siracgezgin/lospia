import { redirect } from "next/navigation";
import { Wallet } from "lucide-react";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { SetupRequiredNotice } from "@/components/modules/SetupRequiredNotice";
import { maybeDatabaseSetupRequired } from "@/lib/utils/supabase-errors";
import { requireModuleAdmin } from "@/lib/modules/context";
import { FinanceView } from "@/components/finance/FinanceView";
import type { FinancePayment } from "@/types";

export const dynamic = "force-dynamic";

// Finans — Ödeme Takibi. Excel "Finans Ödeme Tablo" sekmesinin sistemdeki
// karşılığı; okuma dahil admin-only (RLS + sayfa kapısı).
export default async function FinancePage() {
  const { supabase, workspaceId, gate } = await requireModuleAdmin();
  if (gate === "login") redirect("/login");
  if (gate !== "ok" || !workspaceId) return <AccessDenied />;

  const res = await supabase
    .from("finance_payments")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("status", { ascending: true }) // bekliyor önce
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  const setup = maybeDatabaseSetupRequired(res.error);
  if (setup.setupRequired) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <ModulePageHeader
          title="Finans — Ödeme Takibi"
          description="Kime, ne kadar, ne zaman — ödemelerin tek listesi."
          icon={Wallet}
          secondaryBackHref="/modules"
        />
        <SetupRequiredNotice
          variant="block"
          title="Finans tablosu henüz oluşturulmadı"
          message={setup.message ?? "Finans için veritabanı güncellemesi bekleniyor."}
        />
      </div>
    );
  }

  return <FinanceView payments={(res.data ?? []) as unknown as FinancePayment[]} />;
}
