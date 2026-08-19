import { redirect } from "next/navigation";
import { Table2 } from "lucide-react";
import { requireModuleMember } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { SetupRequiredNotice } from "@/components/modules/SetupRequiredNotice";
import { maybeDatabaseSetupRequired } from "@/lib/utils/supabase-errors";
import { SheetsView, type SheetListItem } from "@/components/sheets/SheetsView";
import type { WorkspaceDepartment } from "@/types";

export const dynamic = "force-dynamic";

// Meta columns only — the JSONB snapshot stays on the detail page so the list
// never ships megabytes of cell data.
const SHEET_LIST_COLUMNS =
  "id, workspace_id, title, description, sheet_type, department_id, related_task_id, " +
  "related_contact_id, status, owner_id, tags, metadata, created_by, archived_at, " +
  "created_at, updated_at";

export default async function SheetsPage() {
  const { supabase, user, workspaceId, isAdmin, gate } = await requireModuleMember();
  if (gate === "login") redirect("/login");
  if (gate !== "ok" || !workspaceId || !user) return <AccessDenied />;

  const sheetsResult = await supabase
    .from("operation_spreadsheets")
    .select(SHEET_LIST_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });

  // Graceful shell while the office-center migration is not applied yet.
  const setup = maybeDatabaseSetupRequired(sheetsResult.error);
  if (setup.setupRequired) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <ModulePageHeader
          title="Sheets"
          description="Excel/CSV düzenlerini ve operasyon tablolarını Lospia içinde güvenli şekilde takip edin."
          icon={Table2}
          secondaryBackHref="/board"
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

  const [deptsResult, tasksResult, contactsResult, membersResult] = await Promise.all([
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
    supabase
      .from("workspace_members")
      .select("user_id, profiles(id, full_name, email)")
      .eq("workspace_id", workspaceId),
  ]);

  const sheets = (sheetsResult.data ?? []) as unknown as SheetListItem[];
  const departments = (deptsResult.data ?? []) as WorkspaceDepartment[];
  const tasks = (tasksResult.data ?? []) as { id: string; title: string }[];
  const contacts = (contactsResult.data ?? []) as { id: string; name: string }[];
  const memberNames: Record<string, string> = {};
  for (const m of membersResult.data ?? []) {
    const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as
      | { id: string; full_name: string | null; email: string | null }
      | null;
    if (p) memberNames[m.user_id as string] = p.full_name || p.email || "—";
  }

  return (
    <SheetsView
      sheets={sheets}
      departments={departments}
      tasks={tasks}
      contacts={contacts}
      memberNames={memberNames}
      currentUserId={user.id}
      isAdmin={isAdmin}
    />
  );
}
