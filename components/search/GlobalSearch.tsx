"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Loader2, ListChecks, CalendarRange, FolderOpen, Contact, Shirt, CornerDownLeft,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Overlay } from "@/components/ui/Overlay";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils/cn";
import { globalSearch, type SearchGroup, type SearchHit, type SearchKind } from "@/lib/actions/search";

/**
 * GENEL ARAMA — uygulama çubuğundaki tek kapı.
 *
 * Sıraç (2026-09-10): "Yukarıda kişinin profili ve bildirim ikonu yanına arama
 * ikonu ekleyelim, o da genel arama olabilir. Yani çok profesyonel, işlevsel,
 * hem basic kullanıma sahip bir sistem olmalı."
 *
 * KURALLAR
 *  • Katman ortak `components/ui/Overlay` — yeni bir modal deseni İCAT EDİLMEZ
 *    (pop-up = Overlay, alan = Field). Esc, odak tuzağı, sayfa kaydırma kilidi
 *    ve mobildeki alt yaprak davranışı oradan hazır gelir.
 *  • Satırda "isim, iş, tarih" var; puan/sayaç YOK (sadelik kuralı). Grup
 *    başlığı zaten türü söylediği için satırda tür rozeti tekrar edilmez —
 *    tek istisna AF Teamwork: aynı grupta Yazı ve Tablo bir arada durur.
 *  • Klavye: ⌘/Ctrl+K açar, ↑↓ gezinir, ↵ açar, Esc kapatır.
 */

/** Debounce — her harfte sunucuya gitmemek için. Yazarken akıcı, 250ms sonra sonuç. */
const DEBOUNCE_MS = 250;

/** En az bu kadar harf; altında sunucuya hiç gidilmez (action da aynı sınırı doğrular). */
const MIN_CHARS = 2;

/** Sabit boş dizi — her sıfırlamada yeni referans üretmesin (aşağıdaki
 *  `groups !== seenGroups` karşılaştırması referansa bakıyor). */
const NO_GROUPS: SearchGroup[] = [];

const KIND_ICON: Record<SearchKind, LucideIcon> = {
  // İkonlar modül dizinindekilerle aynı: aynı şey her yerde aynı görünür.
  task: ListChecks,
  topic: CalendarRange,
  teamwork: FolderOpen,
  contact: Contact,
  production: Shirt,
};

/* Kısayol etiketi platforma göre (⌘K / Ctrl+K). Sunucu anlık görüntüsü "Mac
   değil" der; hidrasyondan sonra doğrusuna geçer — useSyncExternalStore bu
   farkı React'in bildiği biçimde yönetir, elle `useEffect` ile yapınca
   hidrasyon uyarısı çıkıyor (bkz. Overlay/useMounted deseni). */
const noopSubscribe = () => () => {};
function useIsMac() {
  return useSyncExternalStore(
    noopSubscribe,
    () => /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent),
    () => false,
  );
}

