
import { redirectToSignIn } from "@/lib/auth/session-redirect";
import { requireModuleMember } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { CollectionTabs } from "@/components/collection/PaymentTable";
import { SettingsSection, CountChip } from "@/components/settings/SettingsSection";
import { ManufacturersManager, type ManagerManufacturer } from "@/components/settings/ManufacturersManager";
import { SeasonsManager, type ManagerSeason } from "@/components/settings/SeasonsManager";
import { MaterialsManager, type ManagerMaterial } from "@/components/settings/MaterialsManager";
import { ProductDataTiles } from "@/components/collection/ProductDataTiles";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { BackLink } from "@/components/modules/BackLink";

export const dynamic = "force-dynamic";
export const metadata = { title: "Product Data" };

/**
 * Product Data — sezon · usta · hammadde.
 *
 * Sıraç (2026-08-29): "Şu Settings'teki 'Ürün verisi' kısmını Collection'a
 * alalım, burada mantıksız olmuş."
 *
 * Doğru teşhis: bunlar bir AYAR değil, ÜRÜN VERİSİ. Üçü de yalnız Koleksiyon
 * ekranlarını besliyor — sezon üst çubuktaki bağlamı, usta föydeki "Üretici"
 * alanını ve Ödeme Tablosu'nu, hammadde de föy reçetesini ve maliyeti. Ayarlar
 * sayfasında dururken "kim erişebilir / çalışma alanı adı" ile aynı rafta
 * görünüyorlardı; kullanmak isteyen kişi Koleksiyon'dan çıkıp Ayarlar'a gitmek
 * zorundaydı.
 *
 * Artık Koleksiyon'un dördüncü sekmesi: Production Sheets · Cost ·
 * Payment Table · Product Data.
 *
 * Yazma yetkisi ayarlardaki gibi YÖNETİCİDE; üye görür, düzenleyemez.
 */
