"use client";

import { useRef, useState, useTransition } from "react";
import { AlertCircle, FileUp, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createOperationSpreadsheet, updateOperationSpreadsheetMeta, type SheetMetaInput,
} from "@/lib/actions/sheets";
import { SHEET_TYPES, SHEET_STATUSES } from "@/lib/office/constants";
import { parseCsv, normalizeGrid } from "@/lib/utils/csv-to-sheet";
import { workbookFromRows } from "@/lib/sheets/model";
import { Overlay } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { Field, FieldGrid, SelectInput, TextArea, TextInput } from "@/components/ui/Field";
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

/**
 * TABLO BİLGİLERİ FORMU — başlık, tür, durum, ilişkiler.
 *
 * Alanlar ortak Field primitifleriyle çizilir (Overlay + Field); form bir
 * süre kendi input sınıfını taşıyordu ve ölçüleri uygulamanın geri kalanından
 * ayrı düşmüştü. CSV içe aktarma yalnız oluştururken vardır ve tarayıcıda
 * çözülür — dosya sunucuya gitmez.
 */
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

  const titleMissing = error === "Başlık gerekli.";

  async function handleCsvFile(file: File) {
    setError(null);
    try {
      const text = await file.text();
      const grid = normalizeGrid(parseCsv(text));
      if (grid.length === 0) return setError("CSV dosyası boş görünüyor.");
      // CSV doğrudan hesap tablosu ızgarasına girer; ilk satır kalın yazılır.
      const snapshot = workbookFromRows(grid);
      setImportedSnapshotJson(JSON.stringify(snapshot));
      setImportInfo({ name: file.name, rows: grid.length - 1, cols: grid[0].length });
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
    <Overlay
      open
      onClose={onClose}
      title={readOnly ? "Tablo detayı" : isEdit ? "Tablo bilgilerini düzenle" : "Yeni tablo"}
      size="md"
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isPending}>
            {readOnly ? "Kapat" : "Vazgeç"}
          </Button>
          {!readOnly && (
            <Button size="sm" onClick={handleSave} loading={isPending}>
              {isEdit ? "Kaydet" : "Oluştur"}
            </Button>
          )}
        </>
      }
    >
      <form
        className="space-y-3.5"
        onSubmit={(e) => { e.preventDefault(); handleSave(); }}
      >
        <Field label="Başlık" required error={titleMissing ? error : null}>
          <TextInput
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            autoFocus={!readOnly}
            disabled={readOnly}
            placeholder="Örn: 2026 Yaz koleksiyon stok listesi"
          />
        </Field>

        <Field label="Açıklama">
          <TextArea
            rows={2}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            disabled={readOnly}
          />
        </Field>

        <FieldGrid>
          <Field label="Tür">
            <SelectInput value={form.sheet_type} onChange={(e) => set("sheet_type", e.target.value)} disabled={readOnly}>
              {SHEET_TYPES.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Durum">
            <SelectInput value={form.status} onChange={(e) => set("status", e.target.value)} disabled={readOnly}>
              {statusOptions.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </SelectInput>
          </Field>
        </FieldGrid>

        <Field label="Departman">
          <SelectInput value={form.department_id} onChange={(e) => set("department_id", e.target.value)} disabled={readOnly}>
            <option value="">Seçiniz</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </SelectInput>
        </Field>

        <FieldGrid>
          <Field label="İlgili görev">
            <SelectInput value={form.related_task_id} onChange={(e) => set("related_task_id", e.target.value)} disabled={readOnly}>
              <option value="">Seçiniz</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="İlgili kişi">
            <SelectInput value={form.related_contact_id} onChange={(e) => set("related_contact_id", e.target.value)} disabled={readOnly}>
              <option value="">Seçiniz</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </SelectInput>
          </Field>
        </FieldGrid>

        <Field label="Etiketler" hint="Virgülle ayırın: stok, 2026 yaz">
          <TextInput
            value={form.tags}
            onChange={(e) => set("tags", e.target.value)}
            disabled={readOnly}
          />
        </Field>

        {/* CSV import — create only; the file is parsed in the browser and
            becomes the sheet's first snapshot, no file storage involved. */}
        {!isEdit && !readOnly && (
          <div>
            <p className="mb-1 text-[12.5px] font-medium text-muted">Excel / CSV&apos;den başlat (isteğe bağlı)</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              aria-label="CSV dosyası"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleCsvFile(f);
                e.target.value = "";
              }}
            />
            {importInfo ? (
              <div className="anim-fade-down flex items-center justify-between gap-2 rounded-control border border-success/30 bg-success/10 px-3 py-2 text-[12.5px] text-success">
                <span className="flex min-w-0 items-center gap-1.5">
                  <Check size={14} className="shrink-0" aria-hidden />
                  <span className="truncate">{importInfo.name}</span>
                  <span className="shrink-0 tabular-nums">— {importInfo.rows} satır · {importInfo.cols} sütun</span>
                </span>
                <button
                  type="button"
                  onClick={() => { setImportInfo(null); setImportedSnapshotJson(null); }}
                  className="shrink-0 rounded-control px-1 text-[12px] font-medium underline-offset-2 transition-colors duration-150 hover:underline"
                >
                  Kaldır
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-control border border-dashed border-line-strong bg-surface-muted px-3 text-[13px] text-muted transition-colors duration-150 hover:border-brand hover:bg-brand-soft hover:text-brand active:scale-[0.99]"
              >
                <FileUp size={14} aria-hidden />
                CSV dosyası seç — Excel&apos;deki düzen tabloya aktarılır
              </button>
            )}
          </div>
        )}

        {error && !titleMissing && (
          <div role="alert" className="anim-fade-down flex items-start gap-2 rounded-control border border-danger/30 bg-danger/10 px-3 py-2.5 text-[12.5px] leading-relaxed text-danger">
            <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden />
            <span className="min-w-0 break-words">{error}</span>
          </div>
        )}
      </form>
    </Overlay>
  );
}
