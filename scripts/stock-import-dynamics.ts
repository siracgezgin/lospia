#!/usr/bin/env npx tsx
/**
 * ESKİ STOK PROGRAMINI (Dynamics 365 "Aslı Filinta Satış Merkezi") PANELE AKTAR.
 *
 * Kaynak: tarayıcı konsolundan indirilen `af-dynamics-stok.json` (17.11.2026) —
 * 690 ürün, 968 mağaza stok satırı (mağaza × ürün × beden), 2.461 hareket.
 * İçinde MÜŞTERİ BİLGİSİ YOK (dışa aktarım o alanları almadı) — KVKK.
 *
 * NE YAZAR
 *   • stock_products  — ürün (kod = eski `productnumber`; koda göre eşleşir)
 *   • stock_movements — hareketler ASIL TARİHLERİYLE (giriş · sayım · satış);
 *                       eldeki adet bizde de hareketlerin toplamı, eski
 *                       programla birebir aynı çıkar (968/968 doğrulandı).
 *   • --fotograf ile ürün fotoğrafları: satıcının Azure deposundan indirilir,
 *     uzun kenar 1000 px JPEG'e küçültülür, kendi depomuza yazılır (asılları
 *     ortalama ~0,5 MB; küçültülmeden 340 MB ederdi).
 *
 * YENİDEN ÇALIŞTIRILABİLİR: hareket `source_ref = dyn:<eski kimlik>` ile
 * tekildir (20240375) — ikinci çalıştırma hiçbir şeyi iki kez yazmaz.
 * HİÇBİR ŞEY SİLMEZ, mevcut ürünün adını/fiyatını EZMEZ (yalnız eksik olanı açar).
 *
 *   npx tsx scripts/stock-import-dynamics.ts                       # yerel, RAPOR
 *   npx tsx scripts/stock-import-dynamics.ts --uygula               # yerel, yazar
 *   npx tsx scripts/stock-import-dynamics.ts --prod                 # canlı, RAPOR
 *   npx tsx scripts/stock-import-dynamics.ts --prod --uygula        # canlı, yazar
 *   npx tsx scripts/stock-import-dynamics.ts --prod --uygula --fotograf
 *   … --yer "Market 212 Çeşme"   (varsayılan)   … --dosya <yol>   … --limit 20
 */
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import sharp from "sharp";
import { normalizeSize } from "../lib/stock/model";

const arg = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const APPLY = process.argv.includes("--uygula");
const PROD = process.argv.includes("--prod");
const PHOTOS = process.argv.includes("--fotograf");
const LOCATION = arg("--yer") ?? "Market 212 Çeşme";
const FILE = arg("--dosya") ?? path.join(os.homedir(), "Downloads", "af-dynamics-stok.json");
const LIMIT = arg("--limit") ? Number(arg("--limit")) : Infinity;
const BUCKET = "production-sheets";

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

type DynProduct = { productid: string; name?: string; productnumber?: string; zen_barkod?: string; price?: number | null; producturl?: string; statecode?: number };
type DynStoreStock = { zen_magazaurunid: string; zen_beden?: string; zen_eldekiadet?: number | null; _zen_urunid_value?: string };
type DynMove = { zen_stokhareketiid: string; zen_adet?: number | null; zen_satistipicode?: number | null; zen_fiyat?: number | null; zen_stokhareketitarihi?: string | null; createdon?: string; _zen_magazastokid_value?: string };

/** Eski tür kodu → bizim tür. Bilinmeyen kod, işaretine göre giriş/çıkış olur. */
function kindOf(code: number | null | undefined, qty: number): string {
  switch (code) {
    case 10: return "satis";
    case 20: return "iade";
    case 60: return "sayim";
    case 70: return "giris";
    default: return qty > 0 ? "giris" : "cikis"; // 30 marketing · 40 rezerve · 50 depo · 80 tadilat · 100 diğer
  }
}

const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const safeName = (code: string) => code.replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 80) || "urun";

