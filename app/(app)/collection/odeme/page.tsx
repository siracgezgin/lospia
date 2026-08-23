/**
 * Ödeme Tablosu — Aslı Hanım (2026-08-19): "Bu maliyet değil, bu ödeme
 * tablosu. Usta başına ödememesi. Hakan Usta ödeme tablosu. Bu kalsın."
 * Maliyet AYRI ekrandır: /collection/maliyet
 */
import { redirect } from "next/navigation";
import { HandCoins } from "lucide-react";
import { requireModuleMember } from "@/lib/modules/context";
import { resolveSeasonId } from "@/lib/collection/season";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { SetupRequiredNotice } from "@/components/modules/SetupRequiredNotice";
import { maybeDatabaseSetupRequired } from "@/lib/utils/supabase-errors";
import { PaymentTable } from "@/components/collection/PaymentTable";
import type { ProductionSheet, Manufacturer } from "@/types";

export const dynamic = "force-dynamic";

const PAYMENT_COLUMNS =
  "id, title, product_kind, producer, manufacturer_id, category, subcategory, pricing, size_distribution, status";

export default async function PaymentPage({
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
    .select(PAYMENT_COLUMNS)
    .eq("workspace_id", workspaceId)
    .neq("status", "archived")
    .order("category", { ascending: true, nullsFirst: false })
    .order("title", { ascending: true });
  if (seasonId) query.eq("season_id", seasonId);
  const result = await query;

  const setup = maybeDatabaseSetupRequired(result.error);
  if (setup.setupRequired) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <ModulePageHeader
          title="Payment Table"
          description="Usta başına ödeme — hangi usta hangi ürünü dikti, ne kadar ödenecek."
          icon={HandCoins}
          secondaryBackHref="/collection"
        />
        <SetupRequiredNotice
          variant="block"
          title="Koleksiyon tablosu henüz oluşturulmadı"
          message={setup.message ?? "Ödeme tablosu için veritabanı güncellemesi bekleniyor."}
          technicalDetail={isAdmin ? setup.technicalDetail : null}
        />
      </div>
    );
  }

  const rows = (result.data ?? []) as unknown as Pick<
    ProductionSheet,
    "id" | "title" | "product_kind" | "producer" | "manufacturer_id" | "category" | "subcategory" | "pricing" | "size_distribution" | "status"
  >[];

  // Usta kayıtları — gruplama artık serbest metne değil BUNA göre yapılır.
  // Tablo migrate edilmemişse boş liste döner ve tablo eski metin gruplamasına
  // düşer (geri uyum).
  const mResult = await supabase
    .from("workspace_manufacturers")
    .select("id, name, photo_url, city, country, currency, lead_time_days, min_order_qty, is_active")
    .eq("workspace_id", workspaceId);
  const manufacturers = (mResult.data ?? []) as Pick<
    Manufacturer,
    "id" | "name" | "photo_url" | "city" | "country" | "currency" | "lead_time_days" | "min_order_qty" | "is_active"
  >[];

  return <PaymentTable rows={rows} manufacturers={manufacturers} seasons={seasons} />;
}
