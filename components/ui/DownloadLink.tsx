"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useConfirm } from "@/components/ui/useConfirm";

/**
 * İNDİRME BAĞLANTISI — indirmeden ÖNCE onay sorar.
 *
 * Sıraç (2026-08-29): "Bir şeyi indirmeden önce de pop-up çıksın. Ve bu
 * indirme, silme kısımları da loglarda çıksın."
 *
 * İndirilen dosya sistemin dışına çıkar: föy Excel'i maliyeti, üreticiyi ve
 * ölçüleri taşır. Tek tıkla ve sessizce dışarı çıkması, silmenin sessizce
 * olması kadar risklidir — üstelik geri alınamaz. Onay penceresi hem bir
 * duraklama noktası koyar hem de indirmenin KAYDEDİLDİĞİNİ söyler.
 *
 * Gezinme `window.location` iledir, `<a download>` değil: dosyayı sunucu
 * üretiyor (Content-Disposition başlığıyla) ve yol boyunca günlüğe yazılıyor.
 *
 * `beforeDownload` BEKLENİR: dosyayı üreten rota veriyi VERİTABANINDAN okur,
 * yani ekranda yazılmış ama henüz kaydedilmemiş değeri göremez.
 */
export function DownloadLink({
  href,
  label,
  what,
  title,
  beforeDownload,
  className,
  children,
}: {
  href: string;
  /** Onay penceresindeki eylem düğmesi ("İndir", "Çıktı al"). */
  label?: string;
  /** Neyin indirildiği — onay metninde geçer ("Beyaz Dantel Etek föyü"). */
  what: string;
  title?: string;
  /**
   * İndirmeden ÖNCE tamamlanması beklenen iş — bekleyen otomatik kaydı diske
   * yazmak gibi. Hata verirse indirme YAPILMAZ: eski veriyi taşıyan bir dosya
   * indirmektense hiç indirmemek yeğdir. Fırlatılan hatanın metni kullanıcıya
   * burada gösterilir, çağıranın ayrıca uyarı çizmesi gerekmez.
   */
  beforeDownload?: () => Promise<unknown>;
  className?: string;
  children?: React.ReactNode;
}) {
  const { ask, dialog } = useConfirm();
  const [busy, setBusy] = useState(false);
  /* SESSİZ BAŞARISIZLIK OLMAZ. Önceki hâlde hata yutuluyordu: kullanıcı
     onaylıyor, hiçbir şey inmiyor ve ekranda tek kelime çıkmıyordu. */
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!err) return;
    const t = window.setTimeout(() => setErr(null), 6000);
    return () => window.clearTimeout(t);
  }, [err]);

  async function go() {
    setErr(null);
    /* YALNIZ SORU. Altına "dosya sistemin dışına çıkacak / günlüğe
       kaydedilir" gibi cümleler konmuştu; kullanıcı için bunlar bilgi değil
       gürültü (2026-08-29: "sadece indirilsin mi diye pop-up olacak, gereksiz
       bilgi verme"). Kayıt zaten arka planda tutuluyor. */
    const ok = await ask({
      tone: "default",
      title: `${what} indirilsin mi?`,
      message: "",
      confirmLabel: label ?? "İndir",
    });
    if (!ok) return;
    /* BEKLEYEN KAYIT ÖNCE DİSKE. Föy editörü son tuştan 1200 ms sonra
       kaydediyor; bu pencerede basılan "Excel indir" henüz yazılmamış değeri
       göremiyor ve dosya düzenlemeden önceki hâlini taşıyordu — kullanıcının
       tarifi birebir buydu: "güncel şeklinde indirmiyor gibi". */
    if (beforeDownload) {
      setBusy(true);
      try {
        await beforeDownload();
      } catch (e) {
        setBusy(false);
        setErr(e instanceof Error && e.message ? e.message : "İndirme hazırlanamadı.");
        return;
      }
      setBusy(false);
    }
    window.location.href = href;
  }

  return (
    <>
      {/* Yalnız ikon taşıyan kullanımda düğmenin ERİŞİLEBİLİR ADI yoktu:
          ekran okuyucu "düğme" diyor, ne indireceğini söylemiyordu. `what`
          zaten insan diliyle yazılmış ("Beyaz Dantel Etek föyü"). */}
      <button
        type="button"
        onClick={go}
        disabled={busy}
        aria-busy={busy || undefined}
        title={title ?? `${what} indir`}
        /* Görünür metin varsa onu EZME (görünen ad ile okunan ad aynı kalsın);
           ad yalnız çıplak ikon kullanımında dışarıdan verilir. */
        aria-label={children ? undefined : (title ?? `${what} indir`)}
        className={className}
      >
        {children ?? <Download size={13} />}
      </button>
      {/* Araç çubuğunun yerleşimini bozmasın diye satır içinde değil, "Kaydedildi"
          bildirimiyle aynı köşede duran bir şerit. */}
      {err && (
        <div role="alert" className="anim-fade-down fixed bottom-6 right-6 z-50 max-w-[min(22rem,calc(100vw-3rem))] rounded-control bg-danger px-4 py-2.5 text-[13.5px] font-medium text-white shadow-drawer">
          {err}
        </div>
      )}
      {dialog}
    </>
  );
}

/** Yardımcı: yalnız ikon taşıyan köşe düğmelerinin ortak biçimi. */
export const downloadIconCls = cn(
  "tap-target rounded-md bg-surface p-1.5 text-subtle shadow-card",
  /* Hayalet düğme sözleşmesi: hover zemin + metinden konuşur, kenarlık belirmez
     ve düğme yükselmez. `background-color` geçiş listesinde ŞART — yoksa zemin
     metinle aynı anda değil, bir anda sıçrar. */
  "transition-[background-color,color,transform] duration-150 hover:bg-surface-muted hover:text-ink active:scale-95",
);
