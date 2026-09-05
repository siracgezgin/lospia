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
 * ve YENİSİNİ nasıl alırım. Yedeğin içinde ne olduğu (JSON/CSV, özet dosyası)
 * arşivin içindeki OKUBENI.txt'de yazar — ekranda teknik döküm yok.
 *
 * HİYERARŞİ DÜZELTMESİ (2026-08-29): birincil düğme "yalnız kayıtlar"dı,
 * dosyalı indirme ikincildi. Beklenen davranışın tersiydi — "her şey
 * yedeklensin" diyen kişi öndeki düğmeye basıyor ve içinde föy görselleri,
 * klasörler, yüklenen belgeler OLMAYAN bir arşiv iniyordu. Artık birincil
 * düğme TAM yedektir (?files=1); yalnız kayıt indirmek nadir bir istisna
 * olduğu için sessiz (ghost) seçenek olarak durur.
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
      title: withFiles ? "Tam yedek indir" : "Yalnız kayıtları indir",
      message: withFiles
        ? "Bütün kayıtlar ve sisteme yüklenmiş dosyalar tek bir .zip olarak inecek. Hazırlanması birkaç dakika sürebilir; bu sekmeyi kapatmayın."
        : "Yalnız kayıtlar iner — yüklenen dosyalar (föy görselleri, belgeler) bu arşivde olmaz. Tamamı için Tam yedek indir düğmesini kullanın.",
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
      {/* Durum satırı — tek satır, tek bilgi. Taze yedek renksiz kalır (yeşil
          yalnız "tamamlandı" içindir); eskimişse sakin bir warning yüzeyi. */}
      <div
        className={cn(
          "flex flex-col gap-3 rounded-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
          stale ? "border border-warning/30 bg-warning/5" : "bg-surface-muted",
        )}
      >
        <div className="flex items-start gap-3">
        {stale ? (
          <TriangleAlert size={17} className="mt-px shrink-0 text-warning" aria-hidden />
        ) : (
          <ShieldCheck size={17} className="mt-px shrink-0 text-muted" aria-hidden />
        )}
        <div className="min-w-0 text-[13.5px] leading-relaxed">
          {last ? (
            <>
              <p className="font-medium text-ink">
                Son yedek {days === 0 ? "bugün" : `${days} gün önce`} alındı
                {last.personName ? ` · ${last.personName}` : ""}
              </p>
              <p className="text-muted">
                {/* Düğmelerle AYNI iki kelime: "tam yedek" / "yalnız kayıtlar".
                    Farklı sözcük kullanınca insan iki ayrı şey sanıyor. */}
                {last.formattedAt} ·{" "}
                {last.kind === "full" ? "tam yedek" : "yalnız kayıtlar"}
                {stale && " — haftalık yedeğin zamanı geldi."}
              </p>
            </>
          ) : (
            /* Bölüm açıklaması zaten "haftada bir alın" diyor; burada aynı
               cümleyi tekrar etmek düğmeleri aşağı itiyor ve "buton yok"
               hissi veriyordu (Sıraç, 2026-08-30). Boş durum tek satır. */
            <p className="font-medium text-ink">Henüz yedek alınmadı.</p>
          )}
        </div>
        </div>

        {/* BİRİNCİL EYLEM durumun YANINDA: "en son ne zaman alındı" ile "şimdi
            al" aynı bakışta. Aşağıda ayrı bir sırada dururken kullanıcı
            "yedekleme al butonu yok" diyordu (Sıraç, 2026-08-30). */}
        <Button
          onClick={() => download(true)}
          loading={busy === "full"}
          disabled={busy !== null}
          className="shrink-0 max-sm:w-full"
        >
          {busy !== "full" && <HardDriveDownload size={15} aria-hidden />}
          Tam yedek indir
        </Button>
      </div>

      {/* TEK primary: tam yedek. Yalnız kayıt indirmek sessiz istisna.
          Düğmeler durum satırının HEMEN altında ve tam genişlikte başlar:
          "yedek al" eylemi aranacak bir şey olmamalı. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          variant="ghost"
          onClick={() => download(false)}
          loading={busy === "data"}
          disabled={busy !== null}
        >
          {busy !== "data" && <Download size={15} aria-hidden />}
          Yalnız kayıtları indir
        </Button>
      </div>

      {dialog}
    </div>
  );
}
