/**
 * YEDEK TOPLAYICI — çalışma alanının tüm kayıtları, tablo tablo.
 *
 * Kapsam kuralı: bir tablo ya `workspace_id` taşır (çoğu → WORKSPACE_TABLES),
 * ya çalışma alanının kendisidir, ya da workspace'e bir ÜST KAYIT üzerinden
 * bağlıdır (profiller ve sürüm tabloları → collectWorkspaceData'nın sonundaki
 * `in` blokları). Yeni tablo eklendiğinde yedeğe girmesi için ikisinden birine
 * eklenmesi gerekir; hangisi olduğunu tablonun sütunları söyler.
 *
 * Okuma NORMAL istemciyle, yani RLS ile yapılır (proje güvenlik kuralı:
 * uygulama okumaları için RLS atlanmaz). Yedeği alan kişi yöneticidir; yönetici
 * politikası neyi görüyorsa yedek onu içerir. Kaç satır alındığı manifeste
 * yazılır ki yedeğin kapsamı sonradan tartışma konusu olmasın.
 */

import type { createClient } from "@/lib/supabase/server";

/** Sunucu istemcisinin kendi tipi — şema jeneriği uygulanmadığı için (bkz.
 *  lib/supabase/server.ts notu) tip buradan türetilir, elle yazılmaz. */
type Client = Awaited<ReturnType<typeof createClient>>;

/** Nasıl daraltılacağı — her tablonun workspace'e bağlanma biçimi. */
type Scope =
  | { by: "workspace_id"; value: string }
  | { by: "id"; value: string }                        // workspaces
  | { by: "in"; column: string; ids: () => string[] }; // sürüm tabloları

export interface TableResult {
  table: string;
  rows: Record<string, unknown>[];
  /** Okuma reddedildiyse (RLS) ya da tablo yoksa buraya düşer. */
  error?: string;
}

/** workspace_id taşıyan tablolar — alfabetik, types/database.ts ile eşleşir. */
const WORKSPACE_TABLES = [
  "creative_assets",
  "custom_field_definitions",
  "department_members",
  "document_folders",
  "document_templates",
  "finance_payments",
  "operation_documents",
  "operation_spreadsheets",
  "planning_bands",
  "planning_meetings",
  "planning_open_items",
  "planning_process_steps",
  "planning_templates",
  "planning_topics",
  "planning_week_matrix",
  "points_ledger",
  "production_sheet_materials",
  "production_sheets",
  "saved_views",
  "task_activity",
  "task_activity_logs",
  "task_attachments",
  "task_member_completions",
  "task_note_acknowledgements",
  "task_notes",
  "tasks",
  "time_entries",
  "workspace_activity_logs",
  "workspace_contacts",
  "workspace_departments",
  "workspace_invites",
  "workspace_manufacturers",
  "workspace_materials",
  "workspace_members",
  "workspace_notes",
  "workspace_product_categories",
  "workspace_rules",
  "workspace_seasons",
  "workspace_suppliers",
] as const;

/* Yedeğe GİRMEYENLER ve nedenleri — üçü de "gereksiz log" sınıfıdır, işin
   kendisi değil (Sıraç, 2026-08-29: "her şey olsun, sadece gereksiz loglar
   olmasın"). Klasörler, üretim föyleri, belgeler ve tabloların sürümleri
   yedeğe GİRER:
     notifications   → türetilmiş ve kişiye özel; RLS yalnız yedeği alan kişinin
                       satırlarını verir, yani dosyaya "eksik ama tam görünen"
                       bir liste yazardı.
     workspace_backups → indirme günlüğü; yedeğin kendi geçmişini yedeklemenin
                       geri yüklemede bir karşılığı yok.
     webhook_events  → teknik kuyruk kaydı, geri yüklemede bir anlamı yok.
     request_access_leads → pazarlama sitesinin formu; çalışma alanına ait değil.

   Kapsam supabase/migrations altındaki TÜM `create table` satırlarıyla
   karşılaştırıldı (2026-09-05): yukarıdaki dört tablo dışında şemadaki her
   tablo yedeğe giriyor; BACKUP_BUCKETS de migration'larda oluşturulan her
   depolama kovasını kapsıyor. Yeni bir migration tablo eklediğinde bu listeye
   ya da WORKSPACE_TABLES'a eklenmesi gerekir.

   DENETİMİ TEKRARLAMAK İÇİN (yeni migration yazan herkes çalıştırsın):
     grep -rhoiE "create table (if not exists )?(public\.)?[a-z_]+" \
       supabase/migrations | sed -E 's/.*[. ]([a-z_]+)$/\1/' | sort -u
   Çıkan her ad ya WORKSPACE_TABLES'ta, ya EXCLUDED_TABLES'ta, ya da
   collectWorkspaceData'nın sonundaki `in` bloklarında (workspaces, profiles ve
   sürüm tabloları) görünmelidir. Görünmüyorsa o tablo yedeğe GİRMİYOR. */

/** Bilerek yedeğe alınmayan tablolar — OKUBENI ve özet dosyasında yazılı olsun
 *  ki "neden bu tablo yok?" sorusu yedeğin içinden cevaplanabilsin. */
export const EXCLUDED_TABLES: ReadonlyArray<{ table: string; reason: string }> = [
  { table: "notifications", reason: "kişiye özel bildirim kutusu; türetilmiş veri" },
  { table: "workspace_backups", reason: "yedek indirme günlüğü" },
  { table: "webhook_events", reason: "teknik kuyruk kaydı" },
  { table: "request_access_leads", reason: "pazarlama sitesi formu; çalışma alanına ait değil" },
];

const PAGE = 1000;

