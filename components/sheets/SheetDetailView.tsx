"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Pencil, Info, Loader2, Check, AlertCircle, RotateCw, Download, Copy, Trash2, CloudOff,
} from "lucide-react";
import {
  saveSpreadsheetSnapshot,
  renameOperationSpreadsheet,
  duplicateOperationSpreadsheet,
  deleteOperationSpreadsheet,
} from "@/lib/actions/sheets";
import { emptyWorkbook, fromLegacy, type WorkbookSnapshot } from "@/lib/sheets/model";
import { cn } from "@/lib/utils/cn";
import { Button, IconButton } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/useConfirm";
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

/** Kaydetme durumu — kullanıcıya TEK bir cümleyle söylenir. */
type SaveState = "clean" | "dirty" | "saving" | "saved" | "error";

/** Yazma durduktan sonra kaydetmeye kadar beklenen süre. */
const SAVE_DEBOUNCE_MS = 900;

export function SheetDetailView({
  sheet, departments, tasks, contacts, currentUserId, isAdmin,
}: Props) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const apiRef = useRef<SheetEditorApi | null>(null);
  const [metaOpen, setMetaOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [isBusy, startWork] = useTransition();

  // Content edit rights mirror the server rule (saveSpreadsheetSnapshot):
  // locked/archived sheets are read-only for everyone (an admin consciously
  // unlocks first); otherwise admin or the author of a draft/active sheet.
  const contentLocked = sheet.status === "locked" || sheet.status === "archived";
  const authorEditable =
    sheet.created_by === currentUserId && (sheet.status === "draft" || sheet.status === "active");
  const readOnly = contentLocked || (!isAdmin && !authorEditable);
  const canEditMeta = isAdmin || authorEditable;
  const canDelete = isAdmin || sheet.created_by === currentUserId;

  /* Kayıtlı her biçim okunur: yeni "grid", eski "light" (başlıklar 1. satıra
     iner) ve hiç yazılmamış "univer" biçimi. Böylece kayıtlı hiçbir tablo
     okunamaz hâle gelmez. */
  const initialGrid = useMemo<WorkbookSnapshot>(
    () => fromLegacy(sheet.snapshot) ?? emptyWorkbook(),
    [sheet.snapshot],
  );

  /* ── OTOMATİK KAYDETME ────────────────────────────────────────────────────
     Aslı Hanım (2026-08-24): kaydetme "kendiliğinden olsun".

     Üç şey aynı anda doğru olmalı:
      1. Yazarken sunucuya boğulmamalı → yazma durunca ~1 sn sonra kaydeder.
      2. VERİ KAYBOLMAMALI → sekme gizlenince, pencere odağı gidince ve
         bileşen sökülürken (uygulama içi gezinme) bekleyen kayıt hemen
         gönderilir; hâlâ bekleyen bir şey varsa tarayıcı "çıkmak istiyor
         musunuz?" diye sorar.
      3. Kaydedilemezse SESSİZ KALMAMALI → durum satırı hatayı yazar ve
         "Tekrar dene" düğmesi çıkar.

     Kayıtlar üst üste binmez: bir kayıt uçarken gelen değişiklik kuyruğa
     alınır ve kayıt biter bitmez bir kez daha gönderilir. */
  const [saveState, setSaveState] = useState<SaveState>("clean");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const queuedRef = useRef(false);
  const mountedRef = useRef(true);
  const runSaveRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const runSave = useCallback(async () => {
    const api = apiRef.current;
    if (!api || readOnly) return;
    // Uçmakta olan bir kayıt varsa bunu kuyruğa al — iki eşzamanlı yazma
    // birbirinin üstüne binerse eski hâl geri gelebiliyordu.
    if (savingRef.current) { queuedRef.current = true; return; }

    const json = JSON.stringify(api.getSnapshot());
    if (json === lastSavedRef.current) {
      dirtyRef.current = false;
      if (mountedRef.current) setSaveState((s) => (s === "clean" ? s : "saved"));
      return;
    }

    savingRef.current = true;
    if (mountedRef.current) setSaveState("saving");

    const result = await saveSpreadsheetSnapshot(sheet.id, json);
    savingRef.current = false;

    if ("error" in result) {
      // Kayıt başarısız — "kirli" bayrağı DURUYOR ki sonraki deneme veriyi
      // yeniden göndersin.
      if (mountedRef.current) { setSaveError(result.error); setSaveState("error"); }
      return;
    }

    lastSavedRef.current = json;
    dirtyRef.current = false;
    if (mountedRef.current) {
      setSaveError(null);
      setSavedAt(new Date());
      setSaveState("saved");
    }
    if (queuedRef.current) {
      queuedRef.current = false;
      void runSaveRef.current();
    }
  }, [readOnly, sheet.id]);

  useEffect(() => { runSaveRef.current = runSave; }, [runSave]);

  const scheduleSave = useCallback(() => {
    if (readOnly) return;
    dirtyRef.current = true;
    // Zaten "dirty"/"saving" ise aynı değeri döndür: React yeniden çizmez,
    // her tuş vuruşunda ızgara boşuna render edilmez.
    setSaveState((s) => (s === "dirty" || s === "saving" ? s : "dirty"));
    setSaveError(null);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void runSaveRef.current();
    }, SAVE_DEBOUNCE_MS);
  }, [readOnly]);

  const flushNow = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (dirtyRef.current) void runSaveRef.current();
  }, []);

  useEffect(() => {
    if (readOnly) return;

    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirtyRef.current && !savingRef.current) return;
      void runSaveRef.current();
      // Tarayıcı sunucu isteğinin bitmesini beklemez — bu yüzden kullanıcıya
      // sorulur. Onay penceresi çıkana kadar geçen süre kaydın tamamlanmasına
      // da yarar.
      e.preventDefault();
      e.returnValue = "";
    }
    function onHidden() {
      if (document.visibilityState === "hidden") flushNow();
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("blur", flushNow);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("blur", flushNow);
      document.removeEventListener("visibilitychange", onHidden);
      // Uygulama içi gezinme (Link) `beforeunload` tetiklemez; sökülürken
      // bekleyen kayıt burada gönderilir.
      flushNow();
    };
  }, [readOnly, flushNow]);

  const onEditorReady = useCallback((api: SheetEditorApi) => { apiRef.current = api; }, []);

  /* ── Ad değiştirme (satır içi) ────────────────────────────────────────────
     Tablonun adı sayfada HİÇBİR YERDE yazmıyordu (uygulama çubuğu "AF
     Teamwork" diyor) — hangi tabloda olduğunuz görünmüyordu. Ad artık burada
     ve doğrudan düzeltilebiliyor; Drive'daki gibi. */
  const [title, setTitle] = useState(sheet.title);
  const savedTitleRef = useRef(sheet.title);

  // Künye formundan ad değişirse (router.refresh sonrası) satır içi alan da
  // güncel kalsın.
  useEffect(() => {
    savedTitleRef.current = sheet.title;
    setTitle(sheet.title);
  }, [sheet.title]);

  function commitTitle() {
    const next = title.trim();
    if (!next) { setTitle(savedTitleRef.current); return; }
    if (next === savedTitleRef.current) return;
    startWork(async () => {
      const res = await renameOperationSpreadsheet(sheet.id, next);
      if ("error" in res) {
        setNotice(res.error);
        setTitle(savedTitleRef.current);
        return;
      }
      savedTitleRef.current = next;
      setNotice(null);
    });
  }

  function handleDuplicate() {
    setNotice(null);
    startWork(async () => {
      // Kopya en son hâli taşısın: önce bekleyen kayıt gönderilir.
      if (dirtyRef.current) {
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        await runSaveRef.current();
      }
      const res = await duplicateOperationSpreadsheet(sheet.id);
      if ("error" in res) { setNotice(res.error); return; }
      router.push(`/sheets/${res.id}`);
    });
  }

  async function handleDelete() {
    const ok = await ask({
      title: "Tablo silinsin mi?",
      message: `"${savedTitleRef.current}" kalıcı olarak silinir; içindeki bütün veriler gider. Bu işlem geri alınamaz.`,
      confirmLabel: "Sil",
      tone: "danger",
    });
    if (!ok) return;
    setNotice(null);
    startWork(async () => {
      const res = await deleteOperationSpreadsheet(sheet.id);
      if ("error" in res) { setNotice(res.error); return; }
      // Silinen tabloya bekleyen kaydı göndermeyelim.
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      dirtyRef.current = false;
      queuedRef.current = false;
      router.push("/documents");
      router.refresh();
    });
  }

  const savedClock = savedAt
    ? savedAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      {/* Tablo AF Teamwork'ün klasöründe yaşıyor (20240329); "Geri" oraya
          döner. /sheets zaten /documents'a yönlendiriyor — ara durak yok. */}
      <ModulePageHeader
        title={sheet.title}
        backHref="/documents"
        rightSlot={
          <>
            {/* İNDİRME: gerçek bir GET rotası (bkz. [id]/export/route.ts).
                Excel'de açılabilmeyen bir tablo "Excel gibi" değildir.
                • önce bekleyen kayıt gönderilir — indirilen dosya ekrandakiyle
                  aynı olsun;
                • yeni sekme: dosya inerken sayfa YERİNDE kalır, bir hata
                  dönerse de düzenleyici kapanıp yazılanlar gitmez. */}
            <a
              href={`/sheets/${sheet.id}/export?format=xlsx`}
              target="_blank"
              rel="noopener"
              onClick={flushNow}
              className="tap-target inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-control border border-line bg-surface px-3 text-[13px] font-medium whitespace-nowrap text-ink shadow-xs transition-[background-color,border-color,color] duration-150 ease-standard hover:border-line-strong hover:bg-surface-muted pointer-coarse:h-10"
              title="Excel dosyası olarak indir (.xlsx)"
            >
              <Download size={13} aria-hidden />
              Excel&apos;e aktar
            </a>
            <IconButton
              size="sm"
              variant="secondary"
              aria-label="Bir kopyasını oluştur"
              title="Bir kopyasını oluştur"
              disabled={isBusy}
              onClick={handleDuplicate}
            >
              <Copy size={13} aria-hidden />
            </IconButton>
            {canEditMeta && (
              <Button variant="secondary" size="sm" onClick={() => setMetaOpen(true)}>
                <Pencil size={13} aria-hidden />
                Bilgileri düzenle
              </Button>
            )}
            {canDelete && (
              <IconButton
                size="sm"
                variant="secondary"
                aria-label="Tabloyu sil"
                title="Tabloyu sil"
                disabled={isBusy}
                onClick={() => void handleDelete()}
                className="hover:border-danger/40 hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 size={13} aria-hidden />
              </IconButton>
            )}
          </>
        }
      />

      {/* Ad + kaydetme durumu tek satırda: dikey yer harcamadan "neredeyim"
          ve "kaydedildi mi" sorularının ikisini de yanıtlar. */}
      <div className="mb-2 flex min-w-0 items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
            if (e.key === "Escape") { setTitle(savedTitleRef.current); e.currentTarget.blur(); }
          }}
          disabled={!canEditMeta || isBusy}
          aria-label="Tablo adı"
          title={canEditMeta ? "Tablo adını düzenlemek için tıklayın" : title}
          maxLength={300}
          className="min-w-0 flex-1 truncate rounded-control border border-transparent bg-transparent px-2 py-1.5 text-[15px] font-medium text-ink transition-colors duration-150 hover:border-line focus:border-line-strong focus:bg-surface disabled:cursor-default disabled:border-transparent disabled:bg-transparent disabled:text-ink"
        />

        <SaveStatus
          readOnly={readOnly}
          state={saveState}
          error={saveError}
          savedClock={savedClock}
          onRetry={() => { void runSaveRef.current(); }}
        />
      </div>

      {notice && (
        <div
          role="alert"
          className="anim-fade-down mb-2 flex items-start gap-2 rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[12.5px] leading-relaxed text-danger"
        >
          <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden />
          <span className="min-w-0 break-words">{notice}</span>
        </div>
      )}

      {readOnly && (
        <div role="status" className="anim-fade-up mb-3 flex items-start gap-2 rounded-card border border-line bg-surface-muted px-3.5 py-2.5 text-[13.5px] leading-relaxed text-muted">
          <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
          {contentLocked
            ? sheet.status === "locked"
              ? "Bu tablo kilitli — içerik salt okunur. Düzenlemek için bir yönetici tablo durumunu değiştirmelidir."
              : "Bu tablo arşivlendi — içerik salt okunur."
            : "Bu tabloyu görüntüleyebilirsiniz; içerik düzenleme yetkisi tablo sahibine ve yöneticilere aittir."}
        </div>
      )}

      {/* Tam yükseklik: hesap tablosu ekranın kalanını doldursun, sayfa
          kaydırmasın — Excel'de olduğu gibi ızgaranın KENDİSİ kayar.
          dvh: telefonda adres çubuğu açılıp kapanınca kutu taşmasın.
          min-w-0: geniş ızgara SAYFAYI değil kendi kabını kaydırsın
          (gövdede yatay kaydırma yasak; kaydırma kabı düzenleyicinin içinde). */}
      <div className="h-[calc(100dvh-17.5rem)] min-h-[360px] w-full min-w-0">
        <SpreadsheetEditor
          initialSnapshot={initialGrid}
          readOnly={readOnly}
          onReady={onEditorReady}
          onDirty={scheduleSave}
        />
      </div>

      {dialog}

      {metaOpen && (
        <SheetFormModal
          departments={departments}
          tasks={tasks}
          contacts={contacts}
          /* Başlık satır içinde değişmiş olabilir; forma GÜNCEL adı ver,
             yoksa "Bilgileri düzenle" eski adı geri yazıyordu. */
          sheet={{
            id: sheet.id,
            title: savedTitleRef.current,
            description: sheet.description,
            sheet_type: sheet.sheet_type,
            status: sheet.status,
            department_id: sheet.department_id,
            related_task_id: sheet.related_task_id,
            related_contact_id: sheet.related_contact_id,
            tags: sheet.tags,
          }}
          isAdmin={isAdmin}
          readOnly={!canEditMeta}
          onClose={() => setMetaOpen(false)}
          onSaved={() => { setMetaOpen(false); router.refresh(); }}
        />
      )}
    </div>
  );
}

