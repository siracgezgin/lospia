"use server";

/**
 * CSV → görev toplu içe aktarma (admin/owner only).
 *
 * İki aşamalı, güvenli akış:
 *   1. previewCsvImport — dosyayı parse eder, satırları doğrular, mevcut
 *      görevlerle mükerrer (duplicate) kontrolü yapar. HİÇBİR ŞEY YAZMAZ.
 *   2. applyCsvImport   — aynı pipeline'ı yeniden çalıştırır (server otoritedir)
 *      ve yalnızca geçerli + mükerrer olmayan satırları görev olarak ekler.
 *
 * Duplicate koruması: her satır için deterministik bir import_key üretilir
 * (başlık + teslim tarihi + kategori üzerinden) ve custom_fields.import_key
 * olarak saklanır. Aynı CSV ikinci kez yüklendiğinde satırlar "zaten içe
 * aktarılmış" olarak raporlanır, asla ikinci kez yazılmaz.
 */

import { revalidatePath } from "next/cache";
import { generateKeyBetween } from "fractional-indexing";
import { createClient } from "@/lib/supabase/server";
import { parseCsvTasks, matchDepartment, type CsvFormat } from "@/lib/import/csv";
import { logTaskActivity, ACTIVITY_ACTIONS } from "@/lib/activity/log-task-activity";
import { pointsForEffort } from "@/lib/points/effort";
import type { AppRole } from "@/lib/auth/permissions";

const MAX_CSV_BYTES = 1_000_000; // 1 MB — operasyon CSV'leri için fazlasıyla geniş
const MAX_ROWS = 500;
const IMPORT_SOURCE = "csv-ui";

export type CsvPreviewRow = {
  rowNumber: number;
  title: string;
  description: string | null;
  category: string;
  departmentName: string | null;
  dueDate: string | null;
  status: string;
  collaborators: string[];
  // "new" → içe aktarılacak; "duplicate" → daha önce aktarılmış, atlanacak;
  // "invalid" → hatalı, atlanacak.
  verdict: "new" | "duplicate" | "invalid";
  issues: string[];
};

export type CsvPreviewResult = {
  format: CsvFormat;
  headers: string[];
  unknownHeaders: string[];
  rows: CsvPreviewRow[];
  counts: { new: number; duplicate: number; invalid: number; total: number };
};

export type CsvApplyResult = {
  created: number;
  skippedDuplicate: number;
  skippedInvalid: number;
  errors: string[];
};

type SB = Awaited<ReturnType<typeof createClient>>;

async function getAdminCtx(sb: SB): Promise<
  | { userId: string; workspaceId: string }
  | { error: string }
> {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: "Kimlik doğrulama gerekli." };
  const { data: m } = await sb
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  const role = (m?.role ?? null) as AppRole | null;
  if (!m || (role !== "owner" && role !== "admin")) {
    return { error: "CSV içe aktarma yalnızca yöneticiler tarafından yapılabilir." };
  }
  return { userId: user.id, workspaceId: m.workspace_id as string };
}

// Shared pipeline: parse + validate + department map + duplicate check.
async function buildPreview(
  sb: SB, workspaceId: string, csvText: string,
): Promise<CsvPreviewResult | { error: string }> {
  if (!csvText.trim()) return { error: "CSV dosyası boş." };
  if (csvText.length > MAX_CSV_BYTES) return { error: "CSV dosyası çok büyük (en fazla 1 MB)." };

  const parsed = parseCsvTasks(csvText);
  if (parsed.rows.length === 0) {
    return { error: "Geçerli satır bulunamadı. İlk satırın sütun başlıklarını içerdiğinden emin olun (ör. İŞBİRLİĞİ · HEDEF · KONU · STRATEJİ · AKSİYON · BAŞARI)." };
  }
  if (parsed.rows.length > MAX_ROWS) {
    return { error: `Tek seferde en fazla ${MAX_ROWS} satır içe aktarılabilir (dosyada ${parsed.rows.length} satır var).` };
  }

  const { data: departments } = await sb
    .from("workspace_departments")
    .select("id, name")
    .eq("workspace_id", workspaceId);
  const depts = (departments ?? []) as { id: string; name: string }[];

  // Existing import keys in this workspace (duplicate guard).
  const { data: existing } = await sb
    .from("tasks")
    .select("custom_fields")
    .eq("workspace_id", workspaceId)
    .not("custom_fields->>import_key", "is", null);
  const existingKeys = new Set(
    (existing ?? [])
      .map((t) => ((t.custom_fields ?? {}) as Record<string, unknown>).import_key)
      .filter((k): k is string => typeof k === "string"),
  );

  // Aynı dosya İÇİNDE tekrar eden satırlar da mükerrer sayılır.
  const seenInFile = new Set<string>();

  const rows: CsvPreviewRow[] = parsed.rows.map((r) => {
    const departmentId = r.category ? matchDepartment(r.category, depts) : null;
    const departmentName = departmentId
      ? depts.find((d) => d.id === departmentId)?.name ?? null
      : null;

    let verdict: CsvPreviewRow["verdict"] = "new";
    const issues = [...r.issues];
    if (issues.length > 0) {
      verdict = "invalid";
    } else if (existingKeys.has(r.importKey) || seenInFile.has(r.importKey)) {
      verdict = "duplicate";
      issues.push("Bu satır daha önce içe aktarılmış görünüyor — atlanacak.");
    }
    if (verdict !== "invalid") seenInFile.add(r.importKey);
    if (r.category && !departmentName) {
      issues.push(`"${r.category}" bir departmanla eşleşmedi — görev departmansız eklenecek.`);
    }

    return {
      rowNumber: r.rowNumber,
      title: r.title,
      description: r.description,
      category: r.category,
      departmentName,
      dueDate: r.dueDate,
      status: r.status,
      collaborators: r.collaborators,
      verdict,
      issues,
    };
  });

  return {
    format: parsed.format,
    headers: parsed.headers,
    unknownHeaders: parsed.unknownHeaders,
    rows,
    counts: {
      new: rows.filter((r) => r.verdict === "new").length,
      duplicate: rows.filter((r) => r.verdict === "duplicate").length,
      invalid: rows.filter((r) => r.verdict === "invalid").length,
      total: rows.length,
    },
  };
}

