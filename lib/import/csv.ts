/**
 * CSV import — shared, pure parsing/mapping helpers.
 *
 * Used by the server actions in lib/actions/import.ts. No Supabase, no React:
 * everything here is deterministic text-in / rows-out so it can be unit-tested
 * and reused (the one-time scripts in scripts/ share the same mapping rules).
 *
 * Supported layouts (headers are normalized, Turkish diacritics ignored):
 *   • AFTeamWork / AFR-AF:  İŞBİRLİĞİ · HEDEF · KONU · STRATEJİ · AKSİYON · BAŞARI
 *       KONU → title, HEDEF → kategori/departman, STRATEJİ → açıklama,
 *       AKSİYON → teslim tarihi, BAŞARI → durum, İŞBİRLİĞİ → iş birliği kişileri
 *   • Standart:  KONU · HEDEF · STRATEJİ · TESLİM TARİHİ · BAŞARI · İŞ BİRLİĞİ
 *       HEDEF → title, KONU → kategori
 */

import type { TaskStatus } from "@/types";

// ── Turkish/English diacritics stripper ───────────────────────────────────────

export function normStr(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/İ/g, "i").replace(/I/g, "i")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

// ── CSV tokenizer ─────────────────────────────────────────────────────────────
// Handles quoted fields (RFC 4180 style, "" escapes), CRLF, and auto-detects the
// delimiter (`,` `;` or tab) from the header line. Strips a UTF-8 BOM.

