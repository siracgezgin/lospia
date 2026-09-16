#!/usr/bin/env npx tsx
/**
 * BİR GÖRSEL KLASÖRÜNÜ TEMİZLE — önce SAY, sonra sil.
 *
 * Sıraç (2026-09-16): "Sisteme daha önce eklediğim şuradaki Excel Görselleri
 * kaldıralım, boşa yer kaplıyor."
 *
 * NEDEN DOĞRUDAN SİLMEK YANLIŞ OLURDU: o klasördeki görseller 2026-09-06'da
 * `import-excel-images.py` ile aktarıldı ve amaçları TABLOLARDAN ÇAĞRILMAKTI
 * ("önce klasör oluşturup oraya ekleyelim, sonra Excel'de o resmi klasörden
 * çağırtıp gösterelim"). Hücreler görselin BAYTINI değil KİMLİĞİNİ tutuyor
 * (lib/sheets/model CellImage). Kimliği silmek, onu kullanan her tabloda
 * fotoğrafı yok eder ve geri dönüşü yoktur — depodaki dosya da gider.
 *
 * Bu yüzden betik ÜÇ AŞAMALI:
 *   1. (varsayılan)  Klasörü bulur, içindekileri sayar, HANGİLERİNİN hâlâ bir
 *                    tabloda kullanıldığını çıkarır. HİÇBİR ŞEY SİLMEZ.
 *   2. --sil-kullanilmayan   Yalnız hiçbir tabloda geçmeyenleri siler.
 *   3. --sil-hepsi           Kullanılanlar dahil siler. Kullanan tablolar
 *                            varsa adlarını yazar ve ONAY İSTER.
 *
 * KULLANIM
 *   npx tsx scripts/cleanup-image-folder.ts "Excel Görselleri"
 *
 *   Canlı: proje kökünde `.env.prod` aç (gitignore'da), iki satır yaz —
 *     IMPORT_SUPABASE_URL=https://xxxx.supabase.co
 *     IMPORT_SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxxx
 *   sonra:
 *     npm run cleanup:images -- "Excel Görselleri" --prod
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import * as readline from "node:readline/promises";

const ARGS = process.argv.slice(2);
const PROD = ARGS.includes("--prod");
const DEL_UNUSED = ARGS.includes("--sil-kullanilmayan");
const DEL_ALL = ARGS.includes("--sil-hepsi");
/* NPM TIRNAKLARI DÜŞÜRÜYOR. `npm run cleanup:images -- "Excel Görselleri"`
   betiğe iki ayrı argüman olarak ulaşıyor ve yalnız ilkini almak klasör adını
   "Excel" yapıyordu — var olmayan bir klasör. Bayrak olmayan ne varsa
   birleştirilir; boşluklu klasör adları böyle de çalışır. */
const FOLDER_NAME = ARGS.filter((a) => !a.startsWith("--")).join(" ").trim() || undefined;

const BUCKET = "documents";

