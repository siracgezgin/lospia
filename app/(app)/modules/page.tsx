import { redirect } from "next/navigation";
import { LayoutGrid } from "lucide-react";
import { requireModuleAdmin } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { DEPARTMENT_MODULES } from "@/lib/modules/registry";
import { DepartmentCard } from "@/components/modules/DepartmentCard";

export const dynamic = "force-dynamic";

export default async function ModulesPage() {
  const { supabase, workspaceId, isAdmin, gate } = await requireModuleAdmin();
  if (gate === "login") redirect("/login");
  if (gate !== "ok" || !workspaceId) return <AccessDenied />;

  // Top-level departments → id, to join live task counts by name.
  const { data: deptRows } = await supabase
    .from("workspace_departments")
    .select("id, name")
    .eq("workspace_id", workspaceId)
    .is("parent_id", null);
  const deptIdByName = new Map<string, string>(
    (deptRows ?? []).map((d) => [d.name as string, d.id as string]),
  );

  // Active tasks (not done/archived, not deleted) — used for the light summaries.
  // Non-admins never see admin_only tasks (RLS + explicit filter as a backstop).
  const tasksQuery = supabase
    .from("tasks")
    .select("department_id, status, due_date")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .not("status", "in", "(done,archived)");
  if (!isAdmin) tasksQuery.eq("visibility", "workspace");
  const { data: taskRows } = await tasksQuery;

  const today = new Date().toISOString().slice(0, 10);
  const activeByDept = new Map<string, number>();
  const overdueByDept = new Map<string, number>();
  for (const t of taskRows ?? []) {
    const dept = (t.department_id as string | null) ?? null;
    if (!dept) continue;
    activeByDept.set(dept, (activeByDept.get(dept) ?? 0) + 1);
    if (t.due_date && (t.due_date as string) < today) {
      overdueByDept.set(dept, (overdueByDept.get(dept) ?? 0) + 1);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Page header */}
      <div className="mb-6 flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
          <LayoutGrid size={18} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-ink">Operasyon Modülleri</h1>
            <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10.5px] font-medium text-brand-strong">
              Yönetici operasyon alanı
            </span>
          </div>
          <p className="mt-0.5 text-[13px] text-muted">
            Departmanlara göre ilgili çalışma alanlarına buradan ulaşın. Bazı modüller
            hazırlık aşamasındadır.
          </p>
        </div>
      </div>

      {/* Department grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {DEPARTMENT_MODULES.map((dept) => {
          const id = deptIdByName.get(dept.departmentName);
          return (
            <DepartmentCard
              key={dept.key}
              department={dept}
              activeCount={id ? activeByDept.get(id) ?? 0 : 0}
              overdueCount={id ? overdueByDept.get(id) ?? 0 : 0}
              isAdmin={isAdmin}
            />
          );
        })}
      </div>
    </div>
  );
}
