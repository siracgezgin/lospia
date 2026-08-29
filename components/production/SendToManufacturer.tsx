"use client";

import { useState, useTransition } from "react";
import { Send, CheckCircle2 } from "lucide-react";
import { sendSheetToManufacturer } from "@/lib/actions/production";
import { Overlay } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { Field, TextInput, TextArea } from "@/components/ui/Field";

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
      {/* Kapalı düğme üstünde ipucu kalsın diye sarmalayıcı `title` taşır
          (devre dışı düğme işaretçi olaylarını almaz). */}
      <span
        className="inline-flex"
        title={
          confirmed
            ? "Föyü üreticiye e-posta olarak gönder"
            : "Önce föyü konfirme edin — eksik föy üreticiye gitmez"
        }
      >
        <Button
          variant="secondary"
          onClick={() => { setSentTo(null); setOpen(true); }}
          disabled={!confirmed}
          aria-label="Üreticiye gönder"
        >
          <Send size={15} aria-hidden /> <span className="hidden sm:inline">Üreticiye gönder</span>
        </Button>
      </span>

      {sentTo && (
        <span role="status" className="anim-fade-down inline-flex h-9 items-center gap-1.5 rounded-control border border-success/30 bg-success/10 px-2.5 text-[12.5px] font-medium text-ink">
          <CheckCircle2 size={14} className="text-success" aria-hidden /> {sentTo} adresine gönderildi
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
              <p role="alert" className="anim-fade-down rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] font-medium text-danger">
                {error}
              </p>
            )}

            <Field label={`Alıcı${manufacturerName ? ` · ${manufacturerName}` : ""}`} required>
              <TextInput
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="usta@atolye.com"
                autoFocus
                autoComplete="email"
              />
            </Field>

            <Field label="Not" hint="Mailin başında görünür.">
              <TextArea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Merhaba, ekteki föye göre üretime başlayabilir misiniz?"
              />
            </Field>

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
