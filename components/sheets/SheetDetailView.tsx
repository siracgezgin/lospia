"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Table2, Pencil, Save, Lock, Info } from "lucide-react";
import { saveSpreadsheetSnapshot } from "@/lib/actions/sheets";
import {
  sheetTypeLabel, sheetStatusLabel, SHEET_STATUS_TONE,
} from "@/lib/office/constants";
import {
  parseSnapshot, workbookToGrid, emptyLightSnapshot, type LightSnapshot,
} from "@/lib/utils/sheet-snapshot";
import { cn } from "@/lib/utils/cn";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { LightSheetEditor, type SheetEditorApi } from "./LightSheetEditor";
import { SheetFormModal } from "./SheetFormModal";
import type { OperationSpreadsheet, WorkspaceDepartment } from "@/types";

interface Props {
  sheet: OperationSpreadsheet;
  departments: Pick<WorkspaceDepartment, "id" | "name">[];
  tasks: { id: string; title: string }[];
  contacts: { id: string; name: string }[];
  currentUserId: string;
  isAdmin: boolean;
}

export function SheetDetailView({
  sheet, departments, tasks, contacts, currentUserId, isAdmin,
}: Props) {
  const router = useRouter();
  const apiRef = useRef<SheetEditorApi | null>(null);
  const [dirty, setDirty] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [isSaving, startSave] = useTransition();

  // Content edit rights mirror the server rule (saveSpreadsheetSnapshot):
  // locked/archived sheets are read-only for everyone (an admin consciously
  // unlocks first); otherwise admin or the author of a draft/active sheet.
  const contentLocked = sheet.status === "locked" || sheet.status === "archived";
  const authorEditable =
    sheet.created_by === currentUserId && (sheet.status === "draft" || sheet.status === "active");
  const readOnly = contentLocked || (!isAdmin && !authorEditable);
  const canEditMeta = isAdmin || authorEditable;

  // Any stored snapshot renders in the light grid: univer-engine snapshots are
  // degraded to values-only (workbookToGrid) so no sheet is ever unreadable.
  const initialGrid = useMemo<LightSnapshot>(() => {
    const parsed = parseSnapshot(sheet.snapshot);
    if (!parsed) return emptyLightSnapshot();
    return parsed.engine === "light" ? parsed : workbookToGrid(parsed.workbook);
  }, [sheet.snapshot]);

  function handleSave() {
    const api = apiRef.current;
    if (!api || readOnly) return;
    setMessage(null);
    const snapshotJson = JSON.stringify(api.getSnapshot());
    startSave(async () => {
      const result = await saveSpreadsheetSnapshot(sheet.id, snapshotJson);
      if ("error" in result) {
        setMessage({ kind: "error", text: result.error });
        return;
      }
      setDirty(false);
      setMessage({ kind: "ok", text: "Tablo kaydedildi." });
      window.setTimeout(() => setMessage(null), 2500);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <ModulePageHeader
        title={sheet.title}
        description={sheet.description ?? undefined}
        icon={Table2}
        backHref="/sheets"
        backLabel="Tablo Merkezi’ne dön"
        secondaryBackHref="/modules"
        secondaryBackLabel="Operasyon Modülleri"
        rightSlot={
          <>
            {canEditMeta && (
              <button
                onClick={() => setMetaOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium text-muted transition-colors duration-150 hover:border-line-strong hover:bg-surface-muted hover:text-ink active:scale-[0.98]"
              >
                <Pencil size={13} />
                Bilgileri düzenle
              </button>
            )}
            {!readOnly && (
              <button
                onClick={handleSave}
                disabled={isSaving || !dirty}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium text-white transition-colors duration-150 active:scale-[0.98]",
                  isSaving || !dirty ? "bg-brand/50 cursor-not-allowed" : "bg-brand hover:bg-brand-strong",
                )}
              >
                <Save size={14} />
                {isSaving ? "Kaydediliyor…" : dirty ? "Kaydet" : "Kaydedildi"}
              </button>
            )}
          </>
        }
      />

      {/* Status row */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="rounded-md bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-muted">
          {sheetTypeLabel(sheet.sheet_type)}
        </span>
        <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium", SHEET_STATUS_TONE[sheet.status])}>
          {sheet.status === "locked" && <Lock size={10} />}
          {sheetStatusLabel(sheet.status)}
        </span>
        {(sheet.tags ?? []).map((t) => (
          <span key={t} className="rounded bg-surface-muted px-1.5 py-0.5 text-[10.5px] text-muted">
            {t}
          </span>
        ))}
      </div>

      {readOnly && (
        <div className="anim-fade-up mb-3 flex items-start gap-2 rounded-xl border border-line bg-surface-muted/60 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-muted">
          <Info size={14} className="mt-0.5 shrink-0" />
          {contentLocked
            ? sheet.status === "locked"
              ? "Bu tablo kilitli — içerik salt okunur. Düzenlemek için bir yönetici tablo durumunu değiştirmelidir."
              : "Bu tablo arşivlendi — içerik salt okunur."
            : "Bu tabloyu görüntüleyebilirsiniz; içerik düzenleme yetkisi tablo sahibine ve yöneticilere aittir."}
        </div>
      )}

      <LightSheetEditor
        initialSnapshot={initialGrid}
        readOnly={readOnly}
        onReady={(api) => { apiRef.current = api; }}
        onDirty={() => setDirty(true)}
      />

      {message && (
        <div
          role="status"
          className={cn(
            "anim-fade fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full px-4 py-2 text-[12.5px] font-medium shadow-pop",
            message.kind === "ok" ? "bg-ink text-white" : "bg-[#971f12] text-white",
          )}
        >
          {message.text}
        </div>
      )}

      {metaOpen && (
        <SheetFormModal
          departments={departments}
          tasks={tasks}
          contacts={contacts}
          sheet={sheet}
          isAdmin={isAdmin}
          onClose={() => setMetaOpen(false)}
          onSaved={() => { setMetaOpen(false); router.refresh(); }}
        />
      )}
    </div>
  );
}
