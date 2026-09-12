"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/permissions";
import { toActionErrorMessage } from "@/lib/utils/supabase-errors";
import { sendEmail } from "@/lib/email/send-email";
import { documentShareEmail } from "@/lib/email/templates/document-share";
/* Tür etiketi UI'daki ikonla AYNI kaynaktan gelir (file-kind.ts). Mailde
   "Sunum" yazarken ekranda "PPTX" görünmesin — tek terminoloji kuralı. */
import { fileKindOf } from "@/lib/office/file-kind";

// Dokümanlar — klasör ağacı + gerçek dosya yükleme (20240312).
//
// Aslı Hanım (2026-08-19): "Drive, Word, Excel hepsinin burada olduğu böyle
// klasör şeklinde ayırmayı düşündüm… maliyetine bir bak." Araştırma yapıldı
// (dokuman_depolama_maliyeti.md): Pro planda 100 GB dahil, AF'nin hacmi
// ~8,7 GB/yıl → ek maliyet ₺0.
//
// Bucket PRIVATE: sözleşme ve fatura herkese açık URL taşımamalı. Okuma imzalı
// URL ile — föy görsellerinden (public bucket) bilinçli olarak farklı.

const BUCKET = "documents";
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB — bkz. migration notu
const AUTH_REQUIRED = "Kimlik doğrulama gerekli.";
const ADMIN_ONLY = "Klasörleri yalnız yöneticiler düzenleyebilir.";
const PERM_DENIED = "Bu işlem için yetkiniz yok.";
const NOT_FOUND = "Kayıt bulunamadı.";

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

const isAdmin = (r: AppRole) => r === "owner" || r === "admin";

// ── Klasör ──────────────────────────────────────────────────────────────────

const FolderSchema = z.object({
  name: z.string().min(1, "Klasör adı gerekli.").max(200),
  parent_id: z.string().uuid().optional().nullable(),
  /* Varsayılan "all": klasörü açan kişi aksini söylemedikçe ekip görsün.
     Eskiden 'admin'di ve üyenin açtığı klasör kendinden başkasına görünmüyordu
     (Sıraç, 2026-08-30: "tüm üyelere göster kısmı da olsun"). */
  visibility: z.enum(["all", "admin"]).default("all"),
  /** Bölüm (20240324): AF Teamwork mü Kütüphane mi. Alt klasör üstünü izler. */
  section: z.enum(["teamwork", "library"]).default("teamwork"),
});
export type FolderInput = z.infer<typeof FolderSchema>;

export async function saveFolder(
  id: string | null,
  input: FolderInput,
): Promise<{ id: string } | { error: string }> {
  const parsed = FolderSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  /* SAHİPLİK KURALI: yönetici her klasörü, üye YALNIZ KENDİ açtığını yönetir.
     Eskiden klasör açmak da düzenlemek de yönetici işiydi; üye kendi çalışma
     alanını kuramıyordu (Sıraç, 2026-08-30). Aynı kural RLS'te de yazılıdır —
     burası yalnız net bir hata mesajı verebilmek için. */
  if (id && !isAdmin(ctx.role)) {
    const { data: owner } = await supabase
      .from("document_folders")
      .select("created_by")
      .eq("id", id)
      .eq("workspace_id", ctx.workspaceId)
      .maybeSingle();
    if (!owner) return { error: NOT_FOUND };
    if ((owner as { created_by: string | null }).created_by !== ctx.userId) {
      return { error: ADMIN_ONLY };
    }
  }

  const v = parsed.data;
  // Klasör kendi altına taşınamaz — ağaç döngüye girerdi.
  if (id && v.parent_id === id) return { error: "Klasör kendi içine taşınamaz." };

  const payload = {
    name: v.name.trim(),
    parent_id: v.parent_id || null,
    visibility: v.visibility,
    section: v.section,
    updated_by: ctx.userId,
  };

  if (id) {
    const { error, count } = await supabase
      .from("document_folders")
      .update(payload, { count: "exact" })
      .eq("id", id).eq("workspace_id", ctx.workspaceId);
    if (error) {
      if (error.code === "23505") return { error: "Bu adda bir klasör zaten var." };
      return { error: toActionErrorMessage(error) };
    }
    if (count === 0) return { error: NOT_FOUND };
    revalidatePath("/documents");
    return { id };
  }

  const { data, error } = await supabase
    .from("document_folders")
    .insert({ workspace_id: ctx.workspaceId, ...payload, created_by: ctx.userId })
    .select("id").single();
  if (error) {
    if (error.code === "23505") return { error: "Bu adda bir klasör zaten var." };
    return { error: toActionErrorMessage(error) };
  }
  revalidatePath("/documents");
  return { id: (data as { id: string }).id };
}

