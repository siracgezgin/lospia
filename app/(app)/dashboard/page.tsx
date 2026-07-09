import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { MemberDashboardView } from "@/components/dashboard/MemberDashboardView";
import { buildDeptMeta } from "@/lib/utils/departments";
import {
  getAdminPointsData, getMemberPointsSummary, getMemberDashboardData,
} from "@/lib/points/queries";
import type { TaskStatus, WorkspaceDepartment } from "@/types";

export const metadata = { title: "Gösterge Paneli" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1);
  const workspaceId = memberRows?.[0]?.workspace_id;
  if (!workspaceId) return <div className="p-8 text-muted">No workspace found.</div>;
  const isAdmin = memberRows?.[0]?.role === "owner" || memberRows?.[0]?.role === "admin";

  // Everyone gets their own personal points summary (members never see others').
  const memberPoints = await getMemberPointsSummary(supabase, workspaceId, user.id);

  // ── Member dashboard = strictly personal. We never fetch workspace-wide task
  //    counts, department rollups, contributors or the ledger for a member, so
  //    no global operations data is ever sent to a non-admin client. ──────────
  if (!isAdmin) {
    const personal = await getMemberDashboardData(supabase, workspaceId, user.id);
    return <MemberDashboardView data={personal} points={memberPoints} />;
  }

  // ── Admin / Sistem Admini dashboard = the team / operations view. ───────────
  const adminPoints = await getAdminPointsData(supabase, workspaceId);

  // Aggregations via RPC (status counts, time, due-soon) plus two light reads we
  // fold down server-side — the department breakdown and a short activity feed.
  // Only derived/aggregated data crosses to the client, never a full task dump.
  const [statusResult, timeResult, dueSoonResult, deptResult, activeResult, recentResult] =
    await Promise.all([
      supabase.rpc("get_tasks_by_status", { p_workspace_id: workspaceId }),
      supabase.rpc("get_time_logged_this_week", {
        p_workspace_id: workspaceId,
        p_user_id: user.id,
      }),
      supabase.rpc("get_due_soon_tasks", { p_workspace_id: workspaceId }),
      supabase
        .from("workspace_departments")
        .select("id, parent_id, name, color_key")
        .eq("workspace_id", workspaceId)
        .order("position"),
      supabase
        .from("tasks")
        .select("id, department_id, due_date")
        .eq("workspace_id", workspaceId)
        .not("status", "in", "(done,archived)"),
      supabase
        .from("tasks")
        .select("id, title, status, department_id, updated_at")
        .eq("workspace_id", workspaceId)
        .neq("status", "archived")
        .order("updated_at", { ascending: false })
        .limit(6),
    ]);

  const today = new Date().toISOString().slice(0, 10);
  const departments = (deptResult.data ?? []) as Pick<
    WorkspaceDepartment,
    "id" | "parent_id" | "name" | "color_key"
  >[];
  const deptMeta = buildDeptMeta(departments);

  // Roll every department up to its top-level parent so the breakdown stays
  // compact (sub-teams contribute to their parent's totals).
  const byId = new Map(departments.map((d) => [d.id, d]));
  const topLevelOf = (id: string): string => {
    let d = byId.get(id);
    let guard = 0;
    while (d?.parent_id && guard++ < 10) d = byId.get(d.parent_id);
    return d?.id ?? id;
  };

  const acc = new Map<string, { active: number; overdue: number }>();
  for (const t of (activeResult.data ?? []) as {
    id: string; department_id: string | null; due_date: string | null;
  }[]) {
    if (!t.department_id) continue;
    const topId = topLevelOf(t.department_id);
    const cur = acc.get(topId) ?? { active: 0, overdue: 0 };
    cur.active += 1;
    if (t.due_date && t.due_date < today) cur.overdue += 1;
    acc.set(topId, cur);
  }

  const departmentStats = departments
    .filter((d) => d.parent_id === null && acc.has(d.id))
    .map((d) => ({
      name: deptMeta[d.id]?.name ?? d.name,
      color: deptMeta[d.id]?.color ?? null,
      active: acc.get(d.id)!.active,
      overdue: acc.get(d.id)!.overdue,
    }))
    .sort((a, b) => b.active - a.active);

  const recentTasks = ((recentResult.data ?? []) as {
    id: string; title: string; status: TaskStatus; department_id: string | null; updated_at: string;
  }[]).map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    deptName: t.department_id ? deptMeta[t.department_id]?.name ?? null : null,
    deptColor: t.department_id ? deptMeta[t.department_id]?.color ?? null : null,
    updated_at: t.updated_at,
  }));

  return (
    <DashboardView
      tasksByStatus={statusResult.data ?? []}
      timeLoggedSeconds={timeResult.data ?? 0}
      dueSoonTasks={dueSoonResult.data ?? []}
      departmentStats={departmentStats}
      recentTasks={recentTasks}
      isAdmin={isAdmin}
      adminPoints={adminPoints}
      memberPoints={memberPoints}
    />
  );
}
