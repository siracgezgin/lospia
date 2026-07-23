import { redirect } from "next/navigation";
import { requireModuleMember } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { ProductionSheetEditor } from "@/components/production/ProductionSheetEditor";
import type { ProductionSheet } from "@/types";

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

  // "new" → boş föy oluşturma modu.
  if (id === "new") {
    return (
      <ProductionSheetEditor sheet={null} memberNames={memberNames} isAdmin={isAdmin} />
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
      isAdmin={isAdmin}
    />
  );
}
