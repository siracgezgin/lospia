"use server";

import { createClient, getAuthUser, getMembership } from "@/lib/supabase/server";

/**
 * HESAP TABLOSU GÖRSEL HÜCRESİ — Drive köprüsü.
 *
 * Sıraç (2026-09-06): "Excel'de resim ekle kısmı olsun, + basıp sistemdeki
 * klasörden seçelim… Aynı resmi birkaç defa yüklemek sistemi gereksiz
 * ağırlaştırır."
 *
 * Hücre görselin BAYTINI değil KİMLİĞİNİ tutar (lib/sheets/model CellImage).
 * Buradaki iki eylem o kimlikle görüntülenebilir adres arasındaki köprüdür:
 *
 *   listDriveImages()  → seçicinin göreceği görseller (klasör yoluyla birlikte)
 *   signSheetImages()  → tabloda KULLANILAN kimlikler için imzalı adres
 *
 * NEDEN İKİ AYRI EYLEM: seçici çok sayıda görseli listeler ve kullanıcı onu
 * nadiren açar; tablo ise her açılışta yalnız kendi kullandığı birkaç görselin
 * adresine ihtiyaç duyar. Tek eylemde birleştirmek, tabloyu açan herkese
 * yüzlerce imza ürettirirdi.
 *
 * ADRESLER SAKLANMAZ: `documents` kovası özeldir, imzalı adres saatliktir.
 * Anlık görüntüye adres yazmak ertesi gün kırık resim demekti.
 */

const BUCKET = "documents";
/** İmza ömrü — sayfa açık kalırken yenilenmeye gerek kalmasın diye 1 saat. */
const SIGN_TTL = 3600;
/** Seçicide tek seferde gösterilecek en fazla görsel. Arama bunu daraltır. */
const PICKER_LIMIT = 300;

const AUTH_REQUIRED = "Oturum gerekli.";

async function getCtx() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return null;
  const member = await getMembership(user.id);
  if (!member?.workspace_id) return null;
  return { supabase, workspaceId: member.workspace_id };
}

export type DriveImage = {
  id: string;
  name: string;
  /** Klasör yolu — "Koleksiyon / Broş" gibi; seçicide nerede olduğunu söyler. */
  folderPath: string;
  /** İmzalı önizleme adresi (1 saat). */
  url: string | null;
  sizeBytes: number | null;
};

type FolderRow = { id: string; name: string; parent_id: string | null };
type FileRow = {
  id: string;
  title: string;
  file_name: string | null;
  file_path: string | null;
  file_mime: string | null;
  file_size: number | null;
  folder_id: string | null;
};

/** Klasör kimliği → "Üst / Alt" okunur yol. Döngüye karşı korumalı. */
function buildFolderPaths(folders: FolderRow[], rootLabel: string): Map<string, string> {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const out = new Map<string, string>();
  for (const start of folders) {
    const parts: string[] = [];
    const seen = new Set<string>();
    let cur: string | null = start.id;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const f: FolderRow | undefined = byId.get(cur);
      if (!f) break;
      parts.unshift(f.name);
      cur = f.parent_id;
    }
    out.set(start.id, [rootLabel, ...parts].join(" / "));
  }
  return out;
}

/**
 * Seçicinin listesi: çalışma alanındaki YÜKLENMİŞ GÖRSELLER.
 * `query` verilirse ad ve klasör yolunda aranır.
 */
export async function listDriveImages(
  query?: string,
): Promise<{ images: DriveImage[]; truncated: boolean } | { error: string }> {
  const ctx = await getCtx();
  if (!ctx) return { error: AUTH_REQUIRED };
  const { supabase, workspaceId } = ctx;

  const [{ data: folderRows }, { data: fileRows, error }] = await Promise.all([
    supabase
      .from("document_folders")
      .select("id, name, parent_id")
      .eq("workspace_id", workspaceId),
    supabase
      .from("operation_documents")
      .select("id, title, file_name, file_path, file_mime, file_size, folder_id")
      .eq("workspace_id", workspaceId)
      .not("file_path", "is", null)
      .like("file_mime", "image/%")
      .order("created_at", { ascending: false }),
  ]);

  if (error) return { error: "Görseller okunamadı." };

  const folders = (folderRows ?? []) as FolderRow[];
  const paths = buildFolderPaths(folders, "Drive");
  const files = (fileRows ?? []) as FileRow[];

  const needle = (query ?? "").trim().toLocaleLowerCase("tr-TR");
  const matched = files.filter((f) => {
    if (!f.file_path) return false;
    if (!needle) return true;
    const name = (f.file_name ?? f.title ?? "").toLocaleLowerCase("tr-TR");
    const folder = (f.folder_id ? paths.get(f.folder_id) ?? "" : "Drive").toLocaleLowerCase("tr-TR");
    return name.includes(needle) || folder.includes(needle);
  });

  const truncated = matched.length > PICKER_LIMIT;
  const page = matched.slice(0, PICKER_LIMIT);

  /* İmzalar TEK turda üretilir; dosya başına ayrı istek atmak seçiciyi
     saniyelerce bekletirdi (documents/page.tsx da aynı deseni kullanıyor). */
  const signedByPath = new Map<string, string>();
  if (page.length) {
    const { data: signed } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(page.map((f) => f.file_path as string), SIGN_TTL);
    for (const row of signed ?? []) {
      if (row.path && row.signedUrl) signedByPath.set(row.path, row.signedUrl);
    }
  }

  return {
    images: page.map((f) => ({
      id: f.id,
      name: f.file_name ?? f.title ?? "Adsız görsel",
      folderPath: f.folder_id ? paths.get(f.folder_id) ?? "Drive" : "Drive",
      url: f.file_path ? signedByPath.get(f.file_path) ?? null : null,
      sizeBytes: f.file_size,
    })),
    truncated,
  };
}

/**
 * Tablonun KULLANDIĞI görseller için imzalı adres.
 * Kimlik → adres; bulunamayan (silinmiş) kayıt haritada YER ALMAZ, çağıran
 * taraf onu "görsel bulunamadı" olarak çizer.
 */
export async function signSheetImages(
  ids: string[],
): Promise<{ urls: Record<string, string> } | { error: string }> {
  const ctx = await getCtx();
  if (!ctx) return { error: AUTH_REQUIRED };
  const { supabase, workspaceId } = ctx;

  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return { urls: {} };

  const { data, error } = await supabase
    .from("operation_documents")
    .select("id, file_path")
    .eq("workspace_id", workspaceId)
    .in("id", unique);
  if (error) return { error: "Görsel adresleri alınamadı." };

  const rows = (data ?? []) as { id: string; file_path: string | null }[];
  const withPath = rows.filter((r) => r.file_path);
  if (!withPath.length) return { urls: {} };

  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(withPath.map((r) => r.file_path as string), SIGN_TTL);

  const byPath = new Map((signed ?? []).map((s) => [s.path ?? "", s.signedUrl as string | null]));
  const urls: Record<string, string> = {};
  for (const r of withPath) {
    const url = byPath.get(r.file_path as string);
    if (url) urls[r.id] = url;
  }
  return { urls };
}