/**
 * Kaydetme durumu — tek satır, tek anlam.
 * Hata hâlinde SESSİZ KALMAZ: sebebi yazar ve elle tekrar denetir.
 */
function SaveStatus({
  readOnly, state, error, savedClock, onRetry,
}: {
  readOnly: boolean;
  state: SaveState;
  error: string | null;
  savedClock: string | null;
  onRetry: () => void;
}) {
  if (readOnly) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] text-subtle">
        <Info size={13} aria-hidden />
        <span className="hidden sm:inline">Salt okunur</span>
      </span>
    );
  }

  if (state === "error") {
    return (
      <span className="flex shrink-0 items-center gap-1.5" role="alert">
        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-danger">
          <CloudOff size={13} aria-hidden />
          <span className="hidden sm:inline">{error ?? "Kaydedilemedi"}</span>
          <span className="sm:hidden">Kaydedilemedi</span>
        </span>
        <button
          type="button"
          onClick={onRetry}
          className="tap-target inline-flex h-8 items-center gap-1 rounded-control border border-danger/40 px-2 text-[12.5px] font-medium text-danger transition-colors duration-150 hover:bg-danger/10 pointer-coarse:h-10"
        >
          <RotateCw size={12} aria-hidden />
          Tekrar dene
        </button>
      </span>
    );
  }

  return (
    <span
      aria-live="polite"
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 text-[12.5px] font-medium",
        state === "saved" ? "text-success" : "text-muted",
      )}
    >
      {state === "saving" || state === "dirty" ? (
        <>
          <Loader2 size={13} className="animate-spin" aria-hidden />
          <span className="hidden sm:inline">Kaydediliyor…</span>
        </>
      ) : state === "saved" ? (
        <>
          <Check size={13} aria-hidden />
          <span className="hidden sm:inline">
            {savedClock ? `${savedClock}'de kaydedildi` : "Kaydedildi"}
          </span>
        </>
      ) : null}
    </span>
  );
}
