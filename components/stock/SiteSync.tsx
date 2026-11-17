"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { syncSiteStock } from "@/lib/actions/stock";

/**
 * SİTE STOĞU — "Online" yerini aslifilinta.com'daki adetle eşitler.
 *
 * Kimse düğmeye basmak zorunda kalmasın: Stock açıldığında, son eşitlemenin
 * üzerinden on dakika geçmişse sessizce çalışır (zaman tarayıcıda tutulur —
 * aynı kişinin sekmeleri birbirini tekrar etmez). `button` verilirse elle
 * tetikleyen düğme de çizilir; hata yalnız elle basıldığında gösterilir.
 */
const KEY = "af:stock:site-sync";
const EVERY_MS = 10 * 60_000;

const lastRun = () => {
  try { return Number(window.localStorage.getItem(KEY)) || 0; } catch { return 0; }
};
const markRun = () => {
  try { window.localStorage.setItem(KEY, String(Date.now())); } catch { /* depolama kapalı */ }
};

export function SiteSync({ button = false }: { button?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  const run = useCallback(async (manual: boolean) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    markRun(); // başlarken işaretle: yan sekme aynı anda başlamasın
    const res = await syncSiteStock().catch(() => ({ error: "Siteye bağlanılamadı." }));
    running.current = false;
    setBusy(false);
    if ("error" in res) { if (manual) setError(res.error); return; }
    setError(null);
    router.refresh();
  }, [router]);

  useEffect(() => {
    if (Date.now() - lastRun() < EVERY_MS) return;
    const t = window.setTimeout(() => void run(false), 800);
    return () => window.clearTimeout(t);
  }, [run]);

  if (!button) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => void run(true)}
        disabled={busy}
        className="inline-flex h-8 items-center gap-1.5 rounded-control border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink transition-all hover:bg-surface-hover disabled:opacity-60 pointer-coarse:h-10"
      >
        <RefreshCw size={14} className={cn(busy && "animate-spin")} aria-hidden />
        {busy ? "Güncelleniyor" : "Siteden güncelle"}
      </button>
      {error && (
        <p role="alert" className="basis-full rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[13.5px] font-medium text-danger">{error}</p>
      )}
    </>
  );
}
