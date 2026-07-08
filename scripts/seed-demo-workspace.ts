#!/usr/bin/env npx tsx
/**
 * Seed the LOCAL-ONLY "Lospia Demo Operasyon" demo workspace.
 *
 * Source spec: docs/demo/DEMO_DATA_SEED_SPEC.md + DEMO_SEED_SCRIPT_PLAN.md
 * (branch chore/demo-safe-workspace-plan). Creates a brand-new workspace with
 * 6 departments, 4 demo users (@demo.lospia.test), 20 tasks, workflow notes,
 * rules and weekly notes — purely additive, for screenshots / Loom only.
 *
 * Usage:
 *   npm run seed:demo-workspace -- --demo-only            # dry-run (default)
 *   npm run seed:demo-workspace -- --demo-only --execute  # apply (asks for
 *                                        typed confirmation CREATE_DEMO_WORKSPACE)
 *
 * Talks to Postgres DIRECTLY (pg Client) — no Supabase REST/API keys needed.
 * Default DSN is the local Supabase Postgres
 * (postgresql://postgres:postgres@127.0.0.1:54322/postgres); override with
 * SUPABASE_DB_URL. Execute mode runs in ONE transaction — any failure rolls
 * everything back.
 *
 * Safety rules (all enforced below — see DEMO_SEED_SCRIPT_PLAN.md §2):
 *   1.  --demo-only is mandatory; without it nothing runs, nothing connects.
 *   2.  Default mode is dry-run; writes require --execute.
 *   3.  Non-local DB URL is refused unless BOTH the env var
 *       DEMO_SEED_ALLOW_REMOTE=true and the flag --allow-remote are present.
 *   4.  No delete/truncate/update path exists in this script — inserts only.
 *   5.  The "AF Operasyon" workspace is never queried, referenced or written.
 *       Every insert carries the workspace id created by this run.
 *   6.  Creates a NEW workspace; stops if "Lospia Demo Operasyon" already exists.
 *   7.  Target DB URL (password masked) and mode are printed before anything happens.
 *   8.  Execute mode requires typing CREATE_DEMO_WORKSPACE verbatim.
 *   9.  Every created record id is logged to data/demo/seed-log-<ts>.json
 *       (data/ is gitignored).
 *   10. Only @demo.lospia.test emails are allowed; any other domain aborts.
 *
 * Deliberately out of scope: notifications (never inserted directly — app
 * rule), points ledger finalization, department_members. "Marka Ekibi" is a
 * presentational team name only — the schema has no teams table.
 *
 * Relative dates are computed from the current week (Monday start) so the
 * script can be re-run each shoot week; demo users are reused if they already
 * exist (never modified), the workspace is always freshly created.
 */
import * as fs from "fs";
import * as path from "path";
import * as readline from "node:readline/promises";
import { Client } from "pg";
import { addDays, format, startOfWeek, subDays } from "date-fns";
import { generateKeyBetween } from "fractional-indexing";

// ── constants ────────────────────────────────────────────────────────────────

const DEMO_WORKSPACE_NAME = "Lospia Demo Operasyon";
const DEMO_TEAM_NAME = "Marka Ekibi"; // presentational only — no teams table
const FORBIDDEN_WORKSPACE_NAME = "AF Operasyon";
const DEMO_EMAIL_DOMAIN = "@demo.lospia.test";
const DEMO_PASSWORD = "LospiaDemo!2026"; // local-only demo accounts
const CONFIRMATION_PHRASE = "CREATE_DEMO_WORKSPACE";
const LOG_DIR = path.join(process.cwd(), "data", "demo");
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const DEFAULT_LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// ── flags ────────────────────────────────────────────────────────────────────

const ARGV = process.argv.slice(2);
const DEMO_ONLY = ARGV.includes("--demo-only");
const EXECUTE = ARGV.includes("--execute");
const ALLOW_REMOTE_FLAG = ARGV.includes("--allow-remote");
const DRY_RUN = !EXECUTE || ARGV.includes("--dry-run");

// ── demo dataset (DEMO_DATA_SEED_SPEC.md) ────────────────────────────────────

type PersonKey = "elif" | "mert" | "zeynep" | "deniz";

const PEOPLE: Record<
  PersonKey,
  { fullName: string; email: string; title: string; role: "admin" | "member" }
