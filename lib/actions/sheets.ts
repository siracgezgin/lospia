"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/permissions";
import { toActionErrorMessage } from "@/lib/utils/supabase-errors";
import { logWorkspaceActivity, WORKSPACE_ACTIONS } from "@/lib/activity/log-workspace-activity";

// Tablo Merkezi — embedded spreadsheets persisted as JSONB snapshots (no file
// storage, no realtime collaboration). Metadata (title/type/status/relations)
// and the cell snapshot are saved by separate actions so the heavy snapshot
// payload only travels when cells actually changed. Members create/edit their
// own sheets until locked/archived; owner/admin manages everything. RLS on
// operation_spreadsheets is the DB-level backstop.

const PERM_DENIED = "Bu işlem için yetkiniz yok.";
const AUTH_REQUIRED = "Kimlik doğrulama gerekli.";
const NOT_FOUND = "Tablo bulunamadı.";
const LOCKED = "Bu tablo kilitli — içerik değiştirilemez.";
const ADMIN_ROLES: AppRole[] = ["owner", "admin"];

// Snapshot JSON, serialized on the client. Univer snapshots for a filled sheet
// can get large; 4 MB keeps us far from Postgres limits while allowing real use.
const MAX_SNAPSHOT_CHARS = 4_000_000;

/** İki sürüm kaydı arasındaki en kısa süre (bkz. saveSpreadsheetSnapshot). */
const VERSION_MIN_GAP_MS = 3 * 60 * 1000;

const uuidOrNull = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  .optional()
  .nullable()
  .or(z.literal(""));

const SheetMetaSchema = z.object({
  title: z.string().min(1, "Başlık gerekli").max(300),
  description: z.string().max(4000).optional().nullable(),
  sheet_type: z.enum([
    "freeform", "collection", "production", "inventory", "finance", "sales", "crm", "other",
  ]),
  status: z.enum(["draft", "active", "locked", "archived"]),
  department_id: uuidOrNull,
  related_task_id: uuidOrNull,
  related_contact_id: uuidOrNull,
  tags: z.array(z.string().max(60)).max(20).optional(),
});

export type SheetMetaInput = z.infer<typeof SheetMetaSchema>;

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

