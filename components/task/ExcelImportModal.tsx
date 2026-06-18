"use client";

import { useState, useTransition } from "react";
import { X, Upload } from "lucide-react";
import { createTask } from "@/lib/actions/tasks";
import { STATUS_LABELS } from "@/lib/utils/task-constants";
import { cn } from "@/lib/utils/cn";
import type { TaskStatus, WorkspaceContact } from "@/types";

interface Props {
  onClose: () => void;
  workspaceId: string;
  contacts: WorkspaceContact[];
}

// ── Turkish/English diacritics stripper ───────────────────────────────────────

function normStr(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/İ/g, "i").replace(/I/g, "i")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

// ── Month look-up (Turkish + English) ────────────────────────────────────────

const MONTH_INDEX: Record<string, number> = {
  ocak: 0, subat: 1, mart: 2, nisan: 3, mayis: 4, haziran: 5,
  temmuz: 6, agustos: 7, eylul: 8, ekim: 9, kasim: 10, aralik: 11,
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8,
  oct: 9, nov: 10, dec: 11,
};

function parseDateAny(raw: string): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;

  // "15 June", "15 Haziran", "15 June 2026"
  const m1 = s.match(/^(\d{1,2})\s+([A-Za-zÀ-ɏĞğŞşİı]+)(?:\s+(\d{4}))?$/i);
  if (m1) {
    const day = parseInt(m1[1], 10);
    const month = MONTH_INDEX[normStr(m1[2]).replace(/\s/g, "")];
    const year = m1[3] ? parseInt(m1[3], 10) : 2026;
    if (!isNaN(day) && month !== undefined)
      return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // "5/25/2026" US format
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m2) return `${m2[3]}-${m2[1].padStart(2, "0")}-${m2[2].padStart(2, "0")}`;

  // "25.05.2026" EU format
  const m3 = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m3) return `${m3[3]}-${m3[2].padStart(2, "0")}-${m3[1].padStart(2, "0")}`;

  // ISO "2026-06-15"
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  return null;
}

// ── Status mapping ────────────────────────────────────────────────────────────

const STATUS_NORM_MAP: Record<string, TaskStatus> = {
  done: "done", yapildi: "done", tamamlandi: "done",
  bekliyor: "blocked", beklemede: "blocked",
  "devam ediyor": "in_progress", devam: "in_progress",
  baslamadi: "backlog",
  hazir: "ready", bloke: "blocked", incelemede: "review", arsivlendi: "archived",
  backlog: "backlog", ready: "ready", in_progress: "in_progress",
  blocked: "blocked", review: "review", archived: "archived",
};

function parseStatus(raw: string): TaskStatus {
  const key = normStr(raw).replace(/\s+/g, " ");
  return STATUS_NORM_MAP[key] ?? "backlog";
}

// ── Format detection ──────────────────────────────────────────────────────────

type ImportFormat = "afr-af" | "standard";

function normaliseHeader(h: string): string {
  return normStr(h).replace(/\s/g, "");
}

function detectFormat(rawHeaders: string[]): ImportFormat {
  const normed = rawHeaders.map(normaliseHeader);
  const hasAksiyon = normed.some(h => h === "aksiyon");
  const hasIsbirligi = normed.some(h => h === "isbirligi" || h.includes("birligi"));
  return hasAksiyon && hasIsbirligi ? "afr-af" : "standard";
}

// ── Column maps ───────────────────────────────────────────────────────────────

// Standard: KONU→category, HEDEF→title
const STANDARD_COL_MAP: Record<string, string> = {
  konu: "category", hedef: "title", strateji: "description",
  teslimtarihi: "due_date", basari: "status", isbirligi: "collaborators",
};

// AFR-AF: HEDEF→category, KONU→title (CRITICAL distinction from standard)
const AFR_AF_COL_MAP: Record<string, string> = {
  isbirligi: "collaborators", hedef: "category", konu: "title",
  strateji: "description", aksiyon: "due_date", basari: "status",
};

function buildFieldMap(rawHeaders: string[], format: ImportFormat): Record<string, number> {
  const colMap = format === "afr-af" ? AFR_AF_COL_MAP : STANDARD_COL_MAP;
  const fieldToIdx: Record<string, number> = {};
  rawHeaders.forEach((h, i) => {
    const normed = normaliseHeader(h);
    const field = colMap[normed];
    if (field && !(field in fieldToIdx)) fieldToIdx[field] = i;
  });
  return fieldToIdx;
}

// ── Helper-row detection (AFR-AF second row of labels) ────────────────────────

function isHelperRow(cells: string[]): boolean {
  const joined = cells.join(" ").toLowerCase();
  return joined.includes("collab with") || joined.includes("focus area") ||
         joined.includes("kpis") || joined.includes("priorities");
}

// ── Collaborator splitting ────────────────────────────────────────────────────

function splitCollaborators(raw: string): string[] {
  if (!raw?.trim()) return [];
  return raw.split(/[,/;]+/).map(s => s.trim()).filter(s => s.length > 0);
}

// ── Row type + parser ─────────────────────────────────────────────────────────

type ParsedRow = {
  title: string;
  description: string;
  category: string;
  due_date: string | null;
  status: TaskStatus;
  collaborators: string[];
};

