"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download, HardDriveDownload, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/useConfirm";
import { cn } from "@/lib/utils/cn";

/**
 * YEDEK PANELİ.
 *
 * Sıraç (2026-08-29): "Drive'daki bütün dosyaları buraya alacağız, o yüzden
 * silinme riskinin, kayıp riskinin olmaması gerekiyor… haftada bir bu yedeği
 * alıp indirmemiz gerekiyor ki sistemde olan şeyler yanımızda kaybolmasın."
 *
 * Panel iki soruyu cevaplar ve fazlasını söylemez: SON YEDEK NE ZAMAN alındı,
 * ve YENİSİNİ nasıl alırım. Yedeğin içinde ne olduğu arşivin içindeki
 * OKUBENI.txt dosyasında yazar — burada bir tablo dökümü göstermek paneli bir
 * rapora çevirirdi.
 *
 * "Kaç gün önce" bir kişiyi ya da işi puanlamaz, sistemin durumunu tarif eder
 * (CLAUDE.md sadelik kuralının ayırt edici testi) — bu yüzden yazılır.
 */

export interface LastBackup {
  /** Sunucuda biçimlenmiş tarih — istemcide formatlamak sunucu/tarayıcı saat
   *  dilimi farkında hydration uyuşmazlığı üretiyor. */
  formattedAt: string;
  /** Kaç gün önce alındı — bu da sunucuda hesaplanır (render saf kalsın). */
  ageDays: number;
  kind: "data" | "full";
  personName: string | null;
}

/** Yedek "taze" sayılma süresi — haftalık ritim (Cuma operasyon toplantısı). */
export const FRESH_DAYS = 7;

export function BackupPanel({ last }: { last: LastBackup | null }) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const [busy, setBusy] = useState<null | "data" | "full">(null);

  const days = last?.ageDays ?? null;
  const stale = days === null || days >= FRESH_DAYS;

  async function download(withFiles: boolean) {
    const ok = await ask({
      title: withFiles ? "Dosyalarla birlikte yedek" : "Yedek indir",
      message: withFiles
        ? "Kayıtlar ve sisteme yüklenmiş bütün dosyalar tek bir .zip dosyası olarak bilgisayarınıza inecek. Dosya büyükse hazırlanması birkaç dakika sürebilir; bu sekmeyi kapatmayın."
        : "Çalışma alanındaki bütün kayıtlar tek bir .zip dosyası olarak bilgisayarınıza inecek. İndirilen dosyayı sistemin dışında bir yerde saklayın.",
      confirmLabel: "İndir",
      tone: "default",
    });
    if (!ok) return;

    setBusy(withFiles ? "full" : "data");
    // Tarayıcının kendi indirme akışı: gizli bir gezinme, arşiv akış hâlinde
    // iner. fetch + blob KULLANILMAZ — bütün arşivi belleğe alırdı.
    window.location.href = `/api/backup${withFiles ? "?files=1" : ""}`;
    // Kayıt satırı sunucuda akış başlamadan yazılır; kısa bir beklemeden sonra
    // "son yedek" satırını tazeliyoruz.
    window.setTimeout(() => {
      setBusy(null);
      router.refresh();
    }, 4000);
  }

  return (
    <div className="space-y-4">
      {/* Durum şeridi — tek satır, tek bilgi. */}
      <div
        className={cn(
          "flex items-start gap-3 rounded-xl border px-4 py-3",
          stale ? "border-warning/30 bg-warning/5" : "border-success/25 bg-success/5",
        )}
      >
        {stale ? (
          <TriangleAlert size={17} className="mt-px shrink-0 text-warning" />
        ) : (
          <ShieldCheck size={17} className="mt-px shrink-0 text-success" />
        )}
        <div className="min-w-0 text-[13.5px] leading-relaxed">
          {last ? (
            <>
              <p className="font-medium text-ink">
                Son yedek {days === 0 ? "bugün" : `${days} gün önce`} alındı
                {last.personName ? ` · ${last.personName}` : ""}
              </p>
              <p className="text-muted">
                {last.formattedAt} ·{" "}
                {last.kind === "full" ? "dosyalarla birlikte" : "yalnız kayıtlar"}
                {stale && " — haftalık yedeğin zamanı geldi."}
              </p>
            </>
          ) : (
            <>
              <p className="font-medium text-ink">Henüz yedek alınmadı</p>
              <p className="text-muted">
                Haftada bir yedek alıp bilgisayarınızda saklayın; sisteme yüklenen her şeyin
                elinizde ikinci bir kopyası olsun.
              </p>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={() => download(false)} loading={busy === "data"} disabled={busy !== null}>
          {busy !== "data" && <Download size={15} />}
          Yedeği indir
        </Button>
        <Button
          variant="secondary"
          onClick={() => download(true)}
          loading={busy === "full"}
          disabled={busy !== null}
        >
          {busy !== "full" && <HardDriveDownload size={15} />}
          Dosyalarla birlikte indir
        </Button>
      </div>

      <p className="text-[12.5px] leading-relaxed text-subtle">
        Arşivin içinde her kaydın hem JSON hem CSV hâli bulunur — CSV dosyaları Excel&apos;de
        doğrudan açılır. Ne alındığının dökümü <span className="font-medium text-muted">ozet.json</span>,
        açıklaması <span className="font-medium text-muted">OKUBENI.txt</span> dosyasındadır.
      </p>

      {dialog}
    </div>
  );
}
