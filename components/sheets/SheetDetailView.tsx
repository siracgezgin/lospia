"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Table2, Pencil, Save, Info, Loader2, Check } from "lucide-react";
import { saveSpreadsheetSnapshot } from "@/lib/actions/sheets";
import { emptyWorkbook, fromLegacy, type WorkbookSnapshot } from "@/lib/sheets/model";
import { cn } from "@/lib/utils/cn";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { SpreadsheetEditor, type SheetEditorApi } from "./SpreadsheetEditor";
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

  /* Kayıtlı her biçim okunur: yeni "grid", eski "light" (başlıklar 1. satıra
     iner) ve hiç yazılmamış "univer" biçimi. Böylece kayıtlı hiçbir tablo
     okunamaz hâle gelmez. */
  const initialGrid = useMemo<WorkbookSnapshot>(
    () => fromLegacy(sheet.snapshot) ?? emptyWorkbook(),
    [sheet.snapshot],
  );

  /* OTOMATİK KAYDETME.
     Aslı Hanım (2026-08-24): kaydetme "kendiliğinden olsun". Elle "Kaydet"
     düğmesi vardı ve kaydetmeyi unutmak veri kaybı demekti.
     Yazma durunca 1,2 saniye sonra kaydeder (debounce): her tuşta sunucuya
     gitmez, ama kullanıcı sekmeyi kapatmadan önce kaydedilmiş olur.
     router.refresh() BİLEREK çağrılmıyor — her kayıtta sayfayı tazelemek
     düzenleyiciyi sıfırlar ve imleci kaybettirir. */
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef<string | null>(null);

  const doSave = useCallback(() => {
    const api = apiRef.current;
    if (!api || readOnly) return;
    const json = JSON.stringify(api.getSnapshot());
    if (json === lastSaved.current) { setDirty(false); return; }
    startSave(async () => {
      const result = await saveSpreadsheetSnapshot(sheet.id, json);
      if ("error" in result) { setMessage({ kind: "error", text: result.error }); return; }
      lastSaved.current = json;
      setDirty(false);
      setSavedAt(Date.now());
      setMessage(null);
    });
  }, [readOnly, sheet.id]);

  const scheduleSave = useCallback(() => {
    if (readOnly) return;
    setDirty(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(doSave, 1200);
  }, [readOnly, doSave]);

  // Sekme kapanırken bekleyen değişikliği kaydet.
  useEffect(() => {
    function flush() { if (saveTimer.current) { clearTimeout(saveTimer.current); doSave(); } }
    window.addEventListener("beforeunload", flush);
    return () => { window.removeEventListener("beforeunload", flush); flush(); };
  }, [doSave]);

  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      <ModulePageHeader
        title={sheet.title}
        description={sheet.description ?? undefined}
        icon={Table2}
        backHref="/sheets"
        backLabel="Sheets’e dön"
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
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium",
                  isSaving || dirty ? "text-muted" : "text-success",
                )}
                aria-live="polite"
              >
                {isSaving ? (
                  <><Loader2 size={13} className="animate-spin" /> Kaydediliyor…</>
                ) : dirty ? (
                  <><Save size={13} /> Değişiklikler bekliyor</>
                ) : savedAt ? (
                  <><Check size={13} /> Kaydedildi</>
                ) : null}
              </span>
            )}
          </>
        }
      />

      {/* Tür/durum/etiket çipleri KALDIRILDI — Aslı Hanım'ın sadelik kuralı
          ("boş laf istemiyorum"): "Serbest çalışma · Taslak" her tabloda aynı
          şeyi yazıyordu. Kilitli/arşiv durumu zaten aşağıdaki uyarı satırında
          söyleniyor; gerisi "Bilgileri düzenle"nin içinde. */}

      {readOnly && (
        <div className="anim-fade-up mb-3 flex items-start gap-2 rounded-xl border border-line bg-surface-muted/60 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-muted">
          <Info size={14} className="mt-0.5 shrink-0" />
          {contentLocked
            ? sheet.status === "locked"
              ? "Bu tablo kilitli — içerik salt okunur. Düzenlemek için bir yönetici tablo durumunu değiştirmelidir."
              : "Bu tablo arşivlendi — içerik salt okunur."
            : "Bu tabloyu görüntüleyebilirsiniz; içerik düzenleme yetkisi tablo sahibine ve yöneticilere aittir."}
        </div>
      )}

      {/* Tam yükseklik: hesap tablosu ekranın kalanını doldursun, sayfa
          kaydırmasın — Excel'de olduğu gibi ızgaranın KENDİSİ kayar. */}
      <div className="h-[calc(100vh-15rem)] min-h-[420px]">
        <SpreadsheetEditor
          initialSnapshot={initialGrid}
          readOnly={readOnly}
          onReady={(api) => { apiRef.current = api; }}
          onDirty={scheduleSave}
        />
      </div>

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
