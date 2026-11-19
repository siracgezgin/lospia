#!/usr/bin/env npx tsx
/**
 * MÜŞTERİ CRM'i — ANA LİSTEYİ PANELE AKTAR (KVKK; yalnız Sıraç çalıştırır).
 *
 * Kaynak: afcom-seo/28_crm/veri/AF_Ana_Liste_<tarih>.xlsx → "Müşteriler"
 * sayfası (Etiket · Ad Soyad · E-posta · Telefon · Son işlem · E-posta izni ·
 * Bülten · Not) ve veri/gonderim/ altındaki gönderim kayıtları
 * (<kampanya>-gonderilen.csv · cikanlar.csv · gecersiz.csv).
 *
 * RAPOR YALNIZ SAYI YAZAR — ad, e-posta, telefon ekrana ya da dosyaya
 * BASILMAZ. Dosyanın kendisi repoya girmez.
 *
 * ETİKET → KATMAN + KAYNAK: "A+" → A+ · "www.A", "Shopify.C", "2022.B" → site ·
 * "Mağaza A", "Event A" → mağaza; etiket olduğu gibi `label` alanında durur.
 * "E-posta izni" tarih taşıyorsa izin VAR (o günle). "Bülten": "Adres hatalı"
 * → hatalı, "Abonelikten çıktı" → çıktı. KİMSE SİLİNMEZ.
 *
 * YENİDEN ÇALIŞTIRILABİLİR: anahtar e-posta (yoksa telefon, o da yoksa ad +
 * etiket). Kişi panelde ELLE DÜZELTİLDİYSE (updated_by dolu) aktarım onun
 * dolu alanlarını EZMEZ — yalnız boş alanı doldurur ve son işlemi ileri alır
 * ("ekip doğru adresi yazınca düzelir").
 *
 *   npx tsx scripts/customers-import.ts                       # yerel, RAPOR
 *   npx tsx scripts/customers-import.ts --prod                # canlı, RAPOR
 *   npx tsx scripts/customers-import.ts --prod --uygula       # canlı, yazar
 *   … --dosya <xlsx>   … --gonderim <klasör>   … --konu no01="Konu satırı"
 *
 * SİTEDEKİ ABONELİK KAYITLARI (--site) — ayrı adım, ana listeye dokunmaz.
 * Kaynak: aslifilinta.com/wp-json/af/v1/aboneler (afcom-seo snippet 75;
 * sözleşme docs/oneriler/abonelik-okuma-ucu.md). E-POSTA İZNİNİN TEK KAYNAĞI
 * SİTEDİR: bu adım izni ve "abonelikten çıktı" durumunu siteye göre yazar —
 * panelde elle değiştirilmiş olsa bile. Ad, telefon, katman, not EZİLMEZ.
 *   onayli ("aktif")  → izin VAR (onay günüyle); "çıktı" işareti kalkar
 *   beklemede         → izin YOK (çift onay bağlantısına basılmamış)
 *   cikti             → izin YOK + abonelikten çıktı
 * Listede olmayan kişi C katmanında açılır (store-ipad → mağaza, diğerleri →
 * site). "Adres hatalı" sitede tutulmaz; o bilgi gönderim kayıtlarından gelir.
 * İmza sırrı SITE_ABONELIK_SECRET (.env.prod; repoya girmez). Gerçek siteden
 * okuma YALNIZ --prod ile: gerçek abone verisi yerel veritabanına yazılmaz.
 *
 *   npx tsx scripts/customers-import.ts --site --prod              # RAPOR
 *   npx tsx scripts/customers-import.ts --site --prod --uygula     # yazar
 *   … --since 2026-11-12T00:00:00Z   (yalnız o andan sonra değişenler)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";
import ExcelJS from "exceljs";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const args = process.argv.slice(2);
const arg = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const APPLY = args.includes("--uygula");
const PROD = args.includes("--prod");
const VERI = path.join(os.homedir(), "Projects", "afcom-seo", "28_crm", "veri");
const newest = () => fs.existsSync(VERI)
  ? fs.readdirSync(VERI).filter((f) => /^AF_Ana_Liste_\d{4}-\d{2}-\d{2}\.xlsx$/.test(f)).sort().pop()
  : undefined;
const FILE = arg("--dosya") ?? (newest() ? path.join(VERI, newest()!) : "");
const SENDS = arg("--gonderim") ?? path.join(VERI, "gonderim");
/* TANINMAYAN BAYRAK = DUR. 20.11.2026'da kabukta tırnaksız bir değişken
   bütün bayrakları TEK argüman olarak geçirdi; betik `--site`i görmedi,
   varsayılan kipe düştü ve gerçek ana listeyi YEREL veritabanına yazdı
   (hemen silindi). Tanımadığı şeyi yok saymak yerine durur. */
