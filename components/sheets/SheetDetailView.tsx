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

/**
 * İnen dosyanın adı — önce sunucunun söylediği ad (Content-Disposition),
 * o okunamazsa tablonun kendi adı. "download.xlsx" diye bir dosya kimseye
 * hangi tablo olduğunu söylemez.
 */
function downloadNameOf(disposition: string | null, fallbackTitle: string): string {
  const utf8 = disposition ? /filename\*=UTF-8''([^;]+)/i.exec(disposition) : null;
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      // Bozuk kodlama — aşağıdaki yedek adla devam.
    }
  }
  const plain = disposition ? /filename="([^"]+)"/i.exec(disposition) : null;
  if (plain) return plain[1];
  const base = (fallbackTitle || "tablo").replace(/[\\/:*?"<>|]+/g, "-").trim() || "tablo";
  return `${base}.xlsx`;
}

export function SheetDetailView({
  sheet, departments, tasks, contacts, currentUserId, isAdmin,
}: Props) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const apiRef = useRef<SheetEditorApi | null>(null);
  const [metaOpen, setMetaOpen] = useState(false);
  const [metaTitle, setMetaTitle] = useState(sheet.title);
  const [notice, setNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
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
  /** Tablo silindi — bundan sonra hiçbir şey gönderilmez. */
  const abandonedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const runSave = useCallback(async () => {
    const api = apiRef.current;
    if (!api || readOnly || abandonedRef.current) return;
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
      // yeniden göndersin. Kuyruk temizlenir: bekleyen istek zaten aynı
      // veriyi taşıyordu, tekrar denemeyi kullanıcı ya da bir sonraki
      // değişiklik başlatır.
      queuedRef.current = false;
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

  /* Künye formundan ad değişirse (router.refresh sonrası) satır içi alan da
     güncel kalsın. Bu, React'in "prop değişince durumu ayarla" deseni: efekt
     içinde setState çağırmak fazladan bir çizim turu doğurur (ve lint kuralı
     bunu reddeder), oysa render sırasında ayarlamak tek turda biter. */
  const [serverTitle, setServerTitle] = useState(sheet.title);
  if (serverTitle !== sheet.title) {
    setServerTitle(sheet.title);
    setTitle(sheet.title);
  }
  useEffect(() => { savedTitleRef.current = sheet.title; }, [sheet.title]);

  /* Ad da ANLIK GÖRÜNTÜ KADAR veridir ve aynı üç kapıdan kaçabiliyordu.
     Eskiden yalnız kutunun `blur`u gönderiyordu: kullanıcı adı yazıp kutudan
     çıkmadan başka bir sayfaya geçince (ya da sekmeyi kapatınca) yazdığı ad
     sessizce yok oluyordu. Artık pencere odağı gidince, sekme gizlenince ve
     bileşen sökülürken de gönderilir.

     TEK GÖNDERİCİ: kutunun blur'u da bu işlevi çağırır, yoksa pencereden
     çıkarken ikisi birden aynı adı iki kez yollardı. Gönderilen ad hemen
     "kayıtlı" sayılır (tekrarı önler); hata dönerse geri alınır ki bir sonraki
     deneme yeniden göndersin. */
  const titleRef = useRef(title);
  useEffect(() => { titleRef.current = title; }, [title]);

  const flushTitle = useCallback(() => {
    const next = titleRef.current.trim();
    const prev = savedTitleRef.current;
    // Silinmiş tabloya ad göndermek anlamsız (bkz. handleDelete).
    if (!next || next === prev || abandonedRef.current) return;
    savedTitleRef.current = next;
    void renameOperationSpreadsheet(sheet.id, next).then((res) => {
      if ("error" in res) {
        savedTitleRef.current = prev;
        if (mountedRef.current) setNotice(res.error);
      } else if (mountedRef.current) {
        setNotice(null);
      }
    });
  }, [sheet.id]);

  useEffect(() => {
    if (!canEditMeta) return;
    function onHiddenTitle() {
      if (document.visibilityState === "hidden") flushTitle();
    }
    window.addEventListener("blur", flushTitle);
    document.addEventListener("visibilitychange", onHiddenTitle);
    return () => {
      window.removeEventListener("blur", flushTitle);
      document.removeEventListener("visibilitychange", onHiddenTitle);
      // Uygulama içi gezinme `beforeunload` tetiklemez — sökülürken gönder.
      flushTitle();
    };
  }, [canEditMeta, flushTitle]);

  function commitTitle() {
    // Adsız tablo olmaz: boş bırakılırsa kutu eski ada döner.
    if (!titleRef.current.trim()) { setTitle(savedTitleRef.current); return; }
    flushTitle();
  }

  /* ── EXCEL'E AKTAR ────────────────────────────────────────────────────────
     Üç şey aynı anda doğru olmalı:
      1. İnen dosya EKRANDAKİYLE aynı olsun → bekleyen kayıt önce gönderilir.
         (Eskiden düz bir <a> vardı: yeni yazılan hücreler henüz kaydedilmeden
         sunucu eski anlık görüntüyü yazıyordu.)
      2. Rota bir hata dönerse düzenleyici AÇIK kalsın → dosya `fetch` ile
         alınır; `window.location` ile gidilseydi hata JSON'u sayfanın yerine
         geçer, kaydedilmemiş çalışma giderdi.
      3. Hata SESSİZ kalmasın → sunucunun Türkçe mesajı uyarı satırında yazar.
     İndirmeden önce tek soru sorulur (uygulama genelindeki indirme kuralı);
     indirme sunucu tarafında ayrıca günlüğe yazılır. */
  async function handleExport() {
    if (exporting) return;
    const ok = await ask({
      title: `"${savedTitleRef.current}" Excel'e aktarılsın mı?`,
      message: "",
      confirmLabel: "İndir",
    });
    if (!ok) return;

    setNotice(null);
    setExporting(true);
    try {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      if (dirtyRef.current) await runSaveRef.current();

      const res = await fetch(`/sheets/${sheet.id}/export?format=xlsx`, { cache: "no-store" });
      if (!res.ok) {
        let message = "Dosya oluşturulamadı. Lütfen tekrar deneyin.";
        try {
          const body = (await res.json()) as { error?: string };
          if (body?.error) message = body.error;
        } catch {
          // Gövde JSON değilse genel mesaj kalır.
        }
        setNotice(message);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = downloadNameOf(res.headers.get("content-disposition"), savedTitleRef.current);
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Serbest bırakılmazsa dosya tarayıcı belleğinde kalır.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setNotice("Dosya indirilemedi. Bağlantınızı kontrol edip tekrar deneyin.");
    } finally {
      if (mountedRef.current) setExporting(false);
    }
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
      // Silinen tabloya bekleyen kaydı (ya da adı) göndermeyelim.
      abandonedRef.current = true;
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
                Excel'de açılabilmeyen bir tablo "Excel gibi" değildir. */}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleExport()}
              loading={exporting}
              title="Excel dosyası olarak indir (.xlsx)"
            >
              {!exporting && <Download size={13} aria-hidden />}
              Excel&apos;e aktar
            </Button>
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
              <Button
                variant="secondary"
                size="sm"
                /* Formun göreceği ad, pencere AÇILDIĞI andaki kayıtlı addır;
                   ref'i render sırasında okumak yasak (React kuralı). */
                onClick={() => { setMetaTitle(savedTitleRef.current); setMetaOpen(true); }}
              >
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
        {/* Yetkisi olmayan kullanıcıya DÜZENLEME KONTROLÜ GÖSTERİLMEZ: devre
            dışı bir metin kutusu "burayı değiştirebilirdim" diye okunuyor,
            tıklanıyor, hiçbir şey olmuyordu. Yetkisiz gözde ad düz başlıktır. */}
        {canEditMeta ? (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
              if (e.key === "Escape") {
                /* VAZGEÇ gerçekten vazgeçsin: `blur` React yeniden çizmeden
                   tetikleniyor, bu yüzden yalnız state'i geri almak yetmiyordu
                   — kaydedici hâlâ yazılmış adı görüyor ve onu gönderiyordu.
                   Ref de burada geri alınır. */
                titleRef.current = savedTitleRef.current;
                setTitle(savedTitleRef.current);
                e.currentTarget.blur();
              }
            }}
            disabled={isBusy}
            aria-label="Tablo adı"
            title="Tablo adını düzenlemek için tıklayın"
            maxLength={300}
            className="min-w-0 flex-1 truncate rounded-control border border-transparent bg-transparent px-2 py-1.5 text-[15px] font-medium text-ink transition-colors duration-150 hover:border-line focus:border-line-strong focus:bg-surface disabled:cursor-default disabled:border-transparent disabled:bg-transparent disabled:text-ink"
          />
        ) : (
          <h2 className="min-w-0 flex-1 truncate px-2 py-1.5 text-[15px] font-medium text-ink" title={title}>
            {title}
          </h2>
        )}

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
      {/* Telefonda üst çubuk ALT ALTA diziliyor (geri satırı + aksiyon satırı)
          ve altta mobil gezinme var: aynı çıkarma değeri kullanılırsa ızgara
          ekranın altından taşıp sayfayı ikinci kez kaydırılır hâle getiriyordu.
          Bu yüzden mobilde daha fazla, sm'den itibaren daha az düşülür. */}
      <div className="h-[calc(100dvh-23rem)] min-h-[320px] w-full min-w-0 sm:h-[calc(100dvh-17.5rem)] sm:min-h-[360px]">
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
            title: metaTitle,
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
      <span
        className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] text-subtle"
        title="Salt okunur"
      >
        <Info size={13} aria-hidden />
        {/* Telefonda yalnız simge kalır (satırda yer yok); anlamı `title` ve
            ekran okuyucu metni taşır. */}
        <span className="sr-only sm:not-sr-only">Salt okunur</span>
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

  const savedLabel = savedClock ? `${savedClock}'de kaydedildi` : "Kaydedildi";
  const label =
    state === "saving" || state === "dirty" ? "Kaydediliyor…" : state === "saved" ? savedLabel : null;

  return (
    <span
      aria-live="polite"
      title={label ?? undefined}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 text-[12.5px] font-medium",
        state === "saved" ? "text-success" : "text-muted",
      )}
    >
      {label && (state === "saved" ? <Check size={13} aria-hidden /> : <Loader2 size={13} className="animate-spin" aria-hidden />)}
      {/* Dar ekranda metin gizlenir ama SESSİZ KALMAZ: ekran okuyucu ve
          fare ipucu aynı cümleyi söyler. */}
      {label && <span className="sr-only sm:not-sr-only">{label}</span>}
    </span>
  );
}
