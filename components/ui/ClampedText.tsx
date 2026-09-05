"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * KISALTILMIŞ METİN — kesilen yerde açılır.
 *
 * Sıraç (2026-09-05): "Bu kırpma düzeltilmeli."
 *
 * Pano notları sabit satır sayısında kesiliyordu ("…") ve devamını okumanın
 * yolu yoktu: not kartı bir bağlantı değil, açılacak bir yer de yok. Kırpma
 * sütun düzenini korumak için doğru; KAYBOLAN metin yanlıştı.
 *
 * Kural: kısaltma kalır, devamı AYNI KARTIN İÇİNDE açılır. Düğme yalnız metin
 * GERÇEKTEN kesildiğinde görünür — sığan bir notun altında "Devamı" yazması
 * sadelik kuralına aykırı gürültü olurdu. Ölçüm ResizeObserver ile yapılır;
 * sütun daralınca/genişleyince karar kendini günceller.
 */

/* line-clamp sınıfları STATİK yazılır: Tailwind kaynak taramasında dinamik
   `line-clamp-${n}` üretilmez. */
const CLAMP: Record<number, string> = {
  2: "line-clamp-2",
  3: "line-clamp-3",
  4: "line-clamp-4",
};

export function ClampedText({
  text,
  lines = 3,
  className,
}: {
  text: string;
  /** Kapalıyken gösterilecek satır sayısı. */
  lines?: 2 | 3 | 4;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);

  /* Açıkken ölçüm YAPILMAZ: kırpma kalkınca taşma da kalkar ve düğme kendini
     yok ederdi. Durum yalnız aşağıdaki düğmeyle değiştiği için ayna ref de
     orada yazılır — render sırasında ref'e dokunulmaz. */
  const expandedRef = useRef(false);
  function toggle(e: React.MouseEvent<HTMLButtonElement>) {
    /* Not kartları tıklanabilir bir kabın içinde durabiliyor (satırın kendisi
       görevi açıyor). "Devamını oku" o kabı da tetikleyince kullanıcı metni
       açmak isterken başka bir sayfaya düşüyordu. */
    e.preventDefault();
    e.stopPropagation();
    const next = !expanded;
    expandedRef.current = next;
    setExpanded(next);
  }

  const observer = useRef<ResizeObserver | null>(null);
  const measure = useCallback((el: HTMLParagraphElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) return;
    // ResizeObserver bağlanır bağlanmaz bir kez tetiklenir → ilk ölçüm bedava.
    const ro = new ResizeObserver(() => {
      if (expandedRef.current) return;
      setClipped(el.scrollHeight - el.clientHeight > 1);
    });
    ro.observe(el);
    observer.current = ro;
  }, []);

  return (
    <>
      <p
        ref={measure}
        className={cn("whitespace-pre-wrap break-words", !expanded && CLAMP[lines], className)}
      >
        {text}
      </p>
      {(clipped || expanded) && (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          className="tap-target mt-0.5 inline-flex rounded-control text-[12.5px] font-medium text-brand transition-colors duration-150 hover:text-brand-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring"
        >
          {expanded ? "Daha az" : "Devamını oku"}
        </button>
      )}
    </>
  );
}