/** Dolu klasör silinmez — içindekiler öksüz kalmasın (FK de restrict). */
export async function deleteFolder(id: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  // Yönetici her klasörü, üye kendi açtığını siler (RLS ile aynı kural).
  if (!isAdmin(ctx.role)) {
    const { data: owner } = await supabase
      .from("document_folders")
      .select("created_by")
      .eq("id", id)
      .eq("workspace_id", ctx.workspaceId)
      .maybeSingle();
    if (!owner) return { error: NOT_FOUND };
    if ((owner as { created_by: string | null }).created_by !== ctx.userId) {
      return { error: ADMIN_ONLY };
    }
  }

  const [{ count: docs }, { count: subs }] = await Promise.all([
    supabase.from("operation_documents")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", ctx.workspaceId).eq("folder_id", id),
    supabase.from("document_folders")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", ctx.workspaceId).eq("parent_id", id),
  ]);
  if ((docs ?? 0) > 0 || (subs ?? 0) > 0) {
    return { error: `Klasör boş değil (${docs ?? 0} dosya, ${subs ?? 0} alt klasör). Önce içini boşaltın.` };
  }

  const { error } = await supabase
    .from("document_folders").delete()
    .eq("id", id).eq("workspace_id", ctx.workspaceId);
  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/documents");
  return { ok: true };
}

// ── Dosya ───────────────────────────────────────────────────────────────────

/**
 * Dosya yükler ve karşılığında bir doküman kaydı oluşturur.
 *
 * Yol: documents/{workspace_id}/{folder_id|kok}/{uuid}-{ad}
 * workspace_id önde olduğu için silme yetkisi yol üzerinden doğrulanabiliyor.
 */
