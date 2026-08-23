"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertTriangle, ChevronDown, Loader2, ShieldCheck, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { setProductionSheetConfirmed } from "@/lib/actions/production";
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
        "mb-4 overflow-hidden rounded-xl border shadow-card",
        confirmed
          ? "border-emerald-300 bg-emerald-50"
          : complete
            ? "border-line bg-surface"
            : "border-amber-300 bg-amber-50",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5">
        {confirmed ? (
          <ShieldCheck size={17} className="shrink-0 text-emerald-600" />
        ) : complete ? (
          <CheckCircle2 size={17} className="shrink-0 text-emerald-600" />
        ) : (
          <AlertTriangle size={17} className="shrink-0 text-amber-600" />
        )}

        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block text-[13.5px] font-semibold tracking-tight",
              confirmed ? "text-emerald-900" : complete ? "text-ink" : "text-amber-900",
            )}
          >
            {confirmed
              ? `Konfirme edildi${confirmedByName ? ` — ${confirmedByName}` : ""}`
              : complete
                ? "Föy eksiksiz — konfirmeye hazır"
                : `${missing.length} alan eksik`}
          </span>
          <span
            className={cn(
              "mt-0.5 block text-[12px]",
              confirmed ? "text-emerald-800/80" : complete ? "text-muted" : "text-amber-800/90",
            )}
          >
            {confirmed
              ? "Föyde bir şey değiştirirseniz konfirmasyon otomatik düşer."
              : complete
                ? "Aslı Hanım’a göstermeden önce konfirme edin."
                : "Üreticiye giden dosya eksiksiz olmalı — eksikleri görmek için açın."}
          </span>
        </span>

        {!complete && (
          <button
            onClick={() => setOpen((o) => !o)}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-amber-300 bg-white/70 px-2.5 py-1.5 text-[12.5px] font-medium text-amber-900 transition-colors hover:bg-white"
          >
            {open ? "Gizle" : "Eksikleri gör"}
            <ChevronDown size={13} className={cn("transition-transform duration-200", open && "rotate-180")} />
          </button>
        )}

        {sheetId && (
          confirmed ? (
            <button
              onClick={() => toggleConfirm(false)}
              disabled={busy}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald-300 bg-white/70 px-3 py-1.5 text-[12.5px] font-medium text-emerald-900 transition-colors hover:bg-white disabled:opacity-60"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Geri al
            </button>
          ) : (
            <button
              onClick={() => toggleConfirm(true)}
              disabled={busy || !complete || dirty}
              title={
                dirty
                  ? "Önce kaydedin — kaydedilmemiş değişiklik var."
                  : complete
                    ? "Föyü konfirme et"
                    : "Eksik alanlar var; önce onları doldurun."
              }
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-emerald-700 disabled:pointer-events-none disabled:opacity-45"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />} Konfirme et
            </button>
          )
        )}
      </div>

      {error && (
        <p className="border-t border-danger/30 bg-danger/10 px-3.5 py-2 text-[12.5px] font-medium text-danger">
          {error}
        </p>
      )}

      {open && !complete && (
        <ul className="anim-fade-down divide-y divide-amber-200/70 border-t border-amber-200 bg-white/50">
          {missing.map((c) => (
            <li key={c.key}>
              {/* Eksik kaleme tıklayınca o alanın sekmesine atlar — föy dört
                  sekmeye ayrıldığı için "nerede bu alan?" sorusu doğuyordu. */}
              <button
                onClick={() => onJump?.(c.key)}
                className="flex w-full items-start gap-2 px-3.5 py-2 text-left transition-colors hover:bg-amber-100/60"
              >
                <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-600" />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-ink">{c.label}</span>
                  {c.hint && <span className="block text-[12px] text-muted">{c.hint}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