> = {
  elif: {
    fullName: "Elif K.",
    email: "elif@demo.lospia.test",
    title: "Marka Yöneticisi",
    role: "admin",
  },
  mert: {
    fullName: "Mert A.",
    email: "mert@demo.lospia.test",
    title: "İçerik Sorumlusu",
    role: "member",
  },
  zeynep: {
    fullName: "Zeynep D.",
    email: "zeynep@demo.lospia.test",
    title: "Üretim Koordinatörü",
    role: "member",
  },
  deniz: {
    fullName: "Deniz T.",
    email: "deniz@demo.lospia.test",
    title: "E-ticaret Sorumlusu",
    role: "member",
  },
};

type DeptName =
  | "İçerik"
  | "Koleksiyon"
  | "Üretim"
  | "E-ticaret"
  | "Onaylar"
  | "Haftalık Kontrol";

const DEPARTMENTS: { name: DeptName; colorKey: string }[] = [
  { name: "İçerik", colorKey: "purple" },
  { name: "Koleksiyon", colorKey: "pink" },
  { name: "Üretim", colorKey: "brown" },
  { name: "E-ticaret", colorKey: "blue" },
  { name: "Onaylar", colorKey: "orange" },
  { name: "Haftalık Kontrol", colorKey: "red" },
];

type DueKey =
  | "thisMon"
  | "thisWed"
  | "thisFri"
  | "nextMon"
  | "nextWed"
  | "nextFri"
  | "lastFri"
  | "overdue2";

type TaskStatus = "backlog" | "ready" | "in_progress" | "review" | "done";
type TaskPriority = "low" | "medium" | "high" | "urgent";

type DemoTask = {
  title: string;
  department: DeptName;
  status: TaskStatus;
  priority: TaskPriority;
  due: DueKey;
  responsible: PersonKey;
  participants: PersonKey[];
  description: string;
};