function normalizeMeta(v: SheetMetaInput) {
  const nn = (s?: string | null) => {
    const t = (s ?? "").trim();
    return t.length ? t : null;
  };
  return {
    title: v.title.trim(),
    description: nn(v.description),
    sheet_type: v.sheet_type,
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
  sheetId: string,
): Promise<{ createdBy: string | null; status: string } | { error: string }> {
  const { data: row, error } = await supabase
    .from("operation_spreadsheets")
    .select("id, created_by, status")
    .eq("id", sheetId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (error) return { error: toActionErrorMessage(error) };
  if (!row) return { error: NOT_FOUND };
  const createdBy = row.created_by as string | null;
  const status = row.status as string;
  const authorEditable =
    createdBy === ctx.userId && (status === "draft" || status === "active");
  if (!isAdmin(ctx) && !authorEditable) return { error: PERM_DENIED };
  return { createdBy, status };
}

export async function createOperationSpreadsheet(
  input: SheetMetaInput,
  initialSnapshotJson?: string,
): Promise<{ id: string } | { error: string }> {
  const parsed = SheetMetaSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const data = normalizeMeta(parsed.data);
  if (!isAdmin(ctx)) data.status = "draft";

  let snapshot: Record<string, unknown> = {};
  if (initialSnapshotJson) {
    if (initialSnapshotJson.length > MAX_SNAPSHOT_CHARS) {
      return { error: "Tablo içeriği çok büyük — lütfen daha küçük bir veriyle deneyin." };
    }
    try {
      snapshot = JSON.parse(initialSnapshotJson) as Record<string, unknown>;
    } catch {
      return { error: "Tablo içeriği okunamadı." };
    }
  }

  const { data: row, error } = await supabase
    .from("operation_spreadsheets")
    .insert({
      workspace_id: ctx.workspaceId,
      created_by: ctx.userId,
      owner_id: ctx.userId,
      snapshot,
      archived_at: data.status === "archived" ? new Date().toISOString() : null,
      ...data,
    })
    .select("id")
    .single();

  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/sheets");
  return { id: (row as { id: string }).id };
}

export async function updateOperationSpreadsheetMeta(
  sheetId: string,
  input: SheetMetaInput,
): Promise<{ ok: true } | { error: string }> {
  const parsed = SheetMetaSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const editable = await loadEditable(supabase, ctx, sheetId);
  if ("error" in editable) return editable;

  const data = normalizeMeta(parsed.data);
  // A member may keep own sheet draft/active but never lock/archive it.
  if (!isAdmin(ctx) && data.status !== "draft" && data.status !== "active") {
    data.status = editable.status as SheetMetaInput["status"];
  }

  const { error } = await supabase
    .from("operation_spreadsheets")
    .update({
      ...data,
      archived_at: data.status === "archived" ? new Date().toISOString() : null,
    })
    .eq("id", sheetId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/sheets");
  revalidatePath(`/sheets/${sheetId}`);
  return { ok: true };
}

/**
 * Persist the cell snapshot (engine-tagged JSON — see lib/utils/sheet-snapshot).
 * Also appends a best-effort version row so a bad save never loses history.
 */
export async function saveSpreadsheetSnapshot(
  sheetId: string,
  snapshotJson: string,
): Promise<{ ok: true } | { error: string }> {
  if (snapshotJson.length > MAX_SNAPSHOT_CHARS) {
    return { error: "Tablo içeriği çok büyük — lütfen veriyi bölerek kaydedin." };
  }
  let snapshot: Record<string, unknown>;
  try {
    snapshot = JSON.parse(snapshotJson) as Record<string, unknown>;
  } catch {
    return { error: "Tablo içeriği okunamadı." };
  }

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const editable = await loadEditable(supabase, ctx, sheetId);
  if ("error" in editable) return editable;
  // Even an admin should consciously unlock before editing a locked sheet.
  if (editable.status === "locked") return { error: LOCKED };

  const { error } = await supabase
    .from("operation_spreadsheets")
    .update({ snapshot })
    .eq("id", sheetId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) return { error: toActionErrorMessage(error) };

  /* SÜRÜM GEÇMİŞİ — kısıtlı.
     Otomatik kaydetme yazma durduktan ~1 sn sonra çalışıyor; her kayıtta bir
     sürüm yazmak yarım saatlik bir çalışmada yüzlerce TAM anlık görüntü
     biriktiriyordu (tablo şişiyor, kayıt yavaşlıyor). Artık en fazla
     VERSION_MIN_GAP_MS'de bir sürüm alınır: kurtarma noktası olarak yeterli,
     maliyeti sabit. Yazılamazsa kayıt yine de başarılıdır. */
  const { data: last } = await supabase
    .from("operation_spreadsheet_versions")
    .select("version_no, created_at")
    .eq("spreadsheet_id", sheetId)
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastAt = last?.created_at ? Date.parse(last.created_at as string) : 0;
  const tooSoon = Number.isFinite(lastAt) && Date.now() - lastAt < VERSION_MIN_GAP_MS;
  if (!tooSoon) {
    await supabase.from("operation_spreadsheet_versions").insert({
      spreadsheet_id: sheetId,
      snapshot,
      version_no: ((last?.version_no as number | undefined) ?? 0) + 1,
      created_by: ctx.userId,
    });
  }

  /* revalidatePath BİLEREK ÇAĞRILMIYOR.
     Sunucu eyleminde yol geçersiz kılmak, istemci yönlendiricisini de
     tazeliyor: otomatik kaydetme her tetiklendiğinde /sheets/[id] yeniden
     sunucuda çiziliyor (departmanlar + 300 görev + kişiler sorgusu) ve
     düzenleyici yazarken donuyordu. Anlık görüntünün doğruluk kaynağı zaten
     tarayıcıdaki düzenleyici; sayfa bir sonraki gezinmede tazelenir. */
  return { ok: true };
}

/**
 * Yalnız BAŞLIĞI değiştirir — tablo editöründeki satır içi yeniden adlandırma.
 * Künye formunun tamamını göndermeden ad değiştirebilmek için ayrı duruyor
 * (aynı desen yazılarda da var).
 */
export async function renameOperationSpreadsheet(
  sheetId: string,
  title: string,
): Promise<{ ok: true } | { error: string }> {
  const clean = (title ?? "").trim();
  if (!clean) return { error: "Başlık gerekli." };
  if (clean.length > 300) return { error: "Başlık en fazla 300 karakter olabilir." };

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const editable = await loadEditable(supabase, ctx, sheetId);
  if ("error" in editable) return editable;

  const { error } = await supabase
    .from("operation_spreadsheets")
    .update({ title: clean })
    .eq("id", sheetId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/documents");
  return { ok: true };
}

/**
 * KOPYALA — tablonun içeriğiyle birlikte aynı klasörde bir eşini açar.
 * "Geçen sezonun listesini bozmadan üstünde çalışayım" akışı; Drive'daki
 * "Bir kopyasını oluştur" ile aynı beklenti.
 */
export async function duplicateOperationSpreadsheet(
  sheetId: string,
): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const { data: src, error: readError } = await supabase
    .from("operation_spreadsheets")
    .select(
      "title, description, sheet_type, department_id, related_task_id, related_contact_id, tags, snapshot, folder_id, section, visibility",
    )
    .eq("id", sheetId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();

  if (readError) return { error: toActionErrorMessage(readError) };
  if (!src) return { error: NOT_FOUND };

  const row = src as {
    title: string; description: string | null; sheet_type: string;
    department_id: string | null; related_task_id: string | null;
    related_contact_id: string | null; tags: string[] | null;
    snapshot: unknown; folder_id: string | null; section: string;
    visibility: string;
  };

  const { data: made, error } = await supabase
    .from("operation_spreadsheets")
    .insert({
      workspace_id: ctx.workspaceId,
      created_by: ctx.userId,
      owner_id: ctx.userId,
      title: `${row.title} (kopya)`.slice(0, 300),
      description: row.description,
      sheet_type: row.sheet_type,
      status: isAdmin(ctx) ? "active" : "draft",
      department_id: row.department_id,
      related_task_id: row.related_task_id,
      related_contact_id: row.related_contact_id,
      tags: row.tags ?? [],
      snapshot: (row.snapshot ?? {}) as Record<string, unknown>,
      folder_id: row.folder_id,
      section: row.section,
      visibility: row.visibility,
    })
    .select("id")
    .single();

  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/documents");
  return { id: (made as { id: string }).id };
}

// Prefer archive over hard delete — non-destructive; admin-only.
export async function archiveOperationSpreadsheet(
  sheetId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdmin(ctx)) return { error: PERM_DENIED };

  const { error } = await supabase
    .from("operation_spreadsheets")
    .update({ status: "archived", archived_at: new Date().toISOString() })
    .eq("id", sheetId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/sheets");
  return { ok: true };
}

/** Görünürlük — klasördekiyle aynı sözleşme (bkz. documents.ts). */
export async function setOperationSpreadsheetVisibility(
  sheetId: string,
  visibility: "all" | "admin",
): Promise<{ ok: true } | { error: string }> {
  if (visibility !== "all" && visibility !== "admin") return { error: "Geçersiz görünürlük." };
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  if (!isAdmin(ctx)) {
    const { data: row } = await supabase
      .from("operation_spreadsheets")
      .select("created_by")
      .eq("id", sheetId)
      .eq("workspace_id", ctx.workspaceId)
      .maybeSingle();
    if (!row) return { error: NOT_FOUND };
    if ((row as { created_by: string | null }).created_by !== ctx.userId) {
      return { error: PERM_DENIED };
    }
  }

  const { error } = await supabase
    .from("operation_spreadsheets")
    /* `updated_by` YAZILMAZ: bu tabloda öyle bir sütun yok (yalnız
       document_folders'ta var). Yazmaya çalışmak PostgREST'ten "column not
       found" (PGRST204) döndürüyordu ve arayüz bunu "migration bekleniyor"
       diye okuyordu — oysa şema eksik değildi. `updated_at`i tablo kendi
       trigger'ıyla günceller. */
    .update({ visibility })
    .eq("id", sheetId)
    .eq("workspace_id", ctx.workspaceId);
  if (error) return { error: toActionErrorMessage(error) };

  revalidatePath("/documents");
  revalidatePath("/sheets");
  return { ok: true };
}

/** Kalıcı silme: yönetici her tabloyu, ÜYE KENDİ EKLEDİĞİNİ siler
 *  (bkz. deleteOperationDocument — aynı sahiplik kuralı, RLS 20240334). */
export async function deleteOperationSpreadsheet(
  sheetId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  if (!isAdmin(ctx)) {
    const { data: row } = await supabase
      .from("operation_spreadsheets")
      .select("created_by")
      .eq("id", sheetId)
      .eq("workspace_id", ctx.workspaceId)
      .maybeSingle();
    if (!row) return { error: NOT_FOUND };
    if ((row as { created_by: string | null }).created_by !== ctx.userId) {
      return { error: PERM_DENIED };
    }
  }

  const { data: doomed } = await supabase
    .from("operation_spreadsheets")
    .select("title")
    .eq("id", sheetId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();

  const { error } = await supabase
    .from("operation_spreadsheets")
    .delete()
    .eq("id", sheetId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) return { error: toActionErrorMessage(error) };

  await logWorkspaceActivity(supabase, {
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    action: WORKSPACE_ACTIONS.SPREADSHEET_DELETED,
    entityType: "spreadsheet",
    entityId: sheetId,
    entityLabel: (doomed as { title?: string } | null)?.title ?? null,
  });

  revalidatePath("/sheets");
  revalidatePath("/documents");
  return { ok: true };
}

/**
 * Klasörün içinde yeni bir TABLO açar (20240329).
 *
 * Sıraç (2026-08-29): "Mantık Drive'daki gibi olsun. Klasör oluşturalım,
 * klasörün içinde Excel de Word de oluşturulabilsin."
 *
 * `createOperationSpreadsheet` künye formundan (başlık, tür, departman,
 * etiket…) besleniyor; buradaki akış tek tık: klasörde boş bir tablo doğar,
 * adı editörde değişir. Aynı desen yazılarda da var (createTeamworkDoc).
 */
export async function createSheetInFolder(
  input: { title?: string; folder_id?: string | null; section?: "teamwork" | "library" },
): Promise<{ id: string } | { error: string }> {
  const parsed = z
    .object({
      title: z.string().max(300).default("Adsız tablo"),
      folder_id: z.string().uuid().optional().nullable().or(z.literal("")),
      section: z.enum(["teamwork", "library"]).default("teamwork"),
    })
    .safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const { data: row, error } = await supabase
    .from("operation_spreadsheets")
    .insert({
      workspace_id: ctx.workspaceId,
      created_by: ctx.userId,
      owner_id: ctx.userId,
      title: (parsed.data.title || "Adsız tablo").trim(),
      sheet_type: "freeform",
      status: isAdmin(ctx) ? "active" : "draft",
      folder_id: (parsed.data.folder_id ?? "") || null,
      section: parsed.data.section,
      snapshot: {},
    })
    .select("id")
    .single();

  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/documents");
  return { id: (row as { id: string }).id };
}
