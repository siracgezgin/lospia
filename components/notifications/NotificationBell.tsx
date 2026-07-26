"use client";

import { Bell, X, Check } from "lucide-react";
import { useState, useTransition, useOptimistic } from "react";
import Link from "next/link";
import { markAllNotificationsRead, markNotificationsRead } from "@/lib/actions/tasks";
import type { Notification } from "@/types";
import { cn } from "@/lib/utils/cn";
import { formatNotificationTimeTR } from "@/lib/utils/format-date";
import { normalizeNotificationDisplay } from "@/lib/notifications/normalize";

interface Props {
  unreadCount: number;
  userId: string;
  notifications?: Notification[];
  // task_ids whose task was deleted → their notifications become passive
  // ("Silinmiş görev"): shown for history, but never a live link into a dead task.
  deadTaskIds?: string[];
}

export function NotificationBell({ unreadCount: initialCount, notifications = [], deadTaskIds = [] }: Props) {
  const deadSet = new Set(deadTaskIds);
  const [open, setOpen] = useState(false);
  const [_pending, startTransition] = useTransition();
  const [optimisticCount, setOptimisticCount] = useOptimistic(initialCount);

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

  // Header (shared between desktop dropdown + mobile sheet)
  const header = (
    <div className="flex items-center justify-between px-4 py-3 border-b border-hairline shrink-0">
      <h3 className="text-sm font-semibold tracking-tight text-ink flex items-center gap-2">
        Bildirimler
        {optimisticCount > 0 && (
          <span className="text-[10px] font-semibold tabular-nums text-white bg-danger rounded-full px-1.5 py-0.5 leading-none">
            {optimisticCount}
          </span>
        )}
      </h3>
      {optimisticCount > 0 && (
        <button
          onClick={handleMarkAllRead}
          className="text-xs font-medium text-brand hover:text-brand-strong px-1.5 py-1 rounded-md hover:bg-brand-soft/60 transition-colors duration-150"
        >
          Tümünü okundu işaretle
        </button>
      )}
    </div>
  );

  // List body (shared)
  const list = (
    notifications.length === 0 ? (
      <div className="flex flex-col items-center gap-2.5 text-center px-4 py-10 anim-fade">
        <div className="grid h-11 w-11 place-items-center rounded-full bg-surface-sunken">
          <Bell size={20} className="text-subtle" />
        </div>
        <p className="text-sm text-subtle">Yeni bildiriminiz yok.</p>
      </div>
    ) : (
      notifications.slice(0, 20).map((n) => {
        const { title, body } = normalizeNotificationDisplay(n);
        // The task this notification points at was deleted → passive row: kept for
        // history, tagged "Silinmiş görev", never a live link into a dead task.
        const dead = n.task_id != null && deadSet.has(n.task_id);
        // The title/body/date column is the click target → go to the task and
        // mark this row read. The check button is a separate read-only action.
        const inner = (
          <>
            <div className="flex items-center gap-1.5">
              <p className={cn(
                "text-sm line-clamp-1 break-words min-w-0",
                dead ? "text-subtle font-normal" : "text-ink",
                !dead && !n.is_read ? "font-semibold" : "font-normal",
              )}>
                {title}
              </p>
              {dead && (
                <span className="shrink-0 text-[9px] font-medium uppercase tracking-wide text-subtle bg-surface-sunken rounded px-1 py-0.5 leading-none">
                  Silinmiş görev
                </span>
              )}
            </div>
            {body && (
              <p className={cn("text-xs mt-0.5 line-clamp-2 break-words", dead ? "text-subtle" : "text-muted")}>{body}</p>
            )}
            <p className="text-[10px] text-subtle mt-1 tabular-nums">
              {formatNotificationTimeTR(n.created_at)}
            </p>
          </>
        );
        // A dead notification is never unread-emphasised (it's excluded from the
        // badge count too), so it reads as resolved history.
        const showUnread = !n.is_read && !dead;
        // border-l-* colour is swallowed by tailwind-merge inside cn() — the
        // accent classes are concatenated as a plain string on purpose.
        const accent = showUnread ? "border-l-2 border-l-info" : "border-l-2 border-l-transparent";
        return (
          <div
            key={n.id}
            className={cn(
              "px-4 py-2.5 border-b border-hairline last:border-b-0 flex gap-2.5 items-start transition-colors duration-150",
              showUnread ? "bg-info/5" : "bg-surface",
              dead ? "opacity-80" : !showUnread && "hover:bg-surface-hover",
            ) + " " + accent}
          >
            <div className={cn(
              "h-2 w-2 rounded-full mt-1.5 shrink-0",
              showUnread ? "bg-info" : "bg-transparent",
            )} />
            {dead ? (
              // No navigation, no link — a deleted task has no detail page to open.
              <div className="flex-1 min-w-0" title="Bu görev silinmiş">
                {inner}
              </div>
            ) : n.task_id ? (
              <Link
                href={`/tasks/${n.task_id}`}
                onClick={() => { setOpen(false); if (!n.is_read) handleMarkOneRead(n.id); }}
                className="flex-1 min-w-0 group"
              >
                {inner}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => { if (!n.is_read) handleMarkOneRead(n.id); }}
                className="flex-1 min-w-0 text-left"
              >
                {inner}
              </button>
            )}
            {showUnread && (
              <button
                onClick={() => handleMarkOneRead(n.id)}
                className="text-subtle hover:text-info hover:bg-info/10 shrink-0 mt-0.5 p-1 rounded-md transition-colors duration-150"
                title="Okundu işaretle"
                aria-label="Okundu işaretle"
              >
                <Check size={14} />
              </button>
            )}
          </div>
        );
      })
    )
  );

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative grid h-10 w-10 md:h-9 md:w-9 place-items-center rounded-lg text-muted hover:text-ink hover:bg-surface-muted active:scale-95 transition-all duration-150 ease-standard"
        aria-label={`Bildirimler${optimisticCount > 0 ? ` (${optimisticCount} okunmamış)` : ""}`}
      >
        <Bell size={18} />
        {optimisticCount > 0 && (
          <span className="absolute top-0.5 right-0.5 h-4 min-w-4 px-1 rounded-full bg-danger text-white text-[10px] font-bold tabular-nums flex items-center justify-center leading-none ring-2 ring-surface">
            {optimisticCount > 99 ? "99+" : optimisticCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Desktop / tablet: anchored dropdown */}
          <div className="hidden md:block">
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-10 z-50 w-[min(100vw-1.5rem,22rem)] rounded-xl bg-surface shadow-pop border border-line overflow-hidden anim-fade-down">
              {header}
              <div className="overflow-y-auto max-h-80">{list}</div>
            </div>
          </div>

          {/* Mobile: full-width bottom sheet (never clipped off-screen, z-50 above
              the bottom nav). Backdrop dismisses on tap. */}
          <div className="md:hidden fixed inset-0 z-50 flex items-end bg-ink/30 anim-fade" onClick={() => setOpen(false)}>
            <div
              className="w-full bg-surface rounded-t-2xl shadow-drawer flex flex-col max-h-[80dvh] anim-slide-up"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-line-strong shrink-0" aria-hidden />
              <div className="flex items-center justify-between px-4 py-3 border-b border-hairline shrink-0">
                <h3 className="text-sm font-semibold tracking-tight text-ink flex items-center gap-2">
                  Bildirimler
                  {optimisticCount > 0 && (
                    <span className="text-[10px] font-semibold tabular-nums text-white bg-danger rounded-full px-1.5 py-0.5 leading-none">
                      {optimisticCount}
                    </span>
                  )}
                </h3>
                <div className="flex items-center gap-3">
                  {optimisticCount > 0 && (
                    <button onClick={handleMarkAllRead} className="text-xs font-medium text-brand hover:text-brand-strong transition-colors duration-150">
                      Tümünü okundu işaretle
                    </button>
                  )}
                  <button
                    onClick={() => setOpen(false)}
                    className="grid h-8 w-8 place-items-center rounded-lg text-subtle hover:text-ink hover:bg-surface-muted active:scale-95 transition-all duration-150"
                    aria-label="Kapat"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
                {list}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
