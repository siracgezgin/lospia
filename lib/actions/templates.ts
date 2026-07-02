"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/permissions";
import { toActionErrorMessage } from "@/lib/utils/supabase-errors";

// Şablon Kütüphanesi — rich-text template store (no mail sending, no external
// APIs). Content is persisted three ways: Lexical editor state (content_json),
// rendered HTML (content_html — for rich clipboard copy) and plain text
// (plain_text — for search + plain copy). Members create/edit their own drafts;
// owner/admin approves and manages everything. RLS is the DB-level backstop.

const PERM_DENIED = "Bu işlem için yetkiniz yok.";
const AUTH_REQUIRED = "Kimlik doğrulama gerekli.";
const NOT_FOUND = "Şablon bulunamadı.";
const ADMIN_ROLES: AppRole[] = ["owner", "admin"];

const uuidOrNull = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  .optional()
  .nullable()
  .or(z.literal(""));

const TemplateSchema = z.object({
  title: z.string().min(1, "Başlık gerekli").max(300),
  description: z.string().max(4000).optional().nullable(),
  category: z.enum([
    "general", "customer_email", "whatsapp_message", "producer_brief", "order_form",
    "pr_influencer", "sales", "after_sales", "internal_process", "other",
  ]),
  channel: z.enum(["general", "email", "whatsapp", "document", "internal", "other"]),
  // Serialized Lexical editor state; opaque JSON string from the client.
  content_json: z.string().max(400_000).optional().nullable(),
  content_html: z.string().max(400_000).optional().nullable(),
  plain_text: z.string().max(200_000).optional().nullable(),
  variables: z.array(z.string().max(80)).max(40).optional(),
  status: z.enum(["draft", "in_review", "approved", "archived"]),
  department_id: uuidOrNull,
  related_task_id: uuidOrNull,
  related_contact_id: uuidOrNull,
  tags: z.array(z.string().max(60)).max(20).optional(),
});

export type TemplateInput = z.infer<typeof TemplateSchema>;

async function getCtx(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!member) return null;
  return { userId: user.id, workspaceId: member.workspace_id as string, role: member.role as AppRole };
}

type Ctx = NonNullable<Awaited<ReturnType<typeof getCtx>>>;

function isAdmin(ctx: Ctx): boolean {
  return ADMIN_ROLES.includes(ctx.role);
}

function parseContentJson(raw?: string | null): unknown | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

function normalize(v: TemplateInput) {
  const nn = (s?: string | null) => {
    const t = (s ?? "").trim();
    return t.length ? t : null;
  };
  return {
    title: v.title.trim(),
    description: nn(v.description),
    category: v.category,
    channel: v.channel,
    content_json: parseContentJson(v.content_json),
    content_html: nn(v.content_html),
    plain_text: nn(v.plain_text),
    variables: (v.variables ?? []).map((t) => t.trim()).filter(Boolean),
    status: v.status,
    department_id: nn(v.department_id),
    related_task_id: nn(v.related_task_id),
    related_contact_id: nn(v.related_contact_id),
    tags: (v.tags ?? []).map((t) => t.trim()).filter(Boolean),
  };
}

async function loadEditable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ctx: Ctx,
  templateId: string,
): Promise<{ createdBy: string | null; status: string } | { error: string }> {
  const { data: row, error } = await supabase
    .from("document_templates")
    .select("id, created_by, status")
    .eq("id", templateId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (error) return { error: toActionErrorMessage(error) };
  if (!row) return { error: NOT_FOUND };
  const createdBy = row.created_by as string | null;
  const status = row.status as string;
  const authorEditable =
    createdBy === ctx.userId && (status === "draft" || status === "in_review");
  if (!isAdmin(ctx) && !authorEditable) return { error: PERM_DENIED };
  return { createdBy, status };
}

/** Append-only version snapshot — best effort, a failure never blocks a save. */
async function recordVersion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ctx: Ctx,
  templateId: string,
  content: { content_json: unknown | null; content_html: string | null; plain_text: string | null },
) {
  const { data: last } = await supabase
    .from("document_template_versions")
    .select("version_no")
    .eq("template_id", templateId)
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  await supabase.from("document_template_versions").insert({
    template_id: templateId,
    version_no: ((last?.version_no as number | undefined) ?? 0) + 1,
    created_by: ctx.userId,
    ...content,
  });
}

export async function createDocumentTemplate(
  input: TemplateInput,
): Promise<{ id: string } | { error: string }> {
  const parsed = TemplateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const data = normalize(parsed.data);
  if (!isAdmin(ctx)) data.status = "draft";

  const { data: row, error } = await supabase
    .from("document_templates")
    .insert({
      workspace_id: ctx.workspaceId,
      created_by: ctx.userId,
      owner_id: ctx.userId,
      archived_at: data.status === "archived" ? new Date().toISOString() : null,
      ...data,
    })
    .select("id")
    .single();

  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/templates");
  return { id: (row as { id: string }).id };
}

export async function updateDocumentTemplate(
  templateId: string,
  input: TemplateInput,
): Promise<{ ok: true } | { error: string }> {
  const parsed = TemplateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const editable = await loadEditable(supabase, ctx, templateId);
  if ("error" in editable) return editable;

  const data = normalize(parsed.data);
  if (!isAdmin(ctx) && data.status !== "draft" && data.status !== "in_review") {
    data.status = editable.status as TemplateInput["status"];
  }

  const { error } = await supabase
    .from("document_templates")
    .update({
      ...data,
      archived_at: data.status === "archived" ? new Date().toISOString() : null,
    })
    .eq("id", templateId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) return { error: toActionErrorMessage(error) };

  await recordVersion(supabase, ctx, templateId, {
    content_json: data.content_json,
    content_html: data.content_html,
    plain_text: data.plain_text,
  });

  revalidatePath("/templates");
  return { ok: true };
}

// Prefer archive over hard delete — non-destructive; admin-only.
export async function archiveDocumentTemplate(
  templateId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdmin(ctx)) return { error: PERM_DENIED };

  const { error } = await supabase
    .from("document_templates")
    .update({ status: "archived", archived_at: new Date().toISOString() })
    .eq("id", templateId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/templates");
  return { ok: true };
}

// Hard delete: admin anything; a member only their own draft.
export async function deleteDocumentTemplate(
  templateId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  if (!isAdmin(ctx)) {
    const editable = await loadEditable(supabase, ctx, templateId);
    if ("error" in editable) return editable;
    if (editable.status !== "draft") return { error: PERM_DENIED };
  }

  const { error } = await supabase
    .from("document_templates")
    .delete()
    .eq("id", templateId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/templates");
  return { ok: true };
}
