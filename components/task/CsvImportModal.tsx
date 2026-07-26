"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Upload, FileText, CheckCircle2, AlertTriangle, CopyX, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/Button";
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
  new:       { label: "Yeni",       cls: "bg-success/10 text-success border-success/25" },
  duplicate: { label: "Zaten var",  cls: "bg-amber-50 text-amber-700 border-amber-200" },
  invalid:   { label: "Hatalı",     cls: "bg-danger/10 text-danger border-danger/25" },
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
      className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4"
      onClick={onClose}
    >
      <div
        className="anim-scale-in bg-surface rounded-modal border border-line shadow-drawer w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-hairline sticky top-0 bg-surface z-10">
          <h2 className="text-base font-semibold tracking-tight text-ink">CSV&apos;den içe aktar</h2>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="text-subtle hover:text-ink hover:bg-surface-muted active:scale-[0.98] rounded-lg p-1.5 transition-colors duration-150"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* ── Result report (final step) ─────────────────────────────────── */}
          {result ? (
            <div className="anim-fade-up space-y-4">
              <div className="rounded-xl border border-success/25 bg-success/10 px-4 py-3 flex items-start gap-2.5">
                <CheckCircle2 size={18} className="text-success mt-0.5 shrink-0" />
                <div className="text-sm text-green-800 space-y-0.5">
                  <p className="font-semibold">İçe aktarma tamamlandı.</p>
                  <p><span className="tabular-nums">{result.created}</span> görev eklendi
                    {result.skippedDuplicate > 0 && <> · <span className="tabular-nums">{result.skippedDuplicate}</span> satır zaten vardı, atlandı</>}
                    {result.skippedInvalid > 0 && <> · <span className="tabular-nums">{result.skippedInvalid}</span> hatalı satır atlandı</>}.
                  </p>
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 space-y-1">
                  <p className="text-xs font-semibold text-danger-strong">{result.errors.length} satır eklenemedi:</p>
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-xs text-danger">{e}</p>
                  ))}
                </div>
              )}
              <div className="flex justify-end">
                <Button onClick={onClose}>Kapat</Button>
              </div>
            </div>
          ) : (
            <>
              {/* ── Step 1: file picker ─────────────────────────────────────── */}
              <div className="space-y-2">
                <p className="text-sm text-muted">
                  AFTeamWork formatındaki CSV dosyasını seçin. Sistem dosyayı önce
                  <span className="font-medium"> önizler</span>; siz onaylamadan hiçbir görev eklenmez.
                </p>
                <p className="text-xs text-subtle">
                  Beklenen kolonlar:{" "}
                  <span className="font-mono bg-surface-sunken px-1 py-0.5 rounded text-[10px]">İŞBİRLİĞİ · HEDEF · KONU · STRATEJİ · AKSİYON · BAŞARI</span>
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
                  className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line-strong px-4 py-6 text-sm text-muted hover:border-brand-ring hover:text-brand-strong hover:bg-brand-soft/40 active:scale-[0.99] transition-all duration-150 disabled:opacity-60 disabled:pointer-events-none"
                >
                  {pending && !preview ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                  {fileName ? `${fileName} — başka dosya seç` : "CSV dosyası seç"}
                </button>
              </div>

              {error && (
                <p role="alert" className="anim-fade-down text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">{error}</p>
              )}

              {/* ── Step 2: preview (dry-run) ──────────────────────────────── */}
              {preview && counts && (
                <>
                  <div className="anim-fade-up flex items-center gap-2 flex-wrap text-xs">
                    {preview.format === "afr-af" && (
                      <span className="px-2 py-1 rounded-full bg-info/10 border border-info/25 text-info font-medium">
                        AFTeamWork formatı algılandı — KONU → başlık · HEDEF → departman · AKSİYON → teslim tarihi
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-success/10 border border-success/25 text-success font-medium tabular-nums">
                      <CheckCircle2 size={12} /> {counts.new} yeni
                    </span>
                    {counts.duplicate > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 font-medium tabular-nums">
                        <CopyX size={12} /> {counts.duplicate} zaten var
                      </span>
                    )}
                    {counts.invalid > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-danger/10 border border-danger/25 text-danger font-medium tabular-nums">
                        <AlertTriangle size={12} /> {counts.invalid} hatalı
                      </span>
                    )}
                  </div>

                  <div className="anim-fade-up overflow-x-auto border border-line rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="bg-surface-muted border-b border-line">
                        <tr>
                          <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">#</th>
                          <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">Başlık</th>
                          <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">Departman</th>
                          <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">Teslim</th>
                          <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">Durum</th>
                          <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">Sonuç</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hairline">
                        {preview.rows.map((row) => {
                          const v = VERDICT_STYLE[row.verdict];
                          return (
                            <tr
                              key={row.rowNumber}
                              className={cn(
                                "align-top transition-colors duration-150",
                                row.verdict === "invalid" ? "bg-danger/5 hover:bg-danger/10" : "hover:bg-surface-hover",
                              )}
                            >
                              <td className="px-3 py-2 text-subtle tabular-nums">{row.rowNumber}</td>
                              <td className="px-3 py-2 max-w-[220px]">
                                <p className="font-medium text-ink truncate" title={row.title}>{row.title || "—"}</p>
                                {row.issues.length > 0 && (
                                  <p className="text-[10px] text-amber-700 mt-0.5 leading-snug">{row.issues.join(" ")}</p>
                                )}
                              </td>
                              <td className="px-3 py-2 max-w-[140px] truncate text-muted">
                                {row.departmentName ?? (row.category ? `${row.category} (eşleşmedi)` : "—")}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-muted tabular-nums">{row.dueDate ?? "—"}</td>
                              <td className="px-3 py-2 text-muted whitespace-nowrap">{statusLabel(row.status)}</td>
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
                    <p className="text-xs text-subtle">
                      Onaylamadan hiçbir şey yazılmaz. Yalnızca <span className="font-medium text-muted tabular-nums">{counts.new} yeni satır</span> içe aktarılacak.
                    </p>
                    <div className="flex items-center gap-2 ml-auto">
                      <Button type="button" variant="ghost" onClick={onClose}>
                        İptal
                      </Button>
                      <Button
                        onClick={handleImport}
                        loading={pending}
                        disabled={counts.new === 0}
                      >
                        {!pending && <Upload size={14} />}
                        {pending ? "İçe aktarılıyor…" : `${counts.new} görevi içe aktar`}
                      </Button>
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