/** `in(...)` filtresi URL'ye yazılır; binlerce kimlik URL'yi taşırır (HTTP 414)
 *  ve tablo yedeğe "hata" olarak girerdi. Kimlikler paketlere bölünür. */
const ID_CHUNK = 200;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Tek tabloyu sayfalayarak tamamen okur. */
async function readAll(
  supabase: Client,
  table: string,
  scope: Scope,
): Promise<TableResult> {
  const rows: Record<string, unknown>[] = [];

  // `in` kapsamı paketlere bölünür; diğer kapsamlar tek geçiştir.
  let batches: (string[] | null)[] = [null];
  if (scope.by === "in") {
    const ids = scope.ids();
    if (ids.length === 0) return { table, rows: [] };
    batches = chunk(ids, ID_CHUNK);
  }

  for (const ids of batches) {
    for (let from = 0; ; from += PAGE) {
      /* SIRALAMA ŞART: sıralaması olmayan bir sorguda `range` sayfaları
         Postgres'te kararlı değildir — aynı satır iki sayfada birden gelebilir
         ya da hiç gelmeyebilir, yani 1000 satırı geçen her tablo sessizce
         EKSİK yedeklenirdi. Kapsamdaki tabloların hepsinde `id` sütunu var
         (bkz. supabase/migrations). */
      let q = supabase
        .from(table)
        .select("*")
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (scope.by === "workspace_id") q = q.eq("workspace_id", scope.value);
      else if (scope.by === "id") q = q.eq("id", scope.value);
      else q = q.in(scope.column, ids ?? []);

      const { data, error } = await q;
      if (error) return { table, rows, error: error.message };
      const page = (data ?? []) as Record<string, unknown>[];
      rows.push(...page);
      if (page.length < PAGE) break;
    }
  }
  return { table, rows };
}

/**
 * Çalışma alanının tamamını okur. Sıra önemlidir: üyeler ve şablonlar önce
 * okunur, çünkü profiller ve sürüm tabloları onların kimliklerine dayanır.
 */
export async function collectWorkspaceData(
  supabase: Client,
  workspaceId: string,
): Promise<TableResult[]> {
  const results: TableResult[] = [];

  results.push(await readAll(supabase, "workspaces", { by: "id", value: workspaceId }));

  for (const table of WORKSPACE_TABLES) {
    results.push(
      await readAll(supabase, table, { by: "workspace_id", value: workspaceId }),
    );
  }

  const idsOf = (table: string, column = "id") =>
    (results.find((r) => r.table === table)?.rows ?? [])
      .map((r) => r[column])
      .filter((v): v is string => typeof v === "string");

  // Ekip profilleri — isim, kullanıcı adı, fotoğraf yolu. Üyelik satırı
  // olmayan kişi yedeğe girmez.
  results.push(
    await readAll(supabase, "profiles", {
      by: "in",
      column: "id",
      ids: () => idsOf("workspace_members", "user_id"),
    }),
  );

  // SÜRÜM TABLOLARI — belgelerin ve tabloların içeriğinin geçmişi; yedekte
  // olmaları şart. `workspace_id` sütunları YOKTUR (bkz. types/database.ts),
  // bu yüzden WORKSPACE_TABLES'a taşınamazlar: orada okuma workspace_id ile
  // daraltılır ve sorgu hata döner. Üst kaydın kimliği üzerinden toplanırlar.
  results.push(
    await readAll(supabase, "document_template_versions", {
      by: "in",
      column: "template_id",
      ids: () => idsOf("document_templates"),
    }),
  );
  results.push(
    await readAll(supabase, "operation_spreadsheet_versions", {
      by: "in",
      column: "spreadsheet_id",
      ids: () => idsOf("operation_spreadsheets"),
    }),
  );

  return results;
}

/** Yedeğe giren depolama kovaları — yüklenen her dosya bunlardan birindedir. */
export const BACKUP_BUCKETS = [
  "documents",        // AF Teamwork dosyaları (özel)
  "production-sheets", // üretim föyü görselleri
  "teamwork-images",   // yazıların içine gömülen görseller
  "task-attachments",  // görev ekleri (yükleme bayrağı açıkken)
  "avatars",           // profil fotoğrafları
] as const;

export interface StorageFile {
  bucket: string;
  path: string;
  size: number;
}

/**
 * Bir kovadaki tüm dosyaları klasör klasör gezerek listeler.
 * Supabase Storage'ın `list` çağrısı özyinelemeli değildir; klasörler
 * `id === null` satırlarıyla temsil edilir.
 */
export async function listBucketFiles(
  supabase: Client,
  bucket: string,
  budgetBytes: number,
): Promise<{ files: StorageFile[]; truncated: boolean; error?: string }> {
  const files: StorageFile[] = [];
  const queue: string[] = [""];
  let total = 0;

  while (queue.length > 0) {
    const prefix = queue.shift() as string;
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
      if (error) return { files, truncated: false, error: error.message };
      const items = data ?? [];
      for (const item of items) {
        const path = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id === null) {
          queue.push(path); // klasör
          continue;
        }
        const size = (item.metadata?.size as number | undefined) ?? 0;
        if (total + size > budgetBytes) return { files, truncated: true };
        total += size;
        files.push({ bucket, path, size });
      }
      if (items.length < 100) break;
    }
  }
  return { files, truncated: false };
}

/** Satır dizisini CSV'ye çevirir — Excel'de açılabilsin diye (BOM + noktalı virgül yok). */
export function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const cell = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.join(",")];
  for (const r of rows) lines.push(columns.map((c) => cell(r[c])).join(","));
  return lines.join("\r\n");
}
