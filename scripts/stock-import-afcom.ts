#!/usr/bin/env npx tsx
/**
 * İSTANBUL STOĞUNU (Market 212) EXCEL'DEN PANELE AKTAR.
 *
 * Kaynak: ekibin ürün Excel'i ("AFCOM") → `stock-afcom-to-json.py` ile
 * `~/Downloads/af-afcom-stok.json`. Her kategori sayfasında beden beden
 * "M212 Stok" (Market 212 İstanbul) ve "AFR Stok" sütunları var.
 *
 * NE YAZAR
 *   • stock_products  — Excel'deki kod panelde yoksa ürün açılır (ad = Excel'deki
 *                       İngilizce başlık, fiyat = PSF TL). Aynı adlı, KODU BOŞ
 *                       bir kayıt varsa (site eşitlemesi açmıştır) yenisi
 *                       açılmaz, o kayda kod yazılır. Var olan ürünün dolu
 *                       hiçbir alanı değişmez.
 *   • stock_movements — "Market 212 İstanbul" için SAYIM hareketi: Excel'deki
 *                       adet ile paneldeki adet arasındaki fark. Yanlış çıkan
 *                       rakam panelde yeni bir sayımla düzeltilir; geçmiş kalır.
 *
 * YALNIZ M212 YAZILIR. "AFR Stok" sütunu panele YAZILMAZ — Çeşme stoğu eski
 * programdan geldi; ikisi ne kadar tutuyor, raporun sonunda yazar.
 *
 * EXCEL'İN TUTARSIZLIKLARI (rapor hepsini listeler):
 *   • Aynı ürün birden çok sayfada duruyor (kendi kategorisi, "Loungewear",
 *     "New In" vitrini) — bu AYNI stoktur, TOPLANMAZ. Adetler ayrışıyorsa
 *     ürünün KENDİ kategori sayfası (Excel'deki sırayla, stoğu yazan ilk sayfa)
 *     esas alınır; "New In" yalnız başka hiçbir sayfada adet yoksa kullanılır
 *     (o sayfada AFR sütunları bir kaydırılmış — en az güvenilir kopya).
 *   • Aynı kod AYNI sayfada iki satırsa (kod yazım hatası) adetler toplanır.
 *   • Beden kırılımı boş ama toplam sütunu dolu satır → yazılmaz, listelenir.
 *
 * YENİDEN ÇALIŞTIRILABİLİR: `source_ref = afcom:<excel tarihi>:<kod>:<beden>`
 * tekildir — aynı dosya ikinci kez hiçbir şey yazmaz. HİÇBİR ŞEY SİLMEZ.
 *
 *   npx tsx scripts/stock-import-afcom.ts                  # yerel, RAPOR
 *   npx tsx scripts/stock-import-afcom.ts --uygula          # yerel, yazar
 *   npx tsx scripts/stock-import-afcom.ts --prod            # canlı, RAPOR
 *   npx tsx scripts/stock-import-afcom.ts --prod --uygula   # canlı, yazar
 *   … --yer "Market 212 İstanbul" (varsayılan)   … --dosya <yol>
 */
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { normalizeSize } from "../lib/stock/model";

const arg = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const APPLY = process.argv.includes("--uygula");
const PROD = process.argv.includes("--prod");
const LOCATION = arg("--yer") ?? "Market 212 İstanbul";
const OTHER = "Market 212 Çeşme";
const FILE = arg("--dosya") ?? path.join(os.homedir(), "Downloads", "af-afcom-stok.json");
const SHOWCASE = "New In";

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

type Line = {
  sayfa: string; satir: number; kod: string; ad: string; fiyat: number | null;
  m212: Record<string, number>; m212_toplam: number; m212_beden_yok: boolean;
  afr: Record<string, number>; afr_toplam: number; afr_beden_yok: boolean;
};
type Item = { code: string; name: string; price: number | null; m212: Map<string, number>; afr: Map<string, number> };

