#!/usr/bin/env npx tsx
/**
 * ESKİ TABLOLARDA GÖRSELİN YERİNİ DÜZELT — tabloyu silip yeniden açmadan.
 *
 * 17.11.2026'da Excel aktarımındaki görsel yeri hatası düzeltildi (çapanın
 * kesirli değeri yuvarlanıyordu; sütuna girintili fotoğraf bir SAĞDAKİ sütuna
 * düşüyordu). Düzeltme yalnız YENİ aktarımları kapsar: yerleşim aktarım anında
 * tablonun anlık görüntüsüne yazılır, eski tablolar eski yeriyle kaldı.
 *
 * Bu betik, kaynağı (.xlsx) hâlâ Drive'da duran her tablo için:
 *   1. kaynağı yeniden okur ve her görselin DOĞRU yerini hesaplar,
 *   2. aynı görselin ESKİ aktarımın koyduğu yerde durup durmadığına bakar,
 *   3. duruyorsa YALNIZ `img` alanını doğru hücreye taşır.
 *
 * HİÇBİR ŞEYİ EZMEZ
 *   • Hücrelerin metnine, formülüne, biçimine dokunmaz — yalnız görselin
 *     hangi hücrede durduğu ve kaç hücre kapladığı değişir.
 *   • Kullanıcının sonradan taşıdığı / büyüttüğü / kaldırdığı görsel yerinde
 *     kalır: eski yerinde BİREBİR durmayan görsel "dokunulmuş" sayılır, atlanır.
 *   • Hedef hücrede başka bir görsel varsa taşımaz, raporlar.
 *   • Yazmadan önce tablonun anlık görüntüsünü
 *     ~/Downloads/af-tablo-yedek/<kimlik>-<zaman>.json olarak yedekler.
 *   • Yazma, tablo o arada değişmediyse yapılır (snapshot_rev karşılaştırmalı);
 *     biri tabloyu o an düzenliyorsa o tablo atlanır, yeniden çalıştırılır.
 *
 *   npx tsx scripts/sheets-fix-image-anchors.ts                   # yerel, RAPOR
 *   npx tsx scripts/sheets-fix-image-anchors.ts --uygula           # yerel, yazar
 *   npx tsx scripts/sheets-fix-image-anchors.ts --prod             # canlı, RAPOR
 *   npx tsx scripts/sheets-fix-image-anchors.ts --prod --uygula    # canlı, yazar
 *   … --tablo <kimlik>   yalnız o tablo
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import ExcelJS from "exceljs";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { workbookToSnapshot } from "../lib/sheets/xlsx-import";
import { fromLegacy, type Cell, type Sheet, type WorkbookSnapshot } from "../lib/sheets/model";

const arg = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const APPLY = process.argv.includes("--uygula");
const PROD = process.argv.includes("--prod");
const ONLY = arg("--tablo");
const BUCKET = "documents";
const BACKUP_DIR = path.join(os.homedir(), "Downloads", "af-tablo-yedek");

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

/** Hedef AÇIKÇA seçilir: --prod yoksa her zaman yerel. */
function target() {
  if (PROD) {
    const f = readEnvFile(".env.prod");
    const url = process.env.IMPORT_SUPABASE_URL ?? f.IMPORT_SUPABASE_URL;
    const key = process.env.IMPORT_SUPABASE_SERVICE_ROLE_KEY ?? f.IMPORT_SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) { console.error("❌ .env.prod eksik (IMPORT_SUPABASE_URL / IMPORT_SUPABASE_SERVICE_ROLE_KEY)."); process.exit(1); }
    return { url, key, label: "CANLI" };
  }
  const l = readEnvFile(".env.local");
  if (!l.NEXT_PUBLIC_SUPABASE_URL || !l.SUPABASE_SERVICE_ROLE_KEY) { console.error("❌ .env.local eksik."); process.exit(1); }
  return { url: l.NEXT_PUBLIC_SUPABASE_URL, key: l.SUPABASE_SERVICE_ROLE_KEY, label: "YEREL" };
}

const colName = (c: number) => { let n = "", i = c; do { n = String.fromCharCode(65 + (i % 26)) + n; i = Math.floor(i / 26) - 1; } while (i >= 0); return n; };
const a1 = (r: number, c: number) => `${colName(c)}${r + 1}`;
const key = (r: number, c: number) => `${r}:${c}`;