async function main() {
  if (!fs.existsSync(FILE)) { console.error(`❌ Dosya yok: ${FILE}`); process.exit(1); }
  const src = JSON.parse(fs.readFileSync(FILE, "utf8")) as { urunler: DynProduct[]; magazaStok: DynStoreStock[]; hareketler: DynMove[]; magazalar: { zen_name: string }[]; alinma: string };
  const t = target();
  const db = createClient(t.url, t.key, { auth: { persistSession: false } });
  console.log(`\n▸ ${t.label} · ${APPLY ? "YAZAR" : "RAPOR (yazmaz)"} · kaynak ${path.basename(FILE)} (${src.alinma.slice(0, 10)})`);

  // ── Hedef yer ve çalışma alanı ────────────────────────────────────────────
  const { data: locs, error: locErr } = await db.from("stock_locations").select("id, workspace_id, name").eq("name", LOCATION);
  if (locErr) { console.error(`❌ stock_locations okunamadı — ${locErr.message} (20240373 uygulandı mı?)`); process.exit(1); }
  if (!locs || locs.length !== 1) { console.error(`❌ "${LOCATION}" adında ${locs?.length ?? 0} yer bulundu; tam bir tane olmalı (--yer ile adını verin).`); process.exit(1); }
  const loc = locs[0] as { id: string; workspace_id: string; name: string };
  const ws = loc.workspace_id;
  console.log(`  eski mağaza "${src.magazalar.map((m) => m.zen_name).join(", ")}" → panelde "${loc.name}"`);

  // ── Ürünler ───────────────────────────────────────────────────────────────
  const products = src.urunler.filter((p) => (p.productnumber ?? "").trim());
  const existing = new Map<string, { id: string; image_url: string }>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("stock_products").select("id, code, image_url").eq("workspace_id", ws).range(from, from + 999);
    if (error) { console.error(`❌ stock_products okunamadı — ${error.message}`); process.exit(1); }
    for (const r of (data ?? []) as { id: string; code: string; image_url: string }[]) if (r.code) existing.set(r.code.toLowerCase(), { id: r.id, image_url: r.image_url });
    if (!data || data.length < 1000) break;
  }
  const toCreate = products.filter((p) => !existing.has(p.productnumber!.trim().toLowerCase()));
  console.log(`\n  ÜRÜN: kaynakta ${products.length} · panelde zaten var ${products.length - toCreate.length} · açılacak ${toCreate.length}`);

  // ── Hareketler ────────────────────────────────────────────────────────────
  const storeStock = new Map(src.magazaStok.map((m) => [m.zen_magazaurunid, m]));
  const codeOf = new Map(src.urunler.map((p) => [p.productid, (p.productnumber ?? "").trim()]));
  type Row = { ref: string; code: string; size: string; kind: string; qty: number; unit_price: number | null; created_at: string };
  const rows: Row[] = [];
  let orphan = 0, zero = 0;
  for (const h of src.hareketler) {
    const ms = h._zen_magazastokid_value ? storeStock.get(h._zen_magazastokid_value) : undefined;
    const code = ms?._zen_urunid_value ? codeOf.get(ms._zen_urunid_value) : undefined;
    if (!ms || !code) { orphan++; continue; }
    const qty = h.zen_adet ?? 0;
    if (!qty) { zero++; continue; }
    const kind = kindOf(h.zen_satistipicode, qty);
    rows.push({
      ref: `dyn:${h.zen_stokhareketiid}`, code,
      /* Beden MAĞAZA STOK satırından: hareketteki yazım ("One Size") farklı
         olabiliyor, toplamın tutması için tek kaynak o. */
      size: normalizeSize(ms.zen_beden || "ONE SIZE"),
      kind, qty,
      unit_price: kind === "satis" || kind === "iade" ? (h.zen_fiyat ?? null) : null,
      created_at: h.zen_stokhareketitarihi || h.createdon || new Date().toISOString(),
    });
  }
  const level = new Map<string, number>();
  for (const r of rows) level.set(`${r.code}|${r.size}`, (level.get(`${r.code}|${r.size}`) ?? 0) + r.qty);
  const oldTotal = src.magazaStok.reduce((n, m) => n + (m.zen_eldekiadet ?? 0), 0);
  const newTotal = [...level.values()].reduce((a, b) => a + b, 0);
  const kinds = rows.reduce<Record<string, number>>((m, r) => ((m[r.kind] = (m[r.kind] ?? 0) + 1), m), {});
  console.log(`  HAREKET: kaynakta ${src.hareketler.length} · yazılacak ${rows.length} (${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(", ")}) · mağaza stoğu olmayan ${orphan} · adedi 0 olan ${zero}`);
  console.log(`  ELDEKİ ADET: eski program ${oldTotal} · aktarım sonrası ${newTotal} ${oldTotal === newTotal ? "✓ tutuyor" : "✗ TUTMUYOR"}`);
  console.log(`  beden×ürün satırı ${level.size} · stoğu olan ${[...level.values()].filter((q) => q > 0).length} · eksi ${[...level.values()].filter((q) => q < 0).length}`);
  console.log(`  bedenler: ${Object.entries(rows.reduce<Record<string, number>>((m, r) => ((m[r.size] = 1), m), {})).map(([s]) => s).sort().join(" · ")}`);

  const { count: already } = await db.from("stock_movements").select("id", { count: "exact", head: true }).eq("workspace_id", ws).like("source_ref", "dyn:%");
  console.log(`  panelde daha önce aktarılmış hareket: ${already ?? 0}`);

  if (!APPLY) { console.log("\n  Yazmak için: --uygula ekleyin.\n"); return; }

  // ── YAZ: ürünler ──────────────────────────────────────────────────────────
  for (const part of chunk(toCreate, 200)) {
    const { data, error } = await db.from("stock_products").insert(part.map((p) => ({
      workspace_id: ws, code: p.productnumber!.trim(), barcode: (p.zen_barkod ?? "").trim(),
      name: (p.name ?? "").trim() || p.productnumber!.trim(), price: p.price ?? null, active: (p.statecode ?? 0) === 0,
    }))).select("id, code, image_url");
    if (error) { console.error(`❌ ürün yazılamadı — ${error.message}`); process.exit(1); }
    for (const r of (data ?? []) as { id: string; code: string; image_url: string }[]) existing.set(r.code.toLowerCase(), { id: r.id, image_url: r.image_url });
  }
  console.log(`\n  ✓ ${toCreate.length} ürün açıldı`);

  // ── YAZ: hareketler (tekrar çalışınca aynı satırı atlar) ──────────────────
  let written = 0;
  for (const part of chunk(rows, 500)) {
    const { error, count } = await db.from("stock_movements").upsert(part.map((r) => ({
      workspace_id: ws, product_id: existing.get(r.code.toLowerCase())!.id, location_id: loc.id,
      size: r.size, kind: r.kind, qty: r.qty, unit_price: r.unit_price,
      note: "Eski stok programından aktarıldı", source_ref: r.ref, created_at: r.created_at,
    })), { onConflict: "workspace_id,source_ref", ignoreDuplicates: true, count: "exact" });
    if (error) { console.error(`❌ hareket yazılamadı — ${error.message} (20240375 uygulandı mı?)`); process.exit(1); }
    written += count ?? 0;
  }
  console.log(`  ✓ ${written} hareket yazıldı (${rows.length - written} zaten vardı)`);

  // ── Fotoğraflar ───────────────────────────────────────────────────────────
  if (!PHOTOS) { console.log("  Fotoğraflar için: --fotograf ekleyin.\n"); return; }
  const todo = products.filter((p) => (p.producturl ?? "").trim() && !existing.get(p.productnumber!.trim().toLowerCase())?.image_url).slice(0, LIMIT);
  console.log(`\n  FOTOĞRAF: ${todo.length} ürün için indirilecek…`);
  let ok = 0, fail = 0, bytes = 0;
  const queue = [...todo];
  const worker = async () => {
    for (;;) {
      const p = queue.shift();
      if (!p) return;
      const code = p.productnumber!.trim();
      try {
        /* Adreste satır sonu ve boşluk kalmış kayıtlar var ("…_003\n\n.jpg"). */
        const url = encodeURI(p.producturl!.replace(/\s+/g, ""));
        const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const out = await sharp(Buffer.from(await res.arrayBuffer()))
          .rotate().resize(1000, 1000, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toBuffer();
        const key = `${ws}/stok/${safeName(code)}.jpeg`;
        const up = await db.storage.from(BUCKET).upload(key, out, { contentType: "image/jpeg", upsert: true });
        if (up.error) throw new Error(up.error.message);
        const publicUrl = db.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
        const { error } = await db.from("stock_products").update({ image_url: publicUrl }).eq("id", existing.get(code.toLowerCase())!.id);
        if (error) throw new Error(error.message);
        ok++; bytes += out.length;
      } catch (e) {
        fail++;
        if (fail <= 10) console.log(`    ! ${code}: ${e instanceof Error ? e.message : e}`);
      }
      if ((ok + fail) % 50 === 0) console.log(`    … ${ok + fail}/${todo.length}`);
    }
  };
  await Promise.all(Array.from({ length: 5 }, worker));
  console.log(`  ✓ ${ok} fotoğraf yüklendi (${(bytes / 1024 / 1024).toFixed(1)} MB) · ${fail} alınamadı\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
