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
