import { redirect } from "next/navigation";
import { Boxes } from "lucide-react";
import { requireModuleMember } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { SetupRequiredNotice } from "@/components/modules/SetupRequiredNotice";
import { maybeDatabaseSetupRequired } from "@/lib/utils/supabase-errors";
import { CollectionBrowser } from "@/components/collection/CollectionBrowser";
import { getCategoryTree } from "@/lib/collection/category-tree";
import { resolveSeasonId } from "@/lib/collection/season";
import type { ProductionSheet } from "@/types";

export const dynamic = "force-dynamic";

// Koleksiyon tarayıcısı için kolonlar — kategori + fiyat + beden dağılımı da
// gerekiyor (kart üzerinde maliyet göstermek için). measurements/talimatlar
// gibi ağır jsonb'ler editöre bırakılır ki liste hafif kalsın.
const LIST_COLUMNS =
  "id, workspace_id, title, status, product_code, product_kind, producer, manufacturer_id, season_id, " +
  "delivery_date, sewing_delivery_date, season, photo_refs, category, subcategory, pricing, " +
  "size_distribution, measurements, description, confirmed_at, confirmed_by, " +
  "created_by, updated_by, archived_at, created_at, updated_at";

export default async function CollectionPage({
  searchParams,
}: {
  searchParams: Promise<{ sezon?: string }>;
}) {
  const { supabase, user, workspaceId, isAdmin, gate } = await requireModuleMember();
  if (gate === "login") redirect("/login");
  if (gate !== "ok" || !workspaceId || !user) return <AccessDenied />;

  const sp = await searchParams;

  // Sezon bağlamı — Zedonk'un sağ üstteki `SS 21 - WW` seçicisinin karşılığı.
  // Tablo henüz migrate edilmemişse boş liste döner, seçici çizilmez ve süzme
  // olmaz (geri uyum).
  const seasonsRes = await supabase
    .from("workspace_seasons")
    .select("id, name, is_current")
    .eq("workspace_id", workspaceId)
    .order("is_current", { ascending: false })
    .order("position")
    .order("name", { ascending: false });
  const seasons = (seasonsRes.data ?? []) as { id: string; name: string; is_current: boolean }[];
  const seasonId = resolveSeasonId(sp?.sezon, seasons);

  const sheetsQuery = supabase
    .from("production_sheets")
    .select(LIST_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });
  // Sezonu OLMAYAN föyler her sezon bağlamında görünür.
  // Gerekçe: prod'daki föylerin bir kısmında sezon metni hiç yoktu (taşımada
  // 12 föyün yalnız 5'i bağlandı). Katı `eq` süzgeci bunları aktif sezonda
  // gizlerdi ve kullanıcıya VERİ KAYBI gibi görünürdü. Sezonsuz föy bir
  // "eksik", saklanacak bir şey değil — görünür kalır, Koleksiyon'da uyarı
  // ile sezona atanması istenir.
  if (seasonId) sheetsQuery.or(`season_id.eq.${seasonId},season_id.is.null`);
  const sheetsResult = await sheetsQuery;

  const setup = maybeDatabaseSetupRequired(sheetsResult.error);
  if (setup.setupRequired) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 lg:px-8">
        <ModulePageHeader
          title="Collection"
          description="Ürünlerinizi kategori kategori görüntüleyin — her ürünün üretim föyü ve maliyeti bir arada."
          icon={Boxes}
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

  /* workspace_members sorgusu KALDIRILDI: `memberNames` yalnızca prop olarak
     geçiliyordu, CollectionBrowser onu hiç okumuyor (kartlardaki "Oluşturan /
     Son giren" satırı kalktığından beri ölü). Her Koleksiyon açılışına bedava
     bir tur biniyordu. */
  const sheets = (sheetsResult.data ?? []) as unknown as ProductionSheet[];

  /* Kategori ağacı — tablo boşsa kod varsayılanlarına düşer, ekran hiçbir
     durumda boş açılmaz (bkz. lib/collection/category-tree.ts). */
  const categories = await getCategoryTree(supabase, workspaceId);

  return <CollectionBrowser sheets={sheets} isAdmin={isAdmin} seasons={seasons} categories={categories} />;
}