function parseTabText(text: string): { format: ImportFormat; rows: ParsedRow[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { format: "standard", rows: [] };

  const rawHeaders = lines[0].split("\t");
  const format = detectFormat(rawHeaders);
  const fieldIdx = buildFieldMap(rawHeaders, format);

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split("\t");
    if (isHelperRow(cells)) continue;
    const get = (f: string) => (fieldIdx[f] !== undefined ? cells[fieldIdx[f]]?.trim() ?? "" : "");
    const title = get("title");
    if (!title) continue;
    rows.push({
      title,
      description: get("description"),
      category: get("category"),
      due_date: parseDateAny(get("due_date")),
      status: parseStatus(get("status")),
      collaborators: splitCollaborators(get("collaborators")),
    });
  }

  return { format, rows };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ExcelImportModal({ onClose, workspaceId, contacts }: Props) {
  const [pasteText, setPasteText] = useState("");
  const [parsed, setParsed] = useState<{ format: ImportFormat; rows: ParsedRow[] } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [importResult, setImportResult] = useState<{ success: number; errors: string[] } | null>(null);

  void contacts; // available for future contact-matching enhancement

  function handleParse() {
    setParsed(parseTabText(pasteText));
    setImportResult(null);
  }

  function handleImport() {
    if (!parsed || parsed.rows.length === 0) return;
    setImportResult(null);

    startTransition(async () => {
      let success = 0;
      const errors: string[] = [];

      for (const row of parsed.rows) {
        const customFields: Record<string, unknown> = {};
        if (row.category) customFields.category = row.category;
        if (row.collaborators.length > 0) customFields.collaborators = row.collaborators;

        const result = await createTask({
          workspace_id: workspaceId,
          title: row.title,
          description: row.description || undefined,
          status: row.status,
          priority: "medium",
          assignee_id: null,
          due_date: row.due_date,
          start_date: null,
          tags: row.category ? [row.category] : [],
          custom_fields: customFields,
        });

        if ("error" in result) {
          errors.push(`"${row.title}": ${result.error}`);
        } else {
          success++;
        }
      }

      setImportResult({ success, errors });
      if (errors.length === 0) onClose();
    });
  }

  const rows = parsed?.rows ?? [];
  const format = parsed?.format;
  const isParsed = parsed !== null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="text-base font-semibold text-gray-900">Excel&apos;den içe aktar</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 rounded-lg p-1 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="space-y-1">
            <p className="text-sm text-gray-500">Excel&apos;den kopyalanan hücreleri buraya yapıştırın. Format otomatik algılanır.</p>
            <p className="text-xs text-gray-400">
              <span className="font-medium">Standart:</span>{" "}
              <span className="font-mono bg-gray-100 px-1 py-0.5 rounded text-[10px]">KONU · HEDEF · STRATEJİ · TESLİM TARİHİ · BAŞARI · İŞ BİRLİĞİ</span>
            </p>
            <p className="text-xs text-gray-400">
              <span className="font-medium">AFR-AF:</span>{" "}
              <span className="font-mono bg-gray-100 px-1 py-0.5 rounded text-[10px]">İŞBİRLİĞİ · HEDEF · KONU · STRATEJİ · AKSİYON · BAŞARI</span>
            </p>
          </div>

          <textarea
            value={pasteText}
            onChange={e => { setPasteText(e.target.value); setParsed(null); }}
            rows={6}
            placeholder="Excel verilerini buraya yapıştırın (Ctrl+V / Cmd+V)..."
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <button
            onClick={handleParse}
            disabled={!pasteText.trim()}
            className={cn(
              "px-4 py-2 text-sm rounded-lg transition-colors",
              !pasteText.trim()
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-gray-800 text-white hover:bg-gray-900"
            )}
          >
            Önizle
          </button>

          {isParsed && rows.length === 0 && (
            <p className="text-sm text-red-600">
              Geçerli satır bulunamadı. İlk satırın sütun başlıklarını içerdiğinden emin olun.
            </p>
          )}

          {rows.length > 0 && (
            <>
              {format === "afr-af" && (
                <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                  <span className="text-xs font-medium text-blue-700">AFR-AF operasyon formatı algılandı</span>
                  <span className="text-xs text-blue-500">— KONU → başlık · HEDEF → kategori · AKSİYON → son tarih</span>
                </div>
              )}

              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">Başlık</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">Kategori</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">Açıklama</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">Son tarih</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">Durum</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">İş birliği</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 max-w-[180px] truncate font-medium text-gray-900">{row.title}</td>
                        <td className="px-3 py-2 max-w-[120px] truncate text-gray-500">{row.category || "—"}</td>
                        <td className="px-3 py-2 max-w-[140px] truncate text-gray-400 italic text-[11px]">{row.description || "—"}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-500">{row.due_date ?? "—"}</td>
                        <td className="px-3 py-2 text-gray-500">{STATUS_LABELS[row.status]}</td>
                        <td className="px-3 py-2 max-w-[120px] truncate text-gray-500">{row.collaborators.join(", ") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-gray-400">{rows.length} satır içe aktarılacak</p>

              {importResult && importResult.errors.length > 0 && (
                <div className="bg-red-50 rounded-lg px-4 py-3 space-y-1">
                  <p className="text-xs font-semibold text-red-700">
                    {importResult.success} başarılı, {importResult.errors.length} hata:
                  </p>
                  {importResult.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-600">{e}</p>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  İptal
                </button>
                <button
                  onClick={handleImport}
                  disabled={isPending}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                    isPending
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  )}
                >
                  <Upload size={14} />
                  {isPending ? "İçe aktarılıyor…" : `${rows.length} görevi içe aktar`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
