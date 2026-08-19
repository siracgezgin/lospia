/**
 * Ödeme Tablosu — Aslı Hanım (2026-08-19): "Bu maliyet değil, bu ödeme
 * tablosu. Usta başına ödememesi. Hakan Usta ödeme tablosu. Bu kalsın."
 * Maliyet AYRI ekrandır: /collection/maliyet
 */
import { redirect } from "next/navigation";
import { HandCoins } from "lucide-react";
import { requireModuleMember } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { SetupRequiredNotice } from "@/components/modules/SetupRequiredNotice";
import { maybeDatabaseSetupRequired } from "@/lib/utils/supabase-errors";
import { PaymentTable } from "@/components/collection/PaymentTable";
import type { ProductionSheet } from "@/types";

export const dynamic = "force-dynamic";

const PAYMENT_COLUMNS =
  "id, title, product_kind, producer, category, subcategory, pricing, size_distribution, status";

export default async function PaymentPage() {
  const { supabase, user, workspaceId, isAdmin, gate } = await requireModuleMember();
  if (gate === "login") redirect("/login");
  if (gate !== "ok" || !workspaceId || !user) return <AccessDenied />;

  const result = await supabase
    .from("production_sheets")
    .select(PAYMENT_COLUMNS)
    .eq("workspace_id", workspaceId)
    .neq("status", "archived")
    .order("category", { ascending: true, nullsFirst: false })
    .order("title", { ascending: true });

  const setup = maybeDatabaseSetupRequired(result.error);
  if (setup.setupRequired) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <ModulePageHeader
          title="Ödeme Tablosu"
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
    "id" | "title" | "product_kind" | "producer" | "category" | "subcategory" | "pricing" | "size_distribution" | "status"
  >[];

  return <PaymentTable rows={rows} />;
}
