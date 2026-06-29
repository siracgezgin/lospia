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
}

export function NotificationBell({ unreadCount: initialCount, notifications = [] }: Props) {
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
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
      <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
        Bildirimler
        {optimisticCount > 0 && (
          <span className="text-[10px] font-semibold text-white bg-red-500 rounded-full px-1.5 py-0.5 leading-none">
            {optimisticCount}
          </span>
        )}
      </h3>
      {optimisticCount > 0 && (
        <button
          onClick={handleMarkAllRead}
          className="text-xs text-blue-600 hover:text-blue-700 font-medium"
        >
          Tümünü okundu işaretle
        </button>
      )}
    </div>
  );

  // List body (shared)
  const list = (
    notifications.length === 0 ? (
      <div className="flex flex-col items-center gap-2 text-center px-4 py-10">
        <Bell size={26} className="text-gray-200" />
        <p className="text-sm text-gray-400">Yeni bildiriminiz yok.</p>
      </div>
    ) : (
      notifications.slice(0, 20).map((n) => {
        const { title, body } = normalizeNotificationDisplay(n);
        // The title/body/date column is the click target → go to the task and
        // mark this row read. The check button is a separate read-only action.
        const inner = (
          <>
            <p className={cn(
              "text-sm text-gray-900 line-clamp-1 break-words",
              !n.is_read ? "font-medium" : "font-normal",
            )}>
              {title}
            </p>
            {body && (
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 break-words">{body}</p>
            )}
            <p className="text-[10px] text-gray-400 mt-1">
              {formatNotificationTimeTR(n.created_at)}
            </p>
          </>
        );
        return (
          <div
            key={n.id}
            className={cn(
              "px-4 py-2.5 border-b border-gray-50 last:border-0 flex gap-2.5 items-start transition-colors",
              !n.is_read
                ? "bg-blue-50/40 border-l-2 border-l-blue-400"
                : "bg-white border-l-2 border-l-transparent hover:bg-gray-50",
            )}
          >
            <div className={cn(
              "h-2 w-2 rounded-full mt-1.5 shrink-0",
              !n.is_read ? "bg-blue-400" : "bg-transparent",
            )} />
            {n.task_id ? (
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
            {!n.is_read && (
              <button
                onClick={() => handleMarkOneRead(n.id)}
                className="text-gray-300 hover:text-blue-500 shrink-0 mt-0.5 p-0.5"
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
        className="relative p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        aria-label={`Bildirimler${optimisticCount > 0 ? ` (${optimisticCount} okunmamış)` : ""}`}
      >
        <Bell size={18} />
        {optimisticCount > 0 && (
          <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {optimisticCount > 99 ? "99+" : optimisticCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Desktop / tablet: anchored dropdown */}
          <div className="hidden md:block">
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-9 z-50 w-[min(100vw-1.5rem,22rem)] rounded-xl bg-white shadow-pop border border-gray-200 overflow-hidden">
              {header}
              <div className="overflow-y-auto max-h-80">{list}</div>
            </div>
          </div>

          {/* Mobile: full-width bottom sheet (never clipped off-screen, z-50 above
              the bottom nav). Backdrop dismisses on tap. */}
          <div className="md:hidden fixed inset-0 z-50 flex items-end bg-black/30" onClick={() => setOpen(false)}>
            <div
              className="w-full bg-white rounded-t-2xl shadow-2xl flex flex-col max-h-[80dvh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  Bildirimler
                  {optimisticCount > 0 && (
                    <span className="text-[10px] font-semibold text-white bg-red-500 rounded-full px-1.5 py-0.5 leading-none">
                      {optimisticCount}
                    </span>
                  )}
                </h3>
                <div className="flex items-center gap-3">
                  {optimisticCount > 0 && (
                    <button onClick={handleMarkAllRead} className="text-xs text-blue-600 font-medium">
                      Tümünü okundu işaretle
                    </button>
                  )}
                  <button onClick={() => setOpen(false)} className="text-gray-400 p-0.5" aria-label="Kapat">
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
