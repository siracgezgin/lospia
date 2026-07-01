import { redirect } from "next/navigation";
import { Link2 } from "lucide-react";
import { requireModuleAdmin } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { CreativeView } from "@/components/creative/CreativeView";
import type { CreativeAsset, WorkspaceDepartment } from "@/types";

export const dynamic = "force-dynamic";

// True when the creative_assets table hasn't been migrated on this DB yet.
function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42P01" || /relation .*creative_assets.* does not exist/i.test(err.message ?? "");
}

export default async function CreativePage({
  searchParams,
}: {
  searchParams: Promise<{ provider?: string }>;
}) {
  const params = await searchParams;
  const initialProvider = typeof params.provider === "string" ? params.provider : "";

  const { supabase, user, workspaceId, isAdmin, gate } = await requireModuleAdmin();
  if (gate === "login") redirect("/login");
  if (gate !== "ok" || !workspaceId || !user) return <AccessDenied />;

  const assetsResult = await supabase
    .from("creative_assets")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  // Graceful state when the migration hasn't been applied to this environment.
  if (assetsResult.error && isMissingTable(assetsResult.error)) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-6 shadow-card">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
            <Link2 size={18} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-ink">Kreatif Linkler</h1>
            <p className="mt-1 text-[13.5px] text-muted">
              Bu modül hazırlanıyor. Kayıt alanı henüz bu ortamda etkin değil; kısa süre
              içinde açılacaktır.
            </p>
          </div>
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
