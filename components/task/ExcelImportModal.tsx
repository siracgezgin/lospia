"use client";

import { useState, useTransition } from "react";
import { X, Upload } from "lucide-react";
import { createTask } from "@/lib/actions/tasks";
import { cn } from "@/lib/utils/cn";
import type { TaskStatus, WorkspaceContact } from "@/types";

interface Props {
  onClose: () => void;
  workspaceId: string;
  contacts: WorkspaceContact[];
}

// Turkish month names → 0-based month index
const TURKISH_MONTHS: Record<string, number> = {
  Ocak: 0, Şubat: 1, Mart: 2, Nisan: 3, Mayıs: 4, Haziran: 5,
  Temmuz: 6, Ağustos: 7, Eylül: 8, Ekim: 9, Kasım: 10, Aralık: 11,
};

function parseTurkishDate(raw: string): string | null {
  const str = raw?.trim();
  if (!str) return null;
  const parts = str.split(/\s+/);
  if (parts.length < 2) return null;
  const day = parseInt(parts[0], 10);
  const month = TURKISH_MONTHS[parts[1]];
  if (isNaN(day) || month === undefined) return null;
  const year = parts.length >= 3 ? parseInt(parts[2], 10) : new Date().getFullYear();
  const d = new Date(year, month, day);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

const TURKISH_TO_STATUS: Record<string, TaskStatus> = {
  beklemede: "backlog",
  hazır: "ready",
  "devam ediyor": "in_progress",
  bloke: "blocked",
  incelemede: "review",
  tamamlandı: "done",
  arşivlendi: "archived",
};

function parseStatus(raw: string): TaskStatus {
  const key = (raw ?? "").trim().toLowerCase();
  return TURKISH_TO_STATUS[key] ?? "backlog";
}

// Expected column header aliases (case-insensitive)
const COL_MAP: Record<string, string> = {
  konu: "category",
  hedef: "title",
  strateji: "description",
  strateji̇: "description", // with dotted i
  "teslim tarihi": "due_date",
  "teslim tari̇hi̇": "due_date",
  başari: "status",
  "başarı": "status",
  "i̇ş bi̇rli̇ği̇": "collaborators",
  "iş birliği": "collaborators",
  "iş bi̇rli̇ği̇": "collaborators",
};

function normalizeHeader(h: string): string {
  const lower = h.trim().toLowerCase();
  return COL_MAP[lower] ?? lower;
}

type ParsedRow = {
  title: string;
  description: string;
  category: string;
  due_date: string | null;
  status: TaskStatus;
  collaborators: string[];
  raw: Record<string, string>;
};

function parseExcelText(text: string, contactNames: Set<string>): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split("\t").map(normalizeHeader);

  return lines.slice(1).map((line) => {
    const cells = line.split("\t");
    const raw: Record<string, string> = {};
    headers.forEach((h, i) => {
      raw[h] = cells[i]?.trim() ?? "";
    });

    const collaboratorRaw = raw.collaborators ?? "";
    const collaborators = collaboratorRaw
      .split(/[,،;،\s]+/)
      .map((n) => n.trim())
      .filter((n) => n.length > 0 && (contactNames.has(n) || n.length <= 50));

    return {
      title: raw.title ?? "",
      description: raw.description ?? "",
      category: raw.category ?? "",
      due_date: parseTurkishDate(raw.due_date ?? ""),
      status: parseStatus(raw.status ?? ""),
      collaborators,
      raw,
    };
  }).filter((r) => r.title.trim().length > 0);
}

export function ExcelImportModal({ onClose, workspaceId, contacts }: Props) {
  const [pasteText, setPasteText] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [isParsed, setIsParsed] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [importResult, setImportResult] = useState<{ success: number; errors: string[] } | null>(null);

  const contactNames = new Set(contacts.map((c) => c.name));

  function handleParse() {
    const parsed = parseExcelText(pasteText, contactNames);
    setRows(parsed);
    setIsParsed(true);
    setImportResult(null);
  }

  function handleImport() {
    if (rows.length === 0) return;
    setImportResult(null);

    startTransition(async () => {
      let success = 0;
      const errors: string[] = [];

      for (const row of rows) {
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
      if (errors.length === 0) {
        onClose();
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="text-base font-semibold text-gray-900">Excel&apos;den içe aktar</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 rounded-lg p-1 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-500">
            Excel&apos;den kopyalanan hücreleri buraya yapıştırın. Beklenen sütunlar:{" "}
            <span className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">
              KONU · HEDEF · STRATEJİ · TESLİM TARİHİ · BAŞARI · İŞ BİRLİĞİ
            </span>
          </p>

          <textarea
            value={pasteText}
            onChange={(e) => { setPasteText(e.target.value); setIsParsed(false); setRows([]); }}
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
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">Başlık</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">Açıklama</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">Kategori</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">Teslim</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">Durum</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">İş birliği</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 max-w-[180px] truncate font-medium text-gray-900">{row.title}</td>
                        <td className="px-3 py-2 max-w-[160px] truncate text-gray-500">{row.description || "—"}</td>
                        <td className="px-3 py-2 text-gray-500">{row.category || "—"}</td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{row.due_date ?? "—"}</td>
                        <td className="px-3 py-2 text-gray-500">{row.status}</td>
                        <td className="px-3 py-2 text-gray-500">{row.collaborators.join(", ") || "—"}</td>
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
