import type { WorkspaceDepartment } from "@/types";

export type DeptMeta = { name: string; color: string | null };

/**
 * Canonical AF Operasyon top-level department colours, keyed by name.
 *
 * These take precedence over whatever color_key is stored, so the live board is
 * colour-correct regardless of historical seed data. Production data predates
 * two corrections: Marka Yönetimi must be RED (it is the critical CEO layer) and
 * Finans must own a distinct brown/olive tone (the old "green" collided with the
 * reserved completed-task green). Each family is visually distinct so a card's
 * colour alone identifies its department.
 */
const AF_DEPT_COLORS: Record<string, string> = {
  "tasarım & yaratıcı yön": "purple",
  "üretim & tedarik zinciri": "orange",
  "satış & ticaret": "blue",
  "pazarlama & i̇letişim": "pink",
  "pazarlama & iletişim": "pink",
  "finans & operasyon": "brown",
  "marka yönetimi / ceo katmanı": "red",
};

/**
 * Effective colour key for a department: a canonical AF name override wins,
 * otherwise the stored color_key. Sub-departments pass their own name (which
 * won't match a top-level key) and fall back to inheriting the parent's colour.
 */
export function resolveDeptColorKey(name: string, stored: string | null): string | null {
  return AF_DEPT_COLORS[name.trim().toLowerCase()] ?? stored;
}

/**
 * Build a map of department id → { name, effective color }. Sub-departments
 * inherit their top-level parent's colour when they don't define their own, so a
 * task on a child department still shows the department family colour.
 */
export function buildDeptMeta(
  departments: Pick<WorkspaceDepartment, "id" | "parent_id" | "name" | "color_key">[],
): Record<string, DeptMeta> {
  const byId = new Map(departments.map((d) => [d.id, d]));
  const meta: Record<string, DeptMeta> = {};
  for (const d of departments) {
    let color = resolveDeptColorKey(d.name, d.color_key ?? null);
    if (!color && d.parent_id) {
      const parent = byId.get(d.parent_id);
      if (parent) color = resolveDeptColorKey(parent.name, parent.color_key ?? null);
    }
    meta[d.id] = { name: d.name, color };
  }
  return meta;
}