const FLAGS = new Set(["--uygula", "--prod", "--site"]);
const VALUE_FLAGS = new Set(["--dosya", "--gonderim", "--konu", "--alan", "--site-url", "--site-secret", "--since"]);
for (let i = 0; i < args.length; i++) {
  if (FLAGS.has(args[i])) continue;
  if (VALUE_FLAGS.has(args[i]) && args[i + 1] !== undefined) { i++; continue; }
  console.error(`❌ Tanınmayan bayrak: "${args[i]}"`);
  process.exit(1);
}
const SITE = args.includes("--site");
const SITE_URL = (arg("--site-url") ?? "https://www.aslifilinta.com").replace(/\/+$/, "");
const SITE_LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(SITE_URL);
const SINCE = arg("--since");
const SUBJECTS = new Map(args.flatMap((a, i) => (a === "--konu" && args[i + 1]?.includes("=") ? [args[i + 1].split(/=([\s\S]*)/).slice(0, 2) as [string, string]] : [])));

function readEnvFile(name: string): Record<string, string> {
  const p = path.join(process.cwd(), name);
  const env: Record<string, string> = {};
  if (!fs.existsSync(p)) return env;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    const eq = t.indexOf("=");
    if (!t || t.startsWith("#") || eq < 0) continue;
    env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  return env;
}
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