function readEnvFile(name: string): Record<string, string> {
  const p = path.join(process.cwd(), name);
  const env: Record<string, string> = {};
  if (!fs.existsSync(p)) return env;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

/**
 * Hedef veritabanı. Anahtarı HER SEFERİNDE komut satırına yapıştırmak zorunda
 * kalma: `.env.prod` dosyası da okunur ve `.env.*` zaten gitignore'da.
 * Sıra: ortam değişkeni → .env.prod → .env.local (yerel).
 */
function resolveTarget(): { url: string; key: string; label: string } {
  const prodFile = readEnvFile(".env.prod");
  const url = process.env.IMPORT_SUPABASE_URL ?? prodFile.IMPORT_SUPABASE_URL;
  const key = process.env.IMPORT_SUPABASE_SERVICE_ROLE_KEY ?? prodFile.IMPORT_SUPABASE_SERVICE_ROLE_KEY;

  if (PROD || url || key) {
    /* HANGİSİ EKSİKSE ONU SÖYLE. İki değeri birden istemek, biri zaten
       yazılıyken "ne yapacağım" sorusunu doğuruyor. */
    if (!url || !key) {
      const has = (v: string | undefined) => (v ? "✓" : "✗");
      console.error("\n❌  Canlı veritabanına bağlanılamadı — `.env.prod` eksik.\n");
      console.error(`      ${has(url)} IMPORT_SUPABASE_URL`);
      console.error(`      ${has(key)} IMPORT_SUPABASE_SERVICE_ROLE_KEY\n`);
      if (url && !key) {
        /* Proje kimliği adresin içinde; panel bağlantısını hazır ver. */
        const ref = /https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(url)?.[1];
        console.error("    Adres yazılmış, EKSİK OLAN YALNIZ ANAHTAR.\n");
        console.error("    1) Şu sayfayı aç:");
        console.error(`       https://supabase.com/dashboard/project/${ref ?? "<proje>"}/settings/api-keys`);
        console.error('    2) "Secret keys" bölümündeki `default` anahtarını kopyala');
        console.error("       (sb_secret_… ile başlar; sb_publishable_… OLAN DEĞİL)");
        console.error("    3) `.env.prod` dosyasındaki şu satırın SONUNA yapıştır:\n");
        console.error("       IMPORT_SUPABASE_SERVICE_ROLE_KEY=sb_secret_buraya\n");
      } else {
        console.error("    Proje kökünde `.env.prod` dosyası aç (gitignore'da) ve iki satır yaz:\n");
        console.error("      IMPORT_SUPABASE_URL=https://<proje-kimliği>.supabase.co");
        console.error("      IMPORT_SUPABASE_SERVICE_ROLE_KEY=sb_secret_…\n");
        console.error("    İkisi de: Supabase paneli → Project Settings → API\n");
      }
      console.error("    Sonra aynı komutu tekrar çalıştır.");
      process.exit(1);
    }
    if (key.startsWith("sb_publishable_")) {
      console.error("❌  Bu bir tarayıcı anahtarı (publishable) — kayıtları silemez.");
      console.error("    Secret keys → default (sb_secret_…) kullanın.");
      process.exit(1);
    }
    return { url, key, label: "PRODUCTION" };
  }

  const local = readEnvFile(".env.local");
  const lUrl = local.NEXT_PUBLIC_SUPABASE_URL;
  const lKey = local.SUPABASE_SERVICE_ROLE_KEY;
  if (!lUrl || !lKey) {
    console.error("❌  .env.local içinde NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY yok.");
    console.error("    Canlıya bakmak için --prod kullanın.");
    process.exit(1);
  }
  return { url: lUrl, key: lKey, label: "LOCAL" };
}

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;

/** Bir anlık görüntüde geçen bütün görsel kimlikleri. Biçimden bağımsız
 *  çalışsın diye METİN içinde aranır: kimlikler uuid ve hücre modeli
 *  değişse bile bu tarama kimlikleri bulur. Yanlış pozitif (bir kimliğin
 *  tesadüfen metinde geçmesi) SİLMEMEYE yol açar — güvenli taraf. */
function idsInSnapshot(snapshot: unknown, wanted: Set<string>): string[] {
  if (!snapshot) return [];
  const text = JSON.stringify(snapshot);
  const hit: string[] = [];
  for (const id of wanted) if (text.includes(id)) hit.push(id);
  return hit;
}

async function main() {
  if (!FOLDER_NAME) {
    console.error('Kullanım: npx tsx scripts/cleanup-image-folder.ts "Klasör Adı" [--prod] [--sil-kullanilmayan|--sil-hepsi]');
    process.exit(1);
  }
  const { url, key, label } = resolveTarget();
  const db: SupabaseClient = createClient(url, key, { auth: { persistSession: false } });
  console.log(`\n▸ Hedef: ${label}  ·  klasör: "${FOLDER_NAME}"\n`);

  const { data: folders, error: fErr } = await db
    .from("document_folders")
    .select("id, name, workspace_id")
    .eq("name", FOLDER_NAME);
  if (fErr) { console.error("❌ Klasör sorgusu:", fErr.message); process.exit(1); }
  if (!folders?.length) { console.error(`❌ "${FOLDER_NAME}" adlı klasör yok.`); process.exit(1); }
  if (folders.length > 1) console.log(`⚠️  Aynı adda ${folders.length} klasör var; hepsi işlenecek.\n`);

  const folderIds = folders.map((f) => f.id as string);

  /* Alt klasörler de dahil: betik sayfa adına göre alt klasör açıyordu. */
  const { data: subs } = await db
    .from("document_folders")
    .select("id, parent_id")
    .in("parent_id", folderIds);
  const allFolderIds = [...folderIds, ...((subs ?? []) as { id: string }[]).map((s) => s.id)];

  const { data: files, error: dErr } = await db
    .from("operation_documents")
    .select("id, title, file_path, thumb_path, file_size")
    .in("folder_id", allFolderIds)
    .eq("document_type", "file");
  if (dErr) { console.error("❌ Dosya sorgusu:", dErr.message); process.exit(1); }

  const rows = (files ?? []) as {
    id: string; title: string; file_path: string | null;
    thumb_path: string | null; file_size: number | null;
  }[];
  const totalBytes = rows.reduce((a, r) => a + (r.file_size ?? 0), 0);
  console.log(`Klasörde ${rows.length} dosya · ${mb(totalBytes)}\n`);
  if (rows.length === 0) { console.log("Yapılacak bir şey yok."); return; }

  /* ── KULLANIM TARAMASI ─────────────────────────────────────────────────
     Tabloların anlık görüntüleri tek tek taranır. Sayfa sayfa çekilir:
     tek seferde hepsini almak megabaytlarca veri demek. */
  const wanted = new Set(rows.map((r) => r.id));
  const usedBy = new Map<string, Set<string>>();   // görsel kimliği → tablo adları
  let scanned = 0;
  for (let from = 0; ; from += 50) {
    const { data: sheets, error } = await db
      .from("operation_spreadsheets")
      .select("id, title, snapshot")
      .range(from, from + 49);
    if (error) { console.error("❌ Tablo taraması:", error.message); process.exit(1); }
    if (!sheets?.length) break;
    for (const s of sheets as { id: string; title: string; snapshot: unknown }[]) {
      scanned++;
      for (const id of idsInSnapshot(s.snapshot, wanted)) {
        if (!usedBy.has(id)) usedBy.set(id, new Set());
        usedBy.get(id)!.add(s.title || s.id);
      }
    }
    if (sheets.length < 50) break;
  }

  const used = rows.filter((r) => usedBy.has(r.id));
  const unused = rows.filter((r) => !usedBy.has(r.id));
  const usedBytes = used.reduce((a, r) => a + (r.file_size ?? 0), 0);
  const unusedBytes = unused.reduce((a, r) => a + (r.file_size ?? 0), 0);

  console.log(`${scanned} tablo tarandı.`);
  console.log(`  KULLANILAN   ${String(used.length).padStart(5)} dosya · ${mb(usedBytes)}`);
  console.log(`  KULLANILMAYAN${String(unused.length).padStart(5)} dosya · ${mb(unusedBytes)}\n`);

  if (used.length) {
    const tables = new Set<string>();
    for (const set of usedBy.values()) for (const t of set) tables.add(t);
    console.log("Bu klasörün görsellerini KULLANAN tablolar:");
    for (const t of [...tables].sort()) console.log("   ·", t);
    console.log();
  }

  if (!DEL_UNUSED && !DEL_ALL) {
    console.log("Hiçbir şey silinmedi (rapor kipi).");
    console.log("  Yalnız kullanılmayanları sil:  --sil-kullanilmayan");
    console.log("  Hepsini sil (tablolar bozulur): --sil-hepsi");
    return;
  }

  const target = DEL_ALL ? rows : unused;
  if (!target.length) { console.log("Silinecek dosya yok."); return; }

  if (DEL_ALL && used.length) {
    console.log(`⚠️  ${used.length} dosya hâlâ kullanılıyor; silinirse o tablolarda fotoğraflar KAYBOLUR.`);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ans = (await rl.question('Devam etmek için "SIL" yazın: ')).trim();
    rl.close();
    if (ans !== "SIL") { console.log("Vazgeçildi."); return; }
  }

  /* Depo önce, kayıt sonra: kayıt silinip dosya kalırsa öksüz bayt birikir ve
     onu bir daha bulmanın yolu olmaz. Tersi güvenli — dosyası gitmiş kayıt
     görünür bir hatadır ve düzeltilebilir. */
  const paths = target.flatMap((r) => [r.file_path, r.thumb_path].filter(Boolean) as string[]);
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    const { error } = await db.storage.from(BUCKET).remove(chunk);
    if (error) console.error("   depo hatası:", error.message);
    process.stdout.write(`\r   depo: ${Math.min(i + 100, paths.length)}/${paths.length}`);
  }
  console.log();

  const ids = target.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await db.from("operation_documents").delete().in("id", ids.slice(i, i + 200));
    if (error) console.error("   kayıt hatası:", error.message);
  }
  console.log(`\n✅ ${target.length} dosya silindi · ${mb(target.reduce((a, r) => a + (r.file_size ?? 0), 0))} boşaldı.`);
}

void main();
