import type { LucideIcon } from "lucide-react";
import { BackLink } from "./BackLink";

interface Props {
  /** Sayfa başlığı — EKRANDA çizilmez (uygulama çubuğu zaten yazıyor), yalnız
   *  ekran okuyucular için gizli bir <h1> olarak konur. */
  title: string;
  /** "Geri"nin hedefini ELLE ver. Boşsa yolun kendisinden türetilir; kök
   *  sayfalarda düğme hiç çizilmez (bkz. lib/nav/parent-path.ts). */
  backHref?: string;
  /** Sağa yaslı aksiyonlar (düğmeler, süzgeçler). */
  rightSlot?: React.ReactNode;

  /** @deprecated Çizilmiyor (2026-08-29) — bkz. bileşen notu. Eski çağrı
   *  yerleri tip hatası vermesin diye kabul ediliyor. */
  description?: string;
  /** @deprecated Çizilmiyor (2026-08-29). */
  icon?: LucideIcon;
  /** @deprecated Çizilmiyor (2026-08-29). */
  badge?: string;
  /** @deprecated İkinci sabit geri bağlantısı kaldırıldı (2026-08-28). */
  secondaryBackHref?: string;
  /** @deprecated */
  secondaryBackLabel?: string;
  /** @deprecated */
  backLabel?: string;
}

/**
 * Her modül ekranının ortak üst çubuğu: SOLDA "← Geri", SAĞDA aksiyonlar.
 *
 * Aslı Hanım (2026-08-29): "Bütün sayfalarda şu kısımları kaldır, sayfayı
 * etkin, optimum, profesyonel kullan."
 *
 * Burada bir zamanlar büyük bir blok vardı: ikon + sayfa başlığı + açıklama
 * cümlesi. Üçü de ~110px yüksekliği yiyordu ve BAŞLIK TEKRARDI — uygulama
 * çubuğu (AppHeader) aynı adı zaten yazıyor. Açıklama cümlesi de ilk günden
 * sonra kimse tarafından okunmuyordu. Geriye tek satır kaldı; içerik ekranın
 * tepesinden başlıyor.
 *
 * Başlık ERİŞİLEBİLİRLİK için duruyor: her sayfanın bir <h1>'i olmalı, ama
 * görsel olarak gizli (sr-only).
 *
 * Aslı Hanım (2026-08-28), geri bağlantısı için: "Neden 'Home Page'e dön' var
 * her yerde? Normal geldiği yerden geri dönün." — hedefi tarayıcı geçmişi
 * belirler (bkz. BackLink).
 */
export function ModulePageHeader({
  title,
  backHref,
  rightSlot,
}: Props) {
  return (
    /* Tek satır. Dar ekranda aksiyonlar alta geçip tam genişlik alır; eskiden
       `shrink-0` yüzünden sıkışıp sayfayı yatay kaydırıyorlardı. */
    /* Kök sayfada BackLink kendini çizmez; aksiyon da yoksa satır boş kalır
       ama yalnız `mb-2` kadar yer tutar — görünür bir boşluk bırakmaz. */
    <div className="mb-2 flex flex-col gap-2 empty:mb-0 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <h1 className="sr-only">{title}</h1>
      <BackLink href={backHref} />
      {rightSlot && (
        /* sm:ml-auto ŞART: BackLink kök sayfada hiç çizilmiyor ve satırda tek
           çocuk kalıyor — `justify-between` tek çocuğu SOLA yaslıyordu. Aynı
           kontrol bir sayfada sağda, diğerinde solda görünüyordu (2026-08-29:
           "mantıksız olmuş, bir sağ bir sol"). */
        <div className="-mx-1 flex w-full flex-wrap items-center gap-2 overflow-x-auto px-1 pb-0.5 sm:mx-0 sm:ml-auto sm:w-auto sm:shrink-0 sm:overflow-visible sm:px-0">
          {rightSlot}
        </div>
      )}
    </div>
  );
}
