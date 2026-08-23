import { redirect } from "next/navigation";
import { Boxes } from "lucide-react";
import { requireModuleMember } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { SetupRequiredNotice } from "@/components/modules/SetupRequiredNotice";
import { maybeDatabaseSetupRequired } from "@/lib/utils/supabase-errors";
import { CollectionBrowser } from "@/components/collection/CollectionBrowser";
import type { ProductionSheet } from "@/types";

export const dynamic = "force-dynamic";

// Koleksiyon tarayıcısı için kolonlar — kategori + fiyat + beden dağılımı da
// gerekiyor (kart üzerinde maliyet göstermek için). measurements/talimatlar
// gibi ağır jsonb'ler editöre bırakılır ki liste hafif kalsın.
const LIST_COLUMNS =
  "id, workspace_id, title, status, product_code, product_kind, producer, manufacturer_id, " +
  "delivery_date, sewing_delivery_date, season, photo_refs, category, subcategory, pricing, " +
  "size_distribution, measurements, description, confirmed_at, confirmed_by, " +
  "created_by, updated_by, archived_at, created_at, updated_at";

export default async function CollectionPage() {
  const { supabase, user, workspaceId, isAdmin, gate } = await requireModuleMember();
  if (gate === "login") redirect("/login");
  if (gate !== "ok" || !workspaceId || !user) return <AccessDenied />;

  const sheetsResult = await supabase
    .from("production_sheets")
    .select(LIST_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });

  const setup = maybeDatabaseSetupRequired(sheetsResult.error);
  if (setup.setupRequired) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <ModulePageHeader
          title="Collection"
          description="Ürünlerinizi kategori kategori görüntüleyin — her ürünün üretim föyü ve maliyeti bir arada."
          icon={Boxes}
          secondaryBackHref="/board"
        />
        <SetupRequiredNotice
          variant="block"
          title="Koleksiyon tablosu henüz oluşturulmadı"
          message={
            setup.message ??
            "Koleksiyon için veritabanı güncellemesi bekleniyor. Migration uygulandıktan sonra bu ekran aktif olacak."
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

  return <CollectionBrowser sheets={sheets} memberNames={memberNames} isAdmin={isAdmin} />;
}
