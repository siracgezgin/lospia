"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { personStyles } from "@/lib/design/person-colors";

/**
 * KUTUCUK IZGARASI — uygulamanın TEK giriş deseni.
 *
 * Aslı Hanım (2026-08-28):
 *   "Bir tasarımı yaptığın zaman o tasarımı her yerde devam ettirmen gerekiyor.
 *    Bunu böyle yapıp öbürünü başka türlü yaptığın zaman kendi tasarımın kendi
 *    içinde dağılmış oluyor. O da branding'ini destekleyen bir şey olur."
 *   "Koleksiyona girdiğinde bu board'daki gibi önce kategoriler çıksın. Sonra o
 *    kategoriye tıklayınca… solda ayrı bir tasarım yapma."
 *   "Aşağıdan böyle muhasebeci gibi şey seçtirip girdirmeyelim."
 *
 * Referans Pano'nun kişi kartıdır (components/board/PeopleGrid.tsx): üstte
 * kimlik rengi şeridi, ortada büyük yuvarlak görsel, altında isim ve tek
 * satırlık alt bilgi. Koleksiyon kategorileri, Documents klasörleri ve AF
 * Teamwork bölümleri aynı karttan çizilir — kullanıcı her modülde AYNI hareketi
 * öğrenir.
 *
 * KART ÜZERİNDE PUANLAYAN SAYI YOKTUR (CLAUDE.md sadelik kuralı). `meta` yalnız
 * listeyi TARİF eden bilgi içindir ("12 ürün", "4 klasör") — kişi ya da iş
 * puanlayan bir sayı buraya girmez.
 */

export interface TileProps {
  /** Gezinme hedefi. `onClick` ile birlikte verilmez. */
  href?: string;
  /** Dış bağlantı — yeni sekmede açılır (Drive, Canva, Figma…). */
  external?: boolean;
  onClick?: () => void;
  title: string;
  /** Tek satırlık tarif — "12 ürün", "Excel · 3 sayfa". */
  meta?: string;
  /** `meta` yerine serbest içerik (avatar + tarih gibi). */
  metaNode?: ReactNode;
  /** Kapak görseli; yoksa sırayla `initials` → `icon` çizilir. */
  photoUrl?: string | null;
  /** Kişi kartı için baş harfler (SG). Fotoğraf yoksa ikon yerine bu gelir —
   *  sembol kimseyi tanıtmıyor (bkz. PeopleGrid notu). */
  initials?: string;
  icon?: LucideIcon;
  /** Kimlik rengi (hex). Verilmezse nötr yüzey. */
  colorHex?: string;
  /** Sağ üst köşe — durum damgası gibi tek işaret. */
  badge?: ReactNode;
  /** İKONUN köşesine oturan küçük rozet (kilit, paylaşım…). Drive de klasörün
   *  görünürlüğünü böyle gösterir: metin değil, simgenin üstünde işaret. */
  iconBadge?: ReactNode;
  active?: boolean;
  /** Kompakt kart — çok sayıda kişi/öğe yan yana sığsın diye (2026-08-29:
   *  "kişi kartları daha küçük olsun ve tüm kişiler yan yana olsun"). */
  compact?: boolean;
  /** Yerleşim. "column" = fotoğraf üstte, isim altta (kişi/kategori kartı).
   *  "row" = ikon solda, ad sağda — Drive'ın klasör/dosya kutusu (2026-08-29:
   *  "bence Drive'daki gibi olsun"). Dosya listesi dikey kartla iri ve
   *  hizasız duruyordu; yatay kutu satır gibi okunur, ızgara gibi dizilir. */
  layout?: "column" | "row";
  /** Kartın sağ üstüne YERLEŞTİRİLEN eylemler (⋯ menüsü gibi).
   *  Kartın KENDİSİNİN İÇİNE konamaz: kart bir <a>/<button>'dır, içine ikinci
   *  bir tıklanabilir öğe koymak geçersiz HTML üretir ve tıklamayı yutar
   *  (proje kuralı: iç içe <a> yasak). Bu yüzden kart, eylemler verildiğinde
   *  göreli bir sarmalayıcıya alınır ve eylemler KARDEŞ olarak çizilir. */
  actions?: ReactNode;
}

