"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/permissions";
import { toActionErrorMessage } from "@/lib/utils/supabase-errors";

// Doküman Merkezi — a link/metadata registry (no file storage). Unlike the
// admin-only Kreatif Linkler, members participate here: they create drafts and
// edit their own records until approval; owner/admin manages everything.
// RLS on operation_documents is the DB-level backstop; these checks produce
// clean Turkish errors and set created_by/archived_at correctly.

const PERM_DENIED = "Bu işlem için yetkiniz yok.";
const AUTH_REQUIRED = "Kimlik doğrulama gerekli.";
const NOT_FOUND = "Doküman bulunamadı.";
const ADMIN_ROLES: AppRole[] = ["owner", "admin"];

const uuidOrNull = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  .optional()
  .nullable()
  .or(z.literal(""));

const DocumentSchema = z.object({
  title: z.string().min(1, "Başlık gerekli").max(300),
  description: z.string().max(4000).optional().nullable(),
  document_type: z.enum([
    "drive_link", "google_doc", "google_sheet", "canva", "figma", "pdf_link",
    "word_link", "excel_link", "website", "internal_note", "other",
  ]),
  url: z
    .string()
    .max(2000)
    .refine((v) => v.trim() === "" || /^https?:\/\//i.test(v.trim()), "Geçerli bir bağlantı girin (https://…)")
    .optional()
    .nullable(),
  status: z.enum(["draft", "in_review", "approved", "archived"]),
  department_id: uuidOrNull,
  related_task_id: uuidOrNull,
  related_contact_id: uuidOrNull,
  tags: z.array(z.string().max(60)).max(20).optional(),
  notes: z.string().max(4000).optional().nullable(),
});

export type DocumentInput = z.infer<typeof DocumentSchema>;

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

function normalize(v: DocumentInput) {
  const nn = (s?: string | null) => {
    const t = (s ?? "").trim();
    return t.length ? t : null;
  };
  return {
    title: v.title.trim(),
    description: nn(v.description),
    document_type: v.document_type,
    url: nn(v.url),
    status: v.status,
    department_id: nn(v.department_id),
    related_task_id: nn(v.related_task_id),
    related_contact_id: nn(v.related_contact_id),
    tags: (v.tags ?? []).map((t) => t.trim()).filter(Boolean),
    notes: nn(v.notes),
  };
}

/** Fetch the existing row and decide whether this caller may modify it. */
async function loadEditable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ctx: Ctx,
  documentId: string,
): Promise<{ createdBy: string | null; status: string } | { error: string }> {
  const { data: row, error } = await supabase
    .from("operation_documents")
    .select("id, created_by, status")
    .eq("id", documentId)
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

export async function createOperationDocument(
  input: DocumentInput,
): Promise<{ id: string } | { error: string }> {
  const parsed = DocumentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const data = normalize(parsed.data);
  // Members always start at draft — only owner/admin publishes directly.
  if (!isAdmin(ctx)) data.status = "draft";

  const { data: row, error } = await supabase
    .from("operation_documents")
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
  revalidatePath("/documents");
  return { id: (row as { id: string }).id };
}

export async function updateOperationDocument(
  documentId: string,
  input: DocumentInput,
): Promise<{ ok: true } | { error: string }> {
  const parsed = DocumentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const editable = await loadEditable(supabase, ctx, documentId);
  if ("error" in editable) return editable;

  const data = normalize(parsed.data);
  // A member may move own draft ↔ in_review but never approve/archive.
  if (!isAdmin(ctx) && data.status !== "draft" && data.status !== "in_review") {
    data.status = editable.status as DocumentInput["status"];
  }

  const { error } = await supabase
    .from("operation_documents")
    .update({
      ...data,
      archived_at: data.status === "archived" ? new Date().toISOString() : null,
    })
    .eq("id", documentId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/documents");
  return { ok: true };
}

// Prefer archive over hard delete — non-destructive; admin-only.
export async function archiveOperationDocument(
  documentId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdmin(ctx)) return { error: PERM_DENIED };

  const { error } = await supabase
    .from("operation_documents")
    .update({ status: "archived", archived_at: new Date().toISOString() })
    .eq("id", documentId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/documents");
  return { ok: true };
}

// Hard delete: admin anything; a member only their own draft.
export async function deleteOperationDocument(
  documentId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  if (!isAdmin(ctx)) {
    const editable = await loadEditable(supabase, ctx, documentId);
    if ("error" in editable) return editable;
    if (editable.status !== "draft") return { error: PERM_DENIED };
  }

  const { error } = await supabase
    .from("operation_documents")
    .delete()
    .eq("id", documentId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/documents");
  return { ok: true };
}
