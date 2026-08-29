"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, CheckCircle2, AlertTriangle, CopyX, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/Button";
import { Overlay } from "@/components/ui/Overlay";
import { STATUS_LABELS } from "@/lib/utils/task-constants";
import {
  previewCsvImport, applyCsvImport,
  type CsvPreviewResult, type CsvApplyResult, type CsvPreviewRow,
} from "@/lib/actions/import";
import type { TaskStatus } from "@/types";

interface Props {
  onClose: () => void;
}

/* Satır sonucu rozeti — üç ton, hepsi durum token'ından (yeşil yalnız
   "yeni eklenecek" için; "zaten var" uyarı, "hatalı" tehlike). */
const VERDICT_STYLE: Record<CsvPreviewRow["verdict"], { label: string; cls: string }> = {
  new:       { label: "Yeni",       cls: "bg-success/10 text-success border-success/25" },
  duplicate: { label: "Zaten var",  cls: "bg-warning/10 text-warning border-warning/30" },
  invalid:   { label: "Hatalı",     cls: "bg-danger/10 text-danger border-danger/25" },
};

const TH = "text-left px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle whitespace-nowrap";

/* Sunucudan gelen hata bazen ham Postgres/İngilizce metindir. Kullanıcıya
   Türkçe, ne yapacağını söyleyen cümle gösterilir; teknik metin konsola düşer. */