const TASKS: DemoTask[] = [
  // Backlog (3)
  {
    title: "Kampanya Takvimi",
    department: "E-ticaret",
    status: "backlog",
    priority: "medium",
    due: "nextMon",
    responsible: "deniz",
    participants: ["elif"],
    description:
      "Dönem kampanya takvimi taslağı hazırlanacak; indirim ve yayın tarihleri tek takvimde toplanacak.",
  },
  {
    title: "Sezon Sonu Stok Analizi",
    department: "E-ticaret",
    status: "backlog",
    priority: "low",
    due: "nextFri",
    responsible: "deniz",
    participants: [],
    description:
      "Sezon sonu kalan stok raporu çıkarılacak; yavaş dönen ürünler için öneri listesi hazırlanacak.",
  },
  {
    title: "Influencer İş Birliği Brief'i",
    department: "İçerik",
    status: "backlog",
    priority: "medium",
    due: "nextWed",
    responsible: "mert",
    participants: ["elif"],
    description:
      "Yeni sezon iş birlikleri için içerik brief'i yazılacak; teslim formatları ve takvim netleştirilecek.",
  },
  // Hazır (4)
  {
    title: "Instagram İçerik Planı",
    department: "İçerik",
    status: "ready",
    priority: "high",
    due: "thisWed",
    responsible: "mert",
    participants: [],
    description:
      "Önümüzdeki iki haftanın içerik planı hazırlanacak; görsel ihtiyaç listesi karta eklenecek.",
  },
  {
    title: "Ürün Açıklamaları Revizyonu",
    department: "E-ticaret",
    status: "ready",
    priority: "medium",
    due: "thisFri",
    responsible: "deniz",
    participants: ["mert"],
    description:
      "Yeni ürünlerin açıklamaları marka diline göre revize edilecek; kumaş ve bakım bilgileri kontrol edilecek.",
  },
  {
    title: "Ürün Bilgi Sayfası Güncellemesi",
    department: "E-ticaret",
    status: "ready",
    priority: "low",
    due: "nextMon",
    responsible: "deniz",
    participants: [],
    description:
      "Yeni ürünlerin bilgi sayfaları güncellenecek ve site üzerinde yayınlanacak.",
  },
  {
    title: "Paketleme Malzemesi Siparişi",
    department: "Üretim",
    status: "ready",
    priority: "medium",
    due: "thisFri",
    responsible: "zeynep",
    participants: [],
    description:
      "Kutu ve kurdele stoğu kontrol edilecek; eksik kalemler için sipariş verilecek.",
  },
  // Devam Ediyor (5)
  {
    title: "Kampanya Yayın Hazırlığı",
    department: "İçerik",
    status: "in_progress",
    priority: "urgent",
    due: "thisWed",
    responsible: "elif",
    participants: ["mert", "zeynep"],
    description:
      "Kampanya yayın akışı hazırlanıyor; görsel, metin ve yayın tarihi tek karttan takip ediliyor.",
  },
  {
    title: "Kumaş Tedarik Takibi",
    department: "Üretim",
    status: "in_progress",
    priority: "high",
    due: "overdue2",
    responsible: "zeynep",
    participants: [],
    description:
      "Onaylanan kumaşların teslim tarihleri tedarikçiyle teyit edilecek; geciken kalemler bu karta not düşülecek.",
  },
  {
    title: "Ürün Görselleri Yükleme",
    department: "E-ticaret",
    status: "in_progress",
    priority: "high",
    due: "thisFri",
    responsible: "deniz",
    participants: ["mert"],
    description:
      "Rötuşu tamamlanan ürün görselleri siteye yüklenecek; eksik açılar için çekim listesi güncellenecek.",
  },
  {
    title: "Kreatif Onay Akışı",
    department: "İçerik",
    status: "in_progress",
    priority: "urgent",
    due: "nextMon",
    responsible: "elif",
    participants: ["mert", "zeynep", "deniz"],
    description:
      "Kampanya kreatifleri için onay akışı yürütülüyor; içerik, e-ticaret ve üretim onayları tek plana bağlanıyor.",
  },
  {
    title: "Web Sitesi Banner Güncellemesi",
    department: "E-ticaret",
    status: "in_progress",
    priority: "medium",
    due: "thisWed",
    responsible: "deniz",
    participants: [],
    description:
      "Ana sayfa bannerları yeni kampanya görselleriyle değiştirilecek; mobil kırılımlar kontrol edilecek.",
  },
  // Onay Bekliyor (4)
  {
    title: "Numune Revizyon Kontrolü",
    department: "Üretim",
    status: "review",
    priority: "urgent",
    due: "overdue2",
    responsible: "zeynep",
    participants: ["elif"],
    description:
      "İkinci numune revizyonu kontrol edilecek; onay verilirse üretim planına geçilecek.",
  },
  {
    title: "Onay Bekleyen Kreatifler",
    department: "Onaylar",
    status: "review",
    priority: "high",
    due: "thisWed",
    responsible: "mert",
    participants: ["elif"],
    description:
      "Kampanya kreatifleri onaya sunuldu; dönüş sonrası yayın planına alınacak.",
  },
  {
    title: "Tedarikçi Numune Değerlendirmesi",
    department: "Üretim",
    status: "review",
    priority: "medium",
    due: "thisFri",
    responsible: "zeynep",
    participants: [],
    description:
      "Yeni tedarikçiden gelen numuneler değerlendirilecek; kalite notları karta işlenecek.",
  },
  {
    title: "E-posta Bülteni Taslağı",
    department: "İçerik",
    status: "review",
    priority: "medium",
    due: "thisFri",
    responsible: "mert",
    participants: ["deniz"],
    description:
      "Haftalık bülten taslağı hazırlandı; onay sonrası gönderim listesine alınacak.",
  },
  // Tamamlandı (4)
  {
    title: "Haftalık Operasyon Kontrolü",
    department: "Haftalık Kontrol",
    status: "done",
    priority: "high",
    due: "thisMon",
    responsible: "elif",
    participants: ["mert", "zeynep", "deniz"],
    description:
      "Haftalık operasyon toplantısı yapıldı; geciken işler ve bu haftanın öncelikleri belirlendi.",
  },
  {
    title: "Ürün Fotoğraf Rötuşları",
    department: "İçerik",
    status: "done",
    priority: "medium",
    due: "thisMon",
    responsible: "mert",
    participants: [],
    description: "Yeni ürün fotoğraflarının rötuşları tamamlandı ve yükleme için teslim edildi.",
  },
  {
    title: "Kargo Süreç Kontrol Listesi",
    department: "E-ticaret",
    status: "done",
    priority: "low",
    due: "thisMon",
    responsible: "deniz",
    participants: [],
    description: "Kargo ve iade süreç kontrol listesi güncellendi; ekiple paylaşıldı.",
  },
  {
    title: "Haftalık Teslim Kontrolü",
    department: "Haftalık Kontrol",
    status: "done",
    priority: "medium",
    due: "lastFri",
    responsible: "elif",
    participants: ["mert"],
    description: "Bu haftanın teslimleri kontrol edildi; geciken kalemler ve öncelikler ekiple paylaşıldı.",
  },
];

type NoteType = "info" | "action_required" | "handoff" | "approval_waiting";