export default async function CollectionDataPage({
  searchParams,
}: {
  searchParams: Promise<{ k?: string }>;
}) {
  /* `?k=` AÇIK KUTU. Yokken ekran kutucuklarla açılır — üç yöneticiyi alt alta
     dizmek uygulamanın tek tasarım dilinin dışında kalan son giriş ekranıydı
     (Aslı Hanım: "aşağıdan böyle muhasebeci gibi şey seçtirip girdirmeyelim"). */
  const box = (await searchParams).k ?? null;
  const { supabase, user, workspaceId, isAdmin, gate } = await requireModuleMember();
  if (gate === "login") redirectToSignIn();
  if (gate !== "ok" || !workspaceId || !user) return <AccessDenied />;

  const [
    manufacturersResult, sheetProducerResult,
    seasonsResult, sheetSeasonResult,
    materialsResult, bomUsageResult, suppliersResult,
  ] = await Promise.all([
    // Üretici (Usta) — "Cihan Usta, o ustaları da öyle açacağız… hangi ürünler
    // orada dikiliyor." Tablo migrate edilmemişse bölüm sessizce gizlenir.
    supabase
      .from("workspace_manufacturers")
      .select("id, name, photo_url, city, country, currency, lead_time_days, min_order_qty, contact_name, phone, email, notes, is_active")
      .eq("workspace_id", workspaceId)
      .order("is_active", { ascending: false })
      .order("name"),
    supabase
      .from("production_sheets")
      .select("manufacturer_id")
      .eq("workspace_id", workspaceId)
      .not("manufacturer_id", "is", null),
    // Sezon — Ürün ekranlarının bağlamı (Zedonk `SS 21 - WW` deseni).
    supabase
      .from("workspace_seasons")
      .select("id, name, starts_on, ends_on, is_current")
      .eq("workspace_id", workspaceId)
      .order("is_current", { ascending: false })
      .order("name", { ascending: false }),
    supabase
      .from("production_sheets")
      .select("season_id")
      .eq("workspace_id", workspaceId)
      .not("season_id", "is", null),
    // Hammadde kütüphanesi — föy reçetelerinin kaynağı (20240310).
    supabase
      .from("workspace_materials")
      .select("id, code, name, category, supplier_id, composition, width_cm, unit, unit_price, currency, notes, is_active")
      .eq("workspace_id", workspaceId)
      .order("is_active", { ascending: false })
      .order("category")
      .order("name"),
    supabase
      .from("production_sheet_materials")
      .select("material_id")
      .eq("workspace_id", workspaceId),
    supabase
      .from("workspace_suppliers")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .order("name"),
  ]);

  const manufacturers = (manufacturersResult.data ?? []) as ManagerManufacturer[];
  const manufacturersAvailable = !manufacturersResult.error;
  const sheetCounts: Record<string, number> = {};
  for (const r of (sheetProducerResult.data ?? []) as { manufacturer_id: string | null }[]) {
    if (r.manufacturer_id) sheetCounts[r.manufacturer_id] = (sheetCounts[r.manufacturer_id] ?? 0) + 1;
  }

  const seasons = (seasonsResult.data ?? []) as ManagerSeason[];
  const seasonsAvailable = !seasonsResult.error;
  const seasonCounts: Record<string, number> = {};
  for (const r of (sheetSeasonResult.data ?? []) as { season_id: string | null }[]) {
    if (r.season_id) seasonCounts[r.season_id] = (seasonCounts[r.season_id] ?? 0) + 1;
  }

  const materials = (materialsResult.data ?? []) as ManagerMaterial[];
  const materialsAvailable = !materialsResult.error;
  const suppliers = (suppliersResult.data ?? []) as { id: string; name: string }[];
  const materialUsage: Record<string, number> = {};
  for (const r of (bomUsageResult.data ?? []) as { material_id: string }[]) {
    materialUsage[r.material_id] = (materialUsage[r.material_id] ?? 0) + 1;
  }

  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      {/* Başlık uygulama çubuğunda; hiyerarşi satırı kardeş sekmelerle AYNI
          yerde ve aynı biçimde ("Collection › Product Data"). Eskiden burada
          hiçbir şey yoktu: Maliyet ve Ödeme sekmelerinde satır varken bu
          sekmeye geçince kayboluyordu (Sıraç, 12.09.2026: "bazısında var
          bazısında yok"). */}
      <h1 className="sr-only">Product Data</h1>
      <BackLink />
      <CollectionTabs active="veri" />

      {/* GİRİŞ = KUTULAR */}
      {!box && (
        <ProductDataTiles
          counts={{
            sezon: seasonsAvailable ? seasons.length : 0,
            usta: manufacturersAvailable ? manufacturers.length : 0,
            hammadde: materialsAvailable ? materials.length : 0,
          }}
        />
      )}

      {box && (
        <Link
          href="/collection/veri"
          className="-ml-1 mb-2 inline-flex items-center gap-1 text-[13px] font-medium text-muted transition-colors duration-150 hover:text-ink"
        >
          <ChevronLeft size={15} aria-hidden /> Ürün verisi
        </Link>
      )}

      <div className="grid items-start gap-5">
        {box === "sezon" && seasonsAvailable && (
          <SettingsSection
            title="Sezonlar"
            description="Koleksiyon, Maliyet ve Ödeme Tablosu seçili sezona göre süzülür. Aktif sezon üst çubukta ilk gelen ve yeni föyün varsayılanıdır."
            aside={<CountChip n={seasons.length} birim="sezon" />}
          >
            <SeasonsManager seasons={seasons} sheetCounts={seasonCounts} canManage={isAdmin} />
          </SettingsSection>
        )}

        {box === "usta" && manufacturersAvailable && (
          <SettingsSection
            title="Üreticiler (Ustalar)"
            description="Föydeki “Üretici” alanı ve Ödeme Tablosu buradan beslenir. Teslim süresi ve minimum adet sipariş verirken lazım olur."
            aside={<CountChip n={manufacturers.length} birim="usta" />}
          >
            <ManufacturersManager
              manufacturers={manufacturers}
              sheetCounts={sheetCounts}
              canManage={isAdmin}
            />
          </SettingsSection>
        )}

        {box === "hammadde" && materialsAvailable && (
          <div>
            <SettingsSection
              title="Hammadde"
              description="Kumaş ve aksesuarlar burada bir kez tanımlanır. Föyün reçetesine eklenince maliyet hesaplanır; fiyat burada değişince tüm föyler güncellenir."
              aside={<CountChip n={materials.length} birim="malzeme" />}
            >
              <MaterialsManager
                materials={materials}
                suppliers={suppliers}
                usageCounts={materialUsage}
                canManage={isAdmin}
              />
            </SettingsSection>
          </div>
        )}
      </div>
    </div>
  );
}
