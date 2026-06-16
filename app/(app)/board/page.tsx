import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { KanbanBoard } from "@/components/board/KanbanBoard";
import type { Task, SavedView } from "@/types";

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;

  // Get workspace
  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1);
  const workspaceId = memberRows?.[0]?.workspace_id;
  if (!workspaceId) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-sm text-center">
          <h2 className="text-base font-semibold text-gray-800 mb-2">Çalışma alanı bulunamadı</h2>
          <p className="text-sm text-gray-500 mb-4">
            Çalışma alanınız yüklenemedi. Bu genellikle geçici bir sorundur.
          </p>
          <a
            href="/board"
            className="inline-block text-sm text-blue-600 hover:underline"
          >
            Yenile
          </a>
        </div>
      </div>
    );
  }

  // Fetch tasks and saved views
  const [tasksResult, viewsResult] = await Promise.all([
    supabase
      .from("tasks")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("fractional_index"),
    supabase
      .from("saved_views")
      .select("*")
      .eq("workspace_id", workspaceId)
      .or(`is_shared.eq.true,owner_id.eq.${user.id}`)
      .order("position"),
  ]);

  const tasks: Task[] = tasksResult.data ?? [];
  const savedViews: SavedView[] = viewsResult.data ?? [];
  const activeViewId = params.view ?? null;

  return (
    <KanbanBoard
      tasks={tasks}
      savedViews={savedViews}
      activeViewId={activeViewId}
      workspaceId={workspaceId}
      userId={user.id}
    />
  );
}