export function detectDelimiter(headerLine: string): "," | ";" | "\t" {
  const counts: Array<[",", number] | [";", number] | ["\t", number]> = [
    [",", (headerLine.match(/,/g) ?? []).length],
    [";", (headerLine.match(/;/g) ?? []).length],
    ["\t", (headerLine.match(/\t/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delim = detectDelimiter(firstLine);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field); field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }

  // Drop fully empty rows.
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

// ── Date parsing (TR + EN month names, US/EU/ISO numerics) ───────────────────

const MONTH_INDEX: Record<string, number> = {
  ocak: 0, subat: 1, mart: 2, nisan: 3, mayis: 4, haziran: 5,
  temmuz: 6, agustos: 7, eylul: 8, ekim: 9, kasim: 10, aralik: 11,
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8,
  oct: 9, nov: 10, dec: 11,
};

export function parseDateAny(raw: string): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;

  // "15 Haziran", "15 June 2026"
  const m1 = s.match(/^(\d{1,2})\s+([A-Za-zÀ-ɏĞğŞşİı]+)(?:\s+(\d{4}))?$/i);
  if (m1) {
    const day = parseInt(m1[1], 10);
    const month = MONTH_INDEX[normStr(m1[2]).replace(/\s/g, "")];
    const year = m1[3] ? parseInt(m1[3], 10) : new Date().getFullYear();
    if (!isNaN(day) && month !== undefined)
      return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // "5/25/2026" US format
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m2) return `${m2[3]}-${m2[1].padStart(2, "0")}-${m2[2].padStart(2, "0")}`;

  // "25.05.2026" EU format
  const m3 = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m3) return `${m3[3]}-${m3[2].padStart(2, "0")}-${m3[1].padStart(2, "0")}`;

  // ISO "2026-06-15" (slice a possible timestamp down to the date part)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  return null;
}

// ── Status mapping (BAŞARI / durum column) ────────────────────────────────────

const STATUS_NORM_MAP: Record<string, TaskStatus> = {
  done: "done", yapildi: "done", tamamlandi: "done", bitti: "done",
  bekliyor: "blocked", beklemede: "blocked",
  "devam ediyor": "in_progress", devam: "in_progress",
  baslamadi: "backlog", yapilacak: "ready",
  hazir: "ready", bloke: "blocked", incelemede: "review",
  "kontrol onay": "review", onay: "review", arsivlendi: "archived",
  backlog: "backlog", ready: "ready", in_progress: "in_progress",
  blocked: "blocked", review: "review", archived: "archived",
};

export function parseStatus(raw: string): TaskStatus {
  const key = normStr(raw).replace(/\s+/g, " ");
  return STATUS_NORM_MAP[key] ?? "ready";
}

// ── Header → field mapping ────────────────────────────────────────────────────

export type CsvFormat = "afr-af" | "standard";

function normaliseHeader(h: string): string {
  return normStr(h).replace(/\s/g, "");
}

export function detectFormat(rawHeaders: string[]): CsvFormat {
  const normed = rawHeaders.map(normaliseHeader);
  const hasAksiyon = normed.some((h) => h === "aksiyon");
  const hasIsbirligi = normed.some((h) => h === "isbirligi" || h.includes("birligi"));
  return hasAksiyon && hasIsbirligi ? "afr-af" : "standard";
}

// Standard: KONU→category, HEDEF→title
const STANDARD_COL_MAP: Record<string, string> = {
  konu: "category", hedef: "title", baslik: "title", gorev: "title",
  strateji: "description", aciklama: "description",
  teslimtarihi: "due_date", tarih: "due_date", sontarih: "due_date",
  basari: "status", durum: "status",
  isbirligi: "collaborators", sorumlu: "collaborators", kisi: "collaborators",
};

// AFR-AF / AFTeamWork: HEDEF→category, KONU→title (critical difference)
const AFR_AF_COL_MAP: Record<string, string> = {
  isbirligi: "collaborators", hedef: "category", konu: "title",
  strateji: "description", aksiyon: "due_date", basari: "status",
};

export function buildFieldMap(rawHeaders: string[], format: CsvFormat): Record<string, number> {
  const colMap = format === "afr-af" ? AFR_AF_COL_MAP : STANDARD_COL_MAP;
  const fieldToIdx: Record<string, number> = {};
  rawHeaders.forEach((h, i) => {
    const normed = normaliseHeader(h);
    const field = colMap[normed];
    if (field && !(field in fieldToIdx)) fieldToIdx[field] = i;
  });
  return fieldToIdx;
}

// AFR-AF sheets carry a second English helper-label row — skip it.
export function isHelperRow(cells: string[]): boolean {
  const joined = cells.join(" ").toLowerCase();
  return joined.includes("collab with") || joined.includes("focus area") ||
         joined.includes("kpis") || joined.includes("priorities");
}

export function splitCollaborators(raw: string): string[] {
  if (!raw?.trim()) return [];
  return raw.split(/[,/;]+/).map((s) => s.trim()).filter((s) => s.length > 0);
}

// ── Row model ─────────────────────────────────────────────────────────────────

export type CsvTaskRow = {
  rowNumber: number;            // 1-based line in the source file
  title: string;
  description: string | null;
  category: string;             // HEDEF / KONU — mapped to a department later
  dueDate: string | null;
  dueDateRaw: string;           // original cell for error reporting
  status: TaskStatus;
  collaborators: string[];
  importKey: string;            // stable duplicate guard (see below)
  issues: string[];             // per-row validation problems (empty = valid)
};

export type CsvParseResult = {
  format: CsvFormat;
  headers: string[];
  rows: CsvTaskRow[];
  unknownHeaders: string[];     // headers we could not map (informational)
};

// Stable FNV-1a hash over identity fields. Same title+due+category in a re-
// uploaded CSV → same key → the row is recognised as already imported.
export function importKeyFor(title: string, dueDate: string | null, category: string): string {
  const src = `${normStr(title)}|${dueDate ?? ""}|${normStr(category)}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `csv-${h.toString(16).padStart(8, "0")}-${src.length}`;
}

export function parseCsvTasks(text: string): CsvParseResult {
  const table = parseCsv(text);
  if (table.length < 2) {
    return { format: "standard", headers: table[0] ?? [], rows: [], unknownHeaders: [] };
  }

  const headers = table[0].map((h) => h.trim());
  const format = detectFormat(headers);
  const fieldIdx = buildFieldMap(headers, format);
  const mappedIdx = new Set(Object.values(fieldIdx));
  const unknownHeaders = headers.filter((h, i) => h && !mappedIdx.has(i));

  const rows: CsvTaskRow[] = [];
  for (let i = 1; i < table.length; i++) {
    const cells = table[i];
    if (isHelperRow(cells)) continue;
    const get = (f: string) => (fieldIdx[f] !== undefined ? cells[fieldIdx[f]]?.trim() ?? "" : "");

    const title = get("title");
    const dueDateRaw = get("due_date");
    const dueDate = parseDateAny(dueDateRaw);
    const category = get("category");

    // Skip rows that are entirely empty in mapped columns.
    if (!title && !get("description") && !category && !dueDateRaw) continue;

    const issues: string[] = [];
    if (!title) issues.push("Başlık (KONU) boş — satır içe aktarılamaz.");
    if (dueDateRaw && !dueDate) issues.push(`Tarih anlaşılamadı: "${dueDateRaw}"`);

    rows.push({
      rowNumber: i + 1,
      title,
      description: get("description") || null,
      category,
      dueDate,
      dueDateRaw,
      status: parseStatus(get("status")),
      collaborators: splitCollaborators(get("collaborators")),
      importKey: importKeyFor(title, dueDate, category),
      issues,
    });
  }

  return { format, headers, rows, unknownHeaders };
}

// ── HEDEF/kategori → departman adı eşlemesi ──────────────────────────────────
// Mirrors scripts/import-afr-af.ts (the canonical AFTeamWork translation).

export const HEDEF_TO_DEPT: Record<string, string> = {
  "ÜRETİM":           "Üretim & Tedarik Zinciri",
  "SATIN ALMA":       "Üretim & Tedarik Zinciri",
  "SİPARİŞ":          "Satış & Ticaret",
  "TASARIM":          "Tasarım & Yaratıcı Yön",
  "GÖRSEL DÜZENLEME": "Pazarlama & İletişim",
  "FİYAT ÇALIŞMA":   "Finans & Operasyon",
  "OPERASYON":        "Finans & Operasyon",
  "SİSTEM":           "Marka Yönetimi / CEO Katmanı",
};

export function matchDepartment(
  category: string,
  departments: { id: string; name: string }[],
): string | null {
  if (!category || departments.length === 0) return null;

  // 1. Explicit alias map — authoritative, checked first
  const targetName = HEDEF_TO_DEPT[category.trim().toLocaleUpperCase("tr-TR")]
    ?? HEDEF_TO_DEPT[category.trim()];
  if (targetName) {
    const nt = normStr(targetName);
    for (const d of departments) if (normStr(d.name) === nt) return d.id;
  }

  // 2. Exact normalized match
  const nc = normStr(category);
  for (const d of departments) if (normStr(d.name) === nc) return d.id;

  // 3. Substring fallback
  for (const d of departments) {
    const nd = normStr(d.name);
    if (nd.includes(nc) || nc.includes(nd)) return d.id;
  }

  return null;
}