const TASK_NOTES: {
  taskTitle: string;
  author: PersonKey;
  noteType: NoteType;
  content: string;
}[] = [
  {
    taskTitle: "Numune Revizyon Kontrolü",
    author: "zeynep",
    noteType: "approval_waiting",
    content: "İkinci revizyon hazır — Elif Hanım'ın onayı bekleniyor.",
  },
  {
    taskTitle: "Kampanya Yayın Hazırlığı",
    author: "mert",
    noteType: "info",
    content: "Yayın öncesi görsel ve metinler karta eklendi, Çarşamba netleşiyor.",
  },
  {
    taskTitle: "Kumaş Tedarik Takibi",
    author: "zeynep",
    noteType: "action_required",
    content: "Tedarikçi teslimi 2 gün kaydırdı — plan güncellenecek.",
  },
  {
    taskTitle: "Ürün Görselleri Yükleme",
    author: "deniz",
    noteType: "handoff",
    content: "İlk 20 ürün yüklendi; rötuşlu görseller Mert'ten gelecek.",
  },
  {
    taskTitle: "Onay Bekleyen Kreatifler",
    author: "mert",
    noteType: "approval_waiting",
    content: "3 kreatif onaya hazır; kampanya öncesi dönüş gerekli.",
  },
  {
    taskTitle: "Haftalık Operasyon Kontrolü",
    author: "elif",
    noteType: "info",
    content: "Bu hafta 2 geciken iş var; ikisi de üretim tarafında, takipteyiz.",
  },
];

const RULES: string[] = [
  "Her görevin bir sorumlusu ve teslim tarihi olmak zorundadır.",
  "Onay gerektiren işler 'Onay Bekliyor' statüsüne alınır ve karta approval notu düşülür.",
  "Ürün görselleri yüklenmeden ürün yayına alınmaz.",
  "Geciken görevler haftalık kontrol toplantısında ilk sırada konuşulur.",
  "Numune revizyonları en fazla 2 tur yapılır; üçüncü tur yönetici onayı ister.",
];

const WEEKLY_NOTES: { title: string; body: string }[] = [
  {
    title: "Haftalık Odak",
    body: "Bu hafta odak: lansman hazırlığı ve geciken üretim kalemleri. Cuma'ya kadar numune onayı kapanmalı.",
  },
  {
    title: "Kampanya Durumu",
    body: "Kampanya görselleri tamamlandı; e-ticaret yüklemeleri Cuma bitiyor.",
  },
];

// ── relative dates (DEMO_SEED_SCRIPT_PLAN.md §4) ─────────────────────────────

function computeDueDates(today: Date): Record<DueKey, string> {
  const monday = startOfWeek(today, { weekStartsOn: 1 });
  const d = (date: Date) => format(date, "yyyy-MM-dd"); // date-only — weekly board rule
  return {
    thisMon: d(monday),
    thisWed: d(addDays(monday, 2)),
    thisFri: d(addDays(monday, 4)),
    nextMon: d(addDays(monday, 7)),
    nextWed: d(addDays(monday, 9)),
    nextFri: d(addDays(monday, 11)),
    lastFri: d(subDays(monday, 3)),
    overdue2: d(subDays(today, 2)),
  };
}

// ── env / target ─────────────────────────────────────────────────────────────

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

