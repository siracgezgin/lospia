"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/permissions";
import { toActionErrorMessage, isMissingSchemaError } from "@/lib/utils/supabase-errors";
import { sendEmail } from "@/lib/email/send-email";
import { documentShareEmail } from "@/lib/email/templates/document-share";
/* Tür etiketi UI'daki ikonla AYNI kaynaktan gelir (file-kind.ts). Mailde
   "Sunum" yazarken ekranda "PPTX" görünmesin — tek terminoloji kuralı. */
import { fileKindOf } from "@/lib/office/file-kind";
import { getDisplayNotificationEmail } from "@/lib/utils/notification-email";

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
/* Gerçek sınır artık KOVANIN sınırı (25 MB, 20240312). Sunucu tarafında ayrı
   bir bayt kontrolü yok: dosya buradan geçmiyor, doğrudan Storage'a gidiyor ve
   sınırı Storage uyguluyor. İstemcideki kontrol yalnız erken uyarı içindir. */
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
 * Dosya yükleme İKİ AŞAMALI — ve dosyanın kendisi sunucudan GEÇMEZ.
 *
 * Sıraç (26.09.2026): AF Teamwork › Excel'e bir .xlsx yüklenirken
 * "An unexpected response was received from the server." Hata Supabase'den
 * değil Next.js'ten geliyordu: dosya bir Server Action'ın GÖVDESİNDE
 * taşınıyordu ve gövde tavana çarpıyordu.
 *
 * Üç ayrı sınır vardı ve hiçbiri diğerini bilmiyordu:
 *   · tarayıcı kontrolü     25 MB  (DriveBrowser)
 *   · Server Action gövdesi  8 MB  (next.config.ts)
 *   · Vercel istek gövdesi  4,5 MB (platform sabiti — next.config EZEMEZ)
 * Aradaki her dosya istemci kontrolünü geçip sunucuda reddediliyordu; geriye
 * Next'in ham hata metni kalıyordu. Tavanı yükseltmek çözüm değil — 4,5 MB
 * Vercel'in kendi sabiti, ayarla aşılmıyor.
 *
 * Bu yüzden bayt akışı tarayıcıdan doğrudan Storage'a gidiyor. Sunucu yalnız
 * iki küçük iş yapıyor: yolu ÜRETMEK ve kaydı AÇMAK. Gerçek sınır artık
 * kovanın kendi sınırı (25 MB) ve dosya yolun sahibi olan çalışma alanına
 * yazılıyor — RLS aynen devrede, servis anahtarı kullanılmıyor.
 *
 * Yol: documents/{workspace_id}/{folder_id|kok}/{uuid}-{ad}
 * workspace_id önde olduğu için silme yetkisi yol üzerinden doğrulanabiliyor.
 */
export async function prepareDocumentUpload(
  fileName: string,
  folderId: string | null,
): Promise<{ path: string; bucket: string } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  // Dosya adı yolda kullanılacak — tehlikeli karakterleri temizle.
  const safeName = String(fileName).replace(/[^\w.\-() ğüşıöçĞÜŞİÖÇ]/g, "_").slice(0, 120);
  const path = `${ctx.workspaceId}/${folderId ?? "kok"}/${crypto.randomUUID()}-${safeName}`;
  return { path, bucket: BUCKET };
}

/**
 * Yükleme bitti — kaydı aç. Dosya zaten depoda; burada yalnız satır yazılıyor.
 *
 * Yol DOĞRULANIYOR: `prepareDocumentUpload`'ın ürettiği yol istemciden geri
 * geliyor, yani körü körüne güvenilemez. Kendi çalışma alanıyla başlamayan bir
 * yol reddediliyor — başkasının klasörüne kayıt iliştirilemesin.
 */
