#!/usr/bin/env npx tsx
/**
 * AF TEAMWORK TEMİZLİĞİ — bir kişinin eklediği DENEME içeriğini kaldırır.
 *
 * Sıraç (2026-09-16): "Silelim, sonra onlar eklerler. Ve benim eklediğim
 * excelleri vs. de sil, hepsi deneme amacıylaydı."
 *
 * GERİ DÖNÜŞÜ YOKTUR. Bu yüzden betik varsayılan olarak YALNIZ RAPOR verir;
 * silmek için açıkça `--sil` gerekir ve ayrıca "SIL" yazılması istenir.
 *
 * SİLME SIRASI ÖNEMLİ:
 *   1. Depodaki baytlar (dosya + önizleme)
 *   2. Tablolar (operation_spreadsheets)
 *   3. Kayıtlar (operation_documents)
 *   4. Klasörler — EN DERİNDEN yukarı (parent_id on delete RESTRICT)
 * Tersi olsaydı kayıt gidip bayt kalır, öksüz baytı bulmanın yolu olmazdı.
 *
 * KULLANIM
 *   npm run cleanup:teamwork -- --sahip "Siraç Gezgin" --prod
 *   npm run cleanup:teamwork -- --sahip "Siraç Gezgin" --prod --sil
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import * as readline from "node:readline/promises";

const ARGS = process.argv.slice(2);
const PROD = ARGS.includes("--prod");
const DO_DELETE = ARGS.includes("--sil");
const ownerIdx = ARGS.indexOf("--sahip");
/* npm tırnakları düşürüyor: "--sahip Siraç Gezgin --prod" → bayrağa kadarki
   her parça ada aittir. */
const OWNER = ownerIdx >= 0
  ? ARGS.slice(ownerIdx + 1).filter((a) => !a.startsWith("--")).join(" ").trim()
  : "";
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
function target() {
  const f = readEnvFile(".env.prod");
  const url = process.env.IMPORT_SUPABASE_URL ?? f.IMPORT_SUPABASE_URL;
  const key = process.env.IMPORT_SUPABASE_SERVICE_ROLE_KEY ?? f.IMPORT_SUPABASE_SERVICE_ROLE_KEY;
  if (PROD || url || key) {
    if (!url || !key) { console.error("❌ .env.prod eksik."); process.exit(1); }
    return { url, key, label: "PRODUCTION" };
  }
  const l = readEnvFile(".env.local");
  return { url: l.NEXT_PUBLIC_SUPABASE_URL, key: l.SUPABASE_SERVICE_ROLE_KEY, label: "LOCAL" };
}
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;

/** Supabase tek istekte en fazla 1000 satır döner — SAYFALA.
 *  Bunu atlamak "1000 dosya" deyip gerisini görmemek demekti. */
