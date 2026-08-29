"use client";

import { useCallback, useRef, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" = kırmızı (silme). "default" = nötr (arşivle, gönder…). */
  tone?: "danger" | "default";
};

/**
 * ONAY SORAN TEK KAPI.
 *
 * Sıraç (2026-08-29): "Her silme işleminde mutlaka onay olmalı, yoksa direkt
 * silinip gidiyor. Profesyonel bir pop-up tasarımı çıkmalı tüm site genelinde."
 *
 * Uygulamada on yedi ayrı yerde tarayıcının `window.confirm()`'ü kullanılıyordu:
 * işletim sisteminin gri kutusu, markasız, Türkçe düğme adı bile bizde değil.
 * Bazı yerlerde (klasör silme, şerit kaldırma) hiç sorulmuyordu.
 *
 * Kullanımı `confirm()` kadar kısa olsun diye söz (Promise) döndürür:
 *
 *   const { ask, dialog } = useConfirm();
 *   …
 *   if (!(await ask({ message: "…silinsin mi?" }))) return;
 *   …
 *   return (<>{…}{dialog}</>);
 */
export function useConfirm() {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((_ok: boolean) => void) | null>(null);

  const ask = useCallback((next: ConfirmOptions) => {
    setOpts(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = useCallback((ok: boolean) => {
    // Önce sözü kapat, sonra pencereyi: açık kalan bir söz sonraki soruyu
    // sessizce yutuyordu.
    resolver.current?.(ok);
    resolver.current = null;
    setOpts(null);
  }, []);

  const dialog = (
    <ConfirmDialog
      open={!!opts}
      title={opts?.title}
      message={opts?.message ?? ""}
      confirmLabel={opts?.confirmLabel}
      cancelLabel={opts?.cancelLabel}
      tone={opts?.tone}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  );

  return { ask, dialog };
}
