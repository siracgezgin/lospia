#!/usr/bin/env npx tsx
/**
 * Aslı Hanım'ın "Toplantı Takvimi" Excel'ini /planning'e aktarır.
 *
 *   npm run import:planning -- --dry-run              # önizleme, hiçbir şey yazmaz
 *   npm run import:planning                           # yerel Supabase (.env.local)
 *
 *   Prod (kimlik bilgileri yalnız yerelde, depoya asla girmez):
 *     IMPORT_SUPABASE_URL=https://<proj>.supabase.co \
 *     IMPORT_SUPABASE_SERVICE_ROLE_KEY=<service_role> \
 *     npm run import:planning -- --prod
 *
 *   Dosya yolu ve yıl:
 *     npm run import:planning -- --file "sonh/Toplantı Takvimi (1).xlsx" --year 2026
 *
 * SAAT: Excel'deki 09:00 NEW YORK duvar saatidir (Sıraç, 2026-09-06). Sistem de
 * `time_slot`u New York olarak saklar ve İstanbul'u ondan hesaplar
 * (lib/planning/timezones.ts) — yani saat DÖNÜŞTÜRÜLMEZ, olduğu gibi yazılır.
 *
 * TARİHLER: Sayfanın 2. satırındaki gün başlıkları ("27 Tem") HER SÜTUN İÇİN
 * KENDİ tarihidir; sayfa iki farklı haftadan sütun taşıyabilir (kaynakta
 * Pzt/Sal 27–28 Temmuz iken Çar–Paz 22–26 Temmuz). Sütunun kendi tarihine
 * yazılır — Excel ne diyorsa o.
 *
 * İDEMPOTENT: anahtar (workspace_id, meeting_date, time_slot). Tekrar
 * çalıştırmak var olan toplantıyı GÜNCELLER, kopya üretmez. Konular
 * (meeting_id, position) ile eşleşir; kullanıcının sonradan eklediği fazladan
 * konular SİLİNMEZ.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import * as fs from "fs";
import * as path from "path";

const WORKSPACE_NAME = "AF Operasyon";
const DRY_RUN = process.argv.includes("--dry-run");
const PROD = process.argv.includes("--prod");

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

const FILE = argValue("--file") ?? "sonh/Toplantı Takvimi (1).xlsx";
const YEAR = Number(argValue("--year") ?? "2026");

// ── Kategori çözümü ──────────────────────────────────────────────────────────

/** Hücre metninin başındaki kategori sözcüğü → sistemdeki kategori anahtarı.
 *  Kaynak: lib/planning/categories.ts (aynı anahtarlar). Sıra ÖNEMLİ: uzun
 *  etiket önce denenir ki "Sales / Satın Alma" yanlışlıkla eşleşmesin. */
const CATEGORY_PREFIXES: { prefix: string; key: string }[] = [
  { prefix: "dış toplantı", key: "external" },
  { prefix: "marketing", key: "marketing" },
  { prefix: "tasarım", key: "tasarim" },
  { prefix: "üretim", key: "uretim" },
  { prefix: "finans", key: "finance" },
  { prefix: "sistem", key: "system" },
  { prefix: "sales", key: "sales" },
  { prefix: "koop", key: "external" },
  { prefix: "etc", key: "external" },
  { prefix: "ai", key: "ai" },
];

const lower = (s: string) => s.trim().toLocaleLowerCase("tr-TR");

/** Kategori karşılaştırması için TÜRKÇE I KATLAMASI.
 *  `toLocaleLowerCase("tr-TR")` büyük "I"yı NOKTASIZ "ı" yapar; bu yüzden
 *  "AI / Lookbook" hücresi "aı ..." olup "ai" önekiyle eşleşmiyordu ve
 *  toplantı yanlışlıkla "Diğer" kategorisine düşüyordu (ilk koşuda görüldü).
 *  Karşılaştırmada iki i de aynı harfe katlanır. */
const fold = (s: string) => lower(s).replace(/ı/g, "i");

