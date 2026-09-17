#!/usr/bin/env npx tsx
/**
 * ELLE AÇILMIŞ FÖYÜ SİTEDEKİ ÜRÜNÜNE BAĞLA.
 *
 * Ekip 24–27 Temmuz'da 10 föy açtı, Türkçe adlarla: "Ekru Çizgili Yelek",
 * "Siyah Yelek"… Site ürünleri İngilizce adlı olduğu için 17 Eylül'deki
 * "Siteden çek" onları TANIMADI ve aynı ürünler için ikinci kez föy açtı.
 * Aynı yelek koleksiyonda iki kez duruyor: biri ekibin ölçü/maliyet
 * çalışmasıyla, öteki sitenin dekupesi ve metinleriyle.
 *
 * EŞLEŞMELER OTOMATİK BULUNMADI. İsim benzerliği yanıltıcıydı ("Siyah Yelek"
 * ile "Black Vest" hiçbir harfi paylaşmıyor), o yüzden föyün fotoğrafı ile
 * sitenin dekupesi YAN YANA KONULUP GÖZLE karşılaştırıldı
 * (17/foy-site-karsilastirma.jpg). Aşağıdaki liste o karşılaştırmanın
 * sonucudur — tahmin değil, kanıt satırıyla birlikte duruyor.
 *
 * NE YAPAR: site bilgisini (dekupe, Designer's Note, Size & Fit, adres)
 * EKİBİN föyüne taşır; siteden gelen ikizi ARŞİVE kaldırır.
 *
 * NEDEN SİLMEZ: arşiv geri alınabilir, silme alınamaz. İkizin
 * `web_product_id`'si boşaltılır — yoksa (workspace_id, web_product_id)
 * tekil indeksi iki kaydı birden kabul etmez. Ürünü sildirmek yerine
 * Arşiv'de bırakıyoruz ki Aslı Hanım bakıp emin olsun.
 *
 * GÜVENLİK KİLİDİ: ikiz föye ekip bir şey yazmışsa (ölçü, fotoğraf, maliyet)
 * o eşleşme ATLANIR. Otomatik açılmış boş bir kabuğu arşivlemek güvenli,
 * içinde emek olan bir föyü arşivlemek değil.
 *
 *   npm run link:sheets-web -- --prod
 *   npm run link:sheets-web -- --prod --uygula
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const APPLY = process.argv.includes("--uygula");
const PROD = process.argv.includes("--prod");

interface Match {
  sheet: string;
  webId: number;
  evidence: string;
}

/** Gözle doğrulanmış eşleşmeler. Kanıtı olmayan satır BURAYA YAZILMAZ. */
const MATCHES: Match[] = [
  /* KESİN — föyün içinde ürünün kendi fotoğrafı var, sitedeki dekupeyle
     birebir aynı parça. */
  { sheet: "Siyah Yelek", webId: 24310, evidence: "aynı yelek: dört düğme, aynı V yaka, aynı astar ve etiket" },
  { sheet: "Beyaz Dantel Bluz", webId: 24355, evidence: "föyün 3. fotoğrafı sitedeki bluzun kendisi; 4. fotoğraf da o altın düğmenin yakın çekimi" },
  { sheet: "Ekru Çizgili Yelek", webId: 24298, evidence: "föyün 4. fotoğrafı sitedeki yeleğin kendisi — aynı dört düğme, aynı çizgi aralığı" },
  /* GÜÇLÜ — föyde ürünün tam fotoğrafı yok, kumaş yakın çekimi var; kumaş
     sitedeki tek bir ürünle örtüşüyor ve ürün cinsi de tutuyor. */
  { sheet: "Ekru Çizgili Etek", webId: 24350, evidence: "yelekle aynı ekru ince çizgi kumaş; sitede o kumaştan tek etek var" },
  { sheet: "Beyaz Dantel Etek", webId: 24384, evidence: "bluzla aynı yaprak motifli dantel; sitede o dantelden tek etek var" },
];

/** Karşılığı BULUNAMAYAN föyler — neden bulunamadığı da bilgi. */
const UNMATCHED: Record<string, string> = {
  "Şile Bezi Göynek": "föyde fotoğraf yok, sitede Şile bezi ürün yok",
  "Çizgili Göynek": "föyde fotoğraf yok; 'Striped short kaftan' aday ama doğrulanamadı",
  "Şile Bezi Bluz": "föyde fotoğraf yok, sitede Şile bezi ürün yok",
  "Beyaz Dantel Şalvar": "föyde fotoğraf yok",
  "Vual Bej Şort Astar": "föyde fotoğraf var ama sitede bej vual şort yok — henüz yüklenmemiş",
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

type Sheet = Record<string, unknown> & { id: string; title: string; web_product_id: number | null };

const asArray = (v: unknown): unknown[] => {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.trim().startsWith("[")) { try { return JSON.parse(v); } catch { return []; } }
  return [];
};

/** Föyde EKİP EMEĞİ var mı? Web alanları sayılmaz — onları makine yazdı. */
const HANDWORK_TEXT = [
  "product_code", "product_kind", "producer", "description", "season", "production_date",
  "delivery_date", "meterage", "wash_instruction", "fabric_lining", "fabric_info",
  "accessories_info", "embellishments", "sewing_instruction", "workmanship_notes",
  "qc_revision", "revision_notes", "production_waste",
];

