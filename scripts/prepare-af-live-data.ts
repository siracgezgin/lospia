#!/usr/bin/env npx tsx
/**
 * Prepare AF Operasyon for live use.
 *
 * One controlled, idempotent, transactional operation that:
 *   1. Cleans test/dummy content (tasks, notes, activity, notifications, points).
 *   2. Upserts the real team people as workspace_contacts (no auth users — no email).
 *   3. Replaces workspace_rules from veri/AFR-AF  - KURALLAR.csv.
 *   4. Imports the real task list from veri/AFR-AF  - AFTeamWork.csv
 *      (done → done/Tamamlandı, open → ready/Yapılacak), with no historical points
 *      and no notification spam.
 *
 * Usage:
 *   # Cleanup-only — tasks are ALREADY imported on prod; remove test junk + refresh
 *   # rules/contacts/responsibles WITHOUT re-importing tasks (the normal case now):
 *   npm run prepare:af-live -- --cleanup-only --dry-run
 *   npm run prepare:af-live -- --cleanup-only --apply --confirm-live-af
 *
 *   # Full setup — also import the AFTeamWork tasks (only on an empty workspace):
 *   npm run prepare:af-live -- --dry-run
 *   npm run prepare:af-live -- --apply --confirm-live-af
 *
 * What cleanup does (never deletes real tasks — pattern-based candidate list only):
 *   - deletes only test/dummy tasks (ss, sss, test, deneme, "benim adım", …) whose
 *     titles match a junk pattern AND carry no import marker / due date / real body;
 *   - clears task_activity, task_activity_logs, notifications, points_ledger and
 *     workspace_notes for a clean live start;
 *   - replaces workspace_rules from KURALLAR.csv;
 *   - upserts the team people as workspace_contacts;
 *   - fills responsible_contact_id on existing real tasks from İŞBİRLİĞİ.
 *
 * Target:
 *   - Reads .env.local. NEXT_PUBLIC_SUPABASE_URL decides LOCAL vs REMOTE.
 *   - Direct Postgres connection (real BEGIN/COMMIT/ROLLBACK) via SUPABASE_DB_URL,
 *     defaulting to the standard local Supabase DSN when the API URL is 127.0.0.1.
 *   - For a remote/production DB, pass IMPORT_DB_URL=postgres://... explicitly.
 *
 * Safety:
 *   - --apply does nothing without --confirm-live-af.
 *   - Everything runs inside one transaction; any error rolls the whole thing back.
 *   - A JSON snapshot of every affected table is written to data/backups/ first.
 *   - Never runs `supabase db reset`. Never touches auth.users. Never deletes
 *     workspace_members / profiles. Never drops departments.
 *   - Re-running never duplicates: tasks carry custom_fields.import_key, rules and
 *     contacts are matched by normalized title / name.
 */
import { Client } from "pg";
import * as fs from "fs";
import * as path from "path";
import { generateKeyBetween } from "fractional-indexing";

// ── flags ─────────────────────────────────────────────────────────────────────
const ARGV = process.argv.slice(2);
const APPLY = ARGV.includes("--apply");
const DRY_RUN = !APPLY || ARGV.includes("--dry-run");
const CONFIRM = ARGV.includes("--confirm-live-af");
const INCLUDE_COLLECTION = ARGV.includes("--include-collection");
// --cleanup-only: the real AFTeamWork tasks are ALREADY imported on production.
// In this mode we never insert tasks — we only remove test/dummy junk, clear
// activity/notifications/points/notes, refresh rules, upsert contacts, and map
// responsible contacts onto the existing real tasks.
const CLEANUP_ONLY = ARGV.includes("--cleanup-only");

const WORKSPACE_NAME = "AF Operasyon";
const IMPORT_SOURCE = "af_live_import";
const VERI = path.join(process.cwd(), "veri");
const FILE_TEAMWORK = "AFR-AF  - AFTeamWork.csv";
const FILE_RULES = "AFR-AF  - KURALLAR.csv";
const FILE_COLLECTION = "AF_Work - Koleksiyon  (1).csv";

// ── people ──────────────────────────────────────────────────────────────────
// These people are stored as workspace_contacts ONLY — never auth.users / members.
//   • email  → workspace_contacts.email (real column; nullable text, no unique idx)
//   • birth  → PII: written to a local (git-ignored) report file only, NEVER the DB,
//              so it can't leak into the member UI (KVKK).
//   • role_label → the department/responsibility summary (job info, safe to show).
type Person = {
  canonical: string;
  aliases: string[];
  role_label: string;
  email?: string;
  birth?: string; // dd.mm.yyyy — local report only, never persisted to DB
  official: boolean; // listed in the team roster the user gave
};

