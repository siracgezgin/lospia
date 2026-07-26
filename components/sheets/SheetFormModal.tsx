"use client";

import { useRef, useState, useTransition } from "react";
import { X, AlertCircle, FileUp, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createOperationSpreadsheet, updateOperationSpreadsheetMeta, type SheetMetaInput,
} from "@/lib/actions/sheets";
import { SHEET_TYPES, SHEET_STATUSES } from "@/lib/office/constants";
import { parseCsv, normalizeGrid } from "@/lib/utils/csv-to-sheet";
import { makeLightSnapshot } from "@/lib/utils/sheet-snapshot";
import { cn } from "@/lib/utils/cn";
import type { OperationSpreadsheet, SpreadsheetType, WorkspaceDepartment } from "@/types";

type SheetMeta = Pick<
  OperationSpreadsheet,
  "id" | "title" | "description" | "sheet_type" | "status"
  | "department_id" | "related_task_id" | "related_contact_id" | "tags"
>;

interface Props {
  onClose: () => void;
  /** Create → navigates to the new sheet; edit → refresh the caller. */
  onSaved: (id?: string) => void;
  departments: Pick<WorkspaceDepartment, "id" | "name">[];
  tasks: { id: string; title: string }[];
  contacts: { id: string; name: string }[];
  sheet?: SheetMeta | null;
  isAdmin: boolean;
  readOnly?: boolean;
}

const inputCls =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-subtle transition-colors duration-150 hover:border-line-strong focus:outline-none focus:border-brand-ring focus:ring-2 focus:ring-brand-ring/40 disabled:opacity-60 disabled:bg-surface-sunken";
const labelCls = "block text-[12px] font-medium text-muted mb-1";

