"use client";

import { Bell, Check } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition, useOptimistic } from "react";
import Link from "next/link";
import { markAllNotificationsRead, markNotificationsRead } from "@/lib/actions/tasks";
import type { Notification } from "@/types";
import { cn } from "@/lib/utils/cn";
import { formatNotificationTimeTR } from "@/lib/utils/format-date";
import { normalizeNotificationDisplay } from "@/lib/notifications/normalize";
import { Overlay } from "@/components/ui/Overlay";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

interface Props {
  unreadCount: number;
  userId: string;
  notifications?: Notification[];
  // task_ids whose task was deleted → their notifications become passive
  // ("Silinmiş görev"): shown for history, but never a live link into a dead task.
  deadTaskIds?: string[];
}

/* Masaüstü (md+) → çana bağlı popover; telefon → Overlay'in alt yaprağı.
   SSR'de "mobil" varsayılır; menü kapalı doğduğu için hidrasyon farkı yok. */
const DESKTOP_MQ = "(min-width: 768px)";
function subscribeDesktop(cb: () => void) {
  const mq = window.matchMedia(DESKTOP_MQ);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function useIsDesktop() {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_MQ).matches,
    () => false,
  );
}

/**
 * BİLDİRİM ÇANI.
 *
 * Önce iki elle yazılmış katman vardı: masaüstünde görünmez bir
 * `fixed inset-0` arka plan (tıklayınca kapatmak için), telefonda elle
 * kurulmuş bir alt yaprak. Popover artık DIŞARI TIKLAMA + Esc ile kapanır
 * (katman yok, sayfa kaydırılabilir kalır); telefondaki yaprak ortak Overlay.
 *
 * Okunmamış satır: sol kenar + koyu başlık + "okundu işaretle" düğmesi;
 * ekran okuyucuya ayrıca "Okunmadı" denir — renk tek başına sinyal değil.
 */
