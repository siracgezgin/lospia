
import { redirectToSignIn } from "@/lib/auth/session-redirect";
import { requireModuleMember } from "@/lib/modules/context";
import { isMissingSchemaError } from "@/lib/utils/supabase-errors";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { CollectionTabs } from "@/components/collection/PaymentTable";
import { SettingsSection, CountChip } from "@/components/settings/SettingsSection";
import { ManufacturersManager, type ManagerManufacturer } from "@/components/settings/ManufacturersManager";
import { SeasonsManager, type ManagerSeason } from "@/components/settings/SeasonsManager";
import { MaterialsManager, type ManagerMaterial } from "@/components/settings/MaterialsManager";
import { ProductDataTiles } from "@/components/collection/ProductDataTiles";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/** Fihrist sorgusu — `photos` kolonu olmadan da çalışabilsin diye tek yerde. */
function manufacturersQuery(
  supabase: Awaited<ReturnType<typeof requireModuleMember>>["supabase"],
  workspaceId: string,
  withPhotos: boolean,
) {
  const base = "id, name, photo_url, city, country, currency, lead_time_days, min_order_qty, contact_name, phone, email, notes, is_active, role, address";
  return supabase
    .from("workspace_manufacturers")
    .select(withPhotos ? `${base}, photos` : base)
    .eq("workspace_id", workspaceId)
    .order("is_active", { ascending: false })
    .order("name");
}

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
    manufacturersQuery(supabase, workspaceId, true),
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

  /* KARTELA KOLONU YOKSA BÖLÜM KAYBOLMASIN. `photos` 20240355 ile geldi ve
     migration'ı kullanıcı elle uyguluyor; kolon yokken PostgREST sorguyu
     komple reddediyor ve Fihrist sessizce gizleniyordu (aynı tuzağa
     `workspace_materials.role` ile bir kez düşülmüştü, 23.09.2026).
     Kolonsuz bir kez daha denenir; o durumda yalnız kartelalar görünmez. */
  let mRes = manufacturersResult;
  if (mRes.error && isMissingSchemaError(mRes.error)) {
    mRes = await manufacturersQuery(supabase, workspaceId, false);
  }
  /* Sütun listesi koşullu olduğu için PostgREST'in tip çıkarımı kapanıyor;
     şekli biz biliyoruz. */
  const manufacturers = (mRes.data ?? []) as unknown as ManagerManufacturer[];
  const manufacturersAvailable = !mRes.error;
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
      {/* Başlık uygulama çubuğunda; ekran sekme şeridiyle başlar.
          "Collection › Product Data" zinciri KALDIRILDI: kardeş sekmelerin
          (Production Sheets · Cost · Payment Table) hiçbirinde yok, dolayısıyla
          bu sekmeye geçildiğinde şerit bir satır aşağı kayıyordu — sekme
          satırının her sekmede aynı yerde durması bu ekranın kuralıydı. Üst
          kategoriye dönüş zaten sekmelerin kendisi. */}
      <h1 className="sr-only">Product Data</h1>
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

      {/* GERİ DÖNÜŞ HER EKRANDA AYNI DÜĞME. Koleksiyon'da "Kategoriler",
          Ödeme Tablosu'nda "Ustalar" ikincil düğmeyle dönüyor; burası tek
          başına soluk bir metin bağlantısıydı — aynı iş, üçüncü bir görünüm.
          `Button` primitifi bir <button> çizdiği için sınıfları taşınıyor
          (bağlantı olmalı: sunucu bileşeni, yeni sekmede de açılabilsin). */}
      {box && (
        <Link
          href="/collection/veri"
          className="mb-3 inline-flex h-8 items-center gap-1.5 rounded-control border border-line bg-surface px-3 text-[13px] font-medium text-ink shadow-card transition-[background-color,border-color,color] duration-150 ease-standard hover:border-line-strong hover:bg-surface-muted active:scale-[0.98] pointer-coarse:h-10"
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
            title="Fihrist — Üretici, Kalıpçı, Nakışçı"
            description="Dışarıdan çalıştığımız herkesin defteri: ad, rol, cep telefonu, adres ve e-posta. Föydeki “Üretici”, “Kalıpçı” ve “Nakışçı” seçicileri ile Ödeme Tablosu buradan beslenir."
            aside={<CountChip n={manufacturers.length} birim="kayıt" />}
          >
            {/* Ekleme/düzeltme ÜYEYE açık (20240356) — föyü dolduran kişi
                listede olmayan ustayı buradan da açabilmeli. Silme
                yöneticide: usta birden çok föye bağlı olabiliyor. */}
            <ManufacturersManager
              manufacturers={manufacturers}
              sheetCounts={sheetCounts}
              canManage
              canDelete={isAdmin}
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