export async function uploadDocumentFile(
  formData: FormData,
): Promise<{ id: string } | { error: string }> {
  const file = formData.get("file");
  const folderId = (formData.get("folder_id") as string | null) || null;
  /* Bölüm (20240327): kayıt hangi ekranda açıldıysa orada yaşar. Klasörsüz
     yüklemede tek ayırt edici bu — yoksa Kütüphane köküne atılan dosya AF
     Teamwork'te beliriyordu. */
  const section = (formData.get("section") as string | null) === "library" ? "library" : "teamwork";
  if (!(file instanceof File)) return { error: "Dosya bulunamadı." };
  if (file.size === 0) return { error: "Dosya boş." };
  if (file.size > MAX_BYTES) {
    return { error: `Dosya 25 MB sınırını aşıyor (${(file.size / 1024 / 1024).toFixed(1)} MB).` };
  }

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  // Dosya adı yolda kullanılacak — tehlikeli karakterleri temizle.
  const safeName = file.name.replace(/[^\w.\-() ğüşıöçĞÜŞİÖÇ]/g, "_").slice(0, 120);
  const path = `${ctx.workspaceId}/${folderId ?? "kok"}/${crypto.randomUUID()}-${safeName}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (upErr) return { error: upErr.message };

  const { data, error } = await supabase
    .from("operation_documents")
    .insert({
      workspace_id: ctx.workspaceId,
      title: file.name.slice(0, 300),
      document_type: "file",
      folder_id: folderId,
      file_path: path,
      file_name: file.name.slice(0, 300),
      file_size: file.size,
      file_mime: file.type || null,
      section,
      status: "approved",
      owner_id: ctx.userId,
      created_by: ctx.userId,
    })
    .select("id").single();
  if (error) {
    // Kayıt açılamadıysa yüklenen dosyayı bırakma — depoda öksüz kalmasın.
    await supabase.storage.from(BUCKET).remove([path]);
    return { error: toActionErrorMessage(error) };
  }

  revalidatePath("/documents");
  return { id: (data as { id: string }).id };
}

/**
 * İndirme bağlantısı. Bucket private olduğu için imzalı URL üretilir —
 * 60 saniye geçerli, paylaşılan bağlantı kalıcı erişim vermez.
 */
export async function getDocumentDownloadUrl(
  documentId: string,
): Promise<{ url: string; name: string } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const { data: doc } = await supabase
    .from("operation_documents")
    .select("file_path, file_name, title")
    .eq("id", documentId).eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  const row = doc as { file_path: string | null; file_name: string | null; title: string } | null;
  if (!row?.file_path) return { error: "Bu kayıtta yüklenmiş dosya yok." };

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(row.file_path, 60);
  if (error || !data) return { error: error?.message ?? "Bağlantı üretilemedi." };
  return { url: data.signedUrl, name: row.file_name ?? row.title };
}

/** Dosyayı hem depodan hem kayıttan siler. */
export async function deleteDocumentFile(
  documentId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const { data: doc } = await supabase
    .from("operation_documents")
    .select("file_path, created_by")
    .eq("id", documentId).eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  const row = doc as { file_path: string | null; created_by: string | null } | null;
  if (!row) return { error: NOT_FOUND };
  // Yükleyen ya da yönetici silebilir.
  if (!isAdmin(ctx.role) && row.created_by !== ctx.userId) return { error: PERM_DENIED };

  if (row.file_path) {
    if (!row.file_path.startsWith(`${ctx.workspaceId}/`)) return { error: PERM_DENIED };
    await supabase.storage.from(BUCKET).remove([row.file_path]);
  }
  const { error } = await supabase
    .from("operation_documents").delete()
    .eq("id", documentId).eq("workspace_id", ctx.workspaceId);
  if (error) return { error: toActionErrorMessage(error) };

  revalidatePath("/documents");
  return { ok: true };
}

/** Dosyayı başka klasöre taşı. */
export async function moveDocument(
  documentId: string,
  folderId: string | null,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const { error, count } = await supabase
    .from("operation_documents")
    .update({ folder_id: folderId }, { count: "exact" })
    .eq("id", documentId).eq("workspace_id", ctx.workspaceId);
  if (error) return { error: toActionErrorMessage(error) };
  if (count === 0) return { error: NOT_FOUND };
  revalidatePath("/documents");
  return { ok: true };
}

// ── Mail ile paylaş ─────────────────────────────────────────────────────────
//
// Sıraç (2026-09-12): "Klasörün içine diyelim rapor veya sunum ekledik,
// onların da yanına mail atılma ibaresi olsun, mail atalım. Calendar'daki gibi."
//
// Takvimin davet gönderme akışıyla AYNI sözleşme (sendMeetingInvites):
// alıcı başına TEK mail gider — kimse başkasının adresini görmez — ve sonuç
// `sent` / `failed` olarak döner ki arayüz kimin alamadığını söyleyebilsin.
//
// EK DEĞİL BAĞLANTI gönderilir; gerekçesi templates/document-share.ts'te.

/** İmzalı bağlantının ömrü. Alıcı maili ertesi gün açsa da çalışsın. */
const SHARE_LINK_TTL_SECONDS = 7 * 24 * 60 * 60;
const SHARE_LINK_TTL_LABEL = "7 gün";
const MAIL_NOT_CONFIGURED =
  "E-posta gönderimi henüz açık değil. Yönetici ayarlarından mail kurulumu tamamlanmalı.";

const ShareSchema = z.object({
  /* Adresler tek tek doğrulanır: bir tanesi bozuksa diğerleri yine gitsin
     istemiyoruz — yanlış adres sessizce düşmesin, kullanıcı düzeltsin. */
  recipients: z
    .array(z.string().trim().email("Geçersiz e-posta adresi."))
    .min(1, "En az bir e-posta adresi girin.")
    .max(20, "Tek seferde en fazla 20 adrese gönderilebilir."),
  note: z.string().trim().max(1000).optional().nullable(),
});

export type ShareDocumentInput = z.infer<typeof ShareSchema>;
/** Paylaşılabilir kayıt türleri — DriveBrowser'daki öğe türleriyle birebir. */
export type ShareItemType = "file" | "doc" | "sheet" | "link";

const APP_BASE_URL = (
  process.env.EMAIL_TASK_BASE_URL ?? "https://operasyon.aslifilinta.com"
).replace(/\/+$/, "");

function formatBytes(bytes: number | null | undefined): string | null {
  if (!bytes || bytes <= 0) return null;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Klasör zincirini "Koleksiyon / Sunumlar" biçiminde okunur yola çevirir. */
async function folderPathOf(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  folderId: string | null,
): Promise<string | null> {
  if (!folderId) return null;
  const { data } = await supabase
    .from("document_folders")
    .select("id, name, parent_id")
    .eq("workspace_id", workspaceId);
  const rows = (data ?? []) as { id: string; name: string; parent_id: string | null }[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const parts: string[] = [];
  let cur: string | null = folderId;
  const guard = new Set<string>(); // bozuk veri döngü yaparsa sonsuza gitmesin
  while (cur && !guard.has(cur)) {
    guard.add(cur);
    const row = byId.get(cur);
    if (!row) break;
    parts.unshift(row.name);
    cur = row.parent_id;
  }
  return parts.length ? parts.join(" / ") : null;
}

export async function sendDocumentByEmail(
  itemType: ShareItemType,
  itemId: string,
  input: ShareDocumentInput,
): Promise<
  | { ok: true; sent: string[]; failed: { to: string; reason: string }[] }
  | { error: string }
> {
  const parsed = ShareSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  let fileName = "";
  let kindLabel = "Dosya";
  let url = "";
  let sizeLabel: string | null = null;
  let folderId: string | null = null;
  let expiresLabel: string | null = SHARE_LINK_TTL_LABEL;
  let requiresAccount = false;

  if (itemType === "file" || itemType === "link") {
    /* RLS ZATEN SÜZÜYOR: "yalnız yöneticiye kapalı" bir kaydı göremeyen kişi
       burada da satırı alamaz, dolayısıyla paylaşamaz. Ek bir rol kontrolü
       koymuyoruz — iki ayrı yerde yaşayan yetki kuralı er geç ayrışır. */
    const { data } = await supabase
      .from("operation_documents")
      .select("title, file_name, file_path, file_mime, file_size, folder_id, url")
      .eq("id", itemId).eq("workspace_id", ctx.workspaceId)
      .maybeSingle();
    const row = data as {
      title: string; file_name: string | null; file_path: string | null;
      file_mime: string | null; file_size: number | null;
      folder_id: string | null; url: string | null;
    } | null;
    if (!row) return { error: NOT_FOUND };
    folderId = row.folder_id;
    fileName = row.file_name ?? row.title;

    if (itemType === "link") {
      if (!row.url) return { error: "Bu bağlantı kaydında adres yok." };
      url = row.url;
      kindLabel = "Bağlantı";
      expiresLabel = null; // dış adres bizim süremize tabi değil
    } else {
      if (!row.file_path) return { error: "Bu kayıtta yüklenmiş dosya yok." };
      const { data: signed, error: signErr } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(row.file_path, SHARE_LINK_TTL_SECONDS);
      if (signErr || !signed) {
        return { error: signErr?.message ?? "İndirme bağlantısı üretilemedi." };
      }
      url = signed.signedUrl;
      sizeLabel = formatBytes(row.file_size);
      kindLabel = fileKindOf(row.file_mime, fileName).label;
    }
  } else {
    /* Yazı ve tablo uygulamanın İÇİNDE yaşar; dosya olarak dışarı verilecek
       bir hâli yok. Bağlantı panele gider ve alıcının hesabı olmalı — bunu
       mailde açıkça yazıyoruz, kapalı kapıya yönlendirmek istemiyoruz. */
    const table = itemType === "doc" ? "operation_documents" : "operation_spreadsheets";
    const { data } = await supabase
      .from(table)
      .select("title, folder_id")
      .eq("id", itemId).eq("workspace_id", ctx.workspaceId)
      .maybeSingle();
    const row = data as { title: string; folder_id: string | null } | null;
    if (!row) return { error: NOT_FOUND };
    folderId = row.folder_id;
    fileName = row.title;
    kindLabel = itemType === "doc" ? "Yazı" : "Tablo";
    url = `${APP_BASE_URL}/${itemType === "doc" ? "documents" : "sheets"}/${itemId}`;
    expiresLabel = null;
    requiresAccount = true;
  }

  const folderPath = await folderPathOf(supabase, ctx.workspaceId, folderId);
  const { data: actor } = await supabase
    .from("profiles").select("full_name, email").eq("id", ctx.userId).maybeSingle();
  const actorName =
    ((actor?.full_name as string | null) || (actor?.email as string | null)) ?? null;

  /* Aynı adres iki kez yazıldıysa tek mail gitsin — "üç kere geldi" demesin. */
  const recipients = [...new Set(parsed.data.recipients.map((r) => r.trim().toLowerCase()))];

  const sent: string[] = [];
  const failed: { to: string; reason: string }[] = [];
  for (const to of recipients) {
    const res = await sendEmail(
      documentShareEmail({
        to, fileName, kindLabel, url, expiresLabel, folderPath,
        sizeLabel, actorName, note: parsed.data.note ?? null, requiresAccount,
      }),
    );
    if (res.status === "sent") sent.push(to);
    else failed.push({ to, reason: res.status === "skipped" ? res.reason : res.error });
    /* Mail HİÇ yapılandırılmamışsa her adres aynı sebeple düşer; yirmi kez
       denemenin anlamı yok. İlk "skipped" cevabında durur ve arayüze
       "kurulum yok" diye anlaşılır bir hata döneriz — kullanıcı gönderdiğini
       sanıp beklemesin. */
    if (res.status === "skipped") {
      return { error: MAIL_NOT_CONFIGURED };
    }
  }
  return { ok: true, sent, failed };
}
