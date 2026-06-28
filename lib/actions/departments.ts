"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { canManageWorkspace, type AppRole } from "@/lib/auth/permissions";

const PERM_DENIED = "Bu işlem için yetkiniz yok.";

async function getCallerCtx(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!member) return null;
  return { user, workspaceId: member.workspace_id, role: member.role as AppRole, memberId: member.id };
}

// ── Provision AF departments (idempotent) ────────────────────────────────────
export async function provisionAfDepartments(): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCallerCtx(supabase);
  if (!ctx) return { error: "Kimlik doğrulama gerekli." };
  if (!canManageWorkspace(ctx.role)) return { error: PERM_DENIED };

  const { error } = await supabase.rpc("provision_af_departments", {
    p_workspace_id: ctx.workspaceId,
  });
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

// ── Create department ─────────────────────────────────────────────────────────
const CreateDeptSchema = z.object({
  name: z.string().min(1).max(120).trim(),
  parentId: z.string().uuid().nullable().optional(),
  colorKey: z.string().max(30).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
});

export async function createDepartment(
  data: { name: string; parentId?: string | null; colorKey?: string | null; description?: string | null }
): Promise<{ id: string } | { error: string }> {
  const parsed = CreateDeptSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const ctx = await getCallerCtx(supabase);
  if (!ctx) return { error: "Kimlik doğrulama gerekli." };
  if (!canManageWorkspace(ctx.role)) return { error: PERM_DENIED };

  // Resolve max position among siblings
  const { data: siblings } = await supabase
    .from("workspace_departments")
    .select("position")
    .eq("workspace_id", ctx.workspaceId)
    .is(parsed.data.parentId ? "parent_id" : "parent_id", parsed.data.parentId ?? null);
  const maxPos = (siblings ?? []).reduce((m, s) => Math.max(m, s.position), -1);

  const { data: row, error } = await supabase
    .from("workspace_departments")
    .insert({
      workspace_id: ctx.workspaceId,
      parent_id: parsed.data.parentId ?? null,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      color_key: parsed.data.colorKey ?? null,
      position: maxPos + 1,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { error: "Bu isimde bir departman zaten var." };
    return { error: error.message };
  }
  revalidatePath("/settings");
  return { id: row.id };
}

// ── Update department ─────────────────────────────────────────────────────────
export async function updateDepartment(
  departmentId: string,
  data: { name?: string; description?: string | null; colorKey?: string | null }
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCallerCtx(supabase);
  if (!ctx) return { error: "Kimlik doğrulama gerekli." };
  if (!canManageWorkspace(ctx.role)) return { error: PERM_DENIED };

  const updates: Record<string, unknown> = {};
  if (data.name !== undefined) updates.name = data.name.trim();
  if ("description" in data) updates.description = data.description ?? null;
  if ("colorKey" in data) updates.color_key = data.colorKey ?? null;

  const { error } = await supabase
    .from("workspace_departments")
    .update(updates)
    .eq("id", departmentId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

// ── Delete department ─────────────────────────────────────────────────────────
export async function deleteDepartment(
  departmentId: string
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCallerCtx(supabase);
  if (!ctx) return { error: "Kimlik doğrulama gerekli." };
  if (!canManageWorkspace(ctx.role)) return { error: PERM_DENIED };

  const { error } = await supabase
    .from("workspace_departments")
    .delete()
    .eq("id", departmentId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

// ── Add member to department ──────────────────────────────────────────────────
export async function addDepartmentMember(
  departmentId: string,
  memberId: string,
  role: "lead" | "member" = "member"
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCallerCtx(supabase);
  if (!ctx) return { error: "Kimlik doğrulama gerekli." };
  if (!canManageWorkspace(ctx.role)) return { error: PERM_DENIED };

  const { error } = await supabase
    .from("department_members")
    .insert({
      workspace_id: ctx.workspaceId,
      department_id: departmentId,
      member_id: memberId,
      role,
    });

  if (error) {
    if (error.code === "23505") return { error: "Bu kişi zaten bu departmanda." };
    return { error: error.message };
  }
  revalidatePath("/settings");
  return { ok: true };
}

// ── Remove member from department ─────────────────────────────────────────────
export async function removeDepartmentMember(
  departmentMemberId: string
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCallerCtx(supabase);
  if (!ctx) return { error: "Kimlik doğrulama gerekli." };
  if (!canManageWorkspace(ctx.role)) return { error: PERM_DENIED };

  const { error } = await supabase
    .from("department_members")
    .delete()
    .eq("id", departmentMemberId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}