export function Tile({
  href, external, onClick, title, meta, metaNode, photoUrl, initials, icon: Icon, colorHex,
  badge, iconBadge, active, compact, layout = "column", actions,
}: TileProps) {
  const row = layout === "row";
  const st = colorHex ? personStyles(colorHex) : null;

  const inner = (
    <>
      {/* Kimlik çubuğu — cn() DIŞINDA satır içi renk: tailwind-merge kenarlık
          renklerini yutuyor (proje kuralı). */}
      {/* Kimlik çubuğu yalnız DİKEY kartta; yatay kutuda ikonun rengi zaten
          türü söylüyor, üstte bir şerit gürültü oluyordu. */}
      {st && !row && (
        <span
          aria-hidden
          className={cn("absolute inset-x-0 top-0", compact ? "h-1" : "h-1.5")}
          style={{ backgroundColor: st.hex }}
        />
      )}
      {badge && <span className={cn("absolute right-1.5 z-[2]", compact ? "top-2" : "top-3")}>{badge}</span>}

      <span className="relative shrink-0">
      <span
        className={cn(
          "grid shrink-0 place-items-center overflow-hidden",
          row ? "size-9 rounded-lg" : "rounded-full ring-2 ring-white/70",
          /* Telefonda bir kademe küçük: 375px ekranda iki sütun × 96px ikon
             kartı taşırıyor, başlık iki satıra sarıyordu. */
          !row && (compact ? "size-11" : "size-16 sm:size-24"),
          !st && "bg-surface-sunken text-muted",
        )}
        style={st ? { backgroundColor: st.hex + "1A", color: st.hex } : undefined}
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 ease-standard group-hover:scale-[1.04]"
          />
        ) : initials ? (
          <span className={cn("font-semibold tracking-tight", compact ? "text-[14px]" : "text-[28px]")}>
            {initials}
          </span>
        ) : Icon ? (
          <Icon size={row ? 17 : compact ? 18 : 30} strokeWidth={row ? 1.9 : 1.6} className={cn(!row && !compact && "sm:size-[34px]")} />
        ) : null}
      </span>
      {iconBadge && (
        <span className="absolute -bottom-1 -right-1 grid place-items-center rounded-full bg-surface p-0.5 shadow-sm ring-1 ring-line">
          {iconBadge}
        </span>
      )}
      </span>

      <span className={cn("min-w-0", row ? "flex-1 text-left" : "w-full")}>
        <span
          className={cn(
            "block truncate font-semibold tracking-tight text-ink",
            row ? "text-[13.5px]" : compact ? "text-[13px]" : "text-[16px] sm:text-[19px]",
          )}
          title={title}
        >
          {title}
        </span>
        {(metaNode ?? meta) && (
          <span
            className={cn(
              "block truncate text-muted",
              row ? "text-[11.5px]" : compact ? "mt-0.5 line-clamp-2 text-[11.5px] leading-snug" : "mt-1 text-[13px]",
            )}
          >
            {metaNode ?? meta}
          </span>
        )}
      </span>
    </>
  );

  const cls = cn(
    // w-full ŞART: <button>/<a> ızgara hücresini kendiliğinden doldurmuyor.
    // Kart içeriği kadar dar kalıyor, sarmalayıcıya göre konumlanan aksiyon
    // düğmeleri de karttan KOPUK duruyordu (2026-08-29 ekran görüntüsü).
    "group relative flex w-full overflow-hidden border bg-surface shadow-card transition-all duration-200 ease-standard",
    row
      ? "items-center gap-2.5 rounded-xl px-3 py-2.5 text-left"
      : cn(
          "flex-col items-center rounded-2xl text-center",
          compact ? "gap-2 px-2 pb-3 pt-3.5" : "gap-2.5 px-3 pb-5 pt-6 sm:gap-3 sm:px-4 sm:pb-6 sm:pt-8",
        ),
    "hover:-translate-y-0.5 hover:shadow-card-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
    !st && "border-line hover:border-line-strong",
    active && "ring-2 ring-brand-ring",
  );
  const style = st ? { ...st.border, ...st.soft } : undefined;

  /** Eylemler varsa kart göreli bir sarmalayıcıya alınır (bkz. `actions`). */
  const wrap = (el: ReactNode) =>
    actions ? (
      <div className="relative">
        {el}
        <div className="absolute right-2 top-2 z-10">{actions}</div>
      </div>
    ) : (
      el
    );

  if (href && external) {
    return wrap(
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cls}
        style={style}
        aria-label={title}
      >
        {inner}
      </a>,
    );
  }
  if (href) {
    return wrap(
      <Link href={href} className={cls} style={style} aria-label={title}>
        {inner}
      </Link>,
    );
  }
  return wrap(
    <button type="button" onClick={onClick} className={cls} style={style}>
      {inner}
    </button>,
  );
}

/** Kutucukların ızgarası — Pano'daki kişi kartlarıyla aynı kırılımlar.
 *  `compact` daha çok sütun açar: küçük kartlar tek bakışta yan yana sığsın. */
export function TileGrid({
  children, className, compact, row,
}: { children: ReactNode; className?: string; compact?: boolean; row?: boolean }) {
  return (
    <div
      className={cn(
        "stagger-children grid",
        /* auto-fill: kartlar SABİT genişlikte, satıra kaç tane sığarsa o kadar.
           Sabit sütun sayısıyla dört kişi ekranı boydan boya geriyordu; artık
           kart boyu kişi sayısından bağımsız (2026-08-29: "kartlar eşit boyutta
           responsive ve profesyonelce olmalı"). */
        row
          ? "grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2.5"
          : compact
            ? "grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2.5"
            : "grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 lg:gap-5",
        className,
      )}
    >
      {children}
    </div>
  );
}