function handwork(s: Sheet): string[] {
  const filled: string[] = [];
  for (const k of HANDWORK_TEXT) {
    const v = s[k];
    if (typeof v === "string" && v.trim()) filled.push(k);
  }
  if (asArray(s.measurements).length) filled.push(`ölçü×${asArray(s.measurements).length}`);
  if (asArray(s.delivered_items).length) filled.push(`teslim×${asArray(s.delivered_items).length}`);
  if (asArray(s.photo_refs).length) filled.push(`fotoğraf×${asArray(s.photo_refs).length}`);
  const sd = s.size_distribution;
  if (sd && typeof sd === "object" && Object.keys(sd as object).length) filled.push("beden dağılımı");
  return filled;
}

async function main() {
  const { url, key, label } = target();
  const db: SupabaseClient = createClient(url, key, { auth: { persistSession: false } });
  console.log(`\n▸ ${label}${APPLY ? "" : "  (SALT OKUNUR — yazmak için --uygula)"}\n`);

  const { data, error } = await db.from("production_sheets").select("*").limit(2000);
  if (error) { console.error("❌ Föyler okunamadı:", error.message); process.exit(1); }
  const sheets = (data ?? []) as Sheet[];
  const byTitle = new Map(sheets.map((s) => [s.title.trim(), s]));
  const byWebId = new Map(sheets.filter((s) => s.web_product_id).map((s) => [Number(s.web_product_id), s]));

  const ready: { own: Sheet; twin: Sheet; m: Match }[] = [];
  const blocked: string[] = [];

  for (const m of MATCHES) {
    const own = byTitle.get(m.sheet);
    const twin = byWebId.get(m.webId);
    if (!own) { blocked.push(`${m.sheet} — böyle bir föy yok`); continue; }
    if (own.web_product_id) { blocked.push(`${m.sheet} — zaten ${own.web_product_id} ürününe bağlı`); continue; }
    if (!twin) { blocked.push(`${m.sheet} — ${m.webId} için siteden gelen föy yok`); continue; }
    const work = handwork(twin);
    if (work.length) {
      blocked.push(`${m.sheet} — ikiz föy "${twin.title}" BOŞ DEĞİL (${work.join(", ")}), elle karar verilmeli`);
      continue;
    }
    ready.push({ own, twin, m });
  }

  console.log(`── BAĞLANACAK (${ready.length})`);
  for (const { own, twin, m } of ready) {
    const work = handwork(own);
    console.log(`\n   ${own.title}  ←  ${twin.title}  (site ${m.webId})`);
    console.log(`     kanıt      : ${m.evidence}`);
    console.log(`     föyde emek : ${work.join(", ") || "yok"}`);
    console.log(`     gelecek    : ${asArray(twin.web_images).length} dekupe${twin.designers_note ? " · not" : ""}${twin.size_fit ? " · ölçü" : ""}${twin.details_care ? " · detay" : ""}`);
    console.log(`     ikiz       : ARŞİVE kaldırılacak (silinmiyor)`);
  }

  if (blocked.length) {
    console.log(`\n── ELLE KARAR (${blocked.length})`);
    for (const b of blocked) console.log(`   ${b}`);
  }

  console.log(`\n── BAĞLANMAYAN FÖYLER (${Object.keys(UNMATCHED).length})`);
  for (const [t, why] of Object.entries(UNMATCHED)) console.log(`   ${t.padEnd(22)} ${why}`);

  if (!APPLY) {
    console.log(`\nSALT OKUNUR. Uygulamak için: npm run link:sheets-web -- --prod --uygula\n`);
    return;
  }

  for (const { own, twin } of ready) {
    /* SIRA ÖNEMLİ: tekil indeks iki kaydın aynı web_product_id'yi tutmasına
       izin vermez, o yüzden ikiz ÖNCE bırakır, sonra ekibin föyü alır. */
    const { error: e1 } = await db
      .from("production_sheets")
      .update({ web_product_id: null, status: "archived" })
      .eq("id", twin.id);
    if (e1) { console.error(`❌ ${twin.title} arşivlenemedi:`, e1.message); continue; }

    const { error: e2 } = await db
      .from("production_sheets")
      .update({
        web_product_id: twin.web_product_id,
        web_url: twin.web_url,
        web_name: twin.web_name,
        designers_note: twin.designers_note,
        size_fit: twin.size_fit,
        details_care: twin.details_care,
        web_images: twin.web_images,
        web_synced_at: twin.web_synced_at,
      })
      .eq("id", own.id);
    if (e2) {
      console.error(`❌ ${own.title} bağlanamadı:`, e2.message);
      /* İkizi geri al — yarı yolda kalmış bir eşleşme bırakmayalım. */
      await db.from("production_sheets")
        .update({ web_product_id: twin.web_product_id, status: "active" }).eq("id", twin.id);
      continue;
    }
    console.log(`   ✓ ${own.title} → site ${twin.web_product_id} · ikiz arşivde`);
  }
  console.log(`\n✅ Bitti.\n`);
}

main().catch((e) => { console.error("❌", e); process.exit(1); });