const PEOPLE: Person[] = [
  { canonical: "Selen Ergül",    aliases: ["Selen"],                       email: "selennergul@gmail.com",      birth: "02.12.1989", official: true,
    role_label: "Kalite Kontrol · Visual Merchandising" },
  { canonical: "Kısmet Yalçın",  aliases: ["Kısmet", "Kismet"],            email: "kismetyalcin@ictur.com.tr",  birth: "18.10.1993", official: true,
    role_label: "Visual Merchandising" },
  { canonical: "Gül Özerdekli",  aliases: ["Gül", "Gul"],                  email: "g_ozerdekli@hotmail.com",    birth: "04.12.1989", official: true,
    role_label: "Üretim & Tedarik Zinciri · Üretim Planlama · Toptan Satış · Pazarlama" },
  { canonical: "Nisa Demireğer", aliases: ["Nisa"],                        email: "info@aslifilinta.com",       birth: "20.03.2000", official: true,
    role_label: "Satış & Ticaret · Aksesuar Tasarım · Satın Alma · Influencer" },
  { canonical: "Esin Topbaş",    aliases: ["Esin", "EF", "Esin Filinta"],  email: "filintaesin@gmail.com",      birth: "05.01.1961", official: true,
    role_label: "Numune Onay · Pazarlama & İletişim · Influencer" },
  { canonical: "Aslı Filinta",   aliases: ["AF", "Asli", "Aslı"],          official: true,
    role_label: "Creative Direction · VIP Müşteri İlişkileri · Marka / CEO" },
  { canonical: "Sıraç Gezgin",   aliases: ["Sıraç", "Sirac"],              official: true,
    role_label: "Sistem Kurulumu · Genel Koordinasyon" },
  { canonical: "Şeyda",          aliases: ["Seyda"],                       official: false,
    role_label: "Üretim (kalıp)" },
];

// HEDEF (operational area in the sheet) → workspace_departments.name
// Follows the mapping in the live-data brief; extras are inferred from the data.
const HEDEF_TO_DEPT: Record<string, string> = {
  "OPERASYON":        "Finans & Operasyon",
  "SİSTEM":           "Marka Yönetimi / CEO Katmanı",
  "SISTEM":           "Marka Yönetimi / CEO Katmanı",
  "ÜRETİM":           "Üretim & Tedarik Zinciri",
  "URETIM":           "Üretim & Tedarik Zinciri",
  "SATIN ALMA":       "Üretim & Tedarik Zinciri",
  "SİPARİŞ":          "Satış & Ticaret",
  "SIPARIS":          "Satış & Ticaret",
  "SATIŞ":            "Satış & Ticaret",
  "SATIS":            "Satış & Ticaret",
  "GÖRSEL DÜZENLEME": "Tasarım & Yaratıcı Yön",
  "GORSEL DUZENLEME": "Tasarım & Yaratıcı Yön",
  "TASARIM":          "Tasarım & Yaratıcı Yön",
  "UPCYCLE TASARIM":  "Tasarım & Yaratıcı Yön",
  "PAZARLAMA":        "Pazarlama & İletişim",
  "FİYAT ÇALIŞMA":   "Finans & Operasyon",
  "FIYAT CALISMA":    "Finans & Operasyon",
};

