#!/usr/bin/env npx tsx
/**
 * ORDER REVIEW → FÖYÜN "TOPLANTI NOTLARI" SEKMESİ.
 *
 * Aslı Hanım (06.11.2026): "Order review'u bu şeyin içine sokacaksın… beyaz
 * t-shirt'ün içine koyacaksın." Order Review'daki her ürün satırı, Collection'
 * daki ürününün föyüne taşınır: karar, kritik, imalatçı numunesi ve tarihli
 * toplantı notları (20240366).
 *
 * VARSAYILAN: YALNIZ OKUR ve rapor verir. Hangi satırın hangi föye gideceğini,
 * hangisinin eşleşmediğini listeler; hiçbir şey yazmaz.
 *
 *   npx tsx scripts/order-review-to-sheets.ts                  # yerel, rapor
 *   npx tsx scripts/order-review-to-sheets.ts --prod           # canlı, rapor
 *   npx tsx scripts/order-review-to-sheets.ts --prod --uygula  # canlı, yazar
 *   … --harita esleme.json   # elle eşleme: { "<satır id>": "<föy id>" }
 *
 * EŞLEME: önce ürün kodu (föyün `product_code`'u), sonra ad (satırın "Ürün
 * Grubu" ile föy başlığı — biri ötekini içeriyorsa). TEK aday çıkarsa eşleşir;
 * aday yoksa ya da birden çoksa satır ATLANIR ve raporda gösterilir. Tahminle
 * yazmak yok — eşleşmeyenler `--harita` ile elle bağlanır.
 *
 * VERİ SİLİNMEZ:
 *   • Order Review tabloları olduğu gibi kalır.
 *   • Föyde zaten not varsa üstüne yazılmaz: notlar EKLENİR (aynı not iki kez
 *     eklenmez), kritik doluysa yenisi altına eklenir, karar yalnız boşsa yazılır.
 *   • Numune fotoğrafları föyün klasörüne KOPYALANIR (taşınmaz).
 *   • Ürünün orijinal fotoğrafı ile kumaş/renk/adet/fiyat föye yazılmaz (föyde
 *     kendi alanları var); raporda "taşınmayan" olarak sayılır, Order Review
 *     kaydında durur.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const APPLY = process.argv.includes("--uygula");
const PROD = process.argv.includes("--prod");
const MAP_ARG = process.argv.indexOf("--harita");
const MANUAL: Record<string, string> =
  MAP_ARG > 0 ? JSON.parse(fs.readFileSync(process.argv[MAP_ARG + 1], "utf8")) : {};
const BUCKET = "production-sheets";

type Photo = { path: string; url: string };
type Note = { id: string; date: string; text: string };
type Item = {
  id: string; workspace_id: string; review_id: string; position: number;
  code: string; product_group: string; critique: string; meeting_notes: Note[];
  fabric: string; colors: string; planned_qty: number | null; unit_price: number | null;
  decision: string; original_photos: Photo[]; sample_photos: Photo[];
};
type Sheet = {
  id: string; workspace_id: string; title: string; product_code: string | null; status: string | null;
  meeting_notes: Note[] | null; review_critique: string | null; review_decision: string | null;
  review_sample_photos: Photo[] | null;
};

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
  return { url: l.NEXT_PUBLIC_SUPABASE_URL, key: l.SUPABASE_SERVICE_ROLE_KEY, label: "YEREL" };
}

const norm = (s: string | null | undefined) =>
  (s ?? "").toLocaleLowerCase("tr")
    .replace(/[^a-z0-9çğıöşü]+/g, " ")
    .replace(/\s+/g, " ").trim();

function candidates(item: Item, sheets: Sheet[]): Sheet[] {
  const pool = sheets.filter((s) => s.workspace_id === item.workspace_id && s.status !== "archived");
  const code = norm(item.code);
  if (code) {
    const byCode = pool.filter((s) => norm(s.product_code) === code);
    if (byCode.length) return byCode;
  }
  const group = norm(item.product_group);
  if (group.length < 4) return [];
  return pool.filter((s) => {
    const t = norm(s.title);
    return t.length >= 4 && (t === group || group.includes(t) || t.includes(group));
  });
}

async function main() {
  const { url, key, label } = target();
  if (!url || !key) { console.error("❌ Supabase adresi/anahtarı bulunamadı."); process.exit(1); }
  const db: SupabaseClient = createClient(url, key, { auth: { persistSession: false } });
  console.log(`\n▸ Hedef: ${label} · ${APPLY ? "YAZAR (--uygula)" : "yalnız rapor"}\n`);

  const [{ data: reviews, error: rErr }, { data: items, error: iErr }, { data: sheets, error: sErr }] = await Promise.all([
    db.from("order_reviews").select("id, title"),
    db.from("order_review_items").select("*").order("review_id").order("position"),
    db.from("production_sheets").select("id, workspace_id, title, product_code, status, meeting_notes, review_critique, review_decision, review_sample_photos"),
  ]);
  if (rErr || iErr || sErr) {
    console.error("❌ Okunamadı:", rErr?.message ?? iErr?.message ?? sErr?.message,
      "\n   (Föy sütunları yoksa önce 20240366 migration'ı uygulanmalı: supabase db push)");
    process.exit(1);
  }
  const reviewTitle = new Map((reviews ?? []).map((r) => [r.id as string, (r.title as string) || "Adsız değerlendirme"]));
  const allSheets = (sheets ?? []) as Sheet[];
  const sheetById = new Map(allSheets.map((s) => [s.id, s]));
  const list = (items ?? []) as Item[];
  if (!list.length) { console.log("Order Review'da hiç ürün satırı yok — taşınacak bir şey yok."); return; }

  const plan: { item: Item; sheet: Sheet; how: string }[] = [];
  const skipped: { item: Item; why: string }[] = [];
  for (const it of list) {
    const manual = MANUAL[it.id];
    if (manual) {
      const s = sheetById.get(manual);
      if (s) plan.push({ item: it, sheet: s, how: "elle" });
      else skipped.push({ item: it, why: `haritadaki föy bulunamadı (${manual})` });
      continue;
    }
    const c = candidates(it, allSheets);
    if (c.length === 1) plan.push({ item: it, sheet: c[0], how: norm(it.code) && norm(c[0].product_code) === norm(it.code) ? "kod" : "ad" });
    else if (c.length === 0) skipped.push({ item: it, why: "eşleşen föy yok" });
    else skipped.push({ item: it, why: `birden çok aday: ${c.map((s) => `"${s.title}" (${s.id})`).join(", ")}` });
  }

  const line = (it: Item) =>
    `${reviewTitle.get(it.review_id)} · ${String(it.position + 1).padStart(2, "0")} · ${it.code || "kodsuz"} · ${it.product_group.slice(0, 60) || "grupsuz"}`;

  console.log(`EŞLEŞEN (${plan.length})`);
  for (const p of plan) console.log(`  ✓ ${line(p.item)}  →  "${p.sheet.title}" [${p.how}]`);
  console.log(`\nEŞLEŞMEYEN (${skipped.length}) — "--harita" ile elle bağlanabilir`);
  for (const s of skipped) console.log(`  ✗ ${line(s.item)}  (satır id: ${s.item.id}) — ${s.why}`);

  const leftover = list.filter((it) => it.original_photos?.length || it.fabric || it.colors || it.planned_qty !== null || it.unit_price !== null).length;
  console.log(`\nFöye TAŞINMAYAN alan içeren satır: ${leftover} (orijinal fotoğraf, kumaş, renk, adet, fiyat — föyde kendi alanları var; Order Review kaydında duruyor)`);

  if (!APPLY) {
    console.log("\nHiçbir şey yazılmadı. Yazmak için aynı komutu --uygula ile çalıştırın.\n");
    return;
  }

  let written = 0;
  for (const { item, sheet } of plan) {
    const prefix = `${sheet.workspace_id}/toplanti/${sheet.id}/`;
    /* Numune fotoğrafları föyün klasörüne kopyalanır — föy sekmesi yalnız kendi
       klasöründeki yolu kabul eder. Kaynak yerinde kalır. */
    const have = new Set((sheet.review_sample_photos ?? []).map((p) => p.path.split("/").pop()));
    const copied: Photo[] = [];
    for (const p of item.sample_photos ?? []) {
      const name = p.path.split("/").pop() ?? `${crypto.randomUUID()}.jpeg`;
      if (have.has(name)) continue;
      const to = `${prefix}${name}`;
      const { error } = await db.storage.from(BUCKET).copy(p.path, to);
      if (error && !/exists|duplicate/i.test(error.message)) { console.warn(`  ! fotoğraf kopyalanamadı (${p.path}): ${error.message}`); continue; }
      copied.push({ path: to, url: db.storage.from(BUCKET).getPublicUrl(to).data.publicUrl });
    }

    const notes = [...(sheet.meeting_notes ?? [])];
    const seen = new Set(notes.map((n) => `${n.date}|${n.text.trim()}`));
    for (const n of item.meeting_notes ?? []) {
      if (!n.text.trim() || seen.has(`${n.date}|${n.text.trim()}`)) continue;
      notes.push({ id: n.id || crypto.randomUUID(), date: n.date, text: n.text.trim() });
      seen.add(`${n.date}|${n.text.trim()}`);
    }
    const oldCritique = (sheet.review_critique ?? "").trim();
    const newCritique = item.critique.trim();
    const critique = !newCritique || oldCritique.includes(newCritique)
      ? oldCritique
      : oldCritique ? `${oldCritique}\n\n${newCritique}` : newCritique;

    const { error } = await db.from("production_sheets").update({
      meeting_notes: notes,
      review_critique: critique,
      review_decision: sheet.review_decision ?? item.decision ?? null,
      review_sample_photos: [...(sheet.review_sample_photos ?? []), ...copied],
    }).eq("id", sheet.id);
    if (error) { console.warn(`  ! "${sheet.title}" yazılamadı: ${error.message}`); continue; }
    /* Aynı föye ikinci satır gelirse güncel hâli üstüne eklensin. */
    sheet.meeting_notes = notes; sheet.review_critique = critique;
    sheet.review_decision = sheet.review_decision ?? item.decision ?? null;
    sheet.review_sample_photos = [...(sheet.review_sample_photos ?? []), ...copied];
    written++;
  }
  console.log(`\n✓ ${written} satır föylere yazıldı. Order Review kayıtları silinmedi.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