function isLocalUrl(url: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** SUPABASE_DB_URL (shell env or .env.local) wins; otherwise local default. */
function resolveDbUrl(): string {
  const env = loadDotEnvLocal();
  return process.env.SUPABASE_DB_URL || env.SUPABASE_DB_URL || DEFAULT_LOCAL_DB_URL;
}

function maskDbUrl(dbUrl: string): string {
  try {
    const u = new URL(dbUrl);
    if (u.password) u.password = "****";
    return u.toString();
  } catch {
    return dbUrl.replace(/:\/\/([^:@/]+):[^@/]+@/, "://$1:****@");
  }
}

function fail(message: string): never {
  console.error(`\n❌  ${message}`);
  process.exit(1);
}

// ── main ─────────────────────────────────────────────────────────────────────

type CreatedRecord = { table: string; id: string; label: string };

async function main(): Promise<void> {
  // Rule 1: --demo-only is mandatory — exit before touching anything.
  if (!DEMO_ONLY) {
    fail(
      "Bu script yalnızca demo amaçlıdır. --demo-only bayrağı olmadan çalışmaz.\n" +
        "    Kullanım: npm run seed:demo-workspace -- --demo-only [--execute]",
    );
  }

  // Rule 10: dataset must be demo-safe — validate before any connection.
  for (const person of Object.values(PEOPLE)) {
    if (!person.email.endsWith(DEMO_EMAIL_DOMAIN)) {
      fail(`Demo dışı e-posta domaini: ${person.email} (yalnızca ${DEMO_EMAIL_DOMAIN})`);
    }
  }
  // Rule 5: this script must never even name the real workspace as a target.
  if ((DEMO_WORKSPACE_NAME as string) === FORBIDDEN_WORKSPACE_NAME) {
    fail(`"${FORBIDDEN_WORKSPACE_NAME}" workspace'ine dokunulamaz.`);
  }

  const dbUrl = resolveDbUrl();
  const maskedDbUrl = maskDbUrl(dbUrl);

  // Rule 3: refuse non-local targets unless BOTH remote gates are open.
  const local = isLocalUrl(dbUrl);
  if (!local) {
    const envAllows = process.env.DEMO_SEED_ALLOW_REMOTE === "true";
    if (!envAllows || !ALLOW_REMOTE_FLAG) {
      fail(
        `Hedef veritabanı local değil: ${maskedDbUrl}\n` +
          `    Bu script yalnızca local Supabase Postgres (${DEFAULT_LOCAL_DB_URL}) içindir.\n` +
          "    Uzak hedef için HEM DEMO_SEED_ALLOW_REMOTE=true HEM --allow-remote gerekir (önerilmez).",
      );
    }
    console.warn("\n⚠️  UYARI: DEMO_SEED_ALLOW_REMOTE + --allow-remote ile UZAK hedefe izin verildi.");
    console.warn(`⚠️  "${FORBIDDEN_WORKSPACE_NAME}" koruması yine de aktif.`);
  }

  // Rule 7: print the target before doing anything.
  const mode = DRY_RUN ? "DRY-RUN (yazma yok)" : "EXECUTE (kayıt oluşturulacak)";
  console.log("──────────────────────────────────────────────────");
  console.log(`Hedef Postgres : ${maskedDbUrl} ${local ? "(local)" : "(REMOTE!)"}`);
  console.log(`Mod            : ${mode}`);
  console.log(`Workspace      : ${DEMO_WORKSPACE_NAME} · Ekip: ${DEMO_TEAM_NAME}`);
  console.log("──────────────────────────────────────────────────");

  const dueDates = computeDueDates(new Date());
  printPlan(dueDates);

  const client = new Client({
    connectionString: dbUrl,
    connectionTimeoutMillis: 10_000,
    // Local Supabase Postgres has no TLS; remote poolers present cert chains
    // Node doesn't bundle, so don't hard-fail verification.
    ssl: local ? undefined : { rejectUnauthorized: false },
  });

  // Preflight (read-only): existing demo workspace / demo users.
  // In dry-run an unreachable DB only skips these checks; execute aborts.
  let existingWs: { id: string; name: string }[] = [];
  let existingProfiles: { id: string; email: string }[] = [];
  let preflightOk = true;
  let connected = false;
  try {
    await client.connect();
    connected = true;
    const wsRes = await client.query<{ id: string; name: string }>(
      `select id, name from public.workspaces where name = $1`,
      [DEMO_WORKSPACE_NAME],
    );
    existingWs = wsRes.rows;
    const demoEmails = Object.values(PEOPLE).map((p) => p.email);
    const profRes = await client.query<{ id: string; email: string }>(
      `select id, email from public.profiles where email = any($1)`,
      [demoEmails],
    );
    existingProfiles = profRes.rows;
  } catch (err) {
    preflightOk = false;
    const msg = err instanceof Error ? err.message : String(err);
    if (!DRY_RUN) {
      if (connected) await client.end().catch(() => {});
      fail(`Veritabanına bağlanılamadı (supabase start çalışıyor mu?): ${msg}`);
    }
    console.warn(`\n⚠️  Veritabanına erişilemedi — ön kontroller atlandı (${msg}).`);
    console.warn("    Execute modundan önce `supabase start` ile local stack'i açın.");
  }

  if (preflightOk) {
    console.log(`\nÖn kontrol: "${DEMO_WORKSPACE_NAME}" mevcut mu? ${existingWs.length > 0 ? "EVET" : "hayır"}`);
    console.log(
      `Ön kontrol: mevcut demo kullanıcı sayısı: ${existingProfiles.length}/4` +
        (existingProfiles.length > 0 ? " (yeniden kullanılır, asla değiştirilmez)" : ""),
    );
  }

  if (existingWs.length > 0) {
    fail(
      `"${DEMO_WORKSPACE_NAME}" adlı workspace zaten var (id: ${existingWs[0].id}).\n` +
        "    Bu script üstüne yazmaz ve içine eklemez. Eski demo workspace'i uygulamadan\n" +
        "    elle arşivleyin/yeniden adlandırın, sonra tekrar çalıştırın.",
    );
  }

  if (DRY_RUN) {
    if (connected) await client.end().catch(() => {});
    const logFile = writeLog({
      mode: "dry-run",
      targetDb: maskedDbUrl,
      committed: false,
      dueDates,
      created: [],
      reusedProfiles: existingProfiles,
    });
    console.log(`\n✅  Dry-run tamam — hiçbir kayıt yazılmadı. Plan logu: ${logFile}`);
    console.log("    Gerçek oluşturma için: npm run seed:demo-workspace -- --demo-only --execute");
    return;
  }

  // Rule 8: typed confirmation.
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `\nEXECUTE modu: "${DEMO_WORKSPACE_NAME}" oluşturulacak.\n` +
      `Onaylamak için birebir ${CONFIRMATION_PHRASE} yazın: `,
  );
  rl.close();
  if (answer.trim() !== CONFIRMATION_PHRASE) {
    await client.end().catch(() => {});
    fail("Onay metni eşleşmedi — hiçbir şey yapılmadı.");
  }

  // ONE transaction — any failure rolls the whole run back, nothing persists.
  const created: CreatedRecord[] = [];
  let committed = false;
  try {
    await client.query("begin");
    await seed(client, dueDates, existingProfiles, created);
    await client.query("commit");
    committed = true;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    console.error("\n↩️   ROLLBACK yapıldı — bu çalıştırmada hiçbir kayıt kalıcı olmadı.");
    throw err;
  } finally {
    const logFile = writeLog({
      mode: "execute",
      targetDb: maskedDbUrl,
      committed,
      dueDates,
      created,
      reusedProfiles: existingProfiles,
    });
    console.log(`\n📄  Seed logu: ${logFile}`);
    await client.end().catch(() => {});
  }
}

