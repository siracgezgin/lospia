#!/usr/bin/env npx tsx
/**
 * "AFR STOK" DOSYASINI (Drive, Kısmet Hanım) PANELE AKTAR.
 *
 * 18.11.2026 kararı: güncel stok eski stok programı değil, Drive'daki "AFR
 * Stok" dosyasıdır. Web sitesi stoğuna BAĞLANMAZ — bu betik "Online" yerine
 * dokunmaz, siteye hiçbir şey yazmaz.
 *
 * Kaynak: `stock-afrstok-to-json.py` → `~/Downloads/af-afrstok.json` (+ fotoğraf
 * klasörü). Dosyada iki stok var:
 *   • "Market212 Stok" sayfası      → --m212-yer  (varsayılan "Market 212 İstanbul")
 *   • kategori sayfaları (AFR stoğu) → --afr-yer   (varsayılan "AFR"; yoksa açılır)
 *
 * NE YAZAR
 *   • stock_products  — panelde olmayan ürün açılır. Var olan ürünün DOLU hiçbir
 *                       alanı değişmez; yalnız boş barkod / fiyat / fotoğraf dolar.
 *   • stock_movements — SAYIM hareketi: dosyadaki adet ile paneldeki adet
 *                       arasındaki fark. Dosyada geçen ürünün o yerdeki BÜTÜN
 *                       bedenleri sayılır (dosyada olmayan beden 0'a iner).
 *                       Dosyada HİÇ geçmeyen ürüne dokunulmaz; --tam-sayim ile
 *                       onlar da o yerde 0'a indirilir.
 *
 * ÜRÜN NASIL BULUNUR (dosyadaki kod sütunu elle yazılmış, hatalı olabiliyor;
 * barkod ve "malzeme kısa metni" eski stok programından geliyor):
 *   1. kod VE barkod aynı olan panel ürünü;
 *   2. yalnız barkod — fiyat, addaki numara ya da kod benzerliği tutuyorsa
 *      (barkodu yanlış yazılmış satır başka ürüne yapışmasın);
 *   3. yalnız kod;
 *   4. hiçbiri → yeni ürün. Kod başka ürüne aitse `KOD_BARKOD` olarak açılır.
 * Bir panel ürününü yalnız BİR dosya ürünü alır. Market212 sayfasındaki satır,
 * aynı kodu taşıyan AFR satırıyla tek ürün sayılır.
 *
 * YENİDEN ÇALIŞTIRILABİLİR: `source_ref = afrstok:<tarih>:<yer>:<ürün>:<beden>`
 * tekildir — aynı dosya ikinci kez hiçbir şey yazmaz. HİÇBİR ŞEY SİLMEZ.
 *
 *   npx tsx scripts/stock-import-afrstok.ts                        # yerel, RAPOR
 *   npx tsx scripts/stock-import-afrstok.ts --uygula --fotograf     # yerel, yazar
 *   npx tsx scripts/stock-import-afrstok.ts --prod                  # canlı, RAPOR
 *   npx tsx scripts/stock-import-afrstok.ts --prod --uygula --fotograf
 *   … --afr-yer "Market 212 Çeşme"     AFR stoğunu var olan bir yere yaz
 *   … --afr-ad "AFR Çeşme"             o yerin adını değiştir
 *   … --tam-sayim m212|afr|hepsi       dosyada olmayan ürünleri o yerde sıfırla
 *   … --koru <dosya>                   sıfırlanmayacak kod/barkod listesi (takı gibi)
 *   … --kod "Market212 Stok#3=26_KD001_PS"   satıra kod ver (kodsuz satır ya da yanlış kod; AFR sayfaları da olur)
 *   … --dosya <yol>
 */
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { normalizeSize } from "../lib/stock/model";

const arg = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const args = (name: string) => process.argv.flatMap((a, i) => (a === name && process.argv[i + 1] ? [process.argv[i + 1]] : []));
/* TANINMAYAN BAYRAK = DUR (bkz. customers-import.ts): yanlış yazılmış bir
   bayrak sessizce yok sayılıp varsayılan kipte yazmaya yol açmasın. */
{
  const flags = new Set(["--uygula", "--prod", "--fotograf"]);
  const valued = new Set(["--m212-yer", "--afr-yer", "--afr-ad", "--tam-sayim", "--koru", "--kod", "--dosya"]);
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (flags.has(argv[i])) continue;
    if (valued.has(argv[i]) && argv[i + 1] !== undefined) { i++; continue; }
    console.error(`❌ Tanınmayan bayrak: "${argv[i]}"`);
    process.exit(1);
  }
}
const APPLY = process.argv.includes("--uygula");
const PROD = process.argv.includes("--prod");
const PHOTOS = process.argv.includes("--fotograf");
const M212_LOCATION = arg("--m212-yer") ?? "Market 212 İstanbul";
const AFR_LOCATION = arg("--afr-yer") ?? "AFR";
const FULL = arg("--tam-sayim") ?? "";
/** `--tam-sayim` sıfırlarken DOKUNULMAYACAK ürünler: her satırında bir kod ya
 *  da barkod olan dosya. Dosyada hiç sayfası olmayan türler (takı) "yok" değil
 *  "sayılmamış"tır — Kısmet Hanım teyit edene kadar sıfırlanmaz. */
