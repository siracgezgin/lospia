"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Upload, FileText, CheckCircle2, AlertTriangle, CopyX, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { STATUS_LABELS } from "@/lib/utils/task-constants";
import {
  previewCsvImport, applyCsvImport,
  type CsvPreviewResult, type CsvApplyResult, type CsvPreviewRow,
} from "@/lib/actions/import";
import type { TaskStatus } from "@/types";

interface Props {
  onClose: () => void;
}

const VERDICT_STYLE: Record<CsvPreviewRow["verdict"], { label: string; cls: string }> = {
  new:       { label: "Yeni",       cls: "bg-green-50 text-green-700 border-green-200" },
  duplicate: { label: "Zaten var",  cls: "bg-amber-50 text-amber-700 border-amber-200" },
  invalid:   { label: "Hatalı",     cls: "bg-red-50 text-red-600 border-red-200" },
};

function statusLabel(s: string): string {
  return (STATUS_LABELS as Record<string, string>)[s as TaskStatus] ?? s;
}

/**
 * CSV içe aktarma — güvenli, iki aşamalı akış:
 *   1. Dosya seç → sunucu tarafında önizleme (dry-run, hiçbir şey yazılmaz)
 *   2. Onayla → yalnızca "Yeni" satırlar görev olarak eklenir
 * Mükerrer satırlar import_key ile yakalanır ve asla ikinci kez yazılmaz.
 * Dosya hiçbir yere yüklenmez/saklanmaz; yalnızca parse edilir.
 */
