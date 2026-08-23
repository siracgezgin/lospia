import { redirect } from "next/navigation";
import { Wallet } from "lucide-react";
import { requireModuleMember } from "@/lib/modules/context";
import { resolveSeasonId } from "@/lib/collection/season";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { SetupRequiredNotice } from "@/components/modules/SetupRequiredNotice";
import { maybeDatabaseSetupRequired } from "@/lib/utils/supabase-errors";
import { CostBreakdownTable } from "@/components/collection/CostBreakdownTable";
import type { ProductionSheet } from "@/types";
import type { BomLite } from "@/components/collection/CostBreakdownTable";

export const dynamic = "force-dynamic";

const COST_COLUMNS =
  "id, title, product_kind, producer, category, subcategory, pricing, size_distribution, status";

export default async function CostPage({
  searchParams,
}: {
  searchParams: Promise<{ sezon?: string }>;
}) {
  const { supabase, user, workspaceId, isAdmin, gate } = await requireModuleMember();
  if (gate === "login") redirect("/login");
  if (gate !== "ok" || !workspaceId || !user) return <AccessDenied />;

  const sp = await searchParams;

  // Sezon bağlamı — Koleksiyon ile AYNI seçim (Zedonk `SS 21 - WW` deseni).
  const seasonsRes = await supabase
    .from("workspace_seasons")
    .select("id, name, is_current")
    .eq("workspace_id", workspaceId)
    .order("is_current", { ascending: false })
    .order("position")
    .order("name", { ascending: false });
  const seasons = (seasonsRes.data ?? []) as { id: string; name: string; is_current: boolean }[];
  const seasonId = resolveSeasonId(sp?.sezon, seasons);

  const query = supabase
    .from("production_sheets")
    .select(COST_COLUMNS)
    .eq("workspace_id", workspaceId)
    .neq("status", "archived")
    .order("category", { ascending: true, nullsFirst: false })
    .order("title", { ascending: true });
  // Sezonu OLMAYAN föyler her sezon bağlamında görünür.
  // Gerekçe: prod'daki föylerin bir kısmında sezon metni hiç yoktu (taşımada
  // 12 föyün yalnız 5'i bağlandı). Katı `eq` süzgeci bunları aktif sezonda
  // gizlerdi ve kullanıcıya VERİ KAYBI gibi görünürdü. Sezonsuz föy bir
  // "eksik", saklanacak bir şey değil — görünür kalır, Koleksiyon'da uyarı
  // ile sezona atanması istenir.
  if (seasonId) query.or(`season_id.eq.${seasonId},season_id.is.null`);
  const result = await query;

  const setup = maybeDatabaseSetupRequired(result.error);
  if (setup.setupRequired) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <ModulePageHeader
          title="Cost"
          description="Her ürünün birim maliyeti kalem kalem — kumaş, dikim, fermuar, ütü/paket, kalıp, genel giderler."
          icon={Wallet}
          secondaryBackHref="/collection"
        />
        <SetupRequiredNotice
          variant="block"
          title="Koleksiyon tablosu henüz oluşturulmadı"
          message={setup.message ?? "Maliyet için veritabanı güncellemesi bekleniyor."}
          technicalDetail={isAdmin ? setup.technicalDetail : null}
        />
      </div>
    );
  }

  const rows = (result.data ?? []) as unknown as Pick<
    ProductionSheet,
    "id" | "title" | "product_kind" | "producer" | "category" | "subcategory" | "pricing" | "size_distribution" | "status"
  >[];

  // Tüm föylerin reçeteleri — maliyetin malzeme kalemleri buradan gelir.
  // Tablo migrate edilmemişse boş dizi; tablo elle girilen kalemlere düşer.
  const bomRes = await supabase
    .from("production_sheet_materials")
    .select("sheet_id, consumption, waste_pct, material:workspace_materials(id, category, unit_price)")
    .eq("workspace_id", workspaceId);
  const bomBySheet: Record<string, BomLite[]> = {};
  for (const r of (bomRes.data ?? []) as unknown as (BomLite & { sheet_id: string })[]) {
    (bomBySheet[r.sheet_id] ??= []).push(r);
  }

  return <CostBreakdownTable rows={rows} seasons={seasons} bomBySheet={bomBySheet} />;
}