const KEEP = new Set(
  (arg("--koru") ? fs.readFileSync(arg("--koru")!.replace(/^~/, os.homedir()), "utf8").split(/\r?\n/) : [])
    .map((l) => l.split("\t")[0].trim().toLocaleUpperCase("en-US")).filter((l) => l && !l.startsWith("#")),
);
/** AFR stoğunun yazıldığı yerin YENİ adı (isteğe bağlı). Eski stok programının
 *  tek mağazası "AFR Çeşme Marina"ydı; o stok panelde "Market 212 Çeşme" adıyla
 *  duruyor. AFR sayfaları aynı defterin güncel hâliyse yer adı da düzelir. */
const AFR_RENAME = (arg("--afr-ad") ?? "").trim();
const FILE = arg("--dosya") ?? path.join(os.homedir(), "Downloads", "af-afrstok.json");
const BUCKET = "production-sheets";
/** "Sayfa#satır" → kod. Kodu yazılmamış satır için elle verilen kod. */
const CODE_FOR = new Map(args("--kod").map((s) => { const i = s.lastIndexOf("="); return [s.slice(0, i).trim(), s.slice(i + 1).trim()] as [string, string]; }));

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

type Row = {
  sayfa: string; satir: number; tur: "m212" | "afr";
  kod: string; barkod: string; kisa_metin: string; stil: string; renk: string; etiket: string;
  fiyat: number | null; not: string;
  m212: Record<string, number> | null; afr: Record<string, number>; foto: string;
};
type Sizes = Map<string, number>;
/** Dosyadaki bir ürün: AFR satır(lar)ı ve/veya Market212 satır(lar)ı. */
type Item = {
  code: string; barcode: string; name: string; short: string; price: number | null;
  m212: Sizes | null; afr: Sizes | null;
  m212Note: string; afrNote: string; photo: string; refs: string[];
};
type Product = { id: string; code: string; barcode: string; name: string; price: number | null; image_url: string; active: boolean };
type LocKey = "m212" | "afr";

const up = (s: string) => s.trim().toLocaleUpperCase("en-US");
const loose = (s: string) => up(s).replace(/[^A-Z0-9]/g, "");
const sum = (m: Iterable<number>) => [...m].reduce((a, b) => a + b, 0);
const total = (m: Sizes | null) => (m ? sum(m.values()) : 0);
const ref = (r: Row) => `${r.sayfa}#${r.satir}`;
const sizesText = (m: Sizes | null) => (m && m.size ? [...m].map(([s, q]) => `${s} ${q}`).join(" · ") : "—");
const sameSizes = (a: Sizes, b: Sizes) => a.size === b.size && [...a].every(([s, q]) => b.get(s) === q);
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const safeName = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 60) || "urun";
/** Aynı uzunlukta ve tek karakteri farklı (kod yazım hatası: S01 ↔ S02). */
const oneEditApart = (a: string, b: string) => a.length === b.length && [...a].filter((ch, i) => ch !== b[i]).length === 1;
/** Addaki son numara: "BLUZ 1456" → "1456" (eski programda barkodun son hanesi). */
const tailNumber = (s: string) => s.match(/(\d{3,4})\D*$/)?.[1] ?? "";
const list = (title: string, lines: string[], max = 40) => {
  if (!lines.length) return;
  console.log(`\n  ${title} (${lines.length})`);
  for (const l of lines.slice(0, max)) console.log(`    ${l}`);
  if (lines.length > max) console.log(`    … ve ${lines.length - max} satır daha`);
};

function toSizes(rec: Record<string, number> | null): Sizes {
  const m: Sizes = new Map();
  for (const [s, q] of Object.entries(rec ?? {})) {
    const size = normalizeSize(s);
    if (q > 0) m.set(size, (m.get(size) ?? 0) + q);
  }
  return m;
}
function addSizes(into: Sizes, from: Sizes) { for (const [s, q] of from) into.set(s, (into.get(s) ?? 0) + q); }
const joinNote = (a: string, b: string) => (!b || a.includes(b) ? a : a ? `${a} · ${b}` : b);

