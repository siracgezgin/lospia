import { redirect } from "next/navigation";
import { FolderOpen } from "lucide-react";
import { requireModuleMember } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { SetupRequiredNotice } from "@/components/modules/SetupRequiredNotice";
import { maybeDatabaseSetupRequired } from "@/lib/utils/supabase-errors";
import { DocumentsView } from "@/components/documents/DocumentsView";
import type { DocFolder } from "@/components/documents/DocumentFiles";
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
          title="Documents"
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

  // Klasör ağacı (20240312). RLS görünürlüğe göre süzer: 'admin' klasörleri
  // üyeye hiç dönmez. Tablo migrate edilmemişse boş liste → bölüm çizilmez.
  const foldersRes = await supabase
    .from("document_folders")
    .select("id, parent_id, name, visibility")
    .eq("workspace_id", workspaceId)
    .order("position")
    .order("name");
  const folders = (foldersRes.data ?? []) as DocFolder[];
  const filesAvailable = !foldersRes.error;
  // Yüklenmiş dosyalar — bağlantı kayıtlarından ayrı (document_type = 'file').
  const files = documents
    .filter((d) => (d as { document_type?: string }).document_type === "file")
    .map((d) => {
      const r = d as unknown as Record<string, unknown>;
      return {
        id: r.id as string,
        title: r.title as string,
        folder_id: (r.folder_id as string | null) ?? null,
        file_name: (r.file_name as string | null) ?? null,
        file_size: (r.file_size as number | null) ?? null,
        file_mime: (r.file_mime as string | null) ?? null,
        created_by: (r.created_by as string | null) ?? null,
        created_at: r.created_at as string,
      };
    });

  return (
    <DocumentsView
      documents={documents}
      folders={folders}
      files={files}
      filesAvailable={filesAvailable}
      departments={departments}
      tasks={tasks}
      contacts={contacts}
      memberNames={memberNames}
      currentUserId={user.id}
      isAdmin={isAdmin}
    />
  );
}