function printPlan(dueDates: Record<DueKey, string>): void {
  console.log("\nOluşturulacaklar:");
  console.log(`  • 4 demo kullanıcı (${DEMO_EMAIL_DOMAIN}) — şifre: ${DEMO_PASSWORD}`);
  console.log(`  • 1 workspace: ${DEMO_WORKSPACE_NAME}`);
  console.log(`  • ${DEPARTMENTS.length} departman: ${DEPARTMENTS.map((d) => d.name).join(", ")}`);
  console.log(`  • ${TASKS.length} görev · ${TASK_NOTES.length} görev notu · ${RULES.length} kural · ${WEEKLY_NOTES.length} haftalık not`);
  console.log("\nGöreli tarihler:");
  for (const [k, v] of Object.entries(dueDates)) console.log(`  ${k.padEnd(9)} → ${v}`);
  const byStatus: Record<string, number> = {};
  for (const t of TASKS) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
  console.log(`\nStatü dağılımı: ${Object.entries(byStatus).map(([s, n]) => `${s}=${n}`).join(" · ")}`);
  const overdue = TASKS.filter((t) => t.due === "overdue2").length;
  const urgent = TASKS.filter((t) => t.priority === "urgent").length;
  console.log(`Geciken: ${overdue} · Acil: ${urgent} · Onay bekleyen: ${TASKS.filter((t) => t.status === "review").length}`);
  console.log("\nGörevler:");
  for (const t of TASKS) {
    console.log(
      `  [${t.status.padEnd(11)}] ${t.title} · ${t.department} · ${PEOPLE[t.responsible].fullName} · ${t.priority} · ${dueDates[t.due]}`,
    );
  }
}

/**
 * Create a demo auth user directly in the local DB (same shape supabase/seed.sql
 * uses): auth.users + auth.identities; public.profiles comes from the
 * on_auth_user_created trigger, with an explicit insert as a safety net.
 */
async function createDemoUser(
  client: Client,
  person: { fullName: string; email: string },
): Promise<string> {
  const userRes = await client.query<{ id: string }>(
    `insert into auth.users (
       id, instance_id, email, encrypted_password,
       email_confirmed_at, created_at, updated_at,
       raw_user_meta_data, raw_app_meta_data,
       role, aud, is_super_admin, is_sso_user,
       confirmation_token, recovery_token, email_change_token_new, email_change
     ) values (
       gen_random_uuid(), '00000000-0000-0000-0000-000000000000', $1,
       crypt($2, gen_salt('bf')),
       now(), now(), now(),
       jsonb_build_object('full_name', $3::text),
       '{"provider": "email", "providers": ["email"]}'::jsonb,
       'authenticated', 'authenticated', false, false,
       '', '', '', ''
     ) returning id`,
    [person.email, DEMO_PASSWORD, person.fullName],
  );
  const userId = userRes.rows[0].id;
  await client.query(
    `insert into auth.identities (
       id, user_id, provider_id, identity_data, provider,
       last_sign_in_at, created_at, updated_at
     ) values (
       gen_random_uuid(), $1::uuid, ($1::uuid)::text,
       jsonb_build_object('sub', ($1::uuid)::text, 'email', $2::text,
                          'email_verified', true, 'phone_verified', false),
       'email', now(), now(), now()
     )`,
    [userId, person.email],
  );
  await client.query(
    `insert into public.profiles (id, email, full_name)
     values ($1, $2, $3) on conflict (id) do nothing`,
    [userId, person.email, person.fullName],
  );
  return userId;
}