export function SheetFormModal({
  onClose, onSaved, departments, tasks, contacts, sheet, isAdmin, readOnly = false,
}: Props) {
  const isEdit = !!sheet;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // CSV import (create only) — parsed fully in the browser, no file upload.
  const [importInfo, setImportInfo] = useState<{ name: string; rows: number; cols: number } | null>(null);
  const [importedSnapshotJson, setImportedSnapshotJson] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: sheet?.title ?? "",
    description: sheet?.description ?? "",
    sheet_type: (sheet?.sheet_type ?? "freeform") as SpreadsheetType,
    status: sheet?.status ?? "draft",
    department_id: sheet?.department_id ?? "",
    related_task_id: sheet?.related_task_id ?? "",
    related_contact_id: sheet?.related_contact_id ?? "",
    tags: (sheet?.tags ?? []).join(", "),
  });

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Members work in draft/active; locking & archiving are admin levers. The
  // server enforces the same rule — this keeps the form honest.
  const statusOptions = isAdmin
    ? SHEET_STATUSES
    : SHEET_STATUSES.filter((s) => s.key === "draft" || s.key === "active");

  async function handleCsvFile(file: File) {
    setError(null);
    try {
      const text = await file.text();
      const grid = normalizeGrid(parseCsv(text));
      if (grid.length === 0) return setError("CSV dosyası boş görünüyor.");
      const [header, ...rows] = grid;
      const snapshot = makeLightSnapshot(header, rows.length ? rows : [Array(header.length).fill("")]);
      setImportedSnapshotJson(JSON.stringify(snapshot));
      setImportInfo({ name: file.name, rows: rows.length, cols: header.length });
      if (!form.title.trim()) set("title", file.name.replace(/\.csv$/i, ""));
    } catch {
      setError("CSV dosyası okunamadı. Dosyayı kontrol edip tekrar deneyin.");
    }
  }

  function handleSave() {
    if (readOnly) return onClose();
    setError(null);
    if (!form.title.trim()) return setError("Başlık gerekli.");
    const payload: SheetMetaInput = {
      title: form.title,
      description: form.description,
      sheet_type: form.sheet_type,
      status: form.status as SheetMetaInput["status"],
      department_id: form.department_id,
      related_task_id: form.related_task_id,
      related_contact_id: form.related_contact_id,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
    };
    startTransition(async () => {
      if (isEdit) {
        const result = await updateOperationSpreadsheetMeta(sheet!.id, payload);
        if ("error" in result) return setError(result.error);
        onSaved();
      } else {
        const result = await createOperationSpreadsheet(payload, importedSnapshotJson ?? undefined);
        if ("error" in result) return setError(result.error);
        onSaved(result.id);
        router.push(`/sheets/${result.id}`);
      }
    });
  }

  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="anim-scale-in w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl bg-surface shadow-drawer"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-5 py-3.5">
          <h2 className="text-[15px] font-semibold tracking-tight text-ink">
            {readOnly ? "Tablo detayı" : isEdit ? "Tablo bilgilerini düzenle" : "Yeni tablo oluştur"}
          </h2>
          <button onClick={onClose} aria-label="Kapat" className="rounded-lg p-1.5 text-subtle transition-colors duration-150 hover:bg-surface-muted hover:text-ink active:scale-95">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3.5 px-5 py-4">
          <div>
            <label className={labelCls}>Başlık *</label>
            <input className={inputCls} value={form.title} onChange={(e) => set("title", e.target.value)} autoFocus={!readOnly} disabled={readOnly} placeholder="Örn: 2026 Yaz koleksiyon stok listesi" />
          </div>
          <div>
            <label className={labelCls}>Açıklama</label>
            <textarea
              className={cn(inputCls, "resize-y")}
              rows={2}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              disabled={readOnly}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Tür</label>
              <select className={inputCls} value={form.sheet_type} onChange={(e) => set("sheet_type", e.target.value)} disabled={readOnly}>
                {SHEET_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Durum</label>
              <select className={inputCls} value={form.status} onChange={(e) => set("status", e.target.value)} disabled={readOnly}>
                {statusOptions.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Departman</label>
            <select className={inputCls} value={form.department_id} onChange={(e) => set("department_id", e.target.value)} disabled={readOnly}>
              <option value="">Seçiniz</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>İlgili görev</label>
              <select className={inputCls} value={form.related_task_id} onChange={(e) => set("related_task_id", e.target.value)} disabled={readOnly}>
                <option value="">Seçiniz</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>İlgili kişi</label>
              <select className={inputCls} value={form.related_contact_id} onChange={(e) => set("related_contact_id", e.target.value)} disabled={readOnly}>
                <option value="">Seçiniz</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Etiketler</label>
            <input
              className={inputCls}
              value={form.tags}
              onChange={(e) => set("tags", e.target.value)}
              placeholder="Virgülle ayırın: stok, 2026 yaz"
              disabled={readOnly}
            />
          </div>

          {/* CSV import — create only; the file is parsed in the browser and
              becomes the sheet's first snapshot, no file storage involved. */}
          {!isEdit && !readOnly && (
            <div>
              <label className={labelCls}>Excel / CSV&apos;den başlat (opsiyonel)</label>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleCsvFile(f);
                  e.target.value = "";
                }}
              />
              {importInfo ? (
                <div className="anim-fade-down flex items-center justify-between gap-2 rounded-lg border border-[#bfe0cd] bg-[#dcf0e6] px-3 py-2 text-[12.5px] text-[#1f6e4d]">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Check size={14} className="shrink-0" />
                    <span className="truncate">{importInfo.name}</span>
                    <span className="shrink-0 tabular-nums">— {importInfo.rows} satır · {importInfo.cols} sütun</span>
                  </span>
                  <button
                    onClick={() => { setImportInfo(null); setImportedSnapshotJson(null); }}
                    className="shrink-0 rounded text-[12px] font-medium underline-offset-2 transition-colors duration-150 hover:underline"
                  >
                    Kaldır
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-strong bg-surface-muted/40 px-3 py-2.5 text-[12.5px] text-muted transition-colors duration-150 hover:border-brand hover:bg-brand-soft/40 hover:text-brand active:scale-[0.99]"
                >
                  <FileUp size={14} />
                  CSV dosyası seçin — Excel&apos;deki düzeniniz tabloya aktarılır
                </button>
              )}
            </div>
          )}

          {error && (
            <div className="anim-fade-down flex items-start gap-2 rounded-lg border border-[#f1c3bb] bg-[#fdeae7] px-3 py-2.5 text-[12.5px] leading-relaxed text-[#971f12]">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span className="min-w-0 break-words">{error}</span>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-line bg-surface px-5 py-3">
          <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink active:scale-[0.98]">
            {readOnly ? "Kapat" : "İptal"}
          </button>
          {!readOnly && (
            <button
              onClick={handleSave}
              disabled={isPending}
              className={cn(
                "rounded-lg px-4 py-2 text-[13px] font-medium text-white transition-colors duration-150 active:scale-[0.98]",
                isPending ? "bg-brand/60 cursor-not-allowed" : "bg-brand hover:bg-brand-strong",
              )}
            >
              {isPending ? "Kaydediliyor…" : isEdit ? "Kaydet" : "Oluştur"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