// ── helpers ───────────────────────────────────────────────────────────────────
function normalize(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/İ/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ALIAS_TO_CANON = new Map<string, string>();
for (const p of PEOPLE) {
  ALIAS_TO_CANON.set(normalize(p.canonical), p.canonical);
  for (const a of p.aliases) ALIAS_TO_CANON.set(normalize(a), p.canonical);
}
function canonPerson(raw: string): string | null {
  const n = normalize(raw);
  if (!n) return null;
  return ALIAS_TO_CANON.get(n) ?? null;
}

// Match an existing contact name (e.g. "Nisa Hanım", "Aslı Hanım") to a canonical
// person, tolerating Turkish honorifics. Conservative: only a full alias match or a
// single remaining token maps — multi-word names that aren't aliases stay untouched.
const HONORIFICS = /\b(hanim|hanimefendi|bey|bay|by|hn|abla|abi)\b/g;
function contactCanon(name: string): string | null {
  const stripped = normalize(name).replace(HONORIFICS, " ").replace(/\s+/g, " ").trim();
  if (!stripped) return null;
  if (ALIAS_TO_CANON.has(stripped)) return ALIAS_TO_CANON.get(stripped)!;
  const toks = stripped.split(" ");
  if (toks.length === 1 && ALIAS_TO_CANON.has(toks[0])) return ALIAS_TO_CANON.get(toks[0])!;
  return null;
}

const TR_MONTHS: Record<string, number> = {
  ocak: 1, subat: 2, mart: 3, nisan: 4, mayis: 5, haziran: 6,
  temmuz: 7, agustos: 8, eylul: 9, ekim: 10, kasim: 11, aralik: 12,
};
/** Parse "25 Haziran" | "30.06.2026" | "2026-06-30" → ISO date, default year 2026. */
function parseTrDate(raw: string): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  m = s.match(/^(\d{1,2})\s+([A-Za-zÇĞİÖŞÜçğıöşü]+)(?:\s+(\d{4}))?$/);
  if (m) {
    const mon = TR_MONTHS[normalize(m[2])];
    if (!mon) return null;
    const y = m[3] ?? "2026";
    return `${y}-${String(mon).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

type TaskStatus = "ready" | "in_progress" | "review" | "done";
function mapStatus(raw: string): { status: TaskStatus; done: boolean } {
  const n = normalize(raw);
  if (!n) return { status: "ready", done: false };
  if (n === "done" || n === "tamamlandi") return { status: "done", done: true };
  if (n.includes("devam") || n.includes("progress")) return { status: "in_progress", done: false };
  if (n.includes("onay") || n.includes("review")) return { status: "review", done: false };
  return { status: "ready", done: false };
}

// ── test/dummy task detection ─────────────────────────────────────────────────
// A task is a DELETE candidate only if it shows NO sign of being real AND its
// title matches an explicit junk value or a junk pattern. Real tasks (anything
// carrying an import marker, a due date, or a substantive description) are never
// candidates — even if their title happens to contain the word "test".
const EXPLICIT_JUNK = new Set([
  "benim adim", "test denme", "ss", "sss", "ssss", "sssss", "est", "test",
  "bentest", "kursadv", "test111", "aaaa", "aaa", "aa", "yeni gorev test",
  "yeni gorev", "deneme", "xxx", "asd", "asdf", "qwe", "qwer",
]);
const JUNK_REGEX: RegExp[] = [
  /^test\d*$/,        // test, test1, test111
  /^deneme\d*$/,      // deneme, deneme1
  /^benim adim/,      // "benim adım", "benim adım 2"
  /^yeni gorev/,      // "yeni gorev test"
  /kursadv/,          // bentest-style account names used while testing
  /bentest/,
  /^est$/,
  /^(.)\1{1,}$/,      // single character repeated: ss, sss, aaaa, xxxx
];

type DbTask = {
  id: string;
  title: string;
  status: string;
  created_at: string;
  created_by: string | null;
  visibility: string;
  due_date: string | null;
  description: string | null;
  responsible_contact_id: string | null;
  custom_fields: Record<string, unknown> | null;
};

function hasImportMarker(cf: Record<string, unknown> | null): boolean {
  if (!cf) return false;
  return Boolean(cf.source || cf.import_source || cf.import_key);
}

/** Returns a human reason string if the task is a test/dummy DELETE candidate, else null. */
function testTaskReason(t: DbTask): string | null {
  const n = normalize(t.title);
  if (!n) return "boş başlık";
  if (hasImportMarker(t.custom_fields)) return null;           // real import — protected
  if (t.due_date) return null;                                  // has a real due date — protected
  if ((t.description ?? "").trim().length > 40) return null;    // substantive content — protected
  if (EXPLICIT_JUNK.has(n)) return `explicit test başlığı`;
  for (const re of JUNK_REGEX) if (re.test(n)) return `test pattern ${re}`;
  return null;
}

// ── minimal RFC-4180 CSV parser (quotes, embedded newlines, commas) ───────────
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\r") {
      // ignore; handled by \n
    } else if (c === "\n") {
      row.push(field); field = ""; rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// ── parse sources ─────────────────────────────────────────────────────────────
type TaskRow = {
  source_row: number;
  import_key: string;
  title: string;
  description: string | null;
  hedef: string;
  due_date: string | null;
  due_raw: string;
  status: TaskStatus;
  done: boolean;
  collaborators: string[];          // canonical names
  unmatched_collaborators: string[]; // raw names that didn't resolve
  primary_responsible: string | null;
};

function firstSentence(s: string, max = 80): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastDot = cut.lastIndexOf(". ");
  return (lastDot > 20 ? cut.slice(0, lastDot + 1) : cut.trimEnd()) + "…";
}

function parseTeamWork(): TaskRow[] {
  const text = fs.readFileSync(path.join(VERI, FILE_TEAMWORK), "utf8");
  const rows = parseCsv(text);
  // rows[0..1] = description banner, rows[2..3] = two header lines, data from 4
  const data = rows.slice(4);
  const out: TaskRow[] = [];
  data.forEach((r, idx) => {
    const cells = [...r, "", "", "", "", "", ""].slice(0, 6).map((c) => (c ?? "").trim());
    const [collab, hedef, konu, strat, aksiyon, basari] = cells;
    if (![collab, hedef, konu, strat, aksiyon, basari].some((c) => c)) return; // blank row
    const rawPeople = collab.split(/[,\/]/).map((x) => x.trim()).filter(Boolean);
    const collaborators: string[] = [];
    const unmatched: string[] = [];
    for (const rp of rawPeople) {
      const c = canonPerson(rp);
      if (c) { if (!collaborators.includes(c)) collaborators.push(c); }
      else unmatched.push(rp);
    }
    const title = konu || (strat ? firstSentence(strat) : "(başlıksız görev)");
    const description = strat || null;
    const { status, done } = mapStatus(basari);
    const sourceRow = idx + 5; // human line number in the original file (1-based incl. headers)
    out.push({
      source_row: sourceRow,
      import_key: `${IMPORT_SOURCE}:${FILE_TEAMWORK}:${sourceRow}`,
      title,
      description,
      hedef,
      due_date: parseTrDate(aksiyon),
      due_raw: aksiyon,
      status,
      done,
      collaborators,
      unmatched_collaborators: unmatched,
      primary_responsible: collaborators[0] ?? null,
    });
  });
  return out;
}

type RuleRow = { category: string; title: string; position: number };
function parseRules(): RuleRow[] {
  const text = fs.readFileSync(path.join(VERI, FILE_RULES), "utf8");
  const rows = parseCsv(text);
  // header row 0: "OPERASYON KURALLARI", "", "ÜRETİM KURALLARI"
  const seen = new Set<string>();
  const out: RuleRow[] = [];
  let pos = 0;
  for (const r of rows.slice(1)) {
    const op = (r[0] ?? "").trim();
    const ur = (r[2] ?? "").trim();
    for (const [cat, title] of [["Operasyon", op], ["Üretim", ur]] as const) {
      if (!title) continue;
      const key = normalize(title);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ category: cat, title, position: pos++ });
    }
  }
  return out;
}

type Candidate = { source_row: number; title: string; notes: string };
function parseCollection(): Candidate[] {
  const text = fs.readFileSync(path.join(VERI, FILE_COLLECTION), "utf8");
  const rows = parseCsv(text);
  const header = rows[0].map((h) => h.trim());
  const idxOf = (name: string) => header.findIndex((h) => normalize(h).includes(normalize(name)));
  const cName = idxOf("Ürün Adı");
  const cFabric = idxOf("Kumaş");
  const cStatus = idxOf("Durum");
  const cColor = idxOf("Renk");
  const out: Candidate[] = [];
  rows.slice(1).forEach((r, idx) => {
    const name = (r[cName] ?? "").trim();
    if (!name || name === "0") return; // only rows with a meaningful product title
    const parts: string[] = [];
    const fabric = (r[cFabric] ?? "").trim();
    const status = (r[cStatus] ?? "").trim();
    const color = (r[cColor] ?? "").trim();
    if (fabric && fabric !== "0") parts.push(`Kumaş/Durum: ${fabric}`);
    if (status && status !== "0") parts.push(`Durum: ${status}`);
    if (color && color !== "0") parts.push(`Renk: ${color}`);
    out.push({ source_row: idx + 2, title: name, notes: parts.join("\n") });
  });
  return out;
}

// ── connection ────────────────────────────────────────────────────────────────
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

function resolveDbUrl(): { dsn: string; label: string; host: string; isLocal: boolean; apiUrl: string } {
  const local = loadDotEnvLocal();
  const apiUrl = local.NEXT_PUBLIC_SUPABASE_URL ?? "(unknown)";

  // 1. Full connection string (with password) wins — for a remote/production DB.
  const override = process.env.IMPORT_DB_URL || process.env.SUPABASE_DB_URL;
  if (override) {
    const host = (() => { try { return new URL(override).host; } catch { return override; } })();
    const isLocal = /127\.0\.0\.1|localhost/.test(host);
    return { dsn: override, label: isLocal ? "LOCAL" : "REMOTE", host, isLocal, apiUrl };
  }

  // 2. Password-only path: read the linked project's pooler URL and inject the
  //    password from SUPABASE_DB_PASSWORD so the secret stays in the shell env,
  //    never in the repo or in persistent command arguments.
  const pw = process.env.SUPABASE_DB_PASSWORD;
  const poolerPath = path.join(process.cwd(), "supabase", ".temp", "pooler-url");
  if (pw && fs.existsSync(poolerPath)) {
    const raw = fs.readFileSync(poolerPath, "utf8").trim();
    // raw form: postgresql://postgres.<ref>@<host>:<port>/postgres  (no password)
    const dsn = raw.replace(/:\/\/([^:@/]+)@/, (_m, user) => `://${user}:${encodeURIComponent(pw)}@`);
    const host = (() => { try { return new URL(dsn).host; } catch { return "(pooler)"; } })();
    return { dsn, label: "REMOTE", host, isLocal: false, apiUrl };
  }

  // 3. Default to local Supabase when the API URL is local.
  const apiHost = (() => { try { return new URL(apiUrl).hostname; } catch { return ""; } })();
  if (/127\.0\.0\.1|localhost/.test(apiHost)) {
    const dsn = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
    return { dsn, label: "LOCAL", host: "127.0.0.1:54322", isLocal: true, apiUrl };
  }
  console.error("❌  Could not derive a Postgres DSN.");
  console.error("    For production: set SUPABASE_DB_PASSWORD=… (uses the linked pooler URL),");
  console.error("    or set IMPORT_DB_URL=postgres://… explicitly.");
  process.exit(1);
}