async function seed(
  client: Client,
  dueDates: Record<DueKey, string>,
  existingProfiles: { id: string; email: string }[],
  created: CreatedRecord[],
): Promise<void> {
  const profileByEmail = new Map(existingProfiles.map((p) => [p.email, p.id]));

  // 1. Demo users — reuse if present (never modified), create if missing.
  const userIds: Record<PersonKey, string> = {} as Record<PersonKey, string>;
  for (const [personKey, person] of Object.entries(PEOPLE) as [PersonKey, (typeof PEOPLE)[PersonKey]][]) {
    const existingId = profileByEmail.get(person.email);
    if (existingId) {
      userIds[personKey] = existingId;
      console.log(`↻  Kullanıcı mevcut, yeniden kullanılıyor: ${person.email}`);
      continue;
    }
    const userId = await createDemoUser(client, person);
    userIds[personKey] = userId;
    created.push({ table: "auth.users", id: userId, label: person.email });
    console.log(`✚  Kullanıcı oluşturuldu: ${person.email}`);
  }

  // 2. Workspace — always brand new (preflight guarantees the name is free).
  const slug = `lospia-demo-operasyon-${Date.now().toString(36)}`;
  const wsRes = await client.query<{ id: string }>(
    `insert into public.workspaces (name, slug, created_by)
     values ($1, $2, $3) returning id`,
    [DEMO_WORKSPACE_NAME, slug, userIds.elif],
  );
  const workspaceId = wsRes.rows[0].id;
  created.push({ table: "workspaces", id: workspaceId, label: DEMO_WORKSPACE_NAME });
  console.log(`✚  Workspace: ${DEMO_WORKSPACE_NAME} (${workspaceId})`);

  // 3. Members.
  const memberIds: Record<PersonKey, string> = {} as Record<PersonKey, string>;
  for (const [personKey, person] of Object.entries(PEOPLE) as [PersonKey, (typeof PEOPLE)[PersonKey]][]) {
    const memberRes = await client.query<{ id: string }>(
      `insert into public.workspace_members (workspace_id, user_id, role)
       values ($1, $2, $3) returning id`,
      [workspaceId, userIds[personKey], person.role],
    );
    memberIds[personKey] = memberRes.rows[0].id;
    created.push({ table: "workspace_members", id: memberRes.rows[0].id, label: `${person.email} (${person.role})` });
  }
  console.log(`✚  ${Object.keys(memberIds).length} üye eklendi`);

  // 4. Departments.
  const deptIds = new Map<DeptName, string>();
  for (const [i, dept] of DEPARTMENTS.entries()) {
    const deptRes = await client.query<{ id: string }>(
      `insert into public.workspace_departments (workspace_id, name, color_key, position)
       values ($1, $2, $3, $4) returning id`,
      [workspaceId, dept.name, dept.colorKey, i],
    );
    deptIds.set(dept.name, deptRes.rows[0].id);
    created.push({ table: "workspace_departments", id: deptRes.rows[0].id, label: dept.name });
  }
  console.log(`✚  ${deptIds.size} departman eklendi`);

  // 5. Tasks + per-person responsibility rows (task_member_completions).
  const taskIdByTitle = new Map<string, string>();
  let fracIndex: string | null = null;
  for (const task of TASKS) {
    fracIndex = generateKeyBetween(fracIndex, null);
    const dueDate = dueDates[task.due];
    const isDone = task.status === "done";
    const isReview = task.status === "review";
    const completedAt = isDone ? `${dueDate}T15:00:00Z` : null;
    const taskRes = await client.query<{ id: string }>(
      `insert into public.tasks (
         workspace_id, title, description, status, priority, due_date,
         department_id, assignee_id, created_by, fractional_index,
         approval_required, approval_status, completed_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       returning id`,
      [
        workspaceId,
        task.title,
        task.description,
        task.status,
        task.priority,
        dueDate,
        deptIds.get(task.department),
        userIds[task.responsible],
        userIds.elif,
        fracIndex,
        isReview,
        isReview ? "pending" : isDone ? "approved" : "none",
        completedAt,
      ],
    );
    const taskId = taskRes.rows[0].id;
    taskIdByTitle.set(task.title, taskId);
    created.push({ table: "tasks", id: taskId, label: `${task.title} [${task.status}]` });

    const responsiblePeople = [task.responsible, ...task.participants];
    for (const personKey of responsiblePeople) {
      const complRes = await client.query<{ id: string }>(
        `insert into public.task_member_completions (workspace_id, task_id, member_id, completed_at)
         values ($1, $2, $3, $4) returning id`,
        [workspaceId, taskId, memberIds[personKey], completedAt],
      );
      created.push({
        table: "task_member_completions",
        id: complRes.rows[0].id,
        label: `${task.title} → ${PEOPLE[personKey].fullName}`,
      });
    }
  }
  console.log(`✚  ${taskIdByTitle.size} görev + sorumluları eklendi`);

  // 6. Task notes (workflow types) — direct insert is demo-only; the app path
  //    (addTaskNoteWorkflow) also fans out notifications, intentionally skipped.
  for (const note of TASK_NOTES) {
    const taskId = taskIdByTitle.get(note.taskTitle);
    if (!taskId) throw new Error(`Not için görev bulunamadı: ${note.taskTitle}`);
    const task = TASKS.find((t) => t.title === note.taskTitle);
    const noteRes = await client.query<{ id: string }>(
      `insert into public.task_notes (
         workspace_id, task_id, author_id, content, note_type, due_date_at_note_time
       ) values ($1, $2, $3, $4, $5, $6) returning id`,
      [workspaceId, taskId, userIds[note.author], note.content, note.noteType, task ? dueDates[task.due] : null],
    );
    created.push({ table: "task_notes", id: noteRes.rows[0].id, label: `${note.taskTitle} · ${note.noteType}` });
  }
  console.log(`✚  ${TASK_NOTES.length} görev notu eklendi`);

  // 7. Rules.
  for (const [i, rule] of RULES.entries()) {
    const ruleRes = await client.query<{ id: string }>(
      `insert into public.workspace_rules (workspace_id, title, position, created_by)
       values ($1, $2, $3, $4) returning id`,
      [workspaceId, rule, i, userIds.elif],
    );
    created.push({ table: "workspace_rules", id: ruleRes.rows[0].id, label: rule.slice(0, 60) });
  }
  console.log(`✚  ${RULES.length} kural eklendi`);

  // 8. Weekly notes.
  for (const [i, note] of WEEKLY_NOTES.entries()) {
    const noteRes = await client.query<{ id: string }>(
      `insert into public.workspace_notes (workspace_id, title, body, position, created_by)
       values ($1, $2, $3, $4, $5) returning id`,
      [workspaceId, note.title, note.body, i, userIds.elif],
    );
    created.push({ table: "workspace_notes", id: noteRes.rows[0].id, label: note.title });
  }
  console.log(`✚  ${WEEKLY_NOTES.length} haftalık not eklendi`);

  console.log("\n✅  Demo workspace hazır.");
  console.log(`    Workspace ID : ${workspaceId}`);
  console.log(`    Giriş        : ${PEOPLE.elif.email} / ${DEMO_PASSWORD} (admin)`);
}

function writeLog(payload: {
  mode: "dry-run" | "execute";
  targetDb: string; // password-masked DSN — never log the raw URL
  committed: boolean;
  dueDates: Record<DueKey, string>;
  created: CreatedRecord[];
  reusedProfiles: { id: string; email: string }[];
}): string {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(LOG_DIR, `seed-log-${stamp}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        script: "seed-demo-workspace",
        timestamp: new Date().toISOString(),
        mode: payload.mode,
        target_db: payload.targetDb,
        committed: payload.committed,
        workspace_name: DEMO_WORKSPACE_NAME,
        team_name: DEMO_TEAM_NAME,
        due_dates: payload.dueDates,
        reused_profiles: payload.reusedProfiles,
        created_records: payload.created,
        planned_counts: {
          users: Object.keys(PEOPLE).length,
          departments: DEPARTMENTS.length,
          tasks: TASKS.length,
          task_notes: TASK_NOTES.length,
          rules: RULES.length,
          weekly_notes: WEEKLY_NOTES.length,
        },
      },
      null,
      2,
    ),
  );
  return path.relative(process.cwd(), file);
}

main().catch((err) => {
  console.error("\n❌  Beklenmeyen hata:", err);
  process.exit(1);
});
