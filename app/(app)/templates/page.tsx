import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { requireModuleMember } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { SetupRequiredNotice } from "@/components/modules/SetupRequiredNotice";
import { maybeDatabaseSetupRequired } from "@/lib/utils/supabase-errors";
import { TemplatesView } from "@/components/templates/TemplatesView";
import type { DocumentTemplate, WorkspaceDepartment } from "@/types";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const { supabase, user, workspaceId, isAdmin, gate } = await requireModuleMember();
  if (gate === "login") redirect("/login");
  if (gate !== "ok" || !workspaceId || !user) return <AccessDenied />;

  const templatesResult = await supabase
    .from("document_templates")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });

  // Graceful shell while the office-center migration is not applied yet.
  const setup = maybeDatabaseSetupRequired(templatesResult.error);
  if (setup.setupRequired) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <ModulePageHeader
          title="Templates"
          description="Format e-postalar, müşteri mesajları, üretici briefleri ve operasyon metinlerini tek merkezde yönetin."
          icon={FileText}
          secondaryBackHref="/board"
        />
        <SetupRequiredNotice
          variant="block"
          title="Şablon Kütüphanesi tablosu henüz oluşturulmadı"
          message={
            setup.message ??
            "Şablon Kütüphanesi için veritabanı güncellemesi bekleniyor. Migration uygulandıktan sonra bu ekran aktif olacak."
          }
          technicalDetail={isAdmin ? setup.technicalDetail : null}
        />
      </div>
    );
  }

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

  const templates = (templatesResult.data ?? []) as DocumentTemplate[];
  const departments = (deptsResult.data ?? []) as WorkspaceDepartment[];
  const tasks = (tasksResult.data ?? []) as { id: string; title: string }[];
  const contacts = (contactsResult.data ?? []) as { id: string; name: string }[];

  return (
    <TemplatesView
      templates={templates}
      departments={departments}
      tasks={tasks}
      contacts={contacts}
      currentUserId={user.id}
      isAdmin={isAdmin}
    />
  );
}