export function NotificationBell({ unreadCount: initialCount, notifications = [], deadTaskIds = [] }: Props) {
  const deadSet = new Set(deadTaskIds);
  const [open, setOpen] = useState(false);
  const [_pending, startTransition] = useTransition();
  const [optimisticCount, setOptimisticCount] = useOptimistic(initialCount);
  const isDesktop = useIsDesktop();
  const rootRef = useRef<HTMLDivElement>(null);

  // Popover: dışarı tıklayınca ve Esc'te kapan.
  useEffect(() => {
    if (!open || !isDesktop) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, isDesktop]);

  function handleMarkAllRead() {
    startTransition(async () => {
      setOptimisticCount(0);
      await markAllNotificationsRead();
      setOpen(false);
    });
  }

  function handleMarkOneRead(id: string) {
    startTransition(async () => {
      setOptimisticCount((c) => Math.max(0, c - 1));
      await markNotificationsRead([id]);
    });
  }

  const countBadge = optimisticCount > 0 && (
    <Badge size="xs" className="bg-danger text-white">{optimisticCount}</Badge>
  );
  const markAll = optimisticCount > 0 && (
    <Button variant="ghost" size="sm" onClick={handleMarkAllRead} className="h-7 px-2 text-[12.5px] text-brand hover:text-brand-strong">
      Tümünü okundu işaretle
    </Button>
  );

  // Popover başlığı (masaüstü)
  const header = (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-hairline px-4 py-2.5">
      <h3 className="flex items-center gap-2 text-[13.5px] font-semibold tracking-tight text-ink">
        Bildirimler
        {countBadge}
      </h3>
      {markAll}
    </div>
  );

  // List body (shared)
  const list = (
    notifications.length === 0 ? (
      <div className="anim-fade flex flex-col items-center gap-2.5 px-4 py-10 text-center">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-surface-sunken">
          <Bell size={18} className="text-subtle" aria-hidden />
        </div>
        <p className="text-[13.5px] text-subtle">Yeni bildiriminiz yok.</p>
      </div>
    ) : (
      notifications.slice(0, 20).map((n) => {
        const { title, body } = normalizeNotificationDisplay(n);
        // The task this notification points at was deleted → passive row: kept for
        // history, tagged "Silinmiş görev", never a live link into a dead task.
        const dead = n.task_id != null && deadSet.has(n.task_id);
        // A dead notification is never unread-emphasised (it's excluded from the
        // badge count too), so it reads as resolved history.
        const showUnread = !n.is_read && !dead;
        // The title/body/date column is the click target → go to the task and
        // mark this row read. The check button is a separate read-only action.
        const inner = (
          <>
            <div className="flex items-center gap-1.5">
              {showUnread && <span className="sr-only">Okunmadı. </span>}
              <p className={cn(
                "min-w-0 line-clamp-1 break-words text-[13.5px]",
                dead ? "font-normal text-subtle" : "text-ink",
                showUnread ? "font-semibold" : "font-normal",
              )}>
                {title}
              </p>
              {dead && (
                <Badge size="xs" className="shrink-0 bg-surface-sunken text-subtle">Silinmiş görev</Badge>
              )}
            </div>
            {body && (
              <p className={cn("mt-0.5 line-clamp-2 break-words text-[12.5px] leading-snug", dead ? "text-subtle" : "text-muted")}>{body}</p>
            )}
            <p className="mt-1 text-[12px] tabular-nums text-subtle">
              {formatNotificationTimeTR(n.created_at)}
            </p>
          </>
        );
        // border-l-* colour is swallowed by tailwind-merge inside cn() — the
        // accent classes are concatenated as a plain string on purpose.
        const accent = showUnread ? "border-l-2 border-l-info" : "border-l-2 border-l-transparent";
        return (
          <div
            key={n.id}
            className={cn(
              "flex items-start gap-2.5 border-b border-hairline px-4 py-2.5 transition-colors duration-150 last:border-b-0",
              showUnread ? "bg-info/5" : "bg-surface",
              !dead && "hover:bg-surface-hover",
            ) + " " + accent}
          >
            {dead ? (
              // No navigation, no link — a deleted task has no detail page to open.
              <div className="min-w-0 flex-1" title="Bu görev silinmiş">
                {inner}
              </div>
            ) : n.task_id ? (
              <Link
                href={`/tasks/${n.task_id}`}
                onClick={() => { setOpen(false); if (!n.is_read) handleMarkOneRead(n.id); }}
                className="min-w-0 flex-1 rounded-control"
              >
                {inner}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => { if (!n.is_read) handleMarkOneRead(n.id); }}
                className="min-w-0 flex-1 rounded-control text-left"
              >
                {inner}
              </button>
            )}
            {showUnread && (
              <IconButton
                size="sm"
                aria-label="Okundu işaretle"
                title="Okundu işaretle"
                onClick={() => handleMarkOneRead(n.id)}
                className="-mr-1 -mt-0.5 hover:bg-info/10 hover:text-info"
              >
                <Check size={14} />
              </IconButton>
            )}
          </div>
        );
      })
    )
  );

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative grid h-10 w-10 place-items-center rounded-control text-muted transition-[background-color,color,transform] duration-150 ease-standard hover:bg-surface-muted hover:text-ink active:scale-95 md:h-9 md:w-9"
        aria-label={`Bildirimler${optimisticCount > 0 ? ` (${optimisticCount} okunmamış)` : ""}`}
      >
        <Bell size={18} aria-hidden />
        {optimisticCount > 0 && (
          /* Rozet içi sayı — Badge xs ile aynı ölçü (11.5px). */
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[11.5px] font-semibold leading-none tabular-nums text-white ring-2 ring-surface">
            {optimisticCount > 99 ? "99+" : optimisticCount}
          </span>
        )}
      </button>

      {/* Masaüstü / tablet: çana bağlı popover */}
      {open && isDesktop && (
        <div
          role="dialog"
          aria-label="Bildirimler"
          className="anim-fade-down absolute right-0 top-11 z-50 w-[min(100vw-1.5rem,22rem)] overflow-hidden rounded-card border border-line bg-surface shadow-pop"
        >
          {header}
          <div className="max-h-80 overflow-y-auto overscroll-contain">{list}</div>
        </div>
      )}

      {/* Telefon: ortak Overlay'in alt yaprağı */}
      {open && !isDesktop && (
        <Overlay
          open
          onClose={() => setOpen(false)}
          size="sm"
          titleNode={
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[15px] font-semibold tracking-tight text-ink">Bildirimler</h2>
              {countBadge}
              {markAll}
            </div>
          }
        >
          {/* Satırlar kendi iç boşluğunu taşır; gövdenin dolgusu geri alınır. */}
          <div className="-mx-5 -my-4">{list}</div>
        </Overlay>
      )}
    </div>
  );
}