export function GlobalSearch() {
  const router = useRouter();
  const isMac = useIsMac();
  const shortcutLabel = isMac ? "⌘K" : "Ctrl+K";

  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [groups, setGroups] = useState<SearchGroup[]>(NO_GROUPS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Ekrandaki sonuçların CEVAP VERDİĞİ metin — "sonuç yok" cümlesinde kullanılır. */
  const [answered, setAnswered] = useState("");

  /* Geç gelen cevabı yut. Hızlı yazarken istekler sırasız dönebiliyor ve eski
     bir cevap yeni sonuçların üstüne yazılıyordu. */
  const requestRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  /** Bekleyen debounce'u iptal eder ve uçuştaki cevabı geçersiz kılar. */
  const cancelPending = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    requestRef.current++;
  }, []);

  /* ARAMA OLAY İŞLEYİCİDE BAŞLAR, effect'te değil ("You Might Not Need an
     Effect"): kullanıcı yazdığında bir zamanlayıcı kurulur, 250ms sessizlikten
     sonra sunucuya gidilir. Effect'e koyduğumuzda her tuşta senkron setState
     ile basamaklı render üretiyordu (projenin lint kuralı da bunu yasaklıyor). */
  const scheduleSearch = useCallback(
    (raw: string) => {
      cancelPending();
      const q = raw.trim();
      if (q.length < MIN_CHARS) {
        setGroups(NO_GROUPS);
        setError(null);
        setAnswered("");
        setLoading(false);
        return;
      }
      setLoading(true);
      const id = requestRef.current;
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        globalSearch(q)
          .then((res) => {
            if (id !== requestRef.current) return; // daha yeni bir arama var
            if ("error" in res) {
              setGroups(NO_GROUPS);
              setError(res.error);
            } else {
              setGroups(res.groups);
              setError(null);
            }
            setAnswered(q);
            setLoading(false);
          })
          .catch(() => {
            if (id !== requestRef.current) return;
            setGroups(NO_GROUPS);
            setError("Arama şu an yapılamadı. Tekrar deneyin.");
            setLoading(false);
          });
      }, DEBOUNCE_MS);
    },
    [cancelPending],
  );

  const openSearch = useCallback(() => {
    // Her açılış temiz başlar: bir önceki aramanın sonuçları asılı kalmasın.
    cancelPending();
    setTerm("");
    setGroups(NO_GROUPS);
    setError(null);
    setAnswered("");
    setLoading(false);
    setOpen(true);
  }, [cancelPending]);

  const closeSearch = useCallback(() => {
    cancelPending();
    setLoading(false);
    setOpen(false);
  }, [cancelPending]);

  // Bileşen sökülürse bekleyen zamanlayıcı ardında kalmasın.
  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  /* ⌘/Ctrl+K — uygulamanın her yerinden.
     `defaultPrevented` kontrolü ŞART: Yazı editörü (DocEditor) ⌘K'yı "bağlantı
     ekle" için kullanıyor ve kendi işleyicisinde preventDefault çağırıyor.
     Dinleyici document'ta olduğu için o olay buraya da ulaşır; bayrağa
     bakmasak metin yazarken imleç birden arama kutusuna sıçrardı. */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      if (e.key.toLowerCase() !== "k") return;
      e.preventDefault();
      // Açıkken tekrar basmak kapatır — kısayol bir anahtar gibi çalışır.
      if (open) closeSearch();
      else openSearch();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, openSearch, closeSearch]);

  /** Klavye gezinmesi tek düz liste üzerinde yürür; gruplar yalnız görseldir. */
  const flat: SearchHit[] = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  /* Seçili satır. Yeni sonuçlar gelince başa döner. Bu sıfırlama RENDER
     sırasında yapılır, effect'te değil: effect'te setState hem fazladan bir
     boyama hem de projenin lint kuralına takılan basamaklı render üretiyor
     (aynı desen: components/ui/Overlay kapanış animasyonu). */
  const [activeIndex, setActiveIndex] = useState(0);
  const [seenGroups, setSeenGroups] = useState(groups);
  if (groups !== seenGroups) {
    setSeenGroups(groups);
    setActiveIndex(0);
  }

  // Seçili satır listenin dışına taşarsa kendiliğinden görünür alana gelsin.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const go = useCallback(
    (hit: SearchHit) => {
      // closeSearch: bekleyen debounce da iptal edilir — sayfa değiştikten
      // sonra arkada bir arama isteği daha atılmasın.
      closeSearch();
      // Rotalar action'da sabit şablonlardan kuruluyor; dışarıdan URL gelmiyor.
      router.push(hit.href);
    },
    [router, closeSearch],
  );

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Esc'i Overlay'in kendisi yakalar — burada tekrar ele alınmaz.
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (flat.length === 0) return;
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((i) => (i + step + flat.length) % flat.length);
      return;
    }
    if (e.key === "Enter") {
      const hit = flat[activeIndex];
      if (!hit) return;
      e.preventDefault();
      go(hit);
    }
  }

  const trimmed = term.trim();
  const listboxId = "global-search-results";
  const activeOptionId = flat[activeIndex] ? `global-search-opt-${activeIndex}` : undefined;

  /* Gövde durumları: (1) az harf → ne aradığımızı anlatan sakin satır,
     (2) sonuç → gruplu liste, (3) hata, (4) boş. */
  let body: React.ReactNode;
  if (error) {
    body = <EmptyState icon={Search} title="Arama yapılamadı" description={error} compact />;
  } else if (trimmed.length < MIN_CHARS) {
    body = (
      <EmptyState
        icon={Search}
        title="Ne arıyorsunuz?"
        description="Görev, toplantı konusu, AF Teamwork dosyası, CRM kişisi ve üretim föyü aranır. En az iki harf yazın."
        compact
      />
    );
  } else if (flat.length === 0) {
    body = loading ? (
      <div className="flex items-center justify-center gap-2 py-12 text-[13px] text-subtle">
        <Loader2 size={15} className="animate-spin" aria-hidden />
        Aranıyor…
      </div>
    ) : (
      <EmptyState icon={Search} title="Sonuç yok" description={`“${answered}” için bir kayıt bulunamadı.`} compact />
    );
  } else {
    let index = -1;
    body = (
      <div ref={listRef} id={listboxId} role="listbox" aria-label="Arama sonuçları" className="py-1">
        {groups.map((group) => (
          /* role="group": seçenekler listboxın DOĞRUDAN çocuğu olmadığı için
             araya geçerli bir ARIA kabı gerekir; başlık metni grubun adı
             olarak zaten duyurulur, o yüzden görsel başlık aria-hidden. */
          <div key={group.kind} role="group" aria-label={group.label} className="pb-1">
            <p aria-hidden className="px-4 pb-1 pt-2 text-[11.5px] font-semibold uppercase tracking-wide text-subtle">
              {group.label}
            </p>
            {group.items.map((hit) => {
              index++;
              const i = index;
              const active = i === activeIndex;
              const Icon = KIND_ICON[hit.kind];
              return (
                <div
                  key={hit.key}
                  id={`global-search-opt-${i}`}
                  role="option"
                  aria-selected={active}
                  data-active={active ? "true" : undefined}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => go(hit)}
                  /* MENÜ SATIRI sözleşmesi: imleç (fare ya da ok tuşu) satırı
                     yalnız `surface-muted` ile işaretler. `brand-soft` bilerek
                     KULLANILMAZ — o zemin uygulamanın "seçili/aktif" rengidir;
                     buradaki imleç kalıcı bir seçim değil, gezindiğin yerdir.
                     İkon imleçle brand'e döner: satırın tek vurgu noktası o. */
                  className={cn(
                    "flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors duration-150",
                    active ? "bg-surface-muted" : "bg-transparent",
                  )}
                >
                  <Icon
                    size={15}
                    className={cn("shrink-0 transition-colors duration-150", active ? "text-brand" : "text-subtle")}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] text-ink">{hit.title}</span>
                    {hit.subtitle && (
                      <span className="block truncate text-[12px] text-subtle">{hit.subtitle}</span>
                    )}
                  </span>
                  {active && <CornerDownLeft size={13} className="shrink-0 text-subtle" aria-hidden />}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      {/* Düğme çanla AYNI ölçüde: telefonda 40px, masaüstünde 36px. İkon dar
          ekranda da kalır — arama telefonda da tek dokunuş uzakta. */}
      <button
        type="button"
        onClick={openSearch}
        aria-label="Ara"
        title={`Ara (${shortcutLabel})`}
        aria-haspopup="dialog"
        aria-expanded={open}
        /* Hayalet düğme: tek kanal, yalnız zemin + metin. Ölçek değişimi
           kaldırıldı — transform yalnız kutucuklara (TileGrid) ayrıldı. */
        className="grid h-10 w-10 place-items-center rounded-control text-muted transition-[background-color,color] duration-150 hover:bg-surface-muted hover:text-ink md:h-9 md:w-9"
      >
        <Search size={18} aria-hidden />
      </button>

      <Overlay
        open={open}
        onClose={closeSearch}
        title="Arama"
        size="md"
        className="sm:max-w-xl"
        bodyClassName="p-0"
        footer={
          <div className="flex w-full items-center justify-between gap-3 text-[12px] text-subtle">
            <span>{shortcutLabel}</span>
            <span className="hidden sm:inline">↑↓ gezin · ↵ aç · esc kapat</span>
          </div>
        }
      >
        {/* Arama alanı gövdenin TEPESİNE yapışır: sonuçlar kayarken kutu
            yerinde kalır, kullanıcı yazmaya devam edebilir. */}
        <div className="sticky top-0 z-10 border-b border-line bg-surface px-4 py-3">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
            {/* Ortak alan ölçüsü (Field/CONTROL) elle tekrar edilmez; ikon için
                sol dolgu ve yükleme halkası için sağ dolgu eklenir. */}
            <input
              type="text"
              value={term}
              onChange={(e) => {
                setTerm(e.target.value);
                scheduleSearch(e.target.value);
              }}
              onKeyDown={onInputKeyDown}
              placeholder="Görev, konu, dosya, kişi, föy ara…"
              autoComplete="off"
              spellCheck={false}
              role="combobox"
              aria-expanded={flat.length > 0}
              /* Liste yokken var olmayan bir id'ye işaret etmesin. */
              aria-controls={flat.length > 0 ? listboxId : undefined}
              aria-activedescendant={activeOptionId}
              aria-label="Genel arama"
              className="h-10 w-full rounded-control border border-line bg-surface pl-9 pr-9 text-[14px] max-md:pointer-coarse:text-[16px] text-ink transition-[border-color,box-shadow] duration-150 placeholder:text-subtle hover:border-line-strong focus:border-brand-ring focus:outline-none focus:ring-2 focus:ring-brand-ring/40"
            />
            {loading && (
              <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-subtle" aria-hidden />
            )}
          </div>
        </div>

        {body}

        {/* Ekran okuyucuya sonuç durumu — görsel liste zaten değişiyor. */}
        <p aria-live="polite" className="sr-only">
          {trimmed.length < MIN_CHARS
            ? ""
            : loading
              ? "Aranıyor"
              : `${flat.length} sonuç bulundu`}
        </p>
      </Overlay>
    </>
  );
}
