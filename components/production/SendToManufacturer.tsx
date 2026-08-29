"use client";

import { useState, useTransition } from "react";
import { Send, Loader2, CheckCircle2, Mail } from "lucide-react";
import { sendSheetToManufacturer } from "@/lib/actions/production";
import { Overlay } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";

interface Props {
  sheetId: string;
  /** Usta kaydındaki adres — varsa alan bununla dolu açılır. */
  defaultEmail?: string | null;
  manufacturerName?: string | null;
  /** Föy konfirme edilmemişse düğme kapalı gelir. */
  confirmed: boolean;
}

/**
 * Föyü ÜRETİCİYE MAİLLE gönder.
 *
 * Aslı Hanım (2026-08-28): "Üreticiye bu föy gidiyor. Aynı mail sistemiyle."
 * Sıraç üreticiye sistem erişimi vermeyi önerince: "Bence mail olarak
 * gitmesiyle başta daha sağlıklı yani."
 *
 * Mail GERİ ALINAMAZ: bu yüzden tek tıkla gitmez, adres ve not görülüp
 * onaylanır — ve konfirme edilmemiş föy hiç gönderilemez (Aslı Hanım,
 * 2026-08-21: "Üreticiye gidecek dosyanın eksiksiz olmasını istiyorum").
 */
export function SendToManufacturer({ sheetId, defaultEmail, manufacturerName, confirmed }: Props) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(defaultEmail ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [isSending, startSend] = useTransition();

  function send() {
    setError(null);
    startSend(async () => {
      const res = await sendSheetToManufacturer(sheetId, { to: to.trim(), note });
      if ("error" in res) { setError(res.error); return; }
      setSentTo(res.to);
      setOpen(false);
    });
  }

  return (
    <>
      <button
        onClick={() => { setSentTo(null); setOpen(true); }}
        disabled={!confirmed}
        title={
          confirmed
            ? "Föyü üreticiye e-posta olarak gönder"
            : "Önce föyü konfirme edin — eksik föy üreticiye gitmez"
        }
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-2 text-[13px] font-medium text-muted shadow-xs transition-all duration-150 hover:border-brand hover:text-brand active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45"
      >
        <Send size={15} /> <span className="hidden sm:inline">Üreticiye gönder</span>
      </button>

      {sentTo && (
        <span className="anim-fade-down inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[12.5px] font-medium text-emerald-800">
          <CheckCircle2 size={14} /> {sentTo} adresine gönderildi
        </span>
      )}

      {open && (
        <Overlay
          open
          onClose={() => setOpen(false)}
          title="Föyü üreticiye gönder"
          size="md"
          dismissOnBackdrop={false}
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>İptal</Button>
              <Button size="sm" onClick={send} loading={isSending} disabled={!to.trim()}>
                {!isSending && <Send size={14} />} Gönder
              </Button>
            </>
          }
        >
        <div className="space-y-3">
            {error && (
              <p role="alert" className="anim-fade-down rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">
                {error}
              </p>
            )}

            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                Alıcı{manufacturerName ? ` · ${manufacturerName}` : ""}
              </span>
              <input
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="usta@atolye.com"
                autoFocus
                className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink placeholder:text-subtle transition-[border-color,box-shadow] duration-150 hover:border-line-strong focus:border-brand-ring focus:outline-none focus:ring-2 focus:ring-brand-ring"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                Not <span className="font-normal normal-case tracking-normal text-subtle">· mailin başında görünür</span>
              </span>
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Merhaba, ekteki föye göre üretime başlayabilir misiniz?"
                className="w-full resize-y rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] leading-relaxed text-ink placeholder:text-subtle transition-[border-color,box-shadow] duration-150 hover:border-line-strong focus:border-brand-ring focus:outline-none focus:ring-2 focus:ring-brand-ring"
              />
            </label>

            <p className="text-[12px] leading-relaxed text-subtle">
              Föyün tamamı — ürün künyesi, beden dağılımı, ölçüler ve reçete —
              mailin gövdesinde gider. <b className="font-semibold">Fiyat bilgisi gönderilmez.</b>
            </p>
        </div>
        </Overlay>
      )}
    </>
  );
}