const TECHNICAL_ERROR = /duplicate key|violates|permission denied|jwt|pgrst|relation|column|null value|syntax|invalid input|not authenticated|not found|fetch failed|network|unexpected/i;
function friendlyError(msg: string, fallback: string): string {
  if (!msg || TECHNICAL_ERROR.test(msg)) {
    if (msg) console.error("[csvImport]", msg);
    return fallback;
  }
  return msg;
}

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
        if ("error" in res) {
          setError(friendlyError(res.error, "Dosya okunamadı. Sütun başlıklarını kontrol edip tekrar deneyin."));
          setPreview(null);
          return;
        }
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
      if ("error" in res) {
        setError(friendlyError(res.error, "İçe aktarma tamamlanamadı. Lütfen tekrar deneyin."));
        return;
      }
      setResult(res);
      router.refresh(); // pull imported tasks into the board behind the modal
    });
  }

  const counts = preview?.counts;

  // Alt çubuk adıma göre: sonuç → Kapat; önizleme → Vazgeç + tek primary.
  const footer = result ? (
    <Button onClick={onClose}>Kapat</Button>
  ) : preview && counts ? (
    <>
      <Button type="button" variant="ghost" onClick={onClose}>Vazgeç</Button>
      <Button onClick={handleImport} loading={pending} disabled={counts.new === 0}>
        {!pending && <Upload size={14} aria-hidden />}
        {counts.new} görevi içe aktar
      </Button>
    </>
  ) : (
    <Button type="button" variant="ghost" onClick={onClose}>Vazgeç</Button>
  );

  return (
    <Overlay open onClose={onClose} title="CSV’den içe aktar" size="lg" footer={footer}>
      <div className="space-y-4">
        {/* ── Result report (final step) ─────────────────────────────────── */}
        {result ? (
          <div className="anim-fade-up space-y-4">
            <div className="rounded-card border border-success/25 bg-success/10 px-4 py-3 flex items-start gap-2.5">
              <CheckCircle2 size={18} className="text-success mt-0.5 shrink-0" aria-hidden />
              <div className="text-[13.5px] leading-relaxed text-ink space-y-0.5">
                <p className="font-semibold">İçe aktarma tamamlandı.</p>
                <p><span className="tabular-nums">{result.created}</span> görev eklendi
                  {result.skippedDuplicate > 0 && <> · <span className="tabular-nums">{result.skippedDuplicate}</span> satır zaten vardı, atlandı</>}
                  {result.skippedInvalid > 0 && <> · <span className="tabular-nums">{result.skippedInvalid}</span> hatalı satır atlandı</>}.
                </p>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="rounded-card border border-danger/25 bg-danger/10 px-4 py-3 space-y-1">
                <p className="text-[12.5px] font-semibold text-danger-strong">{result.errors.length} satır eklenemedi:</p>
                {result.errors.map((e, i) => (
                  <p key={i} className="text-[12.5px] text-danger">{e}</p>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* ── Step 1: file picker ─────────────────────────────────────── */}
            <div className="space-y-2">
              <p className="text-[13.5px] leading-relaxed text-muted">
                AFTeamWork formatındaki CSV dosyasını seçin. Sistem dosyayı önce
                <span className="font-medium text-ink"> önizler</span>; siz onaylamadan hiçbir görev eklenmez.
              </p>
              <p className="text-[12.5px] leading-relaxed text-subtle">
                Beklenen kolonlar:{" "}
                <span className="font-mono bg-surface-sunken px-1 py-0.5 rounded text-[12px]">İŞBİRLİĞİ · HEDEF · KONU · STRATEJİ · AKSİYON · BAŞARI</span>
                {" "}— virgül veya noktalı virgül ayraçlı, Türkçe karakter destekli (UTF-8).
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
              {/* Dosya bırakma alanı — kesikli çerçeve; ilk adımın tek eylemi. */}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={pending}
                className="w-full flex items-center justify-center gap-2 rounded-card border-2 border-dashed border-line-strong px-4 py-6 text-[13.5px] font-medium text-muted hover:border-brand-ring hover:text-brand-strong hover:bg-brand-soft/40 active:scale-[0.99] transition-colors duration-150 disabled:pointer-events-none disabled:text-subtle"
              >
                {pending && !preview ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <FileText size={16} aria-hidden />}
                {fileName ? `${fileName} — başka dosya seç` : "CSV dosyası seç"}
              </button>
            </div>

            {error && (
              <p role="alert" className="anim-fade-down text-[12.5px] text-danger bg-danger/10 border border-danger/20 rounded-control px-3 py-2">{error}</p>
            )}

            {/* ── Step 2: preview (dry-run) ──────────────────────────────── */}
            {preview && counts && (
              <>
                {/* Özet satırı: sayılar listeyi TARİF eder (kaç yeni / kaç mükerrer). */}
                <div className="anim-fade-up flex items-center gap-2 flex-wrap text-[12px]">
                  {preview.format === "afr-af" && (
                    <span className="px-2 py-1 rounded-full bg-info/10 border border-info/25 text-info font-medium">
                      AFTeamWork formatı algılandı — KONU → başlık · HEDEF → departman · AKSİYON → teslim tarihi
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-success/10 border border-success/25 text-success font-medium tabular-nums">
                    <CheckCircle2 size={12} aria-hidden /> {counts.new} yeni
                  </span>
                  {counts.duplicate > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-warning/10 border border-warning/30 text-warning font-medium tabular-nums">
                      <CopyX size={12} aria-hidden /> {counts.duplicate} zaten var
                    </span>
                  )}
                  {counts.invalid > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-danger/10 border border-danger/25 text-danger font-medium tabular-nums">
                      <AlertTriangle size={12} aria-hidden /> {counts.invalid} hatalı
                    </span>
                  )}
                </div>

                <div className="anim-fade-up overflow-x-auto border border-line rounded-card">
                  <table className="w-full text-[13px] border-collapse">
                    <thead className="bg-surface-muted border-b border-line">
                      <tr>
                        <th className={cn(TH, "text-right")}>#</th>
                        <th className={TH}>Başlık</th>
                        <th className={TH}>Departman</th>
                        <th className={TH}>Teslim</th>
                        <th className={TH}>Durum</th>
                        <th className={TH}>Sonuç</th>
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
                            <td className="px-3 py-2 text-right text-subtle tabular-nums">{row.rowNumber}</td>
                            <td className="px-3 py-2 max-w-[220px]">
                              <p className="font-medium text-ink truncate" title={row.title}>{row.title || "—"}</p>
                              {row.issues.length > 0 && (
                                <p className="text-[12px] text-warning mt-0.5 leading-snug">{row.issues.join(" ")}</p>
                              )}
                            </td>
                            <td className="px-3 py-2 max-w-[140px] truncate text-muted">
                              {row.departmentName ?? (row.category ? `${row.category} (eşleşmedi)` : "—")}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-muted tabular-nums">{row.dueDate ?? "—"}</td>
                            <td className="px-3 py-2 text-muted whitespace-nowrap">{statusLabel(row.status)}</td>
                            <td className="px-3 py-2">
                              <span className={cn("inline-block px-1.5 py-0.5 rounded-md border text-[12px] font-medium whitespace-nowrap", v.cls)}>
                                {v.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <p className="text-[12.5px] text-subtle">
                  Onaylamadan hiçbir şey yazılmaz. Yalnızca <span className="font-medium text-muted tabular-nums">{counts.new} yeni satır</span> içe aktarılacak.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </Overlay>
  );
}
