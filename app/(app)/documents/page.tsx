import { redirect } from "next/navigation";
import { FolderOpen } from "lucide-react";
import { requireModuleMember } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { SetupRequiredNotice } from "@/components/modules/SetupRequiredNotice";
import { maybeDatabaseSetupRequired } from "@/lib/utils/supabase-errors";
import { DocumentsView } from "@/components/documents/DocumentsView";
import type { OperationDocument, WorkspaceDepartment } from "@/types";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const { supabase, user, workspaceId, isAdmin, gate } = await requireModuleMember();
  if (gate === "login") redirect("/login");
  if (gate !== "ok" || !workspaceId || !user) return <AccessDenied />;

  const documentsResult = await supabase
    .from("operation_documents")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });

  // Graceful shell while the office-center migration is not applied yet.
  const setup = maybeDatabaseSetupRequired(documentsResult.error);
  if (setup.setupRequired) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <ModulePageHeader
          title="Doküman Merkezi"
          description="Drive, Canva, Word, Excel ve operasyon dokümanlarını Lospia içinde bağlantı ve görev ilişkisiyle yönetin."
          icon={FolderOpen}
          secondaryBackHref="/board"
        />
        <SetupRequiredNotice
          variant="block"
          title="Doküman Merkezi tablosu henüz oluşturulmadı"
          message={
            setup.message ??
            "Doküman Merkezi için veritabanı güncellemesi bekleniyor. Migration uygulandıktan sonra bu ekran aktif olacak."
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

  const documents = (documentsResult.data ?? []) as OperationDocument[];
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
    <DocumentsView
      documents={documents}
      departments={departments}
      tasks={tasks}
      contacts={contacts}
      memberNames={memberNames}
      currentUserId={user.id}
      isAdmin={isAdmin}
    />
  );
}