/** "Üretim / Ready to Wear" → { category: "uretim", title: "Ready to Wear" }
 *  "Marketing Sosyal Medya takvim" → { marketing, "Sosyal Medya takvim" }
 *  "KOOP" → { external, "KOOP" } — ayıracı olmayan tek sözcüklük başlıklar
 *  kategori olarak sınıflanır ama BAŞLIK METNİ KAYBOLMAZ. */
function parseCell(raw: string): { category: string; title: string } {
  const text = raw.trim().replace(/\s+/g, " ");
  const l = fold(text);
  for (const { prefix: rawPrefix, key } of CATEGORY_PREFIXES) {
    const prefix = fold(rawPrefix);
    if (l === prefix) return { category: key, title: text };
    if (l.startsWith(prefix + " ") || l.startsWith(prefix + "/")) {
      const rest = text.slice(prefix.length).replace(/^\s*\/?\s*/, "").trim();
      return { category: key, title: rest || text };
    }
  }
  return { category: "other", title: text };
}

// ── Kişi çözümü ──────────────────────────────────────────────────────────────

/** lib/planning/initials.ts ile AYNI kural — betik "server-only" modülü
 *  içe aktaramadığı için burada birebir tekrarlanır. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase("tr-TR");
  return (parts[0][0] + parts[parts.length - 1][0]).toLocaleUpperCase("tr-TR");
}

type Person = { userId: string; name: string };

/** "SE, ND" ya da "Meral, SE" → çözülebilen üyelerin user_id'leri.
 *  Çözülemeyen ad (sistemde kullanıcısı olmayan Meral, Hakan Usta…) ATILMAZ:
 *  ham metin `kim` alanında zaten aynen duruyor. */
function resolveKim(kim: string, people: Person[]): string[] {
  const out = new Set<string>();
  for (const tokenRaw of kim.split(/[,;/]/)) {
    const token = tokenRaw.trim();
    if (!token) continue;
    const t = lower(token);
    const upper = token.toLocaleUpperCase("tr-TR");
    const hit =
      people.find((p) => lower(p.name) === t) ??
      people.find((p) => initialsOf(p.name) === upper) ??
      people.find((p) => lower(p.name).startsWith(t + " ")) ??
      null;
    if (hit) out.add(hit.userId);
  }
  return [...out];
}

// ── Tarih çözümü ─────────────────────────────────────────────────────────────

const TR_MONTHS: Record<string, number> = {
  oca: 1, şub: 2, sub: 2, mar: 3, nis: 4, may: 5, haz: 6,
  tem: 7, ağu: 8, agu: 8, eyl: 9, eki: 10, kas: 11, ara: 12,
};

/** "27 Tem" → "2026-07-27". Hücre gerçek bir tarihse o kullanılır. */
function parseDayCell(value: unknown, year: number): string | null {
  if (value instanceof Date) {
    const y = value.getFullYear();
    return `${y}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  const text = String(value ?? "").trim();
  const m = /^(\d{1,2})\s*([A-Za-zÇĞİÖŞÜçğıöşü]+)/.exec(text);
  if (!m) return null;
  const day = Number(m[1]);
  const mon = TR_MONTHS[lower(m[2]).slice(0, 3)];
  if (!mon || !day) return null;
  return `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Excel saat hücresi ("09:00:00", Date ya da 0-1 arası kesir) → "09:00". */
function parseSlot(value: unknown): string | null {
  if (value instanceof Date) {
    return `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}`;
  }
  if (typeof value === "number" && value > 0 && value < 1) {
    const mins = Math.round(value * 24 * 60);
    return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  }
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value ?? "").trim());
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}

// ── env ──────────────────────────────────────────────────────────────────────

