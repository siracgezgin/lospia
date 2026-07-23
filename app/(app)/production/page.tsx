import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { requireModuleMember } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { SetupRequiredNotice } from "@/components/modules/SetupRequiredNotice";
import { maybeDatabaseSetupRequired } from "@/lib/utils/supabase-errors";
import { ProductionSheetsView } from "@/components/production/ProductionSheetsView";
import type { ProductionSheet } from "@/types";

export const dynamic = "force-dynamic";

// Liste için hafif kolonlar — jsonb blokları (measurements/size_distribution)
// detay/düzenleyici sayfasına bırakılır ki liste büyük veri taşımasın.
const LIST_COLUMNS =
  "id, workspace_id, title, status, product_code, product_kind, producer, " +
  "delivery_date, season, created_by, updated_by, archived_at, created_at, updated_at";

export default async function ProductionPage() {
  const { supabase, user, workspaceId, isAdmin, gate } = await requireModuleMember();
  if (gate === "login") redirect("/login");
  if (gate !== "ok" || !workspaceId || !user) return <AccessDenied />;

  const sheetsResult = await supabase
    .from("production_sheets")
    .select(LIST_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });

  // Migration henüz uygulanmadıysa nazik kurulum ekranı.
  const setup = maybeDatabaseSetupRequired(sheetsResult.error);
  if (setup.setupRequired) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <ModulePageHeader
          title="Üretim Föyü"
          description="Üretim föylerinizi Excel yerine Lospia içinde tutun — her ürün bir föy, kim girdiği görünür."
          icon={ClipboardList}
          secondaryBackHref="/board"
        />
        <SetupRequiredNotice
          variant="block"
          title="Üretim Föyü tablosu henüz oluşturulmadı"
          message={
            setup.message ??
            "Üretim Föyü için veritabanı güncellemesi bekleniyor. Migration uygulandıktan sonra bu ekran aktif olacak."
          }
          technicalDetail={isAdmin ? setup.technicalDetail : null}
        />
      </div>
    );
  }

  const membersResult = await supabase
    .from("workspace_members")
    .select("user_id, profiles(id, full_name, email)")
    .eq("workspace_id", workspaceId);

  const sheets = (sheetsResult.data ?? []) as unknown as ProductionSheet[];
  const memberNames: Record<string, string> = {};
  for (const m of membersResult.data ?? []) {
    const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as
      | { id: string; full_name: string | null; email: string | null }
      | null;
    if (p) memberNames[m.user_id as string] = p.full_name || p.email || "—";
  }

  return (
    <ProductionSheetsView
      sheets={sheets}
      memberNames={memberNames}
      isAdmin={isAdmin}
    />
  );
}
