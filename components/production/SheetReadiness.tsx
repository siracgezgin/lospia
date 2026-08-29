"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertTriangle, ChevronDown, ShieldCheck, RotateCcw, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { setProductionSheetConfirmed } from "@/lib/actions/production";
import { Button } from "@/components/ui/Button";
import type { SheetCheck } from "@/lib/production/completeness";

interface Props {
  sheetId: string | null;
  checks: SheetCheck[];
  confirmedAt: string | null;
  confirmedByName: string | null;
  /** Kaydedilmemiş değişiklik varsa konfirme düğmesi kapanır. */
  dirty: boolean;
  /** Eksik bir kaleme tıklandığında o alanın bulunduğu sekmeye atlar. */
  onJump?: (_checkKey: string) => void;
}

/**
 * Föyün "hazır mı?" şeridi.
 *
 * Aslı Hanım (2026-08-21) üç kez üst üste eksik föy aldı ve şunu istedi:
 *   "Üreticiye gidecek olan dosyanın EKSİKSİZ bir şekilde föye girmesini
 *    istiyorum." + "Nisa'yla beraber konfirme ederek bana göstermenizi
 *    istiyorum. Bir tane daha revize vermek istemiyorum."
 *
 * Bu şerit o iki cümlenin karşılığı: neyin eksik olduğunu föyün EN ÜSTÜNDE
 * söyler, ve eksiksiz olmadan konfirme ettirmez. Konfirme edildikten sonra
 * föyde bir şey değişirse damga veritabanı trigger'ıyla düşer — "konfirme"
 * görünen bir föy her zaman gerçekten konfirme edilmiş hâlidir.
 */
export function SheetReadiness({ sheetId, checks, confirmedAt, confirmedByName, dirty, onJump }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, startWork] = useTransition();

  const missing = checks.filter((c) => !c.ok);
  const complete = missing.length === 0;
  const confirmed = !!confirmedAt;

  function toggleConfirm(next: boolean) {
    if (!sheetId) return;
    setError(null);
    startWork(async () => {
      const res = await setProductionSheetConfirmed(sheetId, next);
      if ("error" in res) { setError(res.error); return; }
      router.refresh();
    });
  }

  return (
    <div
      className={cn(
        "mb-4 overflow-hidden rounded-card border",
        confirmed
          ? "border-success/30 bg-success/10"
          : complete
            ? "border-line bg-surface"
            : "border-warning/30 bg-warning/10",
      )}
    >
      {/* Telefonda metin TAM GENİŞLİK, düğmeler alt satıra iner. Aksi hâlde
          "3 alan eksik" ve açıklaması ~90px'lik bir sütuna sıkışıp kelime
          kelime kırılıyordu (390px denetiminde görüldü). */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5">
        {confirmed ? (
          <ShieldCheck size={17} className="shrink-0 text-success" aria-hidden />
        ) : complete ? (
          <CheckCircle2 size={17} className="shrink-0 text-success" aria-hidden />
        ) : (
          <AlertTriangle size={17} className="shrink-0 text-warning" aria-hidden />
        )}

        {/* TEK SATIR. Başlık ve açıklama iki ayrı satırdaydı; şerit iki kat
            yükseliyor ve ikinci satır ("Üreticiye giden dosya eksiksiz
            olmalı…") her föyde aynı cümleyi tekrar ediyordu (2026-08-29:
            "şu eksik alanlar kısmı iki satır olmuş, tek satıra düşür").
            Cümle artık başlığın devamı: kalın kısım DURUM, ince kısım
            NE YAPILACAĞI. */}
        <span className="min-w-0 flex-1 basis-[calc(100%-2rem)] text-[13.5px] leading-snug sm:basis-0">
          <span className="font-semibold tracking-tight text-ink">
            {confirmed
              ? `Konfirme edildi${confirmedByName ? ` — ${confirmedByName}` : ""}`
              : complete
                ? "Föy eksiksiz"
                : `${missing.length} alan eksik`}
          </span>
          <span className="ml-1.5 text-[12.5px] text-muted">
            {confirmed
              ? "· föyde bir şey değişirse konfirmasyon düşer"
              : complete
                ? "· konfirmeye hazır"
                : "· üreticiye giden dosya eksiksiz olmalı"}
          </span>
        </span>

        {!complete && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="max-sm:flex-1"
          >
            {open ? "Gizle" : "Eksikleri gör"}
            <ChevronDown size={13} className={cn("transition-transform duration-200", open && "rotate-180")} aria-hidden />
          </Button>
        )}

        {/* Konfirme İKİNCİL düğmedir; ekranın tek primary'si üst çubuktaki
            Kaydet. Yeşil yalnız "tamamlandı" anlamında ve yalnız düğme
            gerçekten basılabilirken. */}
        {sheetId && (
          confirmed ? (
            <Button variant="secondary" size="sm" onClick={() => toggleConfirm(false)} loading={busy} className="max-sm:flex-1">
              {!busy && <RotateCcw size={13} aria-hidden />} Geri al
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => toggleConfirm(true)}
              loading={busy}
              disabled={!complete || dirty}
              title={
                dirty
                  ? "Önce kaydedin — kaydedilmemiş değişiklik var."
                  : complete
                    ? "Föyü konfirme et"
                    : "Eksik alanlar var; önce onları doldurun."
              }
              className={cn("max-sm:flex-1", complete && !dirty && "border-success/40 text-success hover:bg-success/10 hover:border-success/60")}
            >
              {!busy && <ShieldCheck size={13} aria-hidden />} Konfirme et
            </Button>
          )
        )}
      </div>

      {error && (
        <p role="alert" className="border-t border-danger/30 bg-danger/10 px-3.5 py-2 text-[13px] font-medium text-danger">
          {error}
        </p>
      )}

      {open && !complete && (
        <ul className="anim-fade-down divide-y divide-hairline border-t border-warning/30 bg-surface">
          {missing.map((c) => (
            <li key={c.key}>
              {/* Eksik kaleme tıklayınca doğrudan O ALANA gider: sekmesi
                  açılır, alan ekranın ortasına kaydırılır, imleç içine konur
                  ve alan bir an vurgulanır (2026-08-29: "eksik alanda neresi
                  eksikse tıkladığımda beni oraya atsın"). Önce yalnız sekme
                  değişiyordu; uzun föyde alan hâlâ aranıyordu. */}
              <button
                type="button"
                onClick={() => onJump?.(c.key)}
                className="group flex w-full items-start gap-2 px-3.5 py-2 text-left transition-colors duration-150 hover:bg-surface-hover"
              >
                <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warning" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-medium text-ink">{c.label}</span>
                  {c.hint && <span className="block text-[12px] text-muted">{c.hint}</span>}
                </span>
                {/* Ok her zaman görünür: satırın "buraya götürür" olduğu
                    hover'a bağlı kalmasın. */}
                <ArrowRight
                  size={13}
                  className="ml-auto mt-0.5 shrink-0 text-subtle transition-colors duration-150 group-hover:text-ink"
                  aria-hidden
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