type Row = { id: string; workspace_id: string; title: string; snapshot: unknown; snapshot_rev?: number | null; source_document_id: string | null };
type Move = { sheet: string; from: string; to: string; span: string };

async function planTable(db: SupabaseClient, row: Row): Promise<{ status: string; moves: Move[]; skipped: string[]; next?: WorkbookSnapshot; same: number }> {
  const none = (status: string) => ({ status, moves: [], skipped: [], same: 0 });
  if (!row.source_document_id) return none("kaynak dosya bağı yok");
  const { data: doc } = await db.from("operation_documents").select("file_path, file_name").eq("id", row.source_document_id).maybeSingle();
  const filePath = (doc as { file_path?: string | null } | null)?.file_path;
  if (!filePath) return none("kaynak dosya kaydı yok");
  if (/\.csv$/i.test(filePath)) return none("CSV — görsel taşımaz");
  const { data: blob, error: dlErr } = await db.storage.from(BUCKET).download(filePath);
  if (dlErr || !blob) return none("kaynak dosya depoda yok");

  const book = new ExcelJS.Workbook();
  try {
    await book.xlsx.load(Buffer.from(await blob.arrayBuffer()) as unknown as ArrayBuffer);
  } catch {
    return none("kaynak dosya okunamadı");
  }
  const fresh = workbookToSnapshot(book);
  if (!fresh.images.length) return none("kaynakta yüzen görsel yok");

  const current = fromLegacy(row.snapshot);
  if (!current) return none("anlık görüntü okunamadı");
  const next: WorkbookSnapshot = JSON.parse(JSON.stringify(current));

  /* Görselin Drive kimliği: aktarım içeriğin özetinden yol türetiyor
     (<ws>/aktarilan-gorseller/<sha>.<uzantı>). Eski aktarımlarda yol rastgele
     olabilir — o zaman kimlik bilinmez, yalnız konuma bakılır. */
  const docIdOf = new Map<number, string | null>();
  for (const id of new Set(fresh.images.map((im) => im.imageId))) {
    let found: string | null = null;
    try {
      const media = book.getImage(id) as unknown as { buffer?: Buffer };
      if (media?.buffer?.length) {
        const sha = createHash("sha256").update(media.buffer).digest("hex");
        const { data } = await db.from("operation_documents").select("id").eq("workspace_id", row.workspace_id)
          .like("file_path", `${row.workspace_id}/aktarilan-gorseller/${sha}.%`).limit(1).maybeSingle();
        found = (data as { id: string } | null)?.id ?? null;
      }
    } catch { /* kimlik bilinmiyor */ }
    docIdOf.set(id, found);
  }

  const moves: Move[] = [];
  const skipped: string[] = [];
  let same = 0;
  const sheetNames = (book.worksheets as { name: string }[]).map((w) => w.name);
  for (const im of fresh.images) {
    const name = sheetNames[im.sheet] ?? "";
    const sheet: Sheet | undefined = next.sheets.find((s) => s.name === name);
    const where = `${name || `Sayfa ${im.sheet + 1}`}!${a1(im.r, im.c)}`;
    if (!sheet) { skipped.push(`${where}: sayfa tabloda yok (adı değişmiş ya da silinmiş)`); continue; }
    const want = docIdOf.get(im.imageId) ?? null;
    const at = sheet.cells[key(im.r, im.c)];
    const matches = (cell: Cell | undefined) => !!cell?.img && (want === null || cell.img.id === want);
    if (matches(at) && (at!.img!.cs ?? 1) === im.cs && (at!.img!.rs ?? 1) === im.rs) { same++; continue; }

    /* ESKİ YERİNDE, DOKUNULMAMIŞ mı? */
    const old = im.legacy;
    const oldCell = old ? sheet.cells[key(old.r, old.c)] : undefined;
    const untouched = !!old && matches(oldCell) && (oldCell!.img!.cs ?? 1) === old.cs && (oldCell!.img!.rs ?? 1) === old.rs;
    if (!untouched) {
      /* Doğru hücrede ama boyu farklı: kullanıcı büyütmüş/küçültmüş — kalır. */
      if (matches(at)) { same++; continue; }
      skipped.push(`${where}: görsel eski yerinde değil (taşınmış, kaldırılmış ya da satır/sütun eklenmiş) — dokunulmadı`);
      continue;
    }
    const sameCell = old!.r === im.r && old!.c === im.c;
    if (!sameCell && at?.img) { skipped.push(`${where}: hedef hücrede başka bir görsel var — dokunulmadı`); continue; }

    const img = { ...oldCell!.img!, cs: im.cs, rs: im.rs };
    if (!sameCell) {
      const rest = { ...oldCell! };
      delete rest.img;
      if (Object.keys(rest).length) sheet.cells[key(old!.r, old!.c)] = rest;
      else delete sheet.cells[key(old!.r, old!.c)];
    }
    sheet.cells[key(im.r, im.c)] = { ...(sheet.cells[key(im.r, im.c)] ?? {}), img };
    moves.push({
      sheet: name, from: a1(old!.r, old!.c), to: a1(im.r, im.c),
      span: `${old!.cs}×${old!.rs} → ${im.cs}×${im.rs}`,
    });
  }
  return { status: moves.length ? "düzeltilecek" : "değişiklik yok", moves, skipped, next, same };
}