async function main() {
  if (!fs.existsSync(FILE)) { console.error(`❌ Dosya yok: ${FILE}\n   önce: python3 scripts/stock-afrstok-to-json.py "<AFR Stok.xlsx>"`); process.exit(1); }
  const src = JSON.parse(fs.readFileSync(FILE, "utf8")) as { kaynak: string; alinma: string; foto_klasoru: string; satirlar: Row[] };
  const t = target();
  const db = createClient(t.url, t.key, { auth: { persistSession: false } });
  console.log(`\n▸ ${t.label} · ${APPLY ? "YAZAR" : "RAPOR (yazmaz)"} · kaynak ${src.kaynak} (${src.alinma})`);

  // ── 1. Dosya satırlarını ürüne indir ──────────────────────────────────────
  const items: Item[] = [];
  const mergedAfr: string[] = [], mergedM: string[] = [], picked: string[] = [], ambiguous: string[] = [], codeless: string[] = [], copyDiff: string[] = [], copyOnly: string[] = [];

  /* AFR satırları: kimlik barkod + kod. İkisi de aynı olan satırlar (aynı
     ürünün renkleri tek kodla yazılmış) tek üründür, adetler toplanır. */
  const afrByKey = new Map<string, Item>();
  for (const r0 of src.satirlar.filter((x) => x.tur === "afr")) {
    /* --kod AFR satırına da kod verir: dosyadaki kod panelde başka ürünün
       olduğunda satır, panelde zaten duran asıl kaydına bağlanır. */
    const r = CODE_FOR.has(ref(r0)) ? { ...r0, kod: CODE_FOR.get(ref(r0))! } : r0;
    const key = `${r.barkod}|${up(r.kod)}`;
    const sizes = toSizes(r.afr);
    const hit = key !== "|" ? afrByKey.get(key) : undefined;
    if (hit) {
      addSizes(hit.afr!, sizes);
      hit.afrNote = joinNote(hit.afrNote, r.not);
      hit.refs.push(ref(r));
      if (!hit.photo) hit.photo = r.foto;
      mergedAfr.push(`${r.kod || r.barkod}  ${ref(r)} (${r.renk || "—"}: ${sizesText(sizes)}) → ${hit.refs[0]} ile toplandı`);
      continue;
    }
    const item: Item = {
      code: r.kod, barcode: r.barkod, short: r.kisa_metin, price: r.fiyat,
      name: (r.stil && r.renk ? `${r.stil} · ${r.renk}` : r.stil || r.kisa_metin || r.etiket || r.kod || r.barkod).slice(0, 300),
      m212: null, afr: sizes, m212Note: "", afrNote: r.not, photo: r.foto, refs: [ref(r)],
    };
    items.push(item);
    if (key !== "|") afrByKey.set(key, item);
  }
  const afrByCode = new Map<string, Item[]>();
  for (const i of items) if (i.code) afrByCode.set(up(i.code), [...(afrByCode.get(up(i.code)) ?? []), i]);

  /* Market212 satırları: aynı kodu taşıyan AFR ürünüyle TEK ürün. Kod AFR'de
     birden çok üründeyse sayfadaki "AFR" kopyası (aynı bedenler) ya da fiyat
     hangisi olduğunu söyler. */
  const mByCode = new Map<string, Item>();
  const usedNames = new Map<string, number>();
  const mRows = src.satirlar.filter((x) => x.tur === "m212");
  const baseName = (r: Row) => r.etiket || (r.stil && r.renk ? `${r.stil} · ${r.renk}` : r.stil || (r.renk ? `Adsız · ${r.renk}` : "Adsız"));
  const nameCount = new Map<string, number>();
  for (const r of mRows) if (!(CODE_FOR.get(ref(r)) ?? r.kod)) nameCount.set(baseName(r), (nameCount.get(baseName(r)) ?? 0) + 1);
  for (const r of mRows) {
    const code = CODE_FOR.get(ref(r)) ?? r.kod;
    const sizes = toSizes(r.m212), copy = toSizes(r.afr);
    const attach = (item: Item) => {
      if (item.m212) { addSizes(item.m212, sizes); mergedM.push(`${code}  ${ref(r)} (${r.renk || "—"}: ${sizesText(sizes)}) → aynı kodun önceki satırıyla toplandı`); }
      else item.m212 = sizes;
      item.m212Note = joinNote(item.m212Note, r.not);
      item.refs.push(ref(r));
      if (!item.photo) item.photo = r.foto;
      if (item.price == null) item.price = r.fiyat;
    };
    if (!code) {
      /* Kodsuz satır: adıyla ürün olur. Aynı ad birden çok satırdaysa fiyat,
         o da aynıysa sıra numarası eklenir (ad, yeniden çalıştırmada kimliktir). */
      let name = baseName(r);
      if ((nameCount.get(name) ?? 0) > 1 && r.fiyat != null) name = `${name} · ₺${Math.round(r.fiyat).toLocaleString("tr-TR")}`;
      const n = (usedNames.get(name) ?? 0) + 1;
      usedNames.set(name, n);
      if (n > 1) name = `${name} (${n})`;
      items.push({ code: "", barcode: "", name: name.slice(0, 300), short: "", price: r.fiyat, m212: sizes, afr: null, m212Note: r.not, afrNote: "", photo: r.foto, refs: [ref(r)] });
      codeless.push(`${ref(r)}  "${name}"  ${sizesText(sizes)}${r.foto ? "" : "  (fotoğrafı da yok)"}`);
      if (total(copy)) copyOnly.push(`${ref(r)}  "${name}": sayfada AFR ${sizesText(copy)} yazıyor, kod yok — AFR'ye yazılmadı`);
      continue;
    }
    const cands = afrByCode.get(up(code)) ?? [];
    let item: Item | undefined;
    if (cands.length === 1) item = cands[0];
    else if (cands.length > 1) {
      const bySizes = cands.filter((c) => total(copy) > 0 && sameSizes(c.afr!, copy));
      const byPrice = cands.filter((c) => r.fiyat != null && c.price === r.fiyat);
      item = bySizes.length === 1 ? bySizes[0] : byPrice.length === 1 ? byPrice[0] : undefined;
      if (item) picked.push(`${code}  ${ref(r)} → ${item.refs[0]} (${item.short || item.name}) — ${bySizes.length === 1 ? "AFR adetleri aynı" : "fiyat aynı"}`);
      else { item = cands[0]; ambiguous.push(`${code}  ${ref(r)}: AFR'de ${cands.length} ayrı ürün bu kodu taşıyor, hangisi belli değil → ilki (${cands[0].refs[0]}) alındı`); }
    }
    if (item) {
      attach(item);
      if (!sameSizes(item.afr!, copy)) copyDiff.push(`${code}  ${ref(r)} AFR ${sizesText(copy)}  ≠  ${item.refs[0]} ${sizesText(item.afr)} ← yazılacak`);
      continue;
    }
    const prev = mByCode.get(up(code));
    if (prev) { attach(prev); continue; }
    const fresh: Item = {
      code, barcode: "", short: "", price: r.fiyat,
      name: (r.etiket || (r.stil && r.renk ? `${r.stil} · ${r.renk}` : r.stil || r.renk || code)).slice(0, 300),
      m212: sizes, afr: null, m212Note: r.not, afrNote: "", photo: r.foto, refs: [ref(r)],
    };
    items.push(fresh);
    mByCode.set(up(code), fresh);
    if (total(copy)) copyOnly.push(`${code}  ${ref(r)}: sayfada AFR ${sizesText(copy)} yazıyor ama AFR sayfalarında bu kod yok — AFR'ye yazılmadı`);
  }

  const knownRefs = new Set(src.satirlar.map(ref));
  const unknownRefs = [...CODE_FOR.keys()].filter((k) => !knownRefs.has(k));
  if (unknownRefs.length) { console.error(`❌ --kod: dosyada böyle satır yok → ${unknownRefs.join(", ")} (biçim "Sayfa#satır=KOD")`); process.exit(1); }

  const fileM = sum(items.map((i) => total(i.m212))), fileA = sum(items.map((i) => total(i.afr)));
  console.log(`  DOSYA: ${src.satirlar.length} satır → ${items.length} ürün · Market 212 ${fileM} adet (${items.filter((i) => i.m212).length} ürün) · AFR ${fileA} adet (${items.filter((i) => i.afr).length} ürün)`);

  // ── 2. Yerler, çalışma alanı, mevcut ürünler ve adetler ───────────────────
  const { data: locRows, error: locErr } = await db.from("stock_locations").select("id, workspace_id, name, position");
  if (locErr) { console.error(`❌ stock_locations okunamadı — ${locErr.message}`); process.exit(1); }
  const allLocs = (locRows ?? []) as { id: string; workspace_id: string; name: string; position: number }[];
  const mLocs = allLocs.filter((l) => l.name === M212_LOCATION);
  if (mLocs.length !== 1) { console.error(`❌ "${M212_LOCATION}" adında ${mLocs.length} yer bulundu; tam bir tane olmalı (--m212-yer ile adını verin).`); process.exit(1); }
  const ws = mLocs[0].workspace_id;
  const loc: Record<LocKey, { id: string | null; name: string }> = {
    m212: { id: mLocs[0].id, name: M212_LOCATION },
    afr: { id: allLocs.find((l) => l.workspace_id === ws && l.name === AFR_LOCATION)?.id ?? null, name: AFR_LOCATION },
  };
  if (loc.afr.id === loc.m212.id) { console.error("❌ İki stok aynı yere yazılamaz."); process.exit(1); }

  const products: Product[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("stock_products").select("id, code, barcode, name, price, image_url, active").eq("workspace_id", ws).order("id").range(from, from + 999);
    if (error) { console.error(`❌ stock_products okunamadı — ${error.message}`); process.exit(1); }
    products.push(...((data ?? []) as Product[]));
    if (!data || data.length < 1000) break;
  }
  /** `${ürün}|${yer}` → beden → adet */
  const levels = new Map<string, Sizes>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("stock_levels").select("product_id, location_id, size, qty").eq("workspace_id", ws).order("product_id").order("location_id").order("size").range(from, from + 999);
    if (error) { console.error(`❌ stock_levels okunamadı — ${error.message}`); process.exit(1); }
    for (const r of (data ?? []) as { product_id: string; location_id: string; size: string; qty: number }[]) {
      const k = `${r.product_id}|${r.location_id}`;
      levels.set(k, (levels.get(k) ?? new Map()).set(r.size, r.qty));
    }
    if (!data || data.length < 1000) break;
  }
  const levelOf = (productId: string, k: LocKey): Sizes => (loc[k].id ? levels.get(`${productId}|${loc[k].id}`) ?? new Map() : new Map());
  const locTotal = (k: LocKey) => (loc[k].id ? sum([...levels].filter(([key]) => key.endsWith(`|${loc[k].id}`)).map(([, m]) => sum(m.values()))) : 0);
  console.log(`  YERLER: Market 212 → "${loc.m212.name}" (şu an ${locTotal("m212")} adet) · AFR → "${loc.afr.name}" ${loc.afr.id ? `(şu an ${locTotal("afr")} adet)` : "(YOK — açılacak)"}`);
  if (AFR_RENAME && AFR_RENAME !== loc.afr.name) {
    if ((locRows ?? []).some((l) => l.workspace_id === ws && l.name === AFR_RENAME)) { console.error(`❌ "${AFR_RENAME}" adında bir yer zaten var.`); process.exit(1); }
    console.log(`  YER ADI: "${loc.afr.name}" → "${AFR_RENAME}" olarak değişecek`);
  }

  // ── 3. Dosya ürünü ↔ panel ürünü ──────────────────────────────────────────
  const byCode = new Map<string, Product>();
  const byBarcode = new Map<string, Product[]>();
  const codelessByName = new Map<string, Product[]>();
  for (const p of products) {
    if (p.code.trim()) byCode.set(up(p.code), p);
    else codelessByName.set(p.name.trim(), [...(codelessByName.get(p.name.trim()) ?? []), p]);
    if (p.barcode.trim()) byBarcode.set(p.barcode.trim(), [...(byBarcode.get(p.barcode.trim()) ?? []), p]);
  }
  const match = new Map<Item, Product>();
  const claimed = new Set<string>();
  const how = new Map<Item, string>();
  const claim = (i: Item, p: Product, by: string) => { match.set(i, p); claimed.add(p.id); how.set(i, by); };
  const free = (p: Product | undefined) => !!p && !claimed.has(p.id);

  // 3.1 kod VE barkod aynı
  for (const i of items) {
    if (!i.barcode || !i.code) continue;
    const p = (byBarcode.get(i.barcode) ?? []).find((x) => up(x.code) === up(i.code));
    if (free(p)) claim(i, p!, "kod+barkod");
  }
  // 3.2 yalnız barkod — fiyat / addaki numara / kod benzerliği tutuyorsa
  const barcodeOnly: string[] = [], barcodeRejected: string[] = [];
  for (const i of items) {
    if (match.has(i) || !i.barcode) continue;
    const cands = (byBarcode.get(i.barcode) ?? []).filter((p) => free(p));
    if (!cands.length) continue;
    const plausible = (p: Product) => {
      const a = tailNumber(i.short), b = tailNumber(p.name);
      /* İki adda da numara var ve farklıysa barkod yanlış yazılmıştır
         ("ALINA SWIMSUIT 1570" satırına 35011569 = "ESARP 1569"). */
      if (a && b && a !== b) return false;
      const ci = loose(i.code), cp = loose(p.code);
      return (i.price != null && p.price != null && Number(p.price) === i.price) ||
        (!!a && a === b) ||
        (ci.length >= 4 && cp.length >= 4 && (cp.startsWith(ci) || ci.startsWith(cp) || oneEditApart(ci, cp)));
    };
    const ok = cands.filter(plausible);
    const byPrice = ok.filter((p) => i.price != null && Number(p.price) === i.price);
    const notOld = ok.filter((p) => !/eski$/i.test(p.code.trim()));
    const p = ok.length === 1 ? ok[0] : byPrice.length === 1 ? byPrice[0] : notOld.length === 1 ? notOld[0] : undefined;
    if (p) {
      claim(i, p, "barkod");
      if (i.code && up(p.code) !== up(i.code)) barcodeOnly.push(`${i.refs[0]}  barkod ${i.barcode} (${i.short || i.name}): dosyada kod "${i.code}", panelde "${p.code}" ${p.name}`);
    } else {
      barcodeRejected.push(`${i.refs[0]}  ${i.code || "(kodsuz)"} barkod ${i.barcode} (${i.short}) → panelde ${cands.map((c) => `"${c.code}" ${c.name}`).join(" | ")} — fiyat/ad tutmuyor, barkoda güvenilmedi`);
    }
  }
  // 3.3 yalnız kod
  const codeOnlyBarcodeDiffers: string[] = [], codeTaken: string[] = [], codeOnly: string[] = [];
  for (const i of items) {
    if (match.has(i) || !i.code) continue;
    const p = byCode.get(up(i.code));
    if (!p) continue;
    if (!free(p)) { codeTaken.push(`${i.refs[0]}  ${i.code} ${i.barcode} (${i.short || i.name}): bu kod panelde başka bir dosya ürününe bağlandı ("${p.name}")`); continue; }
    claim(i, p, "kod");
    codeOnly.push(`${i.code}  dosyada "${i.name}"${i.price != null ? ` ₺${i.price}` : ""}  ↔  panelde "${p.name}"${p.price != null ? ` ₺${p.price}` : ""}`);
    if (i.barcode && p.barcode.trim() && p.barcode.trim() !== i.barcode) codeOnlyBarcodeDiffers.push(`${i.refs[0]}  ${i.code}: dosyada barkod ${i.barcode} (${i.short}), panelde ${p.barcode} ${p.name}`);
  }
  // 3.4 kodu başkasına ait olduğu için ekli kodla açılmış ürün (önceki çalıştırma)
  const suffixOf = (i: Item) => i.barcode || loose(i.name.split("·").pop() ?? "");
  for (const i of items) {
    if (match.has(i) || !i.code || !suffixOf(i)) continue;
    const p = byCode.get(up(`${i.code}_${suffixOf(i)}`));
    if (free(p)) claim(i, p!, "kod");
  }
  // 3.5 kodsuz + barkodsuz: daha önce bu betiğin açtığı ürün (aynı ad, kodsuz)
  for (const i of items) {
    if (match.has(i) || i.code || i.barcode) continue;
    const hits = (codelessByName.get(i.name) ?? []).filter((p) => free(p) && !p.barcode.trim());
    if (hits.length === 1) claim(i, hits[0], "ad");
  }

  const stocked = (i: Item) => total(i.m212) + total(i.afr) > 0;
  const toCreate = items.filter((i) => !match.has(i) && stocked(i));
  const skipped = items.filter((i) => !match.has(i) && !stocked(i));
  /* Yeni ürünün kodu: panelde ya da bu aktarımda başkasına aitse ayırt edici ek. */
  const takenCodes = new Set(products.filter((p) => p.code.trim()).map((p) => up(p.code)));
  const newCode = new Map<Item, string>();
  const renamed: string[] = [];
  for (const i of toCreate) {
    let code = i.code;
    if (code && takenCodes.has(up(code))) {
      const suffix = suffixOf(i) || String(newCode.size + 1);
      code = `${i.code}_${suffix}`.slice(0, 60);
      for (let n = 2; takenCodes.has(up(code)); n++) code = `${i.code}_${suffix}_${n}`.slice(0, 60);
      renamed.push(`${i.refs[0]}  ${i.code} (${i.short || i.name}) → "${code}" olarak açılacak`);
    }
    if (code) takenCodes.add(up(code));
    newCode.set(i, code);
  }
  const count = (by: string) => [...how.values()].filter((h) => h === by).length;
  console.log(`  ÜRÜN: ${items.length} · panelde bulundu ${match.size} (kod+barkod ${count("kod+barkod")}, barkod ${count("barkod")}, kod ${count("kod")}, ad ${count("ad")}) · açılacak ${toCreate.length} · stoksuz ve panelde yok (atlandı) ${skipped.length}`);

  list("Aynı barkod+kod birden çok AFR satırında — adetler TOPLANDI", mergedAfr);
  list("Aynı kod Market212 sayfasında iki satırda — adetler TOPLANDI", mergedM);
  list("Kod AFR'de birden çok üründe — Market212 satırı şuna bağlandı", picked);
  list("Kod AFR'de birden çok üründe — HANGİSİ BELLİ DEĞİL", ambiguous);
  list("Market212 sayfasında KODU YAZILMAMIŞ satırlar — adıyla açılır/bulunur (kod yazılınca --kod ile bağlanır)", codeless);
  list("Barkod eşleşti, kod farklı — barkoda göre bağlandı", barcodeOnly);
  list("Barkod panelde başka ürünü gösteriyor — barkoda GÜVENİLMEDİ", barcodeRejected);
  list("Kod eşleşti, barkod farklı — koda göre bağlandı", codeOnlyBarcodeDiffers);
  list("Yalnız koda göre bağlananlar (barkod yok ya da panelde yok) — adlar aynı ürünü mü gösteriyor?", codeOnly, 60);
  list("Kod panelde başka ürünün — yeni ürün ayrı kodla açılacak", renamed);
  list("Market212 sayfasındaki AFR adedi ≠ AFR sayfasındaki adet — AFR sayfası yazılacak", copyDiff);
  list("Market212 sayfasında AFR adedi var, AFR sayfalarında karşılığı yok", copyOnly);
  list("Açılacak ürünler", toCreate.map((i) => `${newCode.get(i) || "(kodsuz)"}  ${i.name}  ·  M212 ${sizesText(i.m212)}  ·  AFR ${sizesText(i.afr)}`), 200);
  const priceDiff = [...match].filter(([i, p]) => i.price != null && p.price != null && Number(p.price) !== i.price);
  list("Fiyat dosyada farklı — panel fiyatı DEĞİŞMEZ", priceDiff.map(([i, p]) => `${p.code || p.name}: dosya ${i.price} · panel ${p.price}`), 12);
  list("Eşleşen ürün panelde PASİF (listede görünmez)", [...match].filter(([i, p]) => !p.active && stocked(i)).map(([i, p]) => `${p.code || p.name}  ${i.refs[0]}`));

  // ── 4. Sayım farkları ─────────────────────────────────────────────────────
  type Move = { item: Item | null; productId: string | null; k: LocKey; size: string; qty: number; note: string; refKey: string };
  const moves: Move[] = [];
  const plan = (i: Item, productId: string | null) => {
    for (const k of ["m212", "afr"] as LocKey[]) {
      const want = i[k];
      if (!want) continue;
      const have = productId ? levelOf(productId, k) : new Map<string, number>();
      const note = joinNote(`Excel sayımı (${src.kaynak}, ${src.alinma})`, (k === "m212" ? i.m212Note : i.afrNote).slice(0, 160));
      for (const size of new Set([...want.keys(), ...have.keys()])) {
        const diff = (want.get(size) ?? 0) - (have.get(size) ?? 0);
        if (diff) moves.push({ item: i, productId, k, size, qty: diff, note, refKey: "" });
      }
    }
  };
  for (const [i, p] of match) plan(i, p.id);
  for (const i of toCreate) plan(i, null);

  /* Dosyada hiç geçmeyen ama o yerde stoğu olan ürünler. */
  const absent: Record<LocKey, { p: Product; sizes: Sizes }[]> = { m212: [], afr: [] };
  const inFile: Record<LocKey, Set<string>> = { m212: new Set(), afr: new Set() };
  for (const [i, p] of match) for (const k of ["m212", "afr"] as LocKey[]) if (i[k]) inFile[k].add(p.id);
  for (const k of ["m212", "afr"] as LocKey[]) {
    if (!loc[k].id) continue;
    for (const p of products) {
      const have = levelOf(p.id, k);
      if (!inFile[k].has(p.id) && [...have.values()].some((q) => q !== 0)) absent[k].push({ p, sizes: have });
    }
    absent[k].sort((a, b) => total(b.sizes) - total(a.sizes));
    const zero = FULL === k || FULL === "hepsi";
    const kept = (a: { p: Product }) => KEEP.has(a.p.code.trim().toLocaleUpperCase("en-US")) || (!!a.p.barcode && KEEP.has(a.p.barcode.trim().toLocaleUpperCase("en-US")));
    const protectedOnes = zero ? absent[k].filter(kept) : [];
    const toZero = zero ? absent[k].filter((a) => !kept(a)) : [];
    list(`"${loc[k].name}" yerinde stoğu var, dosyada YOK — ${zero ? "SIFIRLANACAK (--tam-sayim)" : "dokunulmuyor"} · ${sum((zero ? toZero : absent[k]).map((a) => total(a.sizes)))} adet`,
      (zero ? toZero : absent[k]).map((a) => `${a.p.code || "(kodsuz)"}  ${a.p.name}  ${sizesText(a.sizes)}`), 400);
    if (protectedOnes.length) {
      list(`"${loc[k].name}" yerinde stoğu var, dosyada YOK — KORUNUYOR (--koru) · ${sum(protectedOnes.map((a) => total(a.sizes)))} adet`,
        protectedOnes.map((a) => `${a.p.code || "(kodsuz)"}  ${a.p.name}  ${sizesText(a.sizes)}`), 400);
    }
    if (zero) for (const a of toZero) for (const [size, q] of a.sizes) if (q) {
      moves.push({ item: null, productId: a.p.id, k, size, qty: -q, note: `Excel sayımı (${src.kaynak}, ${src.alinma}) · dosyada yok`, refKey: "" });
    }
  }
  for (const k of ["m212", "afr"] as LocKey[]) {
    const ms = moves.filter((m) => m.k === k);
    const after = locTotal(k) + sum(ms.map((m) => m.qty));
    const file = k === "m212" ? fileM : fileA;
    console.log(`\n  "${loc[k].name}": ${ms.length} sayım hareketi (${sum(ms.filter((m) => m.qty > 0).map((m) => m.qty))} artı, ${sum(ms.filter((m) => m.qty < 0).map((m) => m.qty))} eksi) → ${locTotal(k)} adetten ${after} adede · dosyada ${file} adet${after === file ? " ✓" : ` (fark ${after - file}: dosyada geçmeyen ürünler)`}`);
  }

  if (!APPLY) { console.log(`\n  Yazmak için: --uygula${PHOTOS ? "" : "   (fotoğraflar için --fotograf)"}\n`); return; }

  // ── 5. YAZ ────────────────────────────────────────────────────────────────
  if (!loc.afr.id) {
    const position = Math.max(-1, ...allLocs.filter((l) => l.workspace_id === ws).map((l) => l.position)) + 1;
    const { data, error } = await db.from("stock_locations").insert({ workspace_id: ws, name: AFR_LOCATION, kind: "warehouse", position }).select("id").single();
    if (error || !data) { console.error(`❌ "${AFR_LOCATION}" yeri açılamadı — ${error?.message}`); process.exit(1); }
    loc.afr.id = (data as { id: string }).id;
    console.log(`\n  ✓ "${AFR_LOCATION}" yeri açıldı`);
  }
  /* Var olan ürün: yalnız BOŞ alan dolar. */
  let filled = 0;
  for (const [i, p] of match) {
    const patch: Record<string, unknown> = {};
    if (!p.barcode.trim() && i.barcode && !(byBarcode.get(i.barcode) ?? []).length) patch.barcode = i.barcode;
    if (p.price == null && i.price != null) patch.price = i.price;
    if (!Object.keys(patch).length) continue;
    const { error } = await db.from("stock_products").update(patch).eq("id", p.id).eq("workspace_id", ws);
    if (error) { console.error(`❌ ${p.code || p.name} güncellenemedi — ${error.message}`); process.exit(1); }
    filled++;
  }
  const created = new Map<Item, Product>();
  for (const part of chunk(toCreate, 100)) {
    for (const i of part) {
      /* Tek tek: dönen satırı dosya ürününe güvenle bağlamak için (kodsuz
         ürünlerde koda göre eşleme yapılamaz). */
      const { data, error } = await db.from("stock_products")
        .insert({ workspace_id: ws, code: newCode.get(i) ?? "", barcode: i.barcode, name: i.name || newCode.get(i) || i.barcode, price: i.price })
        .select("id, code, barcode, name, price, image_url, active").single();
      if (error || !data) { console.error(`❌ ürün açılamadı (${i.refs[0]}) — ${error?.message}`); process.exit(1); }
      created.set(i, data as Product);
    }
  }
  const productOf = (m: Move) => m.productId ?? created.get(m.item!)!.id;
  let written = 0;
  for (const part of chunk(moves, 500)) {
    const { error, count: n } = await db.from("stock_movements").upsert(part.map((m) => ({
      workspace_id: ws, product_id: productOf(m), location_id: loc[m.k].id!, size: m.size, kind: "sayim", qty: m.qty,
      note: m.note, source_ref: `afrstok:${src.alinma}:${m.k}:${productOf(m)}:${m.size}`,
    })), { onConflict: "workspace_id,source_ref", ignoreDuplicates: true, count: "exact" });
    if (error) { console.error(`❌ hareket yazılamadı — ${error.message}`); process.exit(1); }
    written += n ?? 0;
  }
  console.log(`\n  ✓ ${created.size} ürün açıldı · ${filled} üründe boş barkod/fiyat doldu · ${written} sayım hareketi yazıldı (${moves.length - written} zaten vardı)`);

  for (const k of ["m212", "afr"] as LocKey[]) {
    let after = 0;
    for (let from = 0; ; from += 1000) {
      const { data } = await db.from("stock_levels").select("qty").eq("workspace_id", ws).eq("location_id", loc[k].id!).order("product_id").order("size").range(from, from + 999);
      after += sum(((data ?? []) as { qty: number }[]).map((r) => r.qty));
      if (!data || data.length < 1000) break;
    }
    console.log(`  "${loc[k].name}" artık panelde: ${after} adet`);
  }

  // ── 6. Fotoğraflar — yalnız fotoğrafı OLMAYAN ürüne ───────────────────────
  if (AFR_RENAME && AFR_RENAME !== loc.afr.name && loc.afr.id) {
    const { error } = await db.from("stock_locations").update({ name: AFR_RENAME }).eq("id", loc.afr.id).eq("workspace_id", ws);
    console.log(error ? `  ❌ yer adı değişmedi — ${error.message}` : `  Yer adı: "${loc.afr.name}" → "${AFR_RENAME}"`);
  }
  if (!PHOTOS) { console.log("  Fotoğraflar için: --fotograf ekleyin.\n"); return; }
  const sharp = (await import("sharp")).default;
  const todo = [...match, ...created].filter(([i, p]) => i.photo && !p.image_url);
  console.log(`\n  FOTOĞRAF: ${todo.length} ürün için yüklenecek…`);
  let ok = 0, fail = 0, bytes = 0;
  const queue = [...todo];
  const worker = async () => {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      const [i, p] = next;
      try {
        const out = await sharp(fs.readFileSync(path.join(src.foto_klasoru, i.photo)))
          .rotate().resize(1000, 1000, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 78, mozjpeg: true }).toBuffer();
        const key = `${ws}/stok/${safeName(p.code || p.barcode)}-${p.id.slice(0, 8)}.jpeg`;
        const upload = await db.storage.from(BUCKET).upload(key, out, { contentType: "image/jpeg", upsert: true });
        if (upload.error) throw new Error(upload.error.message);
        const publicUrl = db.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
        const { error } = await db.from("stock_products").update({ image_url: publicUrl }).eq("id", p.id).eq("image_url", "");
        if (error) throw new Error(error.message);
        ok++; bytes += out.length;
      } catch (e) {
        fail++;
        if (fail <= 10) console.log(`    ! ${p.code || p.name}: ${e instanceof Error ? e.message : e}`);
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  console.log(`  ✓ ${ok} fotoğraf yüklendi (${(bytes / 1024 / 1024).toFixed(1)} MB) · ${fail} alınamadı\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
