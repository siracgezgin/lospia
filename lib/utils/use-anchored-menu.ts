"use client";

import { useEffect, type RefObject } from "react";

/**
 * TETİKLEYİCİYE BAĞLI AÇILIR KATMANLARIN TEK DAVRANIŞI.
 *
 * Sıraç (2026-08-30): "Scroll kayarken kapanıyor… site genelinde."
 *
 * Uygulamada üç ayrı açılır katman vardı (kişi seçici, görev kartı ⋯ menüsü,
 * Drive öğe menüsü) ve üçü de AYNI üç satırı kendi içinde tekrarlıyordu:
 *
 *     const dismiss = () => setOpen(false);
 *     window.addEventListener("scroll", dismiss, true);
 *
 * İki kusuru birden taşıyordu:
 *   1. YAKALAMA fazında (`true`) dinlediği için sayfadaki HER kaydırmayı
 *      görüyordu — menünün KENDİ kaydırılabilir kutusununkini de. Uzun bir
 *      listeyi aşağı kaydırmaya çalışan kullanıcının menüsü elinde kapanıyordu.
 *   2. Sayfa kaydırılınca menü tamamen kapanıyordu; oysa kullanıcı işini
 *      bitirmemişti. `fixed` katman tetikleyiciyi kendiliğinden takip etmez —
 *      ama çözüm kapatmak değil, YENİDEN KONUMLANDIRMAKTIR.
 *
 * Kural burada bir kez yazılır:
 *   • menünün içinden gelen kaydırma yok sayılır,
 *   • dışarıdan gelen kaydırmada menü tetikleyicisini TAKİP eder,
 *   • tetikleyici görüş alanından tamamen çıkarsa kapanır (havada kalmasın),
 *   • pencere yeniden boyutlanınca kapanır (yerleşim baştan kurulur),
 *   • dışarı tıklama ve Esc her zaman kapatır.
 */
export function useAnchoredMenu({
  open,
  onClose,
  triggerRef,
  menuRef,
  reposition,
}: {
  open: boolean;
  onClose: () => void;
  /** Menüyü açan düğme/kap — konum ve "dışarı tıklandı mı" bunun üstünden. */
  triggerRef: RefObject<HTMLElement | null>;
  /** Yüzen katmanın kendisi. */
  menuRef: RefObject<HTMLElement | null>;
  /** Kaydırmada yeniden konumlandırma. Verilmezse kaydırmada kapanır. */
  reposition?: () => void;
}) {
  useEffect(() => {
    if (!open) return;

    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      onClose();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };

    const onScroll = (e: Event) => {
      const t = e.target as Node | null;
      if (t && menuRef.current?.contains(t)) return; // menünün kendi kaydırması
      if (!reposition) { onClose(); return; }
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > window.innerHeight) { onClose(); return; }
      reposition();
    };

    const onResize = () => onClose();

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, onClose, triggerRef, menuRef, reposition]);
}