function loadDotEnvLocal(): Record<string, string> {
  const p = path.join(process.cwd(), ".env.local");
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

const PROD_HELP = [
  "",
  "    Değerler Supabase panelinden alınır:",
  "      Project Settings → API → Project URL          → IMPORT_SUPABASE_URL",
  "      Project Settings → API → service_role (secret) → IMPORT_SUPABASE_SERVICE_ROLE_KEY",
  "",
  "    Örnek (değerleri KENDİ projenizinkiyle değiştirin):",
  "      IMPORT_SUPABASE_URL=https://abcdefgh.supabase.co \\",
  "      IMPORT_SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi... \\",
  "      npm run import:planning -- --prod",
  "",
  "    service_role anahtarı GİZLİDİR: depoya, sohbete ya da bir dosyaya yazmayın.",
].join("\n");

function resolveTarget(): { url: string; key: string; label: string } {
  const envUrl = process.env.IMPORT_SUPABASE_URL;
  const envKey = process.env.IMPORT_SUPABASE_SERVICE_ROLE_KEY;
  if (PROD || envUrl || envKey) {
    if (!envUrl || !envKey) {
      console.error("❌  --prod için IMPORT_SUPABASE_URL ve IMPORT_SUPABASE_SERVICE_ROLE_KEY gerekli.");
      console.error(PROD_HELP);
      process.exit(1);
    }
    /* Yer tutucu yakalama: dokümandaki "…" işareti komuta AYNEN kopyalanınca
       supabase-js "Invalid supabaseUrl" diyor ve nedeni anlaşılmıyordu
       (Sıraç, 2026-09-06). Burada Türkçe ve ne yapılacağını söyleyerek durur. */
    if (!/^https?:\/\//.test(envUrl)) {
      console.error(`❌  IMPORT_SUPABASE_URL geçerli bir adres değil: "${envUrl}"`);
      console.error("    https://<proje>.supabase.co biçiminde OLMALI — komuttaki \u2026 bir yer tutucudur, gerçek adresi yazın.");
      console.error(PROD_HELP);
      process.exit(1);
    }
    return { url: envUrl, key: envKey, label: "PRODUCTION" };
  }
  const local = loadDotEnvLocal();
  const url = local.NEXT_PUBLIC_SUPABASE_URL;
  const key = local.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("❌  .env.local içinde NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY yok");
    process.exit(1);
  }
  return { url, key, label: "LOCAL" };
}

// ── Ayrıştırma ───────────────────────────────────────────────────────────────

type ParsedTopic = { position: number; text: string; kim: string };
type ParsedMeeting = {
  date: string;
  slot: string;
  category: string;
  title: string;
  kim: string;
  topics: ParsedTopic[];
};

const cellText = (ws: ExcelJS.Worksheet, row: number, col: number): string => {
  const v = ws.getCell(row, col).value;
  if (v == null) return "";
  if (typeof v === "object" && v !== null && "richText" in v) {
    return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join("").trim();
  }
  if (typeof v === "object" && v !== null && "text" in v) {
    return String((v as { text: unknown }).text ?? "").trim();
  }
  return String(v).trim();
};

async function parseWorkbook(file: string, year: number): Promise<ParsedMeeting[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Çalışma kitabında sayfa yok");

  /* Gün sütunları İKİŞER: (Toplantı içerik, Kim). 1. sütun etiket kolonu.
     Yani gün i (0-6) → içerik 2+i*2, kim 3+i*2. */
  const DAYS = 7;
  const dates: (string | null)[] = [];
  for (let i = 0; i < DAYS; i++) {
    dates.push(parseDayCell(ws.getCell(2, 2 + i * 2).value, year));
  }

  const meetings: ParsedMeeting[] = [];
  let current: ParsedMeeting[] = [];

  for (let row = 3; row <= ws.rowCount; row++) {
    const label = cellText(ws, row, 1);
    if (!label) continue;

    const slot = parseSlot(ws.getCell(row, 1).value);
    if (slot) {
      // Yeni saat bloğu — her gün için bir toplantı adayı.
      current = [];
      for (let i = 0; i < DAYS; i++) {
        const date = dates[i];
        const raw = cellText(ws, row, 2 + i * 2);
        const kim = cellText(ws, row, 3 + i * 2);
        if (!date || (!raw && !kim)) { current.push(null as unknown as ParsedMeeting); continue; }
        const { category, title } = parseCell(raw);
        const m: ParsedMeeting = { date, slot, category, title, kim, topics: [] };
        current.push(m);
        meetings.push(m);
      }
      continue;
    }

    const topicMatch = /^konu\s*(\d+)/i.exec(label);
    if (topicMatch && current.length) {
      const position = Number(topicMatch[1]);
      for (let i = 0; i < DAYS; i++) {
        const meeting = current[i];
        if (!meeting) continue;
        const text = cellText(ws, row, 2 + i * 2);
        const kim = cellText(ws, row, 3 + i * 2);
        if (!text && !kim) continue;
        meeting.topics.push({ position, text, kim });
      }
    }
  }

  return meetings;
}

