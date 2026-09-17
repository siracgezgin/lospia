#!/usr/bin/env npx tsx
/**
 * SİTEDE GİZLİ DURAN ÜRÜNLERİ İÇE AKTAR.
 *
 * Aslı Hanım (2026-09-17): "Bunların dekupe imajlarını da web sitesinden
 * çekebilir miyiz? İçindeki bütün bilgilerle beraber… bir daha iki kere iş
 * yapmasak."
 *
 * NEDEN AYRI BİR BETİK: Koleksiyondaki "Siteden çek" düğmesi Store API'yi
 * okur, o da YALNIZ yayımdaki ürünleri döndürür. Sitede yayımlanmamış
 * (taslak/özel) 40 ana ürün var — hazırlanan, henüz vitrine çıkmamış işler.
 * Onlara ulaşmanın tek yolu WooCommerce'in CSV dışa aktarımı, ve o dosya her
 * seferinde elle indirilir. Ekrana düğme koymak yanlış olurdu: kullanıcıdan
 * her çekişte dosya istemek "iki kere iş yapmayalım"ın tersi.
 *
 * Yazdığı `web_product_id` sayesinde ürün ileride sitede yayımlandığında
 * "Siteden çek" onu BULUR ve aynı föyü günceller — ikinci bir föy açmaz.
 *
 *   npm run import:hidden-products -- --prod
 *   npm run import:hidden-products -- --prod --uygula
 *
 * Varsayılan SALT OKUNUR: önce ne alınacağını yazar, `--uygula` ile işler.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import { decodeEntities, fetchCategorySlugsByName, mapCategory, parseSections } from "../lib/collection/website";

const APPLY = process.argv.includes("--uygula");
/* TAZELEME. Daha önce alınmış föylerin web metinlerini CSV'den YENİDEN yazar.
   Gerekçe (2026-09-17): ilk içe aktarımda metindeki kaçırılmış satır sonları
   ("\n" dizisi, gerçek satır sonu değil) olduğu gibi kaydedilmişti — 11 föyde
   "100% Cotton Body \n100% Cotton" gibi görünüyordu. Okuyucu düzeltildi;
   bu bayrak düzeltilmiş metni mevcut föylere uygular. Kategori, başlık ve
   föyün kendi alanlarına DOKUNMAZ. */
const REFRESH = process.argv.includes("--tazele");
const PROD = process.argv.includes("--prod");

/** Sitenin ürün ID'si artan sayaçtır: büyük ID = sonra açılmış ürün.
 *  Eşik 21000, yayımdaki ürünlerin son bloğunun başladığı yer — altındakiler
 *  2016–2024 arası, çoğu kategorisiz, artık üretilmeyen işler. */
const MIN_ID = Number(argValue("--min-id") ?? 21000);

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : null;
}

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
    if (!url || !key) { console.error("❌ .env.prod içinde IMPORT_SUPABASE_URL ve IMPORT_SUPABASE_SERVICE_ROLE_KEY olmalı."); process.exit(1); }
    return { url, key, label: "PRODUCTION" };
  }
  const l = readEnvFile(".env.local");
  return { url: l.NEXT_PUBLIC_SUPABASE_URL, key: l.SUPABASE_SERVICE_ROLE_KEY, label: "LOCAL" };
}

/* ── CSV ────────────────────────────────────────────────────────────────────
   Kendi ayrıştırıcısı: "Description" sütunu içinde virgül, satır sonu ve
   tırnak var — satırı `split(",")` ile kesmek dosyayı paramparça eder. */
function parseCsv(text: string): Record<string, string>[] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c !== '"') { field += c; continue; }
      if (src[i + 1] === '"') { field += '"'; i++; continue; }
      quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift() ?? [];
  return rows
    .filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

/** WooCommerce kategori listesini `\,` kaçışına saygı duyarak böler. */
function splitCategories(raw: string): string[][] {
  return raw
    .split(/(?<!\\),/)
    .map((s) => s.replace(/\\,/g, ",").trim())
    .filter(Boolean)
    .map((s) => s.split(">").map((p) => decodeEntities(p).trim()));
}

const fileOf = (url: string) => url.trim().split("?")[0].split("/").pop() ?? "";
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

interface Candidate {
  id: number;
  name: string;
  images: string[];
  category: string | null;
  subcategory: string | null;
  webCategories: string[];
  designersNote: string;
  sizeFit: string;
  detailsCare: string;
}

type Dropped = { id: number; name: string; reason: string };