const text = (v: unknown): string => {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[]; hyperlink?: string };
    if (o.richText) return o.richText.map((r) => r.text).join("").trim();
    if (o.text != null) return String(o.text).trim();
    if (o.result != null) return text(o.result);
    return "";
  }
  return String(v).trim();
};
const day = (v: unknown): string | null => {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const m = text(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};
const emailOf = (v: unknown) => { const e = text(v).toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : ""; };
const digits = (s: string) => s.replace(/\D/g, "");
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const count = <T,>(rows: T[], key: (r: T) => string) => rows.reduce<Record<string, number>>((m, r) => ((m[key(r)] = (m[key(r)] ?? 0) + 1), m), {});
const show = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k || "—"} ${n}`).join(" · ");

type Tier = "A+" | "A" | "B" | "C" | "D";
function tierAndSource(label: string): { tier: Tier; source: "site" | "magaza" | "elle"; known: boolean } {
  const l = label.trim();
  if (l === "A+") return { tier: "A+", source: "magaza", known: true };
  const m = l.match(/^(.*?)[.\s]\s*([ABCD])$/);
  if (!m) return { tier: "C", source: "elle", known: false };
  const src = m[1].toLocaleLowerCase("tr");
  return { tier: m[2] as Tier, source: /mağaza|magaza|event/.test(src) ? "magaza" : "site", known: true };
}

type Row = {
  source_ref: string; full_name: string; email: string; phone: string; tier: Tier; source: string; label: string;
  last_activity: string | null; email_consent: string; email_consent_at: string | null; email_status: string; note: string;
};

function csvRows(file: string): Record<string, string>[] {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
  const parse = (line: string) => {
    const out: string[] = []; let cur = ""; let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const head = parse(lines[0]);
  return lines.slice(1).map((l) => Object.fromEntries(parse(l).map((v, i) => [head[i] ?? `c${i}`, v.trim()])));
}

/* ── Sitedeki abonelik kayıtları (--site) ─────────────────────────────────── */

type SiteRow = {
  id: number; eposta: string; ad?: string | null; soyad?: string | null; dil?: string | null;
  kaynak?: string | null; onay_surumu?: string | null; onay_zamani?: string | null;
  durum: string; degisti?: string | null;
};

async function fetchSiteRows(secret: string): Promise<SiteRow[]> {
  const out: SiteRow[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 400; page++) {
    /* İMZALANAN METİN GÖNDERİLEN YOL VE SORGUNUN AYNISIDIR (sunucu ham
       REQUEST_URI'yi imzalar). Sorgu burada elle kurulur ve hem imzaya hem
       isteğe AYNI dizgi gider — URL kütüphanesine sıralatılmaz. */
    const query = ["limit=500", cursor ? `cursor=${encodeURIComponent(cursor)}` : SINCE ? `since=${encodeURIComponent(SINCE)}` : ""]
      .filter(Boolean).join("&");
    const pathAndQuery = `/wp-json/af/v1/aboneler?${query}`;
    const zaman = String(Math.floor(Date.now() / 1000));
    const imza = createHmac("sha256", secret).update(`${zaman}\n${pathAndQuery}`).digest("hex");
    const res = await fetch(SITE_URL + pathAndQuery, {
      headers: { "x-af-zaman": zaman, "x-af-imza": imza, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const why = res.status === 401 ? "imza ya da saat tutmuyor (sır aynı mı, bilgisayarın saati doğru mu?)"
        : res.status === 404 ? "uç yok (snippet 75 yapıştırıldı mı, sitede sır tanımlı mı?)"
        : res.status === 400 ? "since / cursor biçimi geçersiz"
        : res.status === 503 ? "sitede abonelik tablosu yok"
        : `HTTP ${res.status}`;
      throw new Error(`Site yanıt vermedi — ${why}.`);
    }
    const body = (await res.json()) as { kayitlar?: SiteRow[]; next_cursor?: string | null };
    out.push(...(body.kayitlar ?? []));
    if (!body.next_cursor) return out;
    cursor = body.next_cursor;
  }
  throw new Error("Site listesi bitmedi (400 sayfa) — durduruldu.");
}

async function siteStep(db: SupabaseClient, workspace_id: string, secret: string) {
  const fetched = await fetchSiteRows(secret);
  /* Aynı kayıt iki kez gelebilir (`since` eşitliği dahil eder) — e-postaya
     göre en son değişen kalır. */
  const byEmail = new Map<string, SiteRow>();
  let invalid = 0;
  for (const r of fetched) {
    const e = emailOf(r.eposta);
    if (!e) { invalid++; continue; }
    const prev = byEmail.get(e);
    if (!prev || (r.degisti ?? "") >= (prev.degisti ?? "")) byEmail.set(e, r);
  }
  console.log(`  SİTE: ${fetched.length} kayıt · ayrı e-posta ${byEmail.size}${invalid ? ` · biçimi bozuk e-posta ${invalid}` : ""}`);
  console.log(`    durum: ${show(count([...byEmail.values()], (r) => r.durum))}`);
  console.log(`    kaynak: ${show(count([...byEmail.values()], (r) => r.kaynak ?? ""))}`);

  type Cur = { id: string; source_ref: string | null; full_name: string; email: string; email_consent: string; email_consent_at: string | null; email_status: string };
  const existing = new Map<string, Cur>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("customers")
      .select("id, source_ref, full_name, email, email_consent, email_consent_at, email_status")
      .eq("workspace_id", workspace_id).neq("email", "").order("id").range(from, from + 999);
    if (error) { console.error(`❌ customers okunamadı — ${error.message} (20240379 uygulandı mı?)`); process.exit(1); }
    for (const r of (data ?? []) as Cur[]) existing.set(r.email, r);
    if (!data || data.length < 1000) break;
  }

  const inserts: Record<string, unknown>[] = [];
  const updates: { id: string; patch: Record<string, unknown> }[] = [];
  const changes: Record<string, number> = {};
  const note = (k: string) => { changes[k] = (changes[k] ?? 0) + 1; };
  let unknown = 0, same = 0;
  for (const [email, r] of byEmail) {
    const state = r.durum === "aktif" ? "aktif" : r.durum === "cikti" ? "cikti" : r.durum === "beklemede" ? "beklemede" : null;
    if (!state) { unknown++; continue; }
    const consent = state === "aktif" ? "var" : "yok";
    const consentAt = state === "aktif" ? day(r.onay_zamani) : null;
    const name = [text(r.ad), text(r.soyad)].filter(Boolean).join(" ").slice(0, 200);
    const cur = existing.get(email);
    if (!cur) {
      inserts.push({
        workspace_id, full_name: name, email, tier: "C", source: r.kaynak === "store-ipad" ? "magaza" : "site",
        email_consent: consent, email_consent_at: consentAt, email_status: state === "cikti" ? "cikti" : "ok",
        source_ref: `e:${email}`,
      });
      continue;
    }
    const patch: Record<string, unknown> = {};
    if (cur.email_consent !== consent) { patch.email_consent = consent; note(`izin ${cur.email_consent} → ${consent}`); }
    /* İzin günü yalnız izin VARKEN anlamlıdır; izin kalktıysa gün de kalkar. */
    if ((cur.email_consent_at ?? null) !== consentAt) patch.email_consent_at = consentAt;
    if (state === "cikti" && cur.email_status !== "cikti") { patch.email_status = "cikti"; note("abonelikten çıktı"); }
    /* Yeniden abone olan kişinin "çıktı" işareti kalkar; "adres hatalı" kalmaz
       değil — o, gönderim kayıtlarının bilgisidir, site onu bilmez. */
    if (state === "aktif" && cur.email_status === "cikti") { patch.email_status = "ok"; note("yeniden abone"); }
    if (!cur.full_name && name) patch.full_name = name;
    if (!cur.source_ref) patch.source_ref = `e:${email}`;
    if (Object.keys(patch).length) updates.push({ id: cur.id, patch }); else same++;
  }
  console.log(`\n  PANEL: e-postası olan ${existing.size} kişi · açılacak ${inserts.length} · güncellenecek ${updates.length} · aynı kalan ${same}${unknown ? ` · durumu tanınmayan ${unknown} (atlandı)` : ""}`);
  if (Object.keys(changes).length) console.log(`    değişiklikler: ${show(changes)}`);
  if (inserts.length) console.log(`    açılacaklar: ${show(count(inserts, (r) => `${r.source} · izin ${r.email_consent}${r.email_status === "cikti" ? " · çıktı" : ""}`))}`);

  if (!APPLY) { console.log("\n  Yazmak için: --uygula\n"); return; }
  for (const part of chunk(inserts, 500)) {
    const { error } = await db.from("customers").upsert(part, { onConflict: "workspace_id,source_ref", ignoreDuplicates: true });
    if (error) { console.error(`❌ kişi yazılamadı — ${error.message}`); process.exit(1); }
  }
  for (const part of chunk(updates, 20)) {
    const results = await Promise.all(part.map((u) => db.from("customers").update(u.patch).eq("id", u.id).eq("workspace_id", workspace_id)));
    const failed = results.find((x) => x.error);
    if (failed?.error) { console.error(`❌ güncellenemedi — ${failed.error.message}`); process.exit(1); }
  }
  const latest = [...byEmail.values()].map((r) => r.degisti ?? "").sort().pop();
  console.log(`\n  ✓ ${inserts.length} kişi açıldı · ${updates.length} güncellendi${latest ? ` · bir sonraki sefer: --since ${latest}` : ""}\n`);
}

async function resolveWorkspace(db: SupabaseClient): Promise<string> {
  const { data: wsRows, error: wsErr } = await db.from("workspaces").select("id, slug");
  if (wsErr || !wsRows?.length) { console.error(`❌ çalışma alanı okunamadı — ${wsErr?.message ?? "yok"}`); process.exit(1); }
  const slug = arg("--alan");
  const candidates = slug ? wsRows.filter((w) => w.slug === slug) : wsRows;
  if (candidates.length !== 1) { console.error(`❌ ${candidates.length} çalışma alanı (${wsRows.map((w) => w.slug).join(", ")}); --alan <slug> ile seçin.`); process.exit(1); }
  return candidates[0].id as string;
}

async function main() {
  if (SITE) {
    /* Gerçek abone verisi yerel geliştirme veritabanına YAZILMAZ ve oraya
       karşı okunmaz (KVKK). Yerelde yalnız sahte uçla denenir (--site-url). */
    if (!PROD && !SITE_LOCAL) { console.error("❌ Gerçek siteden okuma yalnız --prod ile yapılır."); process.exit(1); }
    const secret = arg("--site-secret") ?? process.env.SITE_ABONELIK_SECRET ?? readEnvFile(PROD ? ".env.prod" : ".env.local").SITE_ABONELIK_SECRET ?? "";
    if (secret.length < 32) { console.error(`❌ SITE_ABONELIK_SECRET tanımlı değil ya da kısa (${PROD ? ".env.prod" : ".env.local"}).`); process.exit(1); }
    const t = target();
    const db = createClient(t.url, t.key, { auth: { persistSession: false } });
    console.log(`\n▸ ${t.label} · ${APPLY ? "YAZAR" : "RAPOR (yazmaz)"} · kaynak ${SITE_URL.replace(/^https?:\/\//, "")} abonelik kayıtları${SINCE ? ` (${SINCE} sonrası)` : ""}`);
    await siteStep(db, await resolveWorkspace(db), secret);
    return;
  }
  if (!FILE || !fs.existsSync(FILE)) { console.error(`❌ Ana liste bulunamadı${FILE ? `: ${FILE}` : ""} (--dosya ile verin).`); process.exit(1); }
  /* GERÇEK LİSTE YEREL VERİTABANINA YAZILMAZ (KVKK: geliştirme sahte veriyle).
     Yerelde yazmak için gerçek veri klasörünün DIŞINDA bir (sahte) dosya
     `--dosya` ile verilmelidir; gönderim kayıtları da yalnız açıkça verilirse
     okunur. Canlıya yazma `--prod --uygula` iledir. */
  const inRealDir = (p: string) => path.resolve(p).startsWith(path.resolve(VERI) + path.sep);
  if (APPLY && !PROD && (!arg("--dosya") || inRealDir(FILE) || (arg("--gonderim") && inRealDir(SENDS)))) {
    console.error("❌ Gerçek müşteri listesi yerel veritabanına yazılmaz. Yerelde denemek için --dosya ile SAHTE bir dosya verin; canlı için --prod.");
    process.exit(1);
  }
  const sendsDir = PROD || arg("--gonderim") ? SENDS : "";
  const t = target();
  const db = createClient(t.url, t.key, { auth: { persistSession: false } });
  console.log(`\n▸ ${t.label} · ${APPLY ? "YAZAR" : "RAPOR (yazmaz)"} · kaynak ${path.basename(FILE)}`);

  // ── Ana liste ─────────────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const ws = wb.worksheets.find((w) => w.name.trim().toLocaleLowerCase("tr") === "müşteriler");
  if (!ws) { console.error(`❌ "Müşteriler" sayfası yok. Sayfalar: ${wb.worksheets.map((w) => w.name).join(", ")}`); process.exit(1); }
  let head: string[] | null = null;
  const src: Row[] = [];
  let skipped = 0; const unknownLabels: Record<string, number> = {};
  ws.eachRow((row) => {
    const cells = (row.values as unknown[]).slice(1);
    if (!head) { const h = cells.map(text); if (h.includes("Etiket") && h.includes("E-posta")) head = h; return; }
    const get = (name: string) => cells[head!.indexOf(name)];
    const label = text(get("Etiket"));
    const full_name = text(get("Ad Soyad")).slice(0, 200);
    const email = emailOf(get("E-posta"));
    const phone = text(get("Telefon")).slice(0, 60);
    if (!full_name && !email && !phone) { skipped++; return; }
    const ts = tierAndSource(label);
    if (!ts.known) unknownLabels[label] = (unknownLabels[label] ?? 0) + 1;
    const consentAt = day(get("E-posta izni"));
    const bulten = text(get("Bülten")).toLocaleLowerCase("tr");
    const key = email ? `e:${email}` : digits(phone).length >= 7 ? `t:${digits(phone)}` : `a:${full_name.toLocaleLowerCase("tr")}|${label}`;
    src.push({
      source_ref: key, full_name, email, phone, tier: ts.tier, source: ts.source, label: label.slice(0, 80),
      last_activity: day(get("Son işlem")),
      email_consent: consentAt ? "var" : "bilinmiyor", email_consent_at: consentAt,
      email_status: bulten.includes("hatalı") ? "hatali" : bulten.includes("çıktı") ? "cikti" : "ok",
      note: text(get("Not")).slice(0, 4000),
    });
  });
  if (!head) { console.error("❌ Başlık satırı (Etiket · E-posta) bulunamadı."); process.exit(1); }

  /* Aynı anahtar iki satırda: katmanı YÜKSEK olan ve son işlemi yeni olan kalır. */
  const RANK: Record<Tier, number> = { "A+": 0, A: 1, B: 2, C: 3, D: 4 };
  const byKey = new Map<string, Row>();
  let dup = 0;
  for (const r of src) {
    const prev = byKey.get(r.source_ref);
    if (!prev) { byKey.set(r.source_ref, r); continue; }
    dup++;
    const best = RANK[r.tier] < RANK[prev.tier] ? r : prev;
    byKey.set(r.source_ref, {
      ...best,
      phone: best.phone || prev.phone || r.phone,
      last_activity: [prev.last_activity, r.last_activity].filter(Boolean).sort().pop() ?? null,
      email_consent: prev.email_consent === "var" || r.email_consent === "var" ? "var" : "bilinmiyor",
      email_consent_at: prev.email_consent_at ?? r.email_consent_at,
      email_status: prev.email_status !== "ok" ? prev.email_status : r.email_status,
      note: [prev.note, r.note].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" · ").slice(0, 4000),
    });
  }
  const rows = [...byKey.values()];
  console.log(`  ANA LİSTE: ${src.length} satır · boş atlanan ${skipped} · aynı kişi (birleşen) ${dup} · aktarılacak kişi ${rows.length}`);
  console.log(`    katman: ${show(count(rows, (r) => r.tier))}`);
  console.log(`    kaynak: ${show(count(rows, (r) => r.source))}`);
  console.log(`    e-postası olan ${rows.filter((r) => r.email).length} · yalnız telefon ${rows.filter((r) => !r.email && r.phone).length} · izinli ${rows.filter((r) => r.email_consent === "var").length}`);
  console.log(`    adres: ${show(count(rows, (r) => r.email_status))}`);
  if (Object.keys(unknownLabels).length) console.log(`    ⚠ katmanı okunamayan etiket (C sayıldı): ${show(unknownLabels)}`);

  // ── Hedef ─────────────────────────────────────────────────────────────────
  const workspace_id = await resolveWorkspace(db);

  type Existing = Row & { id: string; updated_by: string | null };
  const existing = new Map<string, Existing>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("customers")
      .select("id, source_ref, full_name, email, phone, tier, source, label, last_activity, email_consent, email_consent_at, email_status, note, updated_by")
      .eq("workspace_id", workspace_id).order("id").range(from, from + 999);
    if (error) { console.error(`❌ customers okunamadı — ${error.message} (20240379 uygulandı mı?)`); process.exit(1); }
    for (const r of (data ?? []) as Existing[]) {
      if (r.source_ref) existing.set(r.source_ref, r);
      if (r.email && !existing.has(`e:${r.email}`)) existing.set(`e:${r.email}`, r); // panelde elle açılmış kişi
    }
    if (!data || data.length < 1000) break;
  }

  const inserts: (Row & { workspace_id: string })[] = [];
  const updates: { id: string; patch: Partial<Row> }[] = [];
  let untouched = 0, protectedRows = 0;
  for (const r of rows) {
    const cur = existing.get(r.source_ref);
    if (!cur) { inserts.push({ ...r, workspace_id }); continue; }
    const patch: Partial<Row> = {};
    const edited = cur.updated_by !== null;
    for (const k of ["full_name", "email", "phone", "tier", "source", "label", "email_consent", "email_consent_at", "email_status", "note"] as const) {
      const now = cur[k] ?? "", next = r[k] ?? "";
      if (now === next) continue;
      if (edited && now !== "" && !(k === "email_consent" && now === "bilinmiyor")) continue; // elle düzeltilen alan korunur
      if (next === "" || next === null) continue;                                          // kaynak boşsa silme
      /* "Geçerli" ve "bilinmiyor" kaynakta BİLGİ YOK demektir — panelde duran
         işareti (hatalı / çıktı / izin var) geri almaz. */
      if ((k === "email_status" && next === "ok") || (k === "email_consent" && next === "bilinmiyor")) continue;
      (patch as Record<string, unknown>)[k] = next;
    }
    if (r.last_activity && (!cur.last_activity || r.last_activity > cur.last_activity)) patch.last_activity = r.last_activity;
    if (!cur.source_ref) (patch as Record<string, unknown>).source_ref = r.source_ref;
    if (Object.keys(patch).length) { updates.push({ id: cur.id, patch }); if (edited) protectedRows++; } else untouched++;
  }
  console.log(`\n  PANEL: şu an ${new Set([...existing.values()].map((e) => e.id)).size} kişi · açılacak ${inserts.length} · güncellenecek ${updates.length} (elle düzeltilmiş, yalnız boşu dolan ${protectedRows}) · aynı kalan ${untouched}`);

  // ── Gönderim kayıtları ────────────────────────────────────────────────────
  type Send = { key: string; sent_on: string; subject: string; result: string; source_ref: string };
  const sends: Send[] = [];
  const marks = new Map<string, "hatali" | "cikti">();
  if (sendsDir && fs.existsSync(sendsDir)) {
    for (const f of fs.readdirSync(sendsDir).filter((n) => /-gonderilen\.csv$/.test(n)).sort()) {
      const campaign = f.replace(/-gonderilen\.csv$/, "");
      for (const r of csvRows(path.join(sendsDir, f))) {
        const e = emailOf(r["E-posta"]); const d = day(r["Zaman"]);
        if (e && d) sends.push({ key: `e:${e}`, sent_on: d, subject: SUBJECTS.get(campaign) ?? campaign, result: "gitti", source_ref: `${campaign}:${e}` });
      }
    }
    for (const [file, result, mark] of [["gecersiz.csv", "dondu", "hatali"], ["cikanlar.csv", "cikti", "cikti"]] as const) {
      for (const r of csvRows(path.join(sendsDir, file))) {
        const e = emailOf(r["E-posta"]); const d = day(r["Zaman"]);
        if (!e) continue;
        marks.set(`e:${e}`, mark);
        if (d) sends.push({ key: `e:${e}`, sent_on: d, subject: "", result, source_ref: `${result}:${e}:${d}` });
      }
    }
  }
  const known = new Set([...rows.map((r) => r.source_ref), ...existing.keys()]);
  const sendsKnown = sends.filter((s) => known.has(s.key));
  console.log(`  GÖNDERİM: ${sends.length} kayıt (${show(count(sends, (s) => s.result))}) · listede karşılığı olan ${sendsKnown.length} · geri dönen/çıkan işareti ${marks.size}`);

  if (!APPLY) { console.log("\n  Yazmak için: --uygula\n"); return; }

  // ── Yaz ───────────────────────────────────────────────────────────────────
  for (const part of chunk(inserts, 500)) {
    const { error } = await db.from("customers").upsert(part, { onConflict: "workspace_id,source_ref", ignoreDuplicates: true });
    if (error) { console.error(`❌ kişi yazılamadı — ${error.message}`); process.exit(1); }
  }
  for (const part of chunk(updates, 20)) {
    const results = await Promise.all(part.map((u) => db.from("customers").update(u.patch).eq("id", u.id).eq("workspace_id", workspace_id)));
    const failed = results.find((r) => r.error);
    if (failed?.error) { console.error(`❌ güncellenemedi — ${failed.error.message}`); process.exit(1); }
  }
  /* Kimlikler — gönderim kayıtları ve adres işaretleri için. */
  const idOf = new Map<string, { id: string; email_status: string; updated_by: string | null }>();
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from("customers").select("id, source_ref, email, email_status, updated_by").eq("workspace_id", workspace_id).order("id").range(from, from + 999);
    for (const r of (data ?? []) as { id: string; source_ref: string | null; email: string; email_status: string; updated_by: string | null }[]) {
      if (r.source_ref) idOf.set(r.source_ref, r);
      if (r.email) idOf.set(`e:${r.email}`, r);
    }
    if (!data || data.length < 1000) break;
  }
  let marked = 0;
  for (const [key, mark] of marks) {
    const c = idOf.get(key);
    /* Ekip adresi düzeltip "Geçerli" yaptıysa eski kayıt onu geri bozmasın. */
    if (!c || c.email_status !== "ok" || c.updated_by) continue;
    const { error } = await db.from("customers").update({ email_status: mark }).eq("id", c.id);
    if (!error) marked++;
  }
  let sendCount = 0;
  for (const part of chunk(sendsKnown.filter((s) => idOf.has(s.key)), 500)) {
    const { error, count: n } = await db.from("customer_sends").upsert(
      part.map((s) => ({ workspace_id, customer_id: idOf.get(s.key)!.id, sent_on: s.sent_on, subject: s.subject, result: s.result, source_ref: s.source_ref })),
      { onConflict: "workspace_id,source_ref", ignoreDuplicates: true, count: "exact" },
    );
    if (error) { console.error(`❌ gönderim kaydı yazılamadı — ${error.message}`); process.exit(1); }
    sendCount += n ?? 0;
  }
  const { count: total } = await db.from("customers").select("id", { count: "exact", head: true }).eq("workspace_id", workspace_id);
  console.log(`\n  ✓ ${inserts.length} kişi açıldı · ${updates.length} güncellendi · ${marked} adres işaretlendi · ${sendCount} gönderim kaydı yazıldı`);
  console.log(`  Panelde artık ${total} kişi var.\n`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