export async function registerDocumentFile(input: {
  path: string;
  name: string;
  size: number;
  mime: string | null;
  folder_id: string | null;
  section: string;
}): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  if (!input.path.startsWith(`${ctx.workspaceId}/`)) return { error: PERM_DENIED };

  const section = input.section === "library" ? "library" : "teamwork";
  const { data, error } = await supabase
    .from("operation_documents")
    .insert({
      workspace_id: ctx.workspaceId,
      title: input.name.slice(0, 300),
      document_type: "file",
      folder_id: input.folder_id,
      file_path: input.path,
      file_name: input.name.slice(0, 300),
      file_size: input.size,
      file_mime: input.mime || null,
      section,
      status: "approved",
      owner_id: ctx.userId,
      created_by: ctx.userId,
    })
    .select("id").single();
  if (error) {
    // Kayıt açılamadıysa yüklenen dosyayı bırakma — depoda öksüz kalmasın.
    await supabase.storage.from(BUCKET).remove([input.path]);
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
// Sıraç (2026-09-12): "Amaç dosya gönderme değil, onları sisteme davet etme.
// İndirme işi sonraki aşamalarda. Şimdi sadece böyle bir klasör olduğunu
// paylaşmak — yani kişilere, gelip görsünler."
//
// Bu yüzden mail DOSYA TAŞIMAZ: panele, kaydın durduğu yere götüren tek bir
// bağlantı taşır. İlk sürümü her dosya için imzalı indirme bağlantısı
// üretiyordu; yanlış kurulmuştu. İçerik panelde yaşıyor, orada güncelleniyor
// ve orada yetkiye bağlı — maile kopyalanan dosya o andan sonra kendi hayatını
// yaşar, eskir ve geri alınamaz. Davet her zaman güncel olanı gösterir.
//
// Takvimin davet gönderme akışıyla AYNI sözleşme (sendMeetingInvites):
// alıcı başına TEK mail gider — kimse başkasının adresini görmez — ve sonuç
// `sent` / `failed` olarak döner ki arayüz kimin alamadığını söyleyebilsin.

/** Klasör mailinde tanıtılacak en fazla dosya. Üstü "N dosya daha var" diye
 *  YAZILIR; sessizce kırpmak "hepsi bu" yanılgısı üretirdi. */
const FOLDER_FILE_LIMIT = 25;

const ShareSchema = z.object({
  /* İKİ KAYNAK: sistemdeki kişiler ve serbest adresler.
     Takvimin davet akışıyla aynı mantık (Sıraç, 12.09.2026: "paylaş dedikten
     sonra bizim sistemdeki kişiler de orada çıkmalı, calendardaki mantık").
     Üyenin adresini kullanıcıya yazdırmak hem zahmet hem hata kaynağıydı;
     ayrıca kişinin bildirim adresi değişince paylaşım eski adrese giderdi.
     Kimlikten çözmek her zaman güncel adresi verir. */
  memberIds: z.array(z.string().uuid()).max(50).optional().default([]),
  /* Adresler tek tek doğrulanır: bir tanesi bozuksa diğerleri yine gitsin
     istemiyoruz — yanlış adres sessizce düşmesin, kullanıcı düzeltsin. */
  recipients: z
    .array(z.string().trim().email("Geçersiz e-posta adresi."))
    .max(20, "Tek seferde en fazla 20 adrese gönderilebilir.")
    .optional()
    .default([]),
  note: z.string().trim().max(1000).optional().nullable(),
}).refine((v) => v.memberIds.length + v.recipients.length > 0, {
  message: "En az bir kişi seçin ya da e-posta adresi girin.",
});

export type ShareDocumentInput = z.infer<typeof ShareSchema>;
/** Paylaşılabilir kayıt türleri — DriveBrowser'daki öğe türleriyle birebir. */
export type ShareItemType = "file" | "doc" | "sheet" | "link" | "folder";

const APP_BASE_URL = (
  process.env.EMAIL_TASK_BASE_URL ?? "https://operasyon.aslifilinta.com"
).replace(/\/+$/, "");

const MAIL_NOT_CONFIGURED =
  "E-posta gönderimi henüz açık değil. Yönetici ayarlarından mail kurulumu tamamlanmalı.";

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

/** Bölüm rotası: AF Teamwork mü Kütüphane mi. Klasörün kendi `section`'ı esas. */
function sectionRoute(section: string | null | undefined): string {
  return section === "library" ? "/library" : "/documents";
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
  let sharedFiles: { name: string; meta: string }[] = [];
  let omitted = 0;

  if (itemType === "folder") {
    /* KLASÖR — davetin asıl hedefi. Bağlantı `?f=<id>` ile doğrudan klasörü
       açar (DriveBrowser açık klasörü adreste tutuyor). İçindekiler yalnız
       TANITIM için listelenir: alıcı neye çağrıldığını bilerek gelsin. */
    const { data: f } = await supabase
      .from("document_folders")
      .select("name, parent_id, section")
      .eq("id", itemId).eq("workspace_id", ctx.workspaceId)
      .maybeSingle();
    const folder = f as { name: string; parent_id: string | null; section: string | null } | null;
    if (!folder) return { error: NOT_FOUND };

    const { data: rows } = await supabase
      .from("operation_documents")
      .select("title, file_name, file_mime, file_size")
      .eq("workspace_id", ctx.workspaceId)
      .eq("folder_id", itemId)
      .order("created_at", { ascending: false });
    const docs = (rows ?? []) as {
      title: string; file_name: string | null;
      file_mime: string | null; file_size: number | null;
    }[];
    sharedFiles = docs.slice(0, FOLDER_FILE_LIMIT).map((d) => {
      const nm = d.file_name ?? d.title;
      const size = formatBytes(d.file_size);
      return { name: nm, meta: [fileKindOf(d.file_mime, nm).label, size].filter(Boolean).join(" · ") };
    });
    omitted = Math.max(0, docs.length - sharedFiles.length);

    fileName = folder.name;
    kindLabel = "Klasör";
    folderId = folder.parent_id;   // yol ÜST klasörden türer
    url = `${APP_BASE_URL}${sectionRoute(folder.section)}?f=${encodeURIComponent(itemId)}`;
  } else if (itemType === "file" || itemType === "link") {
    /* RLS ZATEN SÜZÜYOR: "yalnız yöneticiye kapalı" bir kaydı göremeyen kişi
       burada da satırı alamaz, dolayısıyla paylaşamaz. */
    const { data } = await supabase
      .from("operation_documents")
      .select("title, file_name, file_mime, file_size, folder_id, section")
      .eq("id", itemId).eq("workspace_id", ctx.workspaceId)
      .maybeSingle();
    const row = data as {
      title: string; file_name: string | null; file_mime: string | null;
      file_size: number | null; folder_id: string | null; section: string | null;
    } | null;
    if (!row) return { error: NOT_FOUND };
    folderId = row.folder_id;
    fileName = row.file_name ?? row.title;
    kindLabel = itemType === "link" ? "Bağlantı" : fileKindOf(row.file_mime, fileName).label;
    sizeLabel = formatBytes(row.file_size);
    /* Tek dosyanın kendi rotası yok; kaydın DURDUĞU YERE götürüyoruz — alıcı
       klasörü açıp dosyayı orada görüyor. Klasörsüzse bölümün kökü. */
    const base = `${APP_BASE_URL}${sectionRoute(row.section)}`;
    url = row.folder_id ? `${base}?f=${encodeURIComponent(row.folder_id)}` : base;
  } else {
    /* Yazı ve tablo kendi sayfalarında yaşıyor — doğrudan oraya götürülür. */
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
  }

  const folderPath = await folderPathOf(supabase, ctx.workspaceId, folderId);
  const { data: actor } = await supabase
    .from("profiles").select("full_name, email").eq("id", ctx.userId).maybeSingle();
  const actorName =
    ((actor?.full_name as string | null) || (actor?.email as string | null)) ?? null;

  /* SEÇİLEN ÜYELERİN ADRESİ KİMLİKTEN ÇÖZÜLÜR — bildirim adresi varsa o,
     yoksa profil adresi. `@lospia.local` yer tutucusu ATLANIR: o adres
     yönetici-oluşturmalı hesapların iç giriş kimliğidir, mail alamaz.
     Adresi olmayan kişi sessizce düşmez; arayüze `failed` olarak döner. */
  const noAddress: { to: string; reason: string }[] = [];
  const memberEmails: string[] = [];
  if (parsed.data.memberIds.length) {
    const { data: mrows } = await supabase
      .from("workspace_members")
      .select("user_id, notification_email, profiles(full_name, email)")
      .eq("workspace_id", ctx.workspaceId)
      .in("user_id", parsed.data.memberIds);
    for (const m of (mrows ?? []) as {
      user_id: string; notification_email: string | null;
      profiles: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
    }[]) {
      const pr = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      const { email } = getDisplayNotificationEmail({
        notification_email: m.notification_email,
        profiles: { email: pr?.email ?? null },
      });
      if (email) memberEmails.push(email);
      else {
        noAddress.push({
          to: pr?.full_name || "Adsız kişi",
          reason: "Bu kişinin e-posta adresi tanımlı değil (Ayarlar → Kişiler).",
        });
      }
    }
  }

  /* Aynı adres iki kez yazıldıysa tek mail gitsin — "üç kere geldi" demesin.
     Üye adresiyle elle yazılan adres çakışırsa da tek mail gider. */
  const recipients = [
    ...new Set([...memberEmails, ...parsed.data.recipients].map((r) => r.trim().toLowerCase())),
  ];
  if (!recipients.length) {
    return { error: noAddress.length
      ? "Seçilen kişilerin e-posta adresi tanımlı değil (Ayarlar → Kişiler)."
      : "Gönderilecek adres bulunamadı." };
  }

  const sent: string[] = [];
  const failed: { to: string; reason: string }[] = [...noAddress];
  for (const to of recipients) {
    const res = await sendEmail(
      documentShareEmail({
        to, fileName, kindLabel, url, folderPath, sizeLabel, actorName,
        note: parsed.data.note ?? null, files: sharedFiles, omittedCount: omitted,
      }),
    );
    if (res.status === "sent") sent.push(to);
    else failed.push({ to, reason: res.status === "skipped" ? res.reason : res.error });
    /* Mail HİÇ yapılandırılmamışsa her adres aynı sebeple düşer; yirmi kez
       denemenin anlamı yok. İlk "skipped" cevabında durur ve arayüze
       "kurulum yok" diye anlaşılır bir hata döneriz. */
    if (res.status === "skipped") return { error: MAIL_NOT_CONFIGURED };
  }
  return { ok: true, sent, failed };
}

/** Tek aktarımda taşınacak en fazla görsel. Sınır KEYFİ DEĞİL: her görsel bir
 *  yükleme + bir satır açıyor ve sunucu aksiyonunun süresi sonsuz değil.
 *  Aşılırsa kullanıcıya SÖYLENİR; orijinal dosya zaten Drive'da duruyor. */
const IMPORT_IMAGE_LIMIT = 300;

/** Aktarılan görseller için alt klasör — varsa bulur, yoksa açar.
 *  Yüzlerce fotoğrafı föyün yanına dökmek Drive'ı okunmaz hâle getirirdi.
 *  Klasör AÇILAMAZSA null döner ve görseller köke düşer: aktarımın tamamını
 *  bir klasör yüzünden iptal etmek doğru olmazdı. */
async function ensureFolder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ctx: { workspaceId: string; userId: string },
  name: string,
  parentId: string | null,
  section: string,
): Promise<string | null> {
  const clean = name.trim().slice(0, 200) || "Görseller";

  const find = async () => {
    /* parent_id NULL ise `.eq` işe yaramaz (SQL'de NULL = NULL yanlıştır);
       kök için `.is` gerekir. İki ayrı sorgu yazmak yerine tek yerde ayrılır. */
    let q = supabase
      .from("document_folders")
      .select("id")
      .eq("workspace_id", ctx.workspaceId)
      .eq("name", clean);
    q = parentId === null ? q.is("parent_id", null) : q.eq("parent_id", parentId);
    const { data } = await q.limit(1).maybeSingle();
    return data ? (data as { id: string }).id : null;
  };

  const existing = await find();
  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("document_folders")
    .insert({
      workspace_id: ctx.workspaceId,
      name: clean,
      parent_id: parentId,
      section,
      visibility: "all",
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();
  /* Aynı anda iki aktarım aynı klasörü açmaya çalışırsa biri tekillik
     kısıtına takılır — hata değil, yarış. Var olanı bulup devam et. */
  if (error) return await find();
  return created ? (created as { id: string }).id : null;
}

/**
 * YÜKLENEN EXCEL'İ DÜZENLENEBİLİR TABLOYA AKTAR.
 *
 * Sıraç (2026-09-16): "Ee düzenleme nerde?"
 *
 * Önizleme salt okunurdu ve bu yeterli değildi. Dosyayı YERİNDE düzenleyip
 * .xlsx'i yeniden yazmak seçilmedi: ExcelJS'in okuyamadığı her şey (grafik,
 * pivot, koşullu biçim, gömülü görsel) her kayıtta sessizce silinirdi —
 * kullanıcı bir hücreyi düzelttiğini sanırken dosyanın yarısını kaybederdi.
 *
 * Bunun yerine içerik uygulamanın KENDİ tablo modeline aktarılıyor; orada
 * gerçek bir düzenleyici, sürüm geçmişi ve çok kullanıcılı çalışma zaten var.
 * Yüklenen orijinal dosya Drive'da DURMAYA DEVAM EDER.
 */
export async function importUploadedSheet(
  documentId: string,
): Promise<{ id: string; warnings: string[]; reused?: boolean } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  /* ÖNCE VAR MI DİYE BAK. Dosyaya her tıklandığında yeniden aktarsaydık aynı
     dosyadan onlarca kopya tablo birikirdi ve hangisinin güncel olduğu
     belirsizleşirdi. İlk tıkta üretilir, sonraki her tıkta aynı tablo açılır —
     kullanıcı açısından dosya "açılıyor".
     Kolon henüz migrate edilmemişse sorgu hata verir; o durumda eski davranışa
     (her seferinde yeni kopya) düşülür, ekran çalışmaya devam eder. */
  const existing = await supabase
    .from("operation_spreadsheets")
    .select("id")
    .eq("workspace_id", ctx.workspaceId)
    .eq("source_document_id", documentId)
    .neq("status", "archived")
    .limit(1)
    .maybeSingle();
  if (!existing.error && existing.data) {
    return { id: (existing.data as { id: string }).id, warnings: [], reused: true };
  }

  const { data: row } = await supabase
    .from("operation_documents")
    .select("file_path, file_name, title, folder_id, section")
    .eq("id", documentId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  const rec = row as {
    file_path: string | null; file_name: string | null; title: string;
    folder_id: string | null; section: string | null;
  } | null;
  if (!rec?.file_path) return { error: NOT_FOUND };

  const name = (rec.file_name ?? rec.title ?? "").trim();
  /* .xls ESKİ İKİLİ BİÇİM — ExcelJS okuyamaz. Sessizce indirmeye düşmek yerine
     ne yapılacağını söyleriz; dosya zaten Drive'da, indirme yolu açık. */
  if (/\.xls$/i.test(name)) {
    return { error: "Eski .xls biçimi aktarılamıyor. Dosyayı Excel'de açıp .xlsx olarak kaydedip yeniden yükleyin." };
  }
  const isCsv = /\.csv$/i.test(name);

  const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(rec.file_path);
  if (dlErr || !blob) return { error: "Dosya okunamadı." };

  /* Başlık uzantısız: "AFCOM.xlsx" değil "AFCOM" — sistemdeki tablo bir dosya
     değil, bir kayıt. Aynı addan ikincisi gelirse kullanıcı kendisi ayırır. */
  const title = name.replace(/\.(xlsx|xlsm)$/i, "").slice(0, 300) || "Aktarılan tablo";

  let snapshot: unknown;
  /* UYARI ≠ BİLGİ. Burada yalnız GERÇEK KAYIP toplanır: kırpılan sayfa,
     aktarılamayan görsel, aşılan sınır. "Grafik ve pivot aktarılmaz" gibi
     genel bir cümle buraya girmez — her aktarımda çıkıp kullanıcıyı
     durdursaydı, üçüncü seferde okunmayan bir uyarıya dönerdi ve gerçekten
     bir şey kaybolduğunda da okunmazdı. Orijinal dosya zaten Drive'da. */
  let warnings: string[] = [];
  try {
    const buf = Buffer.from(await blob.arrayBuffer());
    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    if (isCsv) {
      /* CSV'de biçim, formül ve görsel YOKTUR — tek bir ızgaradır. ExcelJS'in
         CSV okuyucusu Stream istiyor; metinden okumak hem yeterli hem
         bağımsız. Ayraç Türkçe Excel'de NOKTALI VİRGÜL olur: ilk satırda
         hangisi daha çok geçiyorsa o seçilir. */
      const text = buf.toString("utf8").replace(/^\uFEFF/, "");
      const lines = text.split(/\r?\n/);
      while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
      const first = lines[0] ?? "";
      const sep = first.split(";").length > first.split(",").length ? ";" : ",";
      const ws = wb.addWorksheet(name.replace(/\.csv$/i, "").slice(0, 31) || "CSV");
      for (const line of lines) {
        ws.addRow(line.split(sep).map((c) => c.replace(/^"(.*)"$/, "$1")));
      }
    } else {
      await wb.xlsx.load(buf as unknown as ArrayBuffer);
    }
    const { workbookToSnapshot } = await import("@/lib/sheets/xlsx-import");
    const report = workbookToSnapshot(wb);
    snapshot = report.snapshot;
    warnings = report.notes;

    /* ── GÖMÜLÜ GÖRSELLER ────────────────────────────────────────────────
       Sıraç (2026-09-16): "Resimler yok geliyor, resimlerin de gelmesi
       lazımdı." AFCOM'un ilk sütunu ürün fotoğrafı — onlar gelmezse tablo
       kataloğun yarısı oluyor.

       Görseller Drive'a AYRI DOSYALAR olarak yüklenir ve hücre yalnız
       kimliklerini tutar (lib/sheets/model CellImage). Bu, ekibin zaten
       kullandığı model: "Aynı resmi birkaç defa yüklemek sistemi gereksiz
       ağırlaştırır" (Sıraç, 2026-09-06). Excel'de aynı görsel birden çok
       hücrede olabiliyor; ExcelJS onu tek bir medya kaydında topluyor, biz de
       BİR KEZ yükleyip her hücreden aynı kimliğe işaret ediyoruz.

       Görseller kendi alt klasörüne konur: yüzlerce fotoğrafı föyün yanına
       dökmek Drive'ı okunmaz hâle getirirdi. */
    if (report.images.length > 0) {
      const used = [...new Set(report.images.map((i) => i.imageId))];
      const capped = used.slice(0, IMPORT_IMAGE_LIMIT);
      if (used.length > capped.length) {
        warnings.push(
          `Dosyada ${used.length} görsel var; ilk ${capped.length} tanesi aktarıldı. ` +
          "Kalanlar için orijinal dosya Drive'da duruyor.",
        );
      }

      /* TEK KLASÖR, dosya başına değil.
         Önce her aktarım kendi "<dosya adı> — görseller" klasörünü açıyordu.
         Aynı fotoğraf iki dosyada geçtiğinde hangi klasöre ait olduğunun
         doğru cevabı yok ve klasör başına kopyalamak tam da kaçındığımız
         israf. Hepsi tek yerde toplanır; Drive'da da dağınıklık yapmaz. */
      const imgFolderId = await ensureFolder(
        supabase, ctx, "Aktarılan görseller", null, rec.section ?? "teamwork",
      );

      /* Yüklemeler SIRAYLA değil, küçük bir havuzla: yüzlerce görselde
         sıralı yükleme dakikalar sürer, sınırsız paralel ise depolamayı
         boğar. Altı eşzamanlı istek ikisinin arasında duruyor. */
      const idByMedia = new Map<number, string>();
      let failed = 0;
      const queue = [...capped];
      const worker = async () => {
        for (;;) {
          const mediaId = queue.shift();
          if (mediaId === undefined) return;
          try {
            const media = wb.getImage(mediaId) as unknown as {
              buffer?: Buffer; extension?: string; name?: string;
            };
            if (!media?.buffer?.length) { failed++; continue; }
            const ext = (media.extension ?? "png").replace(/[^a-z0-9]/gi, "") || "png";
            const mime = `image/${ext === "jpg" ? "jpeg" : ext}`;

            /* AYNI FOTOĞRAF İKİNCİ KEZ YÜKLENMEZ.
               Sıraç (2026-09-16): "Gereksiz yer kaplandı, DB dolmasın."

               Yol artık RASTGELE değil, görselin İÇERİĞİNDEN türüyor (sha256).
               Aynı fotoğraf başka bir dosyada da geçiyorsa, aynı dosya ikinci
               kez yüklenmişse ya da aktarım tekrarlanmışsa yol da aynı çıkar:
               depoda tek kopya durur, veritabanında tek satır olur ve bütün
               tablolar aynı kimliğe işaret eder. Ekibin 2026-09-06'daki kuralı
               da buydu: "aynı resmi birkaç defa yüklemek sistemi gereksiz
               ağırlaştırır."

               Kopyaların tamamı TEK KLASÖRDE toplanır (dosya başına ayrı
               klasör değil): aynı fotoğraf iki dosyada geçince hangi klasöre
               ait olduğu sorusunun doğru cevabı yok, ve klasör başına
               kopyalamak tam da kaçındığımız şey olurdu. */
            const sha = createHash("sha256").update(media.buffer).digest("hex");
            const fileName = `${(media.name ?? `gorsel-${mediaId + 1}`).replace(/[^\w.\-() ]/g, "_")}.${ext}`;
            const path = `${ctx.workspaceId}/aktarilan-gorseller/${sha}.${ext}`;

            /* Bu içerik daha önce aktarıldıysa kaydı yeniden kullan. */
            const { data: dup } = await supabase
              .from("operation_documents")
              .select("id")
              .eq("workspace_id", ctx.workspaceId)
              .eq("file_path", path)
              .limit(1)
              .maybeSingle();
            if (dup) { idByMedia.set(mediaId, (dup as { id: string }).id); continue; }

            const { error: upErr } = await supabase.storage
              .from(BUCKET)
              .upload(path, media.buffer, { contentType: mime, upsert: false });
            /* "Zaten var" HATA DEĞİL: iki aktarım aynı anda aynı fotoğrafı
               yüklüyor olabilir. Bayt aynı olduğu için ikinci yükleme
               gereksizdir, kayıt açmaya devam edilir. */
            const alreadyThere =
              !!upErr && /exists|duplicate|409/i.test(`${upErr.message ?? ""}`);
            if (upErr && !alreadyThere) { failed++; continue; }
            const { data: docRow, error: insErr } = await supabase
              .from("operation_documents")
              .insert({
                workspace_id: ctx.workspaceId,
                title: fileName,
                document_type: "file",
                folder_id: imgFolderId,
                file_path: path,
                file_name: fileName,
                file_size: media.buffer.length,
                file_mime: mime,
                section: rec.section ?? "teamwork",
                status: "approved",
                owner_id: ctx.userId,
                created_by: ctx.userId,
              })
              .select("id")
              .single();
            if (insErr || !docRow) {
              /* Bayt depoda ÖKSÜZ kalmasın — ama yalnız BİZ yüklediysek.
                 Dosya zaten oradaydıysa başkasının kaydına ait olabilir;
                 silmek onun görselini de yok ederdi. */
              if (!alreadyThere) await supabase.storage.from(BUCKET).remove([path]);
              failed++;
              continue;
            }
            idByMedia.set(mediaId, (docRow as { id: string }).id);
          } catch {
            failed++;
          }
        }
      };
      await Promise.all(Array.from({ length: 6 }, worker));

      /* Yerleşimleri hücrelere yaz. */
      const wbSnap = snapshot as { sheets: { cells: Record<string, Record<string, unknown>> }[] };
      let placed = 0;
      for (const im of report.images) {
        const docId = idByMedia.get(im.imageId);
        if (!docId) continue;
        const sheet = wbSnap.sheets[im.sheet];
        if (!sheet) continue;
        const k = `${im.r}:${im.c}`;
        const cell = sheet.cells[k] ?? {};
        cell.img = { id: docId, name: "Görsel", cs: im.cs, rs: im.rs };
        sheet.cells[k] = cell;
        placed++;
      }
      if (failed > 0) warnings.push(`${failed} görsel aktarılamadı.`);
    }
  } catch {
    return { error: "Bu dosya tabloya aktarılamadı; indirerek Excel'de açabilirsiniz." };
  }

  const { data: created, error } = await supabase
    .from("operation_spreadsheets")
    .insert({
      workspace_id: ctx.workspaceId,
      created_by: ctx.userId,
      owner_id: ctx.userId,
      title,
      sheet_type: "freeform",
      status: "active",
      folder_id: rec.folder_id,
      section: rec.section ?? "teamwork",
      snapshot,
      source_document_id: documentId,
    })
    .select("id")
    .single();
  if (error) {
    /* Kolon migrate edilmemişse bağ olmadan yeniden denenir: aktarımın
       tamamını bir kolon yüzünden reddetmek, çalışan bir özelliği durdurmak
       olurdu (tek bedeli, her tıkta yeni kopya). */
    if (isMissingSchemaError(error)) {
      const retry = await supabase
        .from("operation_spreadsheets")
        .insert({
          workspace_id: ctx.workspaceId,
          created_by: ctx.userId,
          owner_id: ctx.userId,
          title,
          sheet_type: "freeform",
          status: "active",
          folder_id: rec.folder_id,
          section: rec.section ?? "teamwork",
          snapshot,
        })
        .select("id")
        .single();
      if (retry.error) return { error: toActionErrorMessage(retry.error) };
      revalidatePath("/documents");
      return { id: (retry.data as { id: string }).id, warnings };
    }
    return { error: toActionErrorMessage(error) };
  }

  revalidatePath("/documents");
  return { id: (created as { id: string }).id, warnings };
}

/**
 * YÜKLENEN WORD'Ü DÜZENLENEBİLİR YAZIYA AKTAR.
 *
 * Sıraç (2026-09-16): "Excel olarak eklediğimiz dosyalar ya da Word, vs. nasıl
 * eklendiyse öyle açılmalı ve kullanılmalı."
 *
 * Excel'dekiyle AYNI sözleşme: ilk tıkta aktarılır ve dosyaya bağlanır,
 * sonraki her tıkta aynı yazı açılır; yüklenen .docx Drive'da kalır.
 *
 * GÖRSELLER `teamwork-images` KOVASINA gider. O kova AÇIKTIR ve kalıcı adres
 * verir — yazının gövdesi HTML olarak saklandığı için imzalı (saatlik) adres
 * yazmak ertesi gün kırık resim demekti. Gömülü base64 de olmaz: sanitizer
 * yalnız http(s) ve mailto şemasına izin veriyor, `data:` silinir.
 */
export async function importUploadedDoc(
  documentId: string,
): Promise<{ id: string; warnings: string[]; reused?: boolean } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const existing = await supabase
    .from("operation_documents")
    .select("id")
    .eq("workspace_id", ctx.workspaceId)
    .eq("source_document_id", documentId)
    .eq("document_type", "doc")
    .neq("status", "archived")
    .limit(1)
    .maybeSingle();
  if (!existing.error && existing.data) {
    return { id: (existing.data as { id: string }).id, warnings: [], reused: true };
  }

  const { data: row } = await supabase
    .from("operation_documents")
    .select("file_path, file_name, title, folder_id, section")
    .eq("id", documentId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  const rec = row as {
    file_path: string | null; file_name: string | null; title: string;
    folder_id: string | null; section: string | null;
  } | null;
  if (!rec?.file_path) return { error: NOT_FOUND };

  const name = (rec.file_name ?? rec.title ?? "").trim();
  /* .doc ESKİ İKİLİ BİÇİM — mammoth yalnız .docx okur. */
  if (/\.doc$/i.test(name)) {
    return { error: "Eski .doc biçimi aktarılamıyor. Dosyayı Word'de açıp .docx olarak kaydedip yeniden yükleyin." };
  }

  const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(rec.file_path);
  if (dlErr || !blob) return { error: "Dosya okunamadı." };

  const warnings: string[] = [];
  let html = "";
  try {
    const buf = Buffer.from(await blob.arrayBuffer());
    const mammoth = await import("mammoth");
    let imageCount = 0;
    let imageFailed = 0;
    const result = await mammoth.convertToHtml(
      { buffer: buf },
      {
        convertImage: mammoth.images.imgElement(async (image) => {
          if (imageCount >= IMPORT_IMAGE_LIMIT) { imageFailed++; return { src: "" }; }
          try {
            const bytes = Buffer.from(await image.read("base64"), "base64");
            const mime = (image.contentType ?? "image/png").toLowerCase();
            const ext = mime.split("/")[1]?.replace(/[^a-z0-9]/g, "") || "png";
            const path = `${ctx.workspaceId}/${crypto.randomUUID()}.${ext}`;
            const { error: upErr } = await supabase.storage
              .from("teamwork-images")
              .upload(path, bytes, { contentType: mime, upsert: false });
            if (upErr) { imageFailed++; return { src: "" }; }
            const { data } = supabase.storage.from("teamwork-images").getPublicUrl(path);
            imageCount++;
            return { src: data.publicUrl };
          } catch {
            imageFailed++;
            return { src: "" };
          }
        }),
      },
    );
    html = result.value;
    if (imageFailed > 0) warnings.push(`${imageFailed} görsel aktarılamadı.`);
  } catch {
    return { error: "Bu dosya yazıya aktarılamadı; indirerek Word'de açabilirsiniz." };
  }

  /* Gövde HER ZAMAN temizleyiciden geçer: mammoth'un ürettiği HTML güvenilir
     olsa da kaynak KULLANICI DOSYASI, ve bu uygulamada zengin metnin tek
     giriş kapısı sanitizeRichText'tir. */
  const { sanitizeRichText } = await import("@/lib/office/sanitize-html");
  const body = sanitizeRichText(html);
  const title = name.replace(/\.docx$/i, "").slice(0, 300) || "Aktarılan yazı";

  const payload = {
    workspace_id: ctx.workspaceId,
    created_by: ctx.userId,
    owner_id: ctx.userId,
    title,
    document_type: "doc",
    status: "approved",
    folder_id: rec.folder_id,
    section: rec.section ?? "teamwork",
    body,
  };

  const { data: created, error } = await supabase
    .from("operation_documents")
    .insert({ ...payload, source_document_id: documentId })
    .select("id")
    .single();
  if (error) {
    /* Kolon migrate edilmemişse bağ olmadan devam — tek bedeli, her tıkta
       yeni kopya. Çalışan bir özelliği bir kolon yüzünden durdurmayız. */
    if (isMissingSchemaError(error)) {
      const retry = await supabase.from("operation_documents").insert(payload).select("id").single();
      if (retry.error) return { error: toActionErrorMessage(retry.error) };
      revalidatePath("/documents");
      return { id: (retry.data as { id: string }).id, warnings };
    }
    return { error: toActionErrorMessage(error) };
  }

  revalidatePath("/documents");
  return { id: (created as { id: string }).id, warnings };
}