async function main() {
  const csvPath =
    argValue("--csv") ??
    fs.readdirSync(path.join(process.cwd(), "17"), { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.startsWith("wc-product-export") && e.name.endsWith(".csv"))
      .map((e) => path.join("17", e.name))
      .sort()
      .pop() ?? "";
  if (!csvPath || !fs.existsSync(csvPath)) {
    console.error("❌ CSV bulunamadı. --csv <yol> ile gösterin (WooCommerce → Ürünler → Dışa aktar).");
    process.exit(1);
  }

  const { url, key, label } = target();
  const db: SupabaseClient = createClient(url, key, { auth: { persistSession: false } });
  console.log(`\n▸ ${label} · ${csvPath}${APPLY ? "" : "  (SALT OKUNUR — yazmak için --uygula)"}\n`);

  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  const parents = rows.filter((r) => r.Type === "variable" || r.Type === "simple");
  const hidden = parents.filter((r) => r.Published !== "1");
  console.log(`CSV: ${rows.length} satır · ${parents.length} ana ürün · ${hidden.length} yayımlanmamış\n`);

  const slugOf = await fetchCategorySlugsByName();
  const dropped: Dropped[] = [];

  /* Kopya ayıklama. İki tür var ve ikisi de alınmaz:
     • adında "(Copy)" geçen — WooCommerce'in "çoğalt" düğmesinin izi;
     • aynı isimde, AYNI GÖRSEL DOSYASINI kullanan ikizler. Görselleri
       farklıysa kopya değildir: sitede üç ayrı "Suede top-handle straw bag"
       var, üçü de başka çanta. */
  const isCopy = (name: string) => /\(\s*copy\s*\)/i.test(name);
  const byName = new Map<string, Record<string, string>[]>();
  for (const r of hidden) {
    /* "(Copy)" olanlar ZATEN elenecek; ikiz taramasına girerlerse bir ürün
       iki gerekçeyle birden sayılır ve rapordaki toplam ürün sayısını aşar. */
    if (isCopy(r.Name)) continue;
    const k = norm(r.Name);
    byName.set(k, [...(byName.get(k) ?? []), r]);
  }
  const twinIds = new Set<number>();
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    const byShot = new Map<string, Record<string, string>[]>();
    for (const r of group) {
      const k = (r.Images || "").split(",").map(fileOf).filter(Boolean).sort().join("|");
      byShot.set(k, [...(byShot.get(k) ?? []), r]);
    }
    for (const same of byShot.values()) {
      if (same.length < 2) continue;
      const keep = Math.max(...same.map((r) => Number(r.ID)));
      for (const r of same) {
        if (Number(r.ID) === keep) continue;
        twinIds.add(Number(r.ID));
        dropped.push({ id: Number(r.ID), name: r.Name, reason: `ikiz — ${keep} ile aynı görsel` });
      }
    }
  }

  const candidates: Candidate[] = [];
  for (const r of hidden) {
    const id = Number(r.ID);
    const name = decodeEntities(r.Name).trim();
    if (isCopy(name)) { dropped.push({ id, name, reason: "kopya — adında (Copy)" }); continue; }
    if (twinIds.has(id)) continue;
    if (id < MIN_ID) { dropped.push({ id, name, reason: `eski — ID ${MIN_ID} altında` }); continue; }

    const paths = splitCategories(r.Categories || "");
    const slugs = paths.flat().map((n) => slugOf.get(n.toLowerCase())).filter(Boolean) as string[];
    const mapped = mapCategory(slugs);
    const webCategories = paths.map((p) => p.join(" > "));
    if (!mapped) {
      dropped.push({ id, name, reason: `koleksiyonda karşılığı yok — ${webCategories.join(", ") || "kategorisiz"}` });
      continue;
    }
    const sections = parseSections(r.Description);
    const pick = (...keys: string[]) => keys.map((k) => sections[k]).find(Boolean) ?? "";
    candidates.push({
      id,
      name,
      images: (r.Images || "").split(",").map((s) => s.trim()).filter(Boolean),
      category: mapped.category,
      subcategory: mapped.subcategory,
      webCategories,
      designersNote: pick("designer's note", "designers note"),
      sizeFit: pick("size & fit", "size"),
      detailsCare: pick("details & care", "details"),
    });
  }

  /* Zaten föyü olan ürün ATLANIR — ikinci föy açmak en kötü sonuç. */
  const { data: existing, error: exErr } = await db
    .from("production_sheets")
    .select("id, web_product_id, workspace_id, created_by")
    .not("web_product_id", "is", null);
  if (exErr) { console.error("❌ Mevcut föyler okunamadı:", exErr.message); process.exit(1); }
  const sheetIdByWeb = new Map(
    (existing ?? []).map((r) => [Number((r as { web_product_id: number }).web_product_id), (r as { id: string }).id]),
  );
  const toRefresh: { sheetId: string; c: Candidate }[] = [];
  const fresh = candidates.filter((c) => {
    const sheetId = sheetIdByWeb.get(c.id);
    if (!sheetId) return true;
    if (REFRESH) { toRefresh.push({ sheetId, c }); return false; }
    dropped.push({ id: c.id, name: c.name, reason: "zaten föyü var" });
    return false;
  });

  const first = (existing ?? [])[0] as { workspace_id: string; created_by: string } | undefined;
  if (!first) { console.error("❌ Siteden çekilmiş föy yok; önce Koleksiyon'da 'Siteden çek' çalıştırın."); process.exit(1); }

  console.log(`── ALINACAK (${fresh.length})`);
  for (const c of fresh.sort((a, b) => b.id - a.id)) {
    const where = c.subcategory ? `${c.category} › ${c.subcategory}` : c.category;
    const has = [c.designersNote && "not", c.sizeFit && "ölçü", c.detailsCare && "detay"].filter(Boolean).join("+") || "bilgi yok";
    console.log(`   ${c.id}  ${c.name.slice(0, 42).padEnd(42)} → ${String(where).padEnd(34)} ${c.images.length} görsel · ${has}`);
  }
  if (REFRESH) {
    console.log(`── TAZELENECEK (${toRefresh.length}) — web metinleri CSV'den yeniden yazılır`);
    for (const { c } of toRefresh.slice(0, 40)) console.log(`   ${c.id}  ${c.name.slice(0, 44)}`);
    if (toRefresh.length > 40) console.log(`   … ${toRefresh.length - 40} tane daha`);
    console.log();
  }

  console.log(`\n── ALINMAYACAK (${dropped.length})`);
  const byReason = new Map<string, Dropped[]>();
  for (const d of dropped) {
    const k = d.reason.split(" — ")[0];
    byReason.set(k, [...(byReason.get(k) ?? []), d]);
  }
  for (const [reason, list] of [...byReason].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`   ${String(list.length).padStart(3)} × ${reason}`);
    for (const d of list.slice(0, 4)) console.log(`         ${d.id}  ${d.name.slice(0, 44)}`);
    if (list.length > 4) console.log(`         … ${list.length - 4} tane daha`);
  }

  /* HESAP TUTSUN. Her yayımlanmamış ürün ya alınacak ya da bir gerekçeyle
     elenmiş olmalı; toplam tutmuyorsa bir ürün sessizce kayboldu ya da iki
     kez sayıldı — ikisi de raporu yalancı yapar. */
  if (fresh.length + dropped.length + toRefresh.length !== hidden.length) {
    console.log(`\n⚠️  Hesap tutmuyor: ${fresh.length} + ${dropped.length} + ${toRefresh.length} ≠ ${hidden.length} yayımlanmamış ürün.`);
  }

  if (!APPLY) {
    console.log(`\nSALT OKUNUR. Uygulamak için: npm run import:hidden-products -- --prod --uygula\n`);
    return;
  }
  if (REFRESH && toRefresh.length) {
    let done = 0;
    for (const { sheetId, c } of toRefresh) {
      const { error } = await db
        .from("production_sheets")
        .update({
          designers_note: c.designersNote || null,
          size_fit: c.sizeFit || null,
          details_care: c.detailsCare || null,
          web_images: c.images,
          /* Mutabakat da tazelenir, yoksa bu metinler "elle değiştirilmiş"
             sayılıp siteye gönderim listesine düşerdi. */
          web_baseline: {
            designers_note: c.designersNote,
            size_fit: c.sizeFit,
            details_care: c.detailsCare,
          },
        })
        .eq("id", sheetId);
      if (error) console.error(`   ❌ ${c.name}: ${error.message}`);
      else done++;
    }
    console.log(`\n✅ ${done} föyün web metni tazelendi.`);
  }

  if (!fresh.length) { console.log("\nAlınacak yeni ürün yok.\n"); return; }

  const now = new Date().toISOString();
  const payload = fresh.map((c) => ({
    workspace_id: first.workspace_id,
    created_by: first.created_by,
    title: c.name,
    status: "active",
    category: c.category,
    subcategory: c.subcategory,
    web_product_id: c.id,
    web_name: c.name,
    /* Yayımda olmayan ürünün adresi ziyaretçiye 404 döner — link YAZILMAZ.
       Ürün yayımlanınca "Siteden çek" gerçek adresi yerine koyar. */
    web_url: null,
    designers_note: c.designersNote || null,
    size_fit: c.sizeFit || null,
    details_care: c.detailsCare || null,
    web_images: c.images,
    web_synced_at: now,
  }));

  const { data: inserted, error } = await db.from("production_sheets").insert(payload).select("id");
  if (error) { console.error("\n❌ Yazılamadı:", error.message); process.exit(1); }
  console.log(`\n✅ ${inserted?.length ?? 0} föy açıldı.\n`);
}

main().catch((e) => { console.error("❌", e); process.exit(1); });