/** Dry-run: parse + validate + duplicate report. Writes nothing. */
export async function previewCsvImport(
  csvText: string,
): Promise<CsvPreviewResult | { error: string }> {
  const sb = await createClient();
  const ctx = await getAdminCtx(sb);
  if ("error" in ctx) return { error: ctx.error };
  return buildPreview(sb, ctx.workspaceId, csvText);
}

/** Apply: import every valid, non-duplicate row as a task. */
export async function applyCsvImport(
  csvText: string,
): Promise<CsvApplyResult | { error: string }> {
  const sb = await createClient();
  const ctx = await getAdminCtx(sb);
  if ("error" in ctx) return { error: ctx.error };

  // Server re-derives the whole plan — the client-confirmed preview is only UI.
  const preview = await buildPreview(sb, ctx.workspaceId, csvText);
  if ("error" in preview) return { error: preview.error };

  const parsed = parseCsvTasks(csvText);
  const byRowNumber = new Map(parsed.rows.map((r) => [r.rowNumber, r]));

  const { data: departments } = await sb
    .from("workspace_departments")
    .select("id, name")
    .eq("workspace_id", ctx.workspaceId);
  const depts = (departments ?? []) as { id: string; name: string }[];

  // Son fractional index'ler (kolon sonuna ekleme için).
  const lastIdxByStatus = new Map<string, string | null>();
  const { data: lastRows } = await sb
    .from("tasks")
    .select("status, fractional_index")
    .eq("workspace_id", ctx.workspaceId);
  for (const t of lastRows ?? []) {
    const cur = lastIdxByStatus.get(t.status as string) ?? null;
    const fi = (t.fractional_index as string | null) ?? null;
    if (fi && (cur === null || fi > cur)) lastIdxByStatus.set(t.status as string, fi);
  }
  function nextIndex(status: string): string {
    const prev = lastIdxByStatus.get(status) ?? null;
    let idx: string;
    try { idx = generateKeyBetween(prev, null); }
    catch { idx = generateKeyBetween(null, null); }
    lastIdxByStatus.set(status, idx);
    return idx;
  }

  const today = new Date().toISOString().slice(0, 10);
  let created = 0;
  const errors: string[] = [];

  for (const row of preview.rows) {
    if (row.verdict !== "new") continue;
    const src = byRowNumber.get(row.rowNumber);
    if (!src) continue;

    const departmentId = src.category ? matchDepartment(src.category, depts) : null;
    const custom_fields: Record<string, unknown> = {
      import_source: IMPORT_SOURCE,
      import_key: src.importKey,
      import_row: src.rowNumber,
    };
    if (src.category) custom_fields.category = src.category;
    if (src.collaborators.length) custom_fields.collaborators = src.collaborators;

    const { data, error } = await sb
      .from("tasks")
      .insert({
        workspace_id: ctx.workspaceId,
        title: src.title,
        description: src.description,
        status: src.status,
        priority: "medium",
        start_date: today,
        due_date: src.dueDate,
        department_id: departmentId,
        tags: src.category ? [src.category] : [],
        custom_fields,
        effort_size: "medium",
        points_value: pointsForEffort("medium"),
        visibility: "workspace",
        fractional_index: nextIndex(src.status),
        created_by: ctx.userId,
        ...(src.status === "done" ? { completed_at: new Date().toISOString() } : {}),
      })
      .select("id")
      .single();

    if (error || !data) {
      errors.push(`Satır ${src.rowNumber} "${src.title}": ${error?.message ?? "eklenemedi"}`);
      continue;
    }
    created++;
    await logTaskActivity(sb, {
      workspaceId: ctx.workspaceId,
      taskId: (data as { id: string }).id,
      actorId: ctx.userId,
      action: ACTIVITY_ACTIONS.TASK_CREATED,
      metadata: { source: IMPORT_SOURCE, import_key: src.importKey },
    });
  }

  revalidatePath("/board");
  revalidatePath("/list");

  return {
    created,
    skippedDuplicate: preview.counts.duplicate,
    skippedInvalid: preview.counts.invalid,
    errors,
  };
}
