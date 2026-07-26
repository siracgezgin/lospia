"use client";

import { useEffect, useId, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface Props {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Lightweight confirmation modal for destructive actions. Used wherever a click
 * would otherwise delete something instantly (members, access grants, department
 * assignments). Confirm is the only path that triggers the action.
 */
export function ConfirmDialog({
  open,
  title = "Silmek istediğinize emin misiniz?",
  message,
  confirmLabel = "Sil",
  cancelLabel = "Vazgeç",
  pending = false,
  onConfirm,
  onCancel,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={messageId}
    >
      <div
        className="anim-scale-in w-full max-w-sm rounded-modal border border-line bg-surface shadow-drawer p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-full bg-danger/10 p-2 text-danger ring-4 ring-danger/5">
            <AlertTriangle size={18} strokeWidth={1.75} />
          </div>
          <div className="space-y-1">
            <h2 id={titleId} className="text-sm font-semibold tracking-tight text-ink">{title}</h2>
            <p id={messageId} className="text-sm text-muted leading-relaxed">{message}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            variant="destructive"
            size="sm"
            onClick={onConfirm}
            loading={pending}
          >
            {pending ? "Siliniyor…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
