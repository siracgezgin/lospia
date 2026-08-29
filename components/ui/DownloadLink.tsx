"use client";

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
 */
export function DownloadLink({
  href,
  label,
  what,
  title,
  className,
  children,
}: {
  href: string;
  /** Onay penceresindeki eylem düğmesi ("İndir", "Çıktı al"). */
  label?: string;
  /** Neyin indirildiği — onay metninde geçer ("Beyaz Dantel Etek föyü"). */
  what: string;
  title?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const { ask, dialog } = useConfirm();

  async function go() {
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
    if (ok) window.location.href = href;
  }

  return (
    <>
      <button type="button" onClick={go} title={title} className={className}>
        {children ?? <Download size={13} />}
      </button>
      {dialog}
    </>
  );
}

/** Yardımcı: yalnız ikon taşıyan köşe düğmelerinin ortak biçimi. */
export const downloadIconCls = cn(
  "tap-target rounded-md bg-surface p-1.5 text-subtle shadow-card",
  "transition-[color,transform] duration-150 hover:text-ink active:scale-95",
);
