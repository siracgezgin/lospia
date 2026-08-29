import { redirect, notFound } from "next/navigation";
import { Table2 } from "lucide-react";
import { requireModuleMember } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { SetupRequiredNotice } from "@/components/modules/SetupRequiredNotice";
import { maybeDatabaseSetupRequired } from "@/lib/utils/supabase-errors";
import { SheetDetailView } from "@/components/sheets/SheetDetailView";
import type { OperationSpreadsheet, WorkspaceDepartment } from "@/types";

export const dynamic = "force-dynamic";

export default async function SheetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user, workspaceId, isAdmin, gate } = await requireModuleMember();
  if (gate === "login") redirect("/login");
  if (gate !== "ok" || !workspaceId || !user) return <AccessDenied />;

  const sheetResult = await supabase
    .from("operation_spreadsheets")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const setup = maybeDatabaseSetupRequired(sheetResult.error);
  if (setup.setupRequired) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 lg:px-8">
        <ModulePageHeader
          title="Sheets"
          description="Excel/CSV düzenlerini ve operasyon tablolarını Lospia içinde güvenli şekilde takip edin."
          icon={Table2}
          backHref="/sheets"
          backLabel="Tablo Merkezi’ne dön"
        />
        <SetupRequiredNotice
          variant="block"
          title="Tablo Merkezi tablosu henüz oluşturulmadı"
          message={
            setup.message ??
            "Tablo Merkezi için veritabanı güncellemesi bekleniyor. Migration uygulandıktan sonra bu ekran aktif olacak."
          }
          technicalDetail={isAdmin ? setup.technicalDetail : null}
        />
      </div>
    );
  }

  const sheet = sheetResult.data as OperationSpreadsheet | null;
  if (!sheet) notFound();

  const [deptsResult, tasksResult, contactsResult] = await Promise.all([
    supabase
      .from("workspace_departments")
      .select("id, parent_id, name, color_key")
      .eq("workspace_id", workspaceId)
      .is("parent_id", null)
      .order("position"),
    supabase
      .from("tasks")
      .select("id, title")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("workspace_contacts")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .order("name"),
  ]);

  return (
    <SheetDetailView
      sheet={sheet}
      departments={(deptsResult.data ?? []) as WorkspaceDepartment[]}
      tasks={(tasksResult.data ?? []) as { id: string; title: string }[]}
      contacts={(contactsResult.data ?? []) as { id: string; name: string }[]}
      currentUserId={user.id}
      isAdmin={isAdmin}
    />
  );
}