export function CsvImportModal({ onClose }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string>("");
  const [preview, setPreview] = useState<CsvPreviewResult | null>(null);
  const [result, setResult] = useState<CsvApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleFile(file: File | null) {
    setPreview(null);
    setResult(null);
    setError(null);
    if (!file) return;
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      setError("Lütfen bir CSV dosyası seçin (.csv). Excel dosyalarını (.xlsx) önce Excel'den 'CSV UTF-8' olarak dışa aktarın.");
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setCsvText(text);
      startTransition(async () => {
        const res = await previewCsvImport(text);
        if ("error" in res) { setError(res.error); setPreview(null); return; }
        setPreview(res);
      });
    };
    reader.onerror = () => setError("Dosya okunamadı. Lütfen tekrar deneyin.");
    reader.readAsText(file, "utf-8"); // Türkçe karakterler için UTF-8
  }

  function handleImport() {
    if (!preview || preview.counts.new === 0 || !csvText) return;
    setError(null);
    startTransition(async () => {
      const res = await applyCsvImport(csvText);
      if ("error" in res) { setError(res.error); return; }
      setResult(res);
      router.refresh(); // pull imported tasks into the board behind the modal
    });
  }

  const counts = preview?.counts;

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
          <h2 className="text-base font-semibold text-gray-900">CSV&apos;den içe aktar</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 rounded-lg p-1 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* ── Result report (final step) ─────────────────────────────────── */}
          {result ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 flex items-start gap-2.5">
                <CheckCircle2 size={18} className="text-green-600 mt-0.5 shrink-0" />
                <div className="text-sm text-green-800 space-y-0.5">
                  <p className="font-semibold">İçe aktarma tamamlandı.</p>
                  <p>{result.created} görev eklendi
                    {result.skippedDuplicate > 0 && <> · {result.skippedDuplicate} satır zaten vardı, atlandı</>}
                    {result.skippedInvalid > 0 && <> · {result.skippedInvalid} hatalı satır atlandı</>}.
                  </p>
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 space-y-1">
                  <p className="text-xs font-semibold text-red-700">{result.errors.length} satır eklenemedi:</p>
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-600">{e}</p>
                  ))}
                </div>
              )}
              <div className="flex justify-end">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Kapat
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* ── Step 1: file picker ─────────────────────────────────────── */}
              <div className="space-y-2">
                <p className="text-sm text-gray-600">
                  AFTeamWork formatındaki CSV dosyasını seçin. Sistem dosyayı önce
                  <span className="font-medium"> önizler</span>; siz onaylamadan hiçbir görev eklenmez.
                </p>
                <p className="text-xs text-gray-400">
                  Beklenen kolonlar:{" "}
                  <span className="font-mono bg-gray-100 px-1 py-0.5 rounded text-[10px]">İŞBİRLİĞİ · HEDEF · KONU · STRATEJİ · AKSİYON · BAŞARI</span>
                  {" "}— virgül veya noktalı virgül ayraçlı, Türkçe karakter destekli (UTF-8).
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={pending}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 px-4 py-6 text-sm text-gray-600 hover:border-blue-400 hover:text-blue-700 hover:bg-blue-50/40 transition-colors disabled:opacity-50"
                >
                  {pending && !preview ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                  {fileName ? `${fileName} — başka dosya seç` : "CSV dosyası seç"}
                </button>
              </div>

              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
              )}

              {/* ── Step 2: preview (dry-run) ──────────────────────────────── */}
              {preview && counts && (
                <>
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    {preview.format === "afr-af" && (
                      <span className="px-2 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 font-medium">
                        AFTeamWork formatı algılandı — KONU → başlık · HEDEF → departman · AKSİYON → teslim tarihi
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-50 border border-green-200 text-green-700 font-medium">
                      <CheckCircle2 size={12} /> {counts.new} yeni
                    </span>
                    {counts.duplicate > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 font-medium">
                        <CopyX size={12} /> {counts.duplicate} zaten var
                      </span>
                    )}
                    {counts.invalid > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-50 border border-red-200 text-red-600 font-medium">
                        <AlertTriangle size={12} /> {counts.invalid} hatalı
                      </span>
                    )}
                  </div>

                  <div className="overflow-x-auto border border-gray-200 rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-3 py-2 font-semibold text-gray-500">#</th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-500">Başlık</th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-500">Departman</th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-500">Teslim</th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-500">Durum</th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-500">Sonuç</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {preview.rows.map((row) => {
                          const v = VERDICT_STYLE[row.verdict];
                          return (
                            <tr key={row.rowNumber} className={cn("align-top", row.verdict === "invalid" && "bg-red-50/40")}>
                              <td className="px-3 py-2 text-gray-400 tabular-nums">{row.rowNumber}</td>
                              <td className="px-3 py-2 max-w-[220px]">
                                <p className="font-medium text-gray-900 truncate" title={row.title}>{row.title || "—"}</p>
                                {row.issues.length > 0 && (
                                  <p className="text-[10px] text-amber-700 mt-0.5 leading-snug">{row.issues.join(" ")}</p>
                                )}
                              </td>
                              <td className="px-3 py-2 max-w-[140px] truncate text-gray-500">
                                {row.departmentName ?? (row.category ? `${row.category} (eşleşmedi)` : "—")}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-gray-500">{row.dueDate ?? "—"}</td>
                              <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{statusLabel(row.status)}</td>
                              <td className="px-3 py-2">
                                <span className={cn("inline-block px-1.5 py-0.5 rounded border text-[10px] font-medium whitespace-nowrap", v.cls)}>
                                  {v.label}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                    <p className="text-xs text-gray-400">
                      Onaylamadan hiçbir şey yazılmaz. Yalnızca <span className="font-medium text-gray-600">{counts.new} yeni satır</span> içe aktarılacak.
                    </p>
                    <div className="flex items-center gap-2 ml-auto">
                      <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        İptal
                      </button>
                      <button
                        onClick={handleImport}
                        disabled={pending || counts.new === 0}
                        className={cn(
                          "flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                          pending || counts.new === 0
                            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                            : "bg-blue-600 text-white hover:bg-blue-700",
                        )}
                      >
                        {pending ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                        {pending ? "İçe aktarılıyor…" : `${counts.new} görevi içe aktar`}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