const sum = (m: Iterable<number>) => [...m].reduce((a, b) => a + b, 0);
const sizesText = (m: Map<string, number> | Record<string, number>) =>
  [...(m instanceof Map ? m.entries() : Object.entries(m))].map(([s, q]) => `${s} ${q}`).join(" · ") || "—";
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const list = (title: string, lines: string[], max = 40) => {
  if (!lines.length) return;
  console.log(`\n  ${title} (${lines.length})`);
  for (const l of lines.slice(0, max)) console.log(`    ${l}`);
  if (lines.length > max) console.log(`    … ve ${lines.length - max} satır daha`);
};

async function main() {
  if (!fs.existsSync(FILE)) { console.error(`❌ Dosya yok: ${FILE}\n   önce: python3 scripts/stock-afcom-to-json.py "<AFCOM.xlsx>"`); process.exit(1); }
  const src = JSON.parse(fs.readFileSync(FILE, "utf8")) as { kaynak: string; alinma: string; satirlar: Line[] };
  const t = target();
  const db = createClient(t.url, t.key, { auth: { persistSession: false } });
  console.log(`\n▸ ${t.label} · ${APPLY ? "YAZAR" : "RAPOR (yazmaz)"} · kaynak ${src.kaynak} (${src.alinma})`);

  // ── Excel satırlarını ürün başına indir ───────────────────────────────────
  const byCode = new Map<string, Line[]>();
  for (const l of src.satirlar) {
    const k = l.kod.trim().toLocaleUpperCase("en-US");
    byCode.set(k, [...(byCode.get(k) ?? []), l]);
  }
  const items: Item[] = [];
  const conflicts: string[] = [], merged: string[] = [], unsized: string[] = [], totals: string[] = [];
  const sizesOf = (lines: Line[], key: "m212" | "afr") => {
    const m = new Map<string, number>();
    for (const l of lines) for (const [s, q] of Object.entries(l[key])) {
      const size = normalizeSize(s);
      m.set(size, (m.get(size) ?? 0) + q);
    }
    return m;
  };
  for (const [code, lines] of byCode) {
    /* Sayfa sayfa (Excel'deki sırayla); vitrin sayfası en sona. */
    const sheets = [...new Set(lines.map((l) => l.sayfa))].sort((a, b) => Number(a === SHOWCASE) - Number(b === SHOWCASE));
    const perSheet = (key: "m212" | "afr") => sheets.map((sh) => ({ sheet: sh, sizes: sizesOf(lines.filter((l) => l.sayfa === sh), key) }));
    const pick = (key: "m212" | "afr") => {
      const all = perSheet(key);
      return all.find((x) => sum(x.sizes.values()) > 0) ?? all[0];
    };
    const m = pick("m212");
    const item: Item = {
      code: lines[0].kod.trim(),
      name: (lines.find((l) => l.ad)?.ad ?? "").slice(0, 300),
      price: lines.find((l) => l.fiyat != null && l.fiyat > 0)?.fiyat ?? null,
      m212: m.sizes, afr: pick("afr").sizes,
    };
    items.push(item);
    const filled = perSheet("m212").filter((x) => sum(x.sizes.values()) > 0);
    if (new Set(filled.map((x) => sizesText(x.sizes))).size > 1) {
      conflicts.push(`${code}  ${filled.map((x) => `${x.sheet.slice(0, 26)}: ${sizesText(x.sizes)}${x.sheet === m.sheet ? " ← YAZILACAK" : ""}`).join("  |  ")}`);
    }
    const sameSheet = lines.filter((l) => l.sayfa === m.sheet && sum(Object.values(l.m212)) > 0);
    if (sameSheet.length > 1) merged.push(`${code}  ${sameSheet.map((l) => `${l.sayfa.slice(0, 22)}#${l.satir} ${l.ad.slice(0, 28)}: ${sizesText(l.m212)}`).join("  +  ")}`);
    for (const l of lines.filter((x) => x.sayfa === m.sheet)) {
      const n = sum(Object.values(l.m212));
      if (n === 0 && l.m212_toplam > 0) unsized.push(`${code}  ${l.sayfa.slice(0, 26)}#${l.satir}: toplam ${l.m212_toplam}, beden kırılımı yok`);
      else if (n !== l.m212_toplam) totals.push(`${code}  ${l.sayfa.slice(0, 26)}#${l.satir}: bedenler ${n} (${sizesText(l.m212)}), toplam sütunu ${l.m212_toplam}`);
    }
  }
  const stocked = items.filter((i) => sum(i.m212.values()) > 0);
  console.log(`  EXCEL: ${src.satirlar.length} satır · ${items.length} ayrı kod · M212 stoğu olan ${stocked.length} ürün, ${sum(stocked.map((i) => sum(i.m212.values())))} adet`);

  // ── Hedef yer, çalışma alanı, mevcut ürünler ──────────────────────────────
  const { data: locs, error: locErr } = await db.from("stock_locations").select("id, workspace_id, name").in("name", [LOCATION, OTHER]);
  if (locErr) { console.error(`❌ stock_locations okunamadı — ${locErr.message}`); process.exit(1); }
  const targets = (locs ?? []).filter((l) => l.name === LOCATION) as { id: string; workspace_id: string; name: string }[];
  if (targets.length !== 1) { console.error(`❌ "${LOCATION}" adında ${targets.length} yer bulundu; tam bir tane olmalı (--yer ile adını verin).`); process.exit(1); }
  const loc = targets[0];
  const ws = loc.workspace_id;
  const other = (locs ?? []).find((l) => l.name === OTHER && l.workspace_id === ws) as { id: string } | undefined;

  const existing = new Map<string, string>();
  /* Kodu BOŞ ürünler ada göre: site eşitlemesi bir ürünü (sitede SKU yoksa)
     kodsuz açmış olabilir — aynı adlı ikinci kayıt açmak yerine ona kod yazılır. */
  const codeless = new Map<string, { id: string; price: number | null }[]>();
  const nameKey = (n: string) => n.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, " ").trim();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("stock_products").select("id, code, name, price").eq("workspace_id", ws).order("id").range(from, from + 999);
    if (error) { console.error(`❌ stock_products okunamadı — ${error.message}`); process.exit(1); }
    for (const r of (data ?? []) as { id: string; code: string; name: string; price: number | null }[]) {
      if (r.code.trim()) existing.set(r.code.trim().toLocaleUpperCase("en-US"), r.id);
      else if (nameKey(r.name)) codeless.set(nameKey(r.name), [...(codeless.get(nameKey(r.name)) ?? []), { id: r.id, price: r.price }]);
    }
    if (!data || data.length < 1000) break;
  }
  const levels = new Map<string, number>(), otherLevels = new Map<string, number>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("stock_levels").select("product_id, location_id, size, qty").eq("workspace_id", ws).order("product_id").order("location_id").order("size").range(from, from + 999);
    if (error) { console.error(`❌ stock_levels okunamadı — ${error.message}`); process.exit(1); }
    for (const r of (data ?? []) as { product_id: string; location_id: string; size: string; qty: number }[]) {
      if (r.location_id === loc.id) levels.set(`${r.product_id}|${r.size}`, r.qty);
      else if (other && r.location_id === other.id) otherLevels.set(r.product_id, (otherLevels.get(r.product_id) ?? 0) + r.qty);
    }
    if (!data || data.length < 1000) break;
  }

  const key = (i: Item) => i.code.toLocaleUpperCase("en-US");
  const missing = stocked.filter((i) => !existing.has(key(i)));
  const adopt = new Map<Item, { id: string; price: number | null }>();
  for (const i of missing) {
    const hits = i.name ? codeless.get(nameKey(i.name)) ?? [] : [];
    if (hits.length === 1) { adopt.set(i, hits[0]); codeless.delete(nameKey(i.name)); }
  }
  const toCreate = missing.filter((i) => !adopt.has(i));
  console.log(`  ÜRÜN: stoğu olan ${stocked.length} · panelde zaten var ${stocked.length - missing.length} · kodu yazılacak (siteden açılmış) ${adopt.size} · açılacak ${toCreate.length}`);
  console.log(`  "${loc.name}" şu an panelde: ${sum(levels.values())} adet`);

  list("Aynı ürün Excel'de birden çok sayfada, FARKLI adetle — işaretli olan yazılacak", conflicts);
  list("Aynı kod aynı sayfada iki satırda — adetler TOPLANDI", merged);
  list("Beden kırılımı yok — YAZILMAYACAK (Excel'de bedeni girin ya da panelde sayım yapın)", unsized);
  list("Beden toplamı ≠ toplam sütunu — bedenler yazılacak", totals);
  list("Açılacak ürünler", toCreate.map((i) => `${i.code}  ${i.name || "(adı yok — kod ad olarak yazılır)"}  ${sizesText(i.m212)}`), 200);

  // ── AFR sütunu ↔ paneldeki Çeşme (yalnız rapor) ───────────────────────────
  if (other) {
    let same = 0, differ = 0, notInPanel = 0, excelUnits = 0;
    const examples: string[] = [];
    for (const i of items) {
      const excel = sum(i.afr.values());
      if (!excel) continue;
      excelUnits += excel;
      const id = existing.get(key(i));
      if (!id) { notInPanel++; continue; }
      const panel = otherLevels.get(id) ?? 0;
      if (panel === excel) same++;
      else { differ++; if (examples.length < 12) examples.push(`${i.code}  Excel AFR ${excel} · panel ${OTHER} ${panel}`); }
    }
    console.log(`\n  "AFR Stok" sütunu (YAZILMAZ): Excel'de ${excelUnits} adet · panelde "${OTHER}" ${sum(otherLevels.values())} adet`);
    console.log(`    aynı ${same} ürün · farklı ${differ} · panelde kodu olmayan ${notInPanel}`);
    for (const e of examples) console.log(`    ${e}`);
  }

  if (!APPLY) { console.log("\n  Yazmak için: --uygula\n"); return; }

  // ── Yaz ───────────────────────────────────────────────────────────────────
  for (const [i, hit] of adopt) {
    const { error } = await db.from("stock_products")
      .update({ code: i.code, ...(hit.price == null && i.price != null ? { price: i.price } : {}) })
      .eq("id", hit.id).eq("workspace_id", ws).eq("code", "");
    if (error) { console.error(`❌ ${i.code} kodu yazılamadı — ${error.message}`); process.exit(1); }
    existing.set(key(i), hit.id);
  }
  for (const part of chunk(toCreate, 100)) {
    const { data, error } = await db.from("stock_products")
      .insert(part.map((i) => ({ workspace_id: ws, code: i.code, name: i.name || i.code, price: i.price })))
      .select("id, code");
    if (error) { console.error(`❌ ürün açılamadı — ${error.message}`); process.exit(1); }
    for (const r of (data ?? []) as { id: string; code: string }[]) existing.set(r.code.trim().toLocaleUpperCase("en-US"), r.id);
  }
  const moves: Record<string, unknown>[] = [];
  for (const i of stocked) {
    const id = existing.get(key(i))!;
    for (const [size, qty] of i.m212) {
      const diff = qty - (levels.get(`${id}|${size}`) ?? 0);
      if (!diff) continue;
      moves.push({
        workspace_id: ws, product_id: id, location_id: loc.id, size, kind: "sayim", qty: diff,
        note: `Excel sayımı (${src.kaynak}, ${src.alinma})`,
        source_ref: `afcom:${src.alinma}:${key(i)}:${size}`,
      });
    }
  }
  let written = 0;
  for (const part of chunk(moves, 500)) {
    const { error, count } = await db.from("stock_movements")
      .upsert(part, { onConflict: "workspace_id,source_ref", ignoreDuplicates: true, count: "exact" });
    if (error) { console.error(`❌ hareket yazılamadı — ${error.message}`); process.exit(1); }
    written += count ?? 0;
  }
  console.log(`\n  ✓ ${toCreate.length} ürün açıldı · ${adopt.size} ürüne kod yazıldı · ${written} sayım hareketi yazıldı (${moves.length - written} zaten vardı)`);

  let after = 0;
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from("stock_levels").select("qty").eq("workspace_id", ws).eq("location_id", loc.id).order("product_id").order("size").range(from, from + 999);
    after += sum(((data ?? []) as { qty: number }[]).map((r) => r.qty));
    if (!data || data.length < 1000) break;
  }
  console.log(`  "${loc.name}" artık panelde: ${after} adet\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
