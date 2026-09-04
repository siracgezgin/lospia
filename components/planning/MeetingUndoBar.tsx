"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { RotateCcw, X } from "lucide-react";
import { restoreMeeting, type MeetingSnapshot } from "@/lib/actions/planning";

export type DeletedMeeting = MeetingSnapshot;

/**
 * SİLİNENİ GERİ AL — şerit + Ctrl+Z.
 *
 * Aslı Hanım (2026-08-30): "Bir konu yerine yanlışlıkla başlığı silince
 * gidiyor, Ctrl+Z yapınca geri gelmiyor, bu çok kötü."
 *
 * Onay penceresi yanlışa basmayı azaltır ama bitirmez: konu satırının çöp
 * kutusu ile toplantının "Sil" düğmesi yan yana durur ve ikisi de aynı soruyu
 * sorar. Kaybın gerçek çaresi geri alınabilir olmasıdır.
 *
 * İki yol da açık:
 *   • ekranın altında "Geri al" düğmesi taşıyan bir şerit,
 *   • Ctrl+Z / ⌘Z — kullanıcının parmağının zaten gittiği tuş.
 *
 * Tuş yakalaması bir metin alanına yazarken DEVREYE GİRMEZ: orada Ctrl+Z
 * tarayıcının kendi geri almasıdır ve onu çalmak daha büyük bir kayıp olurdu.
 *
 * ŞERİT PORTAL İLE <body>'YE ÇİZİLİR ve pop-up katmanının (z-100) ÜSTÜNDE
 * durur. Öncesinde sayfaya ait bir katmandı (z-40): gün kartı açıkken silme
 * yapılınca şerit kartın ALTINDA kalıyor, görünse bile tıklanamıyordu — yani
 * KLAVYESİZ CİHAZDA (iPhone) geri alma tamamen imkânsızdı, çünkü orada ⌘Z de
 * yok. Geri alma, üstünde durduğu pencereden bağımsız olarak her zaman
 * erişilebilir olmalı: kaybı telafi eden tek yol odur.
 */
/** SSR'de portal yok; ilk boyamada `document` yokken çizmemek için
 *  (Overlay ile AYNI sözleşme). */
const subscribe = () => () => {};
function useMounted() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

export function MeetingUndoBar({
  deleted,
  onClear,
}: {
  deleted: DeletedMeeting | null;
  onClear: () => void;
}) {
  const router = useRouter();
  const mounted = useMounted();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const undo = useCallback(async () => {
    if (!deleted || busy) return;
    setBusy(true);
    setError(null);
    const res = await restoreMeeting(deleted);
    setBusy(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    onClear();
    router.refresh();
  }, [deleted, busy, onClear, router]);

  useEffect(() => {
    if (!deleted) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "z" && e.key !== "Z") return;
      if (!e.metaKey && !e.ctrlKey) return;
      // Yazı yazarken tarayıcının kendi geri alması korunur.
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) return;
      e.preventDefault();
      void undo();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [deleted, undo]);

  if (!deleted || !mounted) return null;

  const name = (deleted.title ?? "").trim() || "Toplantı";

  return createPortal(
    /* Alt gezinmenin ÜSTÜNDE (mb-bottom-nav): telefonda şerit sekmeleri
       kapatmasın. z-[110] → pop-up katmanının (z-100) da üstünde. */
    <div className="mb-bottom-nav pointer-events-none fixed inset-x-0 bottom-4 z-[110] flex justify-center px-4 md:mb-0">
      <div className="anim-fade-up pointer-events-auto flex max-w-full items-center gap-3 rounded-card border border-line bg-surface px-4 py-2.5 shadow-pop">
        <span className="min-w-0 truncate text-[13.5px] text-ink">
          <span className="font-medium">{name}</span> silindi.
          {error && <span className="ml-2 text-danger">{error}</span>}
        </span>
        {/* Telefonda BU düğme geri almanın TEK yoludur (⌘Z için klavye lazım),
            o yüzden parmağa göre: 40px. Masaüstünde şeridi şişirmesin diye
            küçülür. */}
        <button
          type="button"
          onClick={undo}
          disabled={busy}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-control bg-brand px-3.5 text-[13.5px] font-medium text-white transition-colors duration-150 hover:bg-brand-strong disabled:opacity-60 sm:h-8 sm:px-3 sm:text-[13px]"
        >
          <RotateCcw size={14} aria-hidden />
          {busy ? "Geri alınıyor…" : "Geri al"}
          {/* Kısayol ipucu YALNIZ klavyesi olan cihazda: dokunmatikte ⌘Z
              diye bir şey yok, yazmak yanıltıcı olurdu. */}
          <kbd className="ml-1 hidden rounded border border-white/30 px-1 text-[11px] font-medium leading-[16px] text-white/80 pointer-fine:inline">
            ⌘Z
          </kbd>
        </button>
        <button
          type="button"
          onClick={onClear}
          aria-label="Kapat"
          className="tap-target grid size-8 shrink-0 place-items-center rounded-control text-subtle transition-colors duration-150 hover:bg-surface-muted hover:text-ink"
        >
          <X size={15} aria-hidden />
        </button>
      </div>
    </div>,
    document.body,
  );
}
