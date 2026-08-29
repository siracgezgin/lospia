"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/Button";
import { Overlay } from "@/components/ui/Overlay";

interface Props {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  pending?: boolean;
  /** "danger" = kırmızı (silme). "default" = nötr (arşivle, gönder…). */
  tone?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * ONAY KUTUSU. Geri alınamaz bir işlemden önce çıkan tek pencere.
 *
 * Gövdesi artık ortak `Overlay` — portal, Esc, sayfa kilidi ve mobil yaprak
 * davranışı oradan gelir. Burada yalnız İÇERİK var: ikon, başlık, açıklama.
 *
 * Renk tek başına bir cümle kurar: kırmızı "bu geri alınamaz", nötr mavi
 * "geri alınabilir" (arşivleme, gönderme) demek.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = "Vazgeç",
  pending = false,
  tone = "danger",
  onConfirm,
  onCancel,
}: Props) {
  const isDanger = tone === "danger";
  const heading = title ?? (isDanger ? "Silmek istediğinize emin misiniz?" : "Onaylıyor musunuz?");
  const confirmText = confirmLabel ?? (isDanger ? "Sil" : "Devam et");
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Odak doğrudan eylem düğmesinde: Enter'a basan kullanıcı ne olacağını
  // okumuş sayılır, Esc her zaman vazgeçer.
  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  return (
    <Overlay
      open={open}
      onClose={onCancel}
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            variant={isDanger ? "destructive" : "primary"}
            size="sm"
            onClick={onConfirm}
            loading={pending}
          >
            {confirmText}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3.5 py-1">
        <div
          className={cn(
            "mt-0.5 shrink-0 rounded-full p-2 ring-4",
            isDanger ? "bg-danger/10 text-danger ring-danger/5" : "bg-brand-soft text-brand ring-brand-soft/40",
          )}
        >
          {isDanger ? <AlertTriangle size={18} strokeWidth={1.75} /> : <HelpCircle size={18} strokeWidth={1.75} />}
        </div>
        <div className="min-w-0 space-y-1">
          <h2 className="text-[14.5px] font-semibold tracking-tight text-ink">{heading}</h2>
          {/* whitespace-pre-line: "Bu işlem geri alınamaz" ikinci satır olarak
              mesajın içinde \n ile geliyor. */}
          <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-muted">{message}</p>
        </div>
      </div>
    </Overlay>
  );
}