// ── backup ────────────────────────────────────────────────────────────────────
async function backup(client: Client, wsId: string): Promise<string> {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dir = path.join(process.cwd(), "data", "backups", `af-live-backup-${ts}`);
  fs.mkdirSync(dir, { recursive: true });
  const wsScoped = [
    "tasks", "task_member_completions", "task_notes", "task_activity_logs",
    "task_activity", "notifications", "points_ledger", "time_entries",
    "task_attachments", "workspace_rules", "workspace_notes",
    "workspace_contacts", "workspace_members", "department_members",
  ];
  // task children join through tasks for the workspace filter
  const childOfTask = new Set([
    "task_member_completions", "task_notes", "task_activity_logs", "task_activity",
    "time_entries", "task_attachments",
  ]);
  for (const t of wsScoped) {
    let sql: string;
    if (childOfTask.has(t)) {
      sql = `select coalesce(json_agg(c), '[]'::json) from ${t} c
             where c.task_id in (select id from tasks where workspace_id = $1)`;
    } else {
      sql = `select coalesce(json_agg(c), '[]'::json) from ${t} c where c.workspace_id = $1`;
    }
    try {
      const res = await client.query(sql, [wsId]);
      fs.writeFileSync(path.join(dir, `${t}.json`), JSON.stringify(res.rows[0].coalesce, null, 2));
    } catch (e) {
      fs.writeFileSync(path.join(dir, `${t}.ERROR.txt`), String((e as Error).message));
    }
  }
  // profiles has no workspace_id — snapshot all (small) for completeness
  try {
    const res = await client.query(`select coalesce(json_agg(p), '[]'::json) from profiles p`);
    fs.writeFileSync(path.join(dir, "profiles.json"), JSON.stringify(res.rows[0].coalesce, null, 2));
  } catch { /* ignore */ }
  return dir;
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  const tasks = parseTeamWork();
  const rules = parseRules();
  const candidates = parseCollection();

  if (process.env.PARSE_ONLY) {
    console.log(JSON.stringify({
      taskCount: tasks.length,
      doneCount: tasks.filter((t) => t.done).length,
      ruleCount: rules.length,
      candidateCount: candidates.length,
      unparseableDates: tasks.filter((t) => t.due_raw && !t.due_date).map((t) => ({ row: t.source_row, raw: t.due_raw })),
      unmatchedPeople: [...new Set(tasks.flatMap((t) => t.unmatched_collaborators))],
      sampleTasks: tasks.slice(0, 3).map((t) => ({ title: t.title, due: t.due_date, status: t.status, resp: t.primary_responsible, collab: t.collaborators })),
      sampleDone: tasks.filter((t) => t.done).slice(0, 2).map((t) => ({ title: t.title, due: t.due_date })),
      sampleRules: rules.slice(0, 2).map((r) => `${r.category}: ${r.title.slice(0, 40)}…`),
      sampleCandidates: candidates.slice(0, 3).map((c) => c.title),
    }, null, 2));
    return;
  }

  if (APPLY && !CONFIRM) {
    console.error("❌  --apply requires --confirm-live-af. Refusing to write.");
    console.error("    npm run prepare:af-live -- --apply --confirm-live-af");
    process.exit(1);
  }

  const { dsn, label, host, isLocal, apiUrl } = resolveDbUrl();
  const client = new Client({
    connectionString: dsn,
    // Supabase requires TLS for remote connections; the pooler presents a cert
    // chain Node doesn't bundle, so don't hard-fail verification.
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });
  await client.connect();

  // workspace
  const wsRes = await client.query<{ id: string; name: string }>(
    `select id, name from workspaces order by created_at asc`,
  );
  if (wsRes.rowCount === 0) { console.error("❌  No workspace found."); process.exit(1); }
  const ws = wsRes.rows.find((w) => w.name === WORKSPACE_NAME) ?? wsRes.rows[0];

  // owner → created_by
  const ownerRes = await client.query<{ user_id: string }>(
    `select user_id from workspace_members where workspace_id = $1 and role = 'owner' limit 1`, [ws.id],
  );
  const createdBy = ownerRes.rows[0]?.user_id ?? null;

  // departments
  const deptRes = await client.query<{ id: string; name: string }>(
    `select id, name from workspace_departments where workspace_id = $1`, [ws.id],
  );
  const depts = deptRes.rows;
  function matchDept(hedef: string): string | null {
    const target = HEDEF_TO_DEPT[hedef.trim()] ?? HEDEF_TO_DEPT[normalize(hedef).toUpperCase()];
    if (target) {
      const nt = normalize(target);
      const d = depts.find((d) => normalize(d.name) === nt);
      if (d) return d.id;
    }
    const nh = normalize(hedef);
    const d = depts.find((d) => normalize(d.name) === nh)
      ?? depts.find((d) => normalize(d.name).includes(nh) || nh.includes(normalize(d.name)));
    return d?.id ?? null;
  }

  // ── plan / reporting ──────────────────────────────────────────────────────
  const banner = (s: string) => console.log(`\n${"─".repeat(4)} ${s} ${"─".repeat(Math.max(0, 60 - s.length))}`);
  console.log(`\n🎯  Target: ${label}  →  ${host}`);
  console.log(`    API URL (.env.local): ${apiUrl}`);
  console.log(`    Workspace: ${ws.name} (${ws.id})`);
  console.log(`    Mode: ${DRY_RUN ? "DRY-RUN (no writes)" : "APPLY"}`);
  console.log(`    created_by (owner): ${createdBy ?? "(none found)"}`);
  console.log(`    Departments in workspace: ${depts.length}`);
  console.log(`    Cleanup-only: ${CLEANUP_ONLY ? "YES (no task import)" : "no (will also import tasks)"}`);
  if (depts.length === 0 && !CLEANUP_ONLY) {
    console.error("\n❌  No departments found but task import was requested.");
    console.error("    Re-run with --cleanup-only to skip import, or create departments first. Aborting.");
    await client.end();
    process.exit(1);
  }
  if (depts.length === 0) console.warn("⚠   No departments found — responsible mapping continues; task import skipped.");

  const count = async (sql: string, params: unknown[] = [ws.id]) =>
    Number((await client.query<{ n: string }>(sql, params)).rows[0].n);

  // ── load every task and classify test-junk vs real ────────────────────────
  const allTasks = (await client.query<DbTask>(
    `select id, title, status, created_at, created_by, visibility, due_date,
            description, responsible_contact_id, custom_fields
       from tasks where workspace_id = $1 order by created_at`, [ws.id])).rows;
  const deleteCandidates = allTasks
    .map((t) => ({ t, reason: testTaskReason(t) }))
    .filter((x): x is { t: DbTask; reason: string } => x.reason !== null);
  const candidateIds = deleteCandidates.map((x) => x.t.id);
  const candidateIdSet = new Set(candidateIds);
  const preserved = allTasks.filter((t) => !candidateIdSet.has(t.id));
  const preservedByStatus = new Map<string, number>();
  for (const t of preserved) preservedByStatus.set(t.status, (preservedByStatus.get(t.status) ?? 0) + 1);

  // child rows that cascade-delete with the candidate tasks
  const idArr = candidateIds.length ? candidateIds : ["00000000-0000-0000-0000-000000000000"];
  const delNotesOfCandidates = await count(`select count(*) n from task_notes where task_id = any($1)`, [idArr]);
  const delComplOfCandidates = await count(`select count(*) n from task_member_completions where task_id = any($1)`, [idArr]);

  // workspace-wide live-start clears
  const wsTaskSub = `select id from tasks where workspace_id = $1`;
  const clrActivity = await count(`select count(*) n from task_activity where task_id in (${wsTaskSub})`);
  const clrActivityLogs = await count(`select count(*) n from task_activity_logs where task_id in (${wsTaskSub})`);
  const clrNotif = await count(`select count(*) n from notifications where workspace_id = $1`);
  const clrPoints = await count(`select count(*) n from points_ledger where workspace_id = $1`);
  const clrWsNotes = await count(`select count(*) n from workspace_notes where workspace_id = $1`);

  // existing contacts / rules / members
  const existingContacts = (await client.query<{ id: string; name: string; role_label: string | null; email: string | null }>(
    `select id, name, role_label, email from workspace_contacts where workspace_id = $1`, [ws.id])).rows;
  const existingRules = (await client.query<{ id: string; title: string; category: string | null }>(
    `select id, title, category from workspace_rules where workspace_id = $1`, [ws.id])).rows;
  const members = (await client.query<{ email: string; full_name: string | null }>(
    `select p.email, p.full_name from workspace_members m join profiles p on p.id = m.user_id
      where m.workspace_id = $1 order by m.role`, [ws.id])).rows;

  // responsible mapping plan: for each preserved task with no responsible contact,
  // resolve the primary person from (1) the task's own import metadata
  // (custom_fields.collaborators / original_owner — set by the earlier import) and
  // (2) failing that, an İŞBİRLİĞİ title match against the CSV.
  const csvRespByTitle = new Map<string, string>();
  for (const t of tasks) { if (!t.primary_responsible) continue; const n = normalize(t.title); if (!csvRespByTitle.has(n)) csvRespByTitle.set(n, t.primary_responsible); }
  function resolveResponsible(t: DbTask): string | null {
    const cf = t.custom_fields ?? {};
    const collab = Array.isArray(cf.collaborators) ? (cf.collaborators as unknown[]) : null;
    const owner = typeof cf.original_owner === "string" ? cf.original_owner : null;
    const firstRaw = (collab && collab.length ? String(collab[0]) : null) ?? (owner ? owner.split(/[,\/]/)[0] : null);
    return (firstRaw ? canonPerson(firstRaw) : null) ?? csvRespByTitle.get(normalize(t.title)) ?? null;
  }
  const respPlan: { taskId: string; title: string; person: string }[] = [];
  let respAlreadySet = 0;
  const respUnresolved: DbTask[] = [];
  for (const t of preserved) {
    if (t.responsible_contact_id) { respAlreadySet++; continue; }
    const person = resolveResponsible(t);
    if (person) respPlan.push({ taskId: t.id, title: t.title, person });
    else respUnresolved.push(t);
  }

  // department mapping outcome (only relevant when importing tasks)
  const unmappedHedef = new Set<string>();
  for (const t of tasks) { if (t.hedef && !matchDept(t.hedef)) unmappedHedef.add(t.hedef); }
  const badDates = tasks.filter((t) => t.due_raw && !t.due_date);

  // ── reporting ─────────────────────────────────────────────────────────────
  banner("DELETE CANDIDATES (test/dummy tasks)");
  console.log(`  ${deleteCandidates.length} task(s) flagged for deletion:`);
  const ymd = (v: unknown) => { try { return new Date(v as string).toISOString().slice(0, 10); } catch { return String(v); } };
  for (const { t, reason } of deleteCandidates) {
    console.log(`   • [${t.id}] "${t.title}"  status=${t.status}  created=${ymd(t.created_at)}` +
      `  by=${t.created_by ?? "null"}  vis=${t.visibility}  → ${reason}`);
  }

  banner("PRESERVED (real) tasks");
  console.log(`  total kept            : ${preserved.length}`);
  for (const [s, n] of [...preservedByStatus.entries()].sort()) console.log(`      ${s.padEnd(12)}: ${n}`);

  banner("CLEANUP — other tables");
  console.log(`  task_notes (of deleted)   : ${delNotesOfCandidates}`);
  console.log(`  task_member_completions   : ${delComplOfCandidates}`);
  console.log(`  task_activity (ALL ws)    : ${clrActivity}   (cleared for live start)`);
  console.log(`  task_activity_logs (ALL)  : ${clrActivityLogs}   (cleared for live start)`);
  console.log(`  notifications (ALL ws)    : ${clrNotif}   (cleared)`);
  console.log(`  points_ledger (ALL ws)    : ${clrPoints}   (cleared)`);
  console.log(`  workspace_notes (ALL ws)  : ${clrWsNotes}   (cleared)`);

  banner("RULES (from KURALLAR.csv)");
  console.log(`  current in DB : ${existingRules.length}`);
  console.log(`  to set        : ${rules.length}  (` +
    `${rules.filter((r) => r.category === "Operasyon").length} Operasyon, ` +
    `${rules.filter((r) => r.category === "Üretim").length} Üretim)`);

  banner("PEOPLE → workspace_contacts (upsert, no auth users)");
  for (const p of PEOPLE) {
    const match = existingContacts.find((c) => contactCanon(c.name) === p.canonical);
    const emailNote = p.email ? `email=${p.email}` : "email yok";
    const existingEmail = match?.email && match.email !== p.email ? ` (DB'de mevcut: ${match.email})` : "";
    console.log(`  ${match ? `update "${match.name}"→` : "insert            "}  ${p.canonical.padEnd(15)} — ${emailNote}${existingEmail}${p.official ? "" : "  (⚠ roster dışı)"}`);
  }

  banner("RESPONSIBLE mapping on existing real tasks (İŞBİRLİĞİ → contact)");
  const respByPerson = new Map<string, number>();
  for (const r of respPlan) respByPerson.set(r.person, (respByPerson.get(r.person) ?? 0) + 1);
  console.log(`  görev eşleşti (set edilecek)  : ${respPlan.length}`);
  for (const [person, n] of [...respByPerson.entries()].sort()) console.log(`        ${person.padEnd(15)}: ${n}`);
  console.log(`  zaten sorumlusu var (atlandı) : ${respAlreadySet}`);
  console.log(`  eşleşmeyen görev              : ${respUnresolved.length}`);
  if (respUnresolved.length) {
    console.log(`     eşleşmeyen başlıklar (ilk 12):`);
    for (const t of respUnresolved.slice(0, 12)) console.log(`       • "${t.title.slice(0, 70)}"`);
  }

  banner("SUSPECT contacts / members (review — NEVER auto-deleted)");
  const SUSPECT = /(^|[^a-z])test|deneme|asibirgolge|merkez|^a+$|^s+$|^x+$|benim adim/i;
  const suspectContacts = existingContacts.filter((c) => SUSPECT.test(normalize(c.name)));
  const suspectMembers = members.filter((m) => SUSPECT.test(m.email) || (m.full_name ? SUSPECT.test(normalize(m.full_name)) : false));
  console.log(`  contacts: ${suspectContacts.length}` + (suspectContacts.length ? "  → " + suspectContacts.map((c) => c.name).join(", ") : ""));
  console.log(`  members : ${suspectMembers.length}` + (suspectMembers.length ? "  → " + suspectMembers.map((m) => m.email).join(", ") : ""));

  if (!CLEANUP_ONLY) {
    banner("TASK IMPORT (AFTeamWork.csv) — full mode");
    console.log(`  rows: ${tasks.length}  done: ${tasks.filter((t) => t.done).length}  open: ${tasks.filter((t) => !t.done).length}`);
    console.log(`  unmapped HEDEF: ${unmappedHedef.size}` + (unmappedHedef.size ? "  → " + [...unmappedHedef].join(", ") : ""));
    console.log(`  unparseable dates: ${badDates.length}`);
  }

  // local (git-ignored) artefacts for the audit trail
  const outDir = path.join(process.cwd(), "data", "imports");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "cleanup_candidates.json"),
    JSON.stringify(deleteCandidates.map(({ t, reason }) => ({ id: t.id, title: t.title, status: t.status, created_at: t.created_at, reason })), null, 2));
  fs.writeFileSync(path.join(outDir, "af-people-birthdates.json"),
    JSON.stringify(PEOPLE.map((p) => ({ name: p.canonical, role: p.role_label, email: p.email ?? null, birth: p.birth ?? null })), null, 2));
  if (INCLUDE_COLLECTION || !CLEANUP_ONLY)
    fs.writeFileSync(path.join(outDir, "import_candidates.json"), JSON.stringify(candidates, null, 2));
  console.log(`\n  wrote data/imports/cleanup_candidates.json (${deleteCandidates.length})`);
  console.log(`  wrote data/imports/af-people-birthdates.json (PII — local only, git-ignored)`);

  if (!CLEANUP_ONLY && unmappedHedef.size > 0 && !DRY_RUN) {
    console.error("\n❌  Some HEDEF values map to no department. Fix HEDEF_TO_DEPT first. Aborting.");
    await client.end();
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log("\n(dry run — nothing was written)\n");
    await client.end();
    return;
  }

  // ── APPLY ────────────────────────────────────────────────────────────────
  console.log("\n📦  Backing up affected tables…");
  const backupDir = await backup(client, ws.id);
  console.log(`    → ${path.relative(process.cwd(), backupDir)}`);

  console.log("🔒  BEGIN transaction");
  await client.query("BEGIN");
  try {
    // 1. delete ONLY the flagged test/dummy tasks (children cascade)
    if (candidateIds.length) {
      await client.query(`delete from tasks where id = any($1) and workspace_id = $2`, [candidateIds, ws.id]);
    }
    // 2. workspace-wide live-start clears
    await client.query(`delete from task_activity where task_id in (${wsTaskSub})`, [ws.id]);
    await client.query(`delete from task_activity_logs where task_id in (${wsTaskSub})`, [ws.id]);
    await client.query(`delete from notifications where workspace_id = $1`, [ws.id]);
    await client.query(`delete from points_ledger where workspace_id = $1`, [ws.id]);
    await client.query(`delete from workspace_notes where workspace_id = $1`, [ws.id]);

    // 3. contacts (alias match → update, else insert). Build canonical→id map.
    const contactId = new Map<string, string>();
    for (const c of existingContacts) {
      const canon = contactCanon(c.name);
      if (canon && !contactId.has(canon)) contactId.set(canon, c.id);
    }
    for (const p of PEOPLE) {
      const existingId = contactId.get(p.canonical);
      if (existingId) {
        // coalesce email so we never overwrite an existing address with null
        await client.query(
          `update workspace_contacts
              set name = $1, role_label = $2, email = coalesce($3, email), updated_at = now()
            where id = $4`,
          [p.canonical, p.role_label, p.email ?? null, existingId]);
      } else {
        const ins = await client.query<{ id: string }>(
          `insert into workspace_contacts (workspace_id, name, role_label, email)
           values ($1, $2, $3, $4) returning id`,
          [ws.id, p.canonical, p.role_label, p.email ?? null]);
        contactId.set(p.canonical, ins.rows[0].id);
      }
    }

    // 4. rules — replace with canonical set (delete non-canonical, upsert by title)
    const canonRuleTitles = new Set(rules.map((r) => normalize(r.title)));
    for (const r of existingRules) {
      if (!canonRuleTitles.has(normalize(r.title))) await client.query(`delete from workspace_rules where id = $1`, [r.id]);
    }
    const existingRuleByTitle = new Map(existingRules.map((r) => [normalize(r.title), r.id]));
    for (const r of rules) {
      const ex = existingRuleByTitle.get(normalize(r.title));
      if (ex) {
        await client.query(
          `update workspace_rules set category = $1, position = $2, is_active = true, updated_at = now() where id = $3`,
          [r.category, r.position, ex]);
      } else {
        await client.query(
          `insert into workspace_rules (workspace_id, title, category, position, is_active, created_by)
           values ($1, $2, $3, $4, true, $5)`,
          [ws.id, r.title, r.category, r.position, createdBy]);
      }
    }

    // 5. responsible mapping on existing real tasks (fill only where empty)
    let respSet = 0;
    for (const r of respPlan) {
      const cid = contactId.get(r.person);
      if (!cid) continue;
      await client.query(
        `update tasks set responsible_contact_id = $1, updated_at = now()
           where id = $2 and responsible_contact_id is null`, [cid, r.taskId]);
      respSet++;
    }

    // 6. task import (skipped in cleanup-only mode)
    let created = 0, updated = 0;
    if (!CLEANUP_ONLY) {
      const existingImport = (await client.query<{ id: string; import_key: string; status: string; fractional_index: string | null }>(
        `select id, custom_fields->>'import_key' as import_key, status, fractional_index
           from tasks where workspace_id = $1 and custom_fields->>'source' = $2`, [ws.id, IMPORT_SOURCE])).rows;
      const byKey = new Map(existingImport.map((t) => [t.import_key, t]));
      const lastIdx = new Map<string, string | null>();
      for (const t of existingImport) {
        const cur = lastIdx.get(t.status) ?? null;
        if (t.fractional_index && (cur === null || t.fractional_index > cur)) lastIdx.set(t.status, t.fractional_index);
      }
      const nextIndex = (status: string): string => {
        const prev = lastIdx.get(status) ?? null;
        let idx: string;
        try { idx = generateKeyBetween(prev, null); } catch { idx = generateKeyBetween(null, null); }
        lastIdx.set(status, idx);
        return idx;
      };
      const importedAt = new Date().toISOString();
      const rowsToImport = INCLUDE_COLLECTION
        ? [...tasks, ...candidates.map<TaskRow>((c) => ({
            source_row: c.source_row, import_key: `${IMPORT_SOURCE}:${FILE_COLLECTION}:${c.source_row}`,
            title: c.title, description: c.notes || null, hedef: "ÜRETİM", due_date: null, due_raw: "",
            status: "ready" as const, done: false, collaborators: [], unmatched_collaborators: [], primary_responsible: null,
          }))]
        : tasks;
      for (const t of rowsToImport) {
        const deptId = matchDept(t.hedef);
        const respId = t.primary_responsible ? contactId.get(t.primary_responsible) ?? null : null;
        const custom_fields = {
          source: IMPORT_SOURCE, source_file: t.import_key.split(":")[1], source_row: t.source_row,
          import_key: t.import_key, imported_at: importedAt, original_status: t.done ? "done" : "",
          original_owner: t.collaborators.join(",") || null,
          collaborators: t.collaborators.length ? t.collaborators : undefined, category: t.hedef || undefined,
        };
        const completedAt = t.done ? (t.due_date ? `${t.due_date}T12:00:00Z` : importedAt) : null;
        const existing = byKey.get(t.import_key);
        if (existing) {
          await client.query(
            `update tasks set title=$1, description=$2, status=$3, due_date=$4, department_id=$5,
               responsible_contact_id=$6, tags=$7, custom_fields=$8, updated_at=now() where id=$9`,
            [t.title, t.description, t.status, t.due_date, deptId, respId, t.hedef ? [t.hedef] : [], JSON.stringify(custom_fields), existing.id]);
          updated++;
        } else {
          await client.query(
            `insert into tasks (workspace_id, title, description, status, priority, due_date, completed_at,
               department_id, responsible_contact_id, tags, custom_fields, fractional_index, created_by, visibility)
             values ($1,$2,$3,$4,'medium',$5,$6,$7,$8,$9,$10,$11,$12,'workspace')`,
            [ws.id, t.title, t.description, t.status, t.due_date, completedAt, deptId, respId,
             t.hedef ? [t.hedef] : [], JSON.stringify(custom_fields), nextIndex(t.status), createdBy]);
          created++;
        }
      }
    }

    await client.query("COMMIT");
    console.log("✅  COMMIT");
    banner("APPLY REPORT");
    console.log(`  test tasks deleted    : ${candidateIds.length}`);
    console.log(`  real tasks preserved  : ${preserved.length}`);
    console.log(`  task_activity cleared : ${clrActivity}`);
    console.log(`  activity_logs cleared : ${clrActivityLogs}`);
    console.log(`  notifications cleared : ${clrNotif}`);
    console.log(`  points cleared        : ${clrPoints}`);
    console.log(`  workspace_notes cleared: ${clrWsNotes}`);
    console.log(`  rules set             : ${rules.length}`);
    console.log(`  contacts upserted     : ${PEOPLE.length}`);
    console.log(`  responsible filled    : ${respSet}`);
    if (!CLEANUP_ONLY) console.log(`  tasks created/updated : ${created}/${updated}`);
    console.log(`  backup                : ${path.relative(process.cwd(), backupDir)}`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("\n❌  ROLLBACK — nothing was committed.");
    console.error("    " + (e as Error).message);
    await client.end();
    process.exit(1);
  }
  await client.end();
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
