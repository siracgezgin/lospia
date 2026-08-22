import { redirect } from "next/navigation";
import { requireModuleMember } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { ProductionSheetEditor } from "@/components/production/ProductionSheetEditor";
import type { ProductionSheet, Manufacturer } from "@/types";

export const dynamic = "force-dynamic";

export default async function ProductionSheetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user, workspaceId, isAdmin, gate } = await requireModuleMember();
  if (gate === "login") redirect("/login");
  if (gate !== "ok" || !workspaceId || !user) return <AccessDenied />;

  // Üye adları — oluşturan/son giren rozetleri için.
  const membersResult = await supabase
    .from("workspace_members")
    .select("user_id, profiles(id, full_name, email)")
    .eq("workspace_id", workspaceId);
  const memberNames: Record<string, string> = {};
  for (const m of membersResult.data ?? []) {
    const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as
      | { id: string; full_name: string | null; email: string | null }
      | null;
    if (p) memberNames[m.user_id as string] = p.full_name || p.email || "—";
  }

  // Üretici (usta) listesi — föydeki "Üretici" alanı artık seçim.
  // Tablo henüz migrate edilmediyse boş liste döner ve alan serbest metne
  // düşer; föy açılmaya devam eder.
  const manufacturersResult = await supabase
    .from("workspace_manufacturers")
    .select("id, name, is_active, lead_time_days, min_order_qty, currency, city")
    .eq("workspace_id", workspaceId)
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });
  const manufacturers = (manufacturersResult.data ?? []) as Pick<
    Manufacturer, "id" | "name" | "is_active" | "lead_time_days" | "min_order_qty" | "currency" | "city"
  >[];

  // "new" → boş föy oluşturma modu.
  if (id === "new") {
    return (
      <ProductionSheetEditor
        sheet={null}
        memberNames={memberNames}
        manufacturers={manufacturers}
        isAdmin={isAdmin}
        currentUserId={user.id}
      />
    );
  }

  const { data, error } = await supabase
    .from("production_sheets")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error || !data) {
    redirect("/production");
  }

  return (
    <ProductionSheetEditor
      sheet={data as unknown as ProductionSheet}
      memberNames={memberNames}
      manufacturers={manufacturers}
      isAdmin={isAdmin}
      currentUserId={user.id}
    />
  );
}