// ── Yazma ────────────────────────────────────────────────────────────────────

async function upsertMeeting(
  supabase: SupabaseClient,
  workspaceId: string,
  createdBy: string | null,
  people: Person[],
  m: ParsedMeeting,
): Promise<"inserted" | "updated"> {
  const participantIds = resolveKim(m.kim, people);
  const payload = {
    workspace_id: workspaceId,
    meeting_date: m.date,
    time_slot: m.slot,
    category: m.category,
    title: m.title || null,
    kim: m.kim || null,
    participant_ids: participantIds,
    updated_by: createdBy,
  };

  const { data: existing } = await supabase
    .from("planning_meetings")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("meeting_date", m.date)
    .eq("time_slot", m.slot)
    .limit(1)
    .maybeSingle();

  let meetingId: string;
  let mode: "inserted" | "updated";
  if (existing?.id) {
    const { error } = await supabase.from("planning_meetings").update(payload).eq("id", existing.id);
    if (error) throw new Error(`toplantı güncellenemedi (${m.date} ${m.slot}): ${error.message}`);
    meetingId = existing.id;
    mode = "updated";
  } else {
    const { data, error } = await supabase
      .from("planning_meetings")
      .insert({ ...payload, created_by: createdBy })
      .select("id")
      .single();
    if (error || !data) throw new Error(`toplantı eklenemedi (${m.date} ${m.slot}): ${error?.message}`);
    meetingId = data.id;
    mode = "inserted";
  }

  /* Konular POZİSYONA göre eşleşir. Silme YOK: kullanıcının sonradan eklediği
     konular korunur; Excel'de dolu olan pozisyonlar güncellenir. */
  for (const t of m.topics) {
    const topicPayload = {
      meeting_id: meetingId,
      workspace_id: workspaceId,
      position: t.position,
      text: t.text || null,
      kim: t.kim || null,
      participant_ids: resolveKim(t.kim, people),
    };
    const { data: exT } = await supabase
      .from("planning_topics")
      .select("id")
      .eq("meeting_id", meetingId)
      .eq("position", t.position)
      .limit(1)
      .maybeSingle();
    if (exT?.id) {
      const { error } = await supabase.from("planning_topics").update(topicPayload).eq("id", exT.id);
      if (error) throw new Error(`konu güncellenemedi (${m.date} ${m.slot} #${t.position}): ${error.message}`);
    } else {
      const { error } = await supabase
        .from("planning_topics")
        .insert({ ...topicPayload, created_by: createdBy });
      if (error) throw new Error(`konu eklenemedi (${m.date} ${m.slot} #${t.position}): ${error.message}`);
    }
  }

  return mode;
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const file = path.isAbsolute(FILE) ? FILE : path.join(process.cwd(), FILE);
  if (!fs.existsSync(file)) {
    console.error(`❌  Dosya bulunamadı: ${file}`);
    process.exit(1);
  }

  console.log(`📄  Kaynak: ${path.basename(file)}  ·  yıl: ${YEAR}`);
  const meetings = await parseWorkbook(file, YEAR);
  const topicCount = meetings.reduce((n, m) => n + m.topics.length, 0);
  console.log(`🔎  Ayrıştırıldı: ${meetings.length} toplantı · ${topicCount} konu`);

  const byDate = new Map<string, number>();
  for (const m of meetings) byDate.set(m.date, (byDate.get(m.date) ?? 0) + 1);
  console.log(`📅  Tarihler: ${[...byDate.entries()].sort().map(([d, n]) => `${d} (${n})`).join(", ")}`);

  if (DRY_RUN) {
    console.log("\n— ÖNİZLEME (hiçbir şey yazılmadı) —");
    for (const m of meetings) {
      console.log(`  ${m.date} ${m.slot} [${m.category}] ${m.title}${m.kim ? `  · Kim: ${m.kim}` : ""}`);
      for (const t of m.topics) console.log(`      ${t.position}. ${t.text}${t.kim ? `  · ${t.kim}` : ""}`);
    }
    return;
  }

  const { url, key, label } = resolveTarget();
  console.log(`🎯  Hedef: ${label}`);
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: wsList, error: wsErr } = await supabase.from("workspaces").select("id, name");
  if (wsErr || !wsList?.length) {
    const msg = wsErr?.message ?? "(boş)";
    console.error("❌  Çalışma alanı bulunamadı:", msg);
    /* "fetch failed" = sunucuya hiç ulaşılamadı. Yerelde bunun tek anlamı
       Supabase'in ayakta olmamasıdır; genel mesaj bunu söylemiyordu. */
    if (/fetch failed/i.test(msg)) {
      if (label === "LOCAL") {
        console.error("    Yerel Supabase çalışmıyor. Docker Desktop'ı açın, sonra: supabase start");
        console.error("    Canlı veritabanına yazmak istiyorsanız --prod kullanın:");
        console.error(PROD_HELP);
      } else {
        console.error(`    ${url} adresine ulaşılamadı — adresi ve ağ bağlantınızı kontrol edin.`);
      }
    }
    process.exit(1);
  }
  const ws = wsList.find((w) => w.name === WORKSPACE_NAME) ?? wsList[0];
  console.log(`✅  Çalışma alanı: ${ws.name} (${ws.id})`);

  const { data: owner } = await supabase
    .from("workspace_members").select("user_id")
    .eq("workspace_id", ws.id).eq("role", "owner").limit(1).maybeSingle();
  const createdBy = owner?.user_id ?? null;

  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("user_id, profiles(full_name, username, email)")
    .eq("workspace_id", ws.id);
  const people: Person[] = (memberRows ?? []).flatMap((row) => {
    const r = row as unknown as {
      user_id: string;
      profiles: { full_name: string | null; username: string | null; email: string | null } | null;
    };
    const name = r.profiles?.full_name ?? r.profiles?.username ?? r.profiles?.email ?? "";
    return name ? [{ userId: r.user_id, name }] : [];
  });
  console.log(`👥  Üye: ${people.length} — ${people.map((p) => `${initialsOf(p.name)}=${p.name}`).join(", ")}`);

  let inserted = 0;
  let updated = 0;
  const unresolved = new Set<string>();
  for (const m of meetings) {
    const mode = await upsertMeeting(supabase, ws.id, createdBy, people, m);
    if (mode === "inserted") inserted++;
    else updated++;
    for (const src of [m.kim, ...m.topics.map((t) => t.kim)]) {
      for (const tok of src.split(/[,;/]/).map((x) => x.trim()).filter(Boolean)) {
        if (!resolveKim(tok, people).length) unresolved.add(tok);
      }
    }
  }

  console.log(`\n✅  Bitti — ${inserted} eklendi, ${updated} güncellendi, ${topicCount} konu yazıldı.`);
  if (unresolved.size) {
    console.log(
      `ℹ️   Sistemde kullanıcısı olmayan isimler (ham metin "Kim" alanında aynen duruyor): ${[...unresolved].join(", ")}`,
    );
  }
}

main().catch((error) => {
  console.error("❌ ", error instanceof Error ? error.message : error);
  process.exit(1);
});
