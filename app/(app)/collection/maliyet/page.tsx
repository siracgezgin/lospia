import { redirect } from "next/navigation";
import { Wallet } from "lucide-react";
import { requireModuleMember } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { SetupRequiredNotice } from "@/components/modules/SetupRequiredNotice";
import { maybeDatabaseSetupRequired } from "@/lib/utils/supabase-errors";
import { CostBreakdownTable } from "@/components/collection/CostBreakdownTable";
import type { ProductionSheet } from "@/types";

export const dynamic = "force-dynamic";

const COST_COLUMNS =
  "id, title, product_kind, producer, category, subcategory, pricing, size_distribution, status";

export default async function CostPage() {
  const { supabase, user, workspaceId, isAdmin, gate } = await requireModuleMember();
  if (gate === "login") redirect("/login");
  if (gate !== "ok" || !workspaceId || !user) return <AccessDenied />;

  const result = await supabase
    .from("production_sheets")
    .select(COST_COLUMNS)
    .eq("workspace_id", workspaceId)
    .neq("status", "archived")
    .order("category", { ascending: true, nullsFirst: false })
    .order("title", { ascending: true });

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

  return <CostBreakdownTable rows={rows} />;
}