async function main() {
  const t = target();
  const db = createClient(t.url, t.key, { auth: { persistSession: false } });
  console.log(`\n▸ ${t.label} · ${APPLY ? "YAZAR" : "RAPOR (yazmaz)"}${ONLY ? ` · yalnız ${ONLY}` : ""}`);

  /* snapshot_rev (20240374) yoksa da çalışır — o zaman korumasız yazmaz, atlar. */
  let hasRev = true;
  let q = db.from("operation_spreadsheets").select("id, workspace_id, title, snapshot, snapshot_rev, source_document_id").not("source_document_id", "is", null);
  if (ONLY) q = q.eq("id", ONLY);
  let res = await q.order("created_at");
  if (res.error && /snapshot_rev/.test(res.error.message)) {
    hasRev = false;
    let q2 = db.from("operation_spreadsheets").select("id, workspace_id, title, snapshot, source_document_id").not("source_document_id", "is", null);
    if (ONLY) q2 = q2.eq("id", ONLY);
    res = await q2.order("created_at") as typeof res;
  }
  if (res.error) { console.error(`❌ tablolar okunamadı — ${res.error.message}`); process.exit(1); }
  const rows = (res.data ?? []) as Row[];
  console.log(`  Excel'den aktarılmış tablo: ${rows.length}`);

  let fixedTables = 0, fixedImages = 0;
  for (const row of rows) {
    const plan = await planTable(db, row);
    const head = `\n  ■ ${row.title}  (${row.id})`;
    if (!plan.moves.length && !plan.skipped.length) { console.log(`${head}\n    ${plan.status}${plan.same ? ` · ${plan.same} görsel yerinde` : ""}`); continue; }
    console.log(`${head}\n    yerinde ${plan.same} · taşınacak ${plan.moves.length} · dokunulmayan ${plan.skipped.length}`);
    for (const m of plan.moves.slice(0, 60)) console.log(`    ↳ ${m.sheet}: ${m.from} → ${m.to}  (${m.span})`);
    if (plan.moves.length > 60) console.log(`    … ve ${plan.moves.length - 60} görsel daha`);
    for (const s of plan.skipped.slice(0, 20)) console.log(`    · ${s}`);
    if (plan.skipped.length > 20) console.log(`    … ve ${plan.skipped.length - 20} satır daha`);
    if (!APPLY || !plan.moves.length || !plan.next) continue;

    if (!hasRev) { console.log("    ✗ snapshot_rev sütunu yok (20240374) — korumasız yazılmaz, atlandı"); continue; }
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const backup = path.join(BACKUP_DIR, `${row.id}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(backup, JSON.stringify(row.snapshot));
    const rev = row.snapshot_rev ?? 0;
    const { data, error } = await db.from("operation_spreadsheets")
      .update({ snapshot: plan.next, snapshot_rev: rev + 1 })
      .eq("id", row.id).eq("snapshot_rev", rev).select("id");
    if (error) { console.log(`    ✗ yazılamadı — ${error.message}`); continue; }
    if (!data?.length) { console.log("    ✗ tablo o arada değişti — atlandı; betiği yeniden çalıştırın"); continue; }
    fixedTables++; fixedImages += plan.moves.length;
    console.log(`    ✓ yazıldı · yedek: ${backup}`);
  }
  console.log(APPLY ? `\n  ✓ ${fixedTables} tabloda ${fixedImages} görsel düzeltildi\n` : "\n  Yazmak için: --uygula\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
