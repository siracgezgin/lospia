import type { WorkspaceDepartment } from "@/types";

export type DeptMeta = { name: string; color: string | null };

/**
 * Build a map of department id → { name, effective color_key }. Sub-departments
 * inherit their top-level parent's color_key when they don't define their own,
 * so a task on a child department still shows the department family colour.
 */
export function buildDeptMeta(
  departments: Pick<WorkspaceDepartment, "id" | "parent_id" | "name" | "color_key">[],
): Record<string, DeptMeta> {
  const byId = new Map(departments.map((d) => [d.id, d]));
  const meta: Record<string, DeptMeta> = {};
  for (const d of departments) {
    let color = d.color_key ?? null;
    if (!color && d.parent_id) {
      const parent = byId.get(d.parent_id);
      color = parent?.color_key ?? null;
    }
    meta[d.id] = { name: d.name, color };
  }
  return meta;
}
