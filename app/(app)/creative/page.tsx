import { redirect } from "next/navigation";
import { Link2 } from "lucide-react";
import { requireModuleMember } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { CreativeView } from "@/components/creative/CreativeView";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { SetupRequiredNotice } from "@/components/modules/SetupRequiredNotice";
import { maybeDatabaseSetupRequired } from "@/lib/utils/supabase-errors";
import type { CreativeAsset, WorkspaceDepartment } from "@/types";

export const dynamic = "force-dynamic";

export default async function CreativePage({
  searchParams,
}: {
  searchParams: Promise<{ provider?: string }>;
}) {
  const params = await searchParams;
  const initialProvider = typeof params.provider === "string" ? params.provider : "";

  // Herkes görür, yönetici (ve link sahibi) düzenler — RLS üye okumasına açık.
  const { supabase, user, workspaceId, isAdmin, gate } = await requireModuleMember();
  if (gate === "login") redirect("/login");
  if (gate !== "ok" || !workspaceId || !user) return <AccessDenied />;

  const assetsResult = await supabase
    .from("creative_assets")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  // Graceful state when the creative_assets migration hasn't been applied to
  // this environment. Renders a proper module shell (header + back nav + setup
  // notice) instead of a raw PostgREST error, and disables link creation.
  const setup = maybeDatabaseSetupRequired(assetsResult.error);
  if (setup.setupRequired) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <ModulePageHeader
          title="Creative Links"
          description="Canva, Drive ve Figma bağlantılarının kayıt altında tutulacağı alan."
          icon={Link2}
          secondaryBackHref="/board"
        />
        <SetupRequiredNotice
          variant="block"
          title="Kreatif Linkler tablosu henüz oluşturulmadı"
          message={
            setup.message ??
            "Kreatif Linkler tablosu henüz production veritabanında oluşturulmamış. Migration uygulandıktan sonra bağlantı ekleme aktif olacak."
          }
          technicalDetail={isAdmin ? setup.technicalDetail : null}
        />
        <div className="mt-4 rounded-2xl border border-line bg-surface p-5 shadow-card">
          <p className="text-[13px] text-muted">
            Bu modül bir <span className="font-medium text-ink">bağlantı kaydı</span> alanıdır —
            dosya yüklenmez, yalnızca Canva/Drive/Figma bağlantıları ve onay durumu izlenir.
            Kurulum tamamlandığında bu ekran otomatik olarak aktif hâle gelir.
          </p>
        </div>
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

  const assets = (assetsResult.data ?? []) as CreativeAsset[];
  const departments = (deptsResult.data ?? []) as WorkspaceDepartment[];
  const tasks = (tasksResult.data ?? []) as { id: string; title: string }[];
  const contacts = (contactsResult.data ?? []) as { id: string; name: string }[];

  return (
    <CreativeView
      assets={assets}
      departments={departments}
      tasks={tasks}
      contacts={contacts}
      currentUserId={user.id}
      isAdmin={isAdmin}
      initialProvider={initialProvider}
    />
  );
}