async function all<T>(
  db: SupabaseClient,
  table: string,
  cols: string,
  apply: (q: ReturnType<SupabaseClient["from"]>) => unknown,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(cols) as unknown as { range: (a: number, b: number) => Promise<{ data: unknown; error: unknown }> };
    q = apply(q as never) as never;
    const { data, error } = await (q as { range: (a: number, b: number) => Promise<{ data: T[] | null; error: { message: string } | null }> }).range(from, from + 999);
    if (error) { console.error(`❌ ${table}:`, error.message); process.exit(1); }
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

async function main() {
  if (!OWNER) {
    console.error('Kullanım: npm run cleanup:teamwork -- --sahip "Ad Soyad" --prod [--sil]');
    process.exit(1);
  }
  const { url, key, label } = target();
  const db: SupabaseClient = createClient(url, key, { auth: { persistSession: false } });
  console.log(`\n▸ ${label}  ·  sahip: "${OWNER}"\n`);

  const { data: prof } = await db.from("profiles").select("id, full_name, email");
  const me = ((prof ?? []) as { id: string; full_name: string | null; email: string | null }[])
    .find((p) => (p.full_name ?? "").trim() === OWNER || (p.email ?? "") === OWNER);
  if (!me) { console.error(`❌ "${OWNER}" adlı kişi bulunamadı.`); process.exit(1); }

  const docs = await all<{ id: string; title: string; file_path: string | null; thumb_path: string | null; file_size: number | null; document_type: string }>(
    db, "operation_documents", "id, title, file_path, thumb_path, file_size, document_type",
    (q) => (q as never as { eq: (a: string, b: string) => unknown }).eq("created_by", me.id),
  );
  const sheets = await all<{ id: string; title: string }>(
    db, "operation_spreadsheets", "id, title",
    (q) => (q as never as { eq: (a: string, b: string) => unknown }).eq("created_by", me.id),
  );
  const folders = await all<{ id: string; name: string; parent_id: string | null }>(
    db, "document_folders", "id, name, parent_id",
    (q) => (q as never as { eq: (a: string, b: string) => unknown }).eq("created_by", me.id),
  );

  const bytes = docs.reduce((a, d) => a + (d.file_size ?? 0), 0);
  const byType = new Map<string, number>();
  for (const d of docs) byType.set(d.document_type, (byType.get(d.document_type) ?? 0) + 1);

  console.log("SİLİNECEKLER");
  console.log(`  Klasör   ${String(folders.length).padStart(5)}`);
  console.log(`  Tablo    ${String(sheets.length).padStart(5)}`);
  for (const [t, n] of byType) console.log(`  ${t.padEnd(8)} ${String(n).padStart(5)}`);
  console.log(`  Depo     ${mb(bytes)}\n`);
  console.log("Tablolar:");
  for (const s of sheets) console.log("   ·", s.title);
  console.log();

  if (!DO_DELETE) { console.log("Hiçbir şey silinmedi (rapor kipi). Silmek için: --sil"); return; }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ans = (await rl.question('GERİ DÖNÜŞÜ YOK. Devam için "SIL" yazın: ')).trim();
  rl.close();
  if (ans !== "SIL") { console.log("Vazgeçildi."); return; }

  // 1) Depo
  const paths = docs.flatMap((d) => [d.file_path, d.thumb_path].filter(Boolean) as string[]);
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await db.storage.from(BUCKET).remove(paths.slice(i, i + 100));
    if (error) console.error("   depo:", error.message);
    process.stdout.write(`\r   depo ${Math.min(i + 100, paths.length)}/${paths.length}`);
  }
  if (paths.length) console.log();

  // 2) Tablolar
  for (let i = 0; i < sheets.length; i += 200) {
    const { error } = await db.from("operation_spreadsheets").delete().in("id", sheets.slice(i, i + 200).map((s) => s.id));
    if (error) console.error("   tablo:", error.message);
  }

  // 3) Kayıtlar
  for (let i = 0; i < docs.length; i += 200) {
    const { error } = await db.from("operation_documents").delete().in("id", docs.slice(i, i + 200).map((d) => d.id));
    if (error) console.error("   kayıt:", error.message);
  }

  // 4) Klasörler — EN DERİNDEN yukarı (parent_id RESTRICT)
  const depth = new Map<string, number>();
  const byId = new Map(folders.map((f) => [f.id, f]));
  const depthOf = (id: string, guard = new Set<string>()): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (guard.has(id)) return 0;
    guard.add(id);
    const p = byId.get(id)?.parent_id;
    const d = p && byId.has(p) ? depthOf(p, guard) + 1 : 0;
    depth.set(id, d);
    return d;
  };
  const ordered = [...folders].sort((a, b) => depthOf(b.id) - depthOf(a.id));
  let folderFail = 0;
  for (const f of ordered) {
    const { error } = await db.from("document_folders").delete().eq("id", f.id);
    if (error) { folderFail++; console.error(`   klasör "${f.name}":`, error.message); }
  }

  console.log(`\n✅ ${docs.length} kayıt · ${sheets.length} tablo · ${folders.length - folderFail}/${folders.length} klasör silindi · ${mb(bytes)} boşaldı.`);
}
void main();
