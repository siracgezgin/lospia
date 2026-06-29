"use client";

import { Bell } from "lucide-react";
import { useState, useTransition, useOptimistic } from "react";
import Link from "next/link";
import { markAllNotificationsRead, markNotificationsRead } from "@/lib/actions/tasks";
import type { Notification } from "@/types";
import { cn } from "@/lib/utils/cn";
import { formatDateTimeTR } from "@/lib/utils/format-date";

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

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        aria-label={`Bildirimler${optimisticCount > 0 ? ` (${optimisticCount} okunmamış)` : ""}`}
      >
        <Bell size={18} />
        {optimisticCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {optimisticCount > 9 ? "9+" : optimisticCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-50 w-80 rounded-xl bg-white shadow-pop border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
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

            {/* List */}
            <div className={cn("overflow-y-auto max-h-80", notifications.length === 0 && "py-10")}>
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center gap-2 text-center px-4">
                  <Bell size={26} className="text-gray-200" />
                  <p className="text-sm text-gray-400">Yeni bildiriminiz yok.</p>
                </div>
              ) : (
                notifications.slice(0, 20).map((n) => (
                  <div
                    key={n.id}
                    className={cn(
                      "px-4 py-3 border-b border-gray-50 last:border-0 flex gap-3 items-start transition-colors",
                      !n.is_read
                        ? "bg-blue-50/70 border-l-2 border-l-blue-500"
                        : "bg-white border-l-2 border-l-transparent hover:bg-gray-50",
                    )}
                  >
                    <div className={cn(
                      "h-2 w-2 rounded-full mt-1.5 shrink-0",
                      !n.is_read ? "bg-blue-500" : "bg-transparent",
                    )} />
                    <div className="flex-1 min-w-0">
                      {n.task_id ? (
                        <Link
                          href={`/tasks/${n.task_id}`}
                          onClick={() => { setOpen(false); if (!n.is_read) handleMarkOneRead(n.id); }}
                          className={cn(
                            "text-sm text-gray-800 hover:text-blue-600 block truncate",
                            !n.is_read ? "font-semibold" : "font-normal",
                          )}
                        >
                          {n.title}
                        </Link>
                      ) : (
                        <p className={cn(
                          "text-sm text-gray-800 truncate",
                          !n.is_read ? "font-semibold" : "font-normal",
                        )}>
                          {n.title}
                        </p>
                      )}
                      {n.body && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
                      )}
                      <p className="text-[10px] text-gray-400 mt-1">
                        {formatDateTimeTR(n.created_at)}
                      </p>
                    </div>
                    {!n.is_read && (
                      <button
                        onClick={() => handleMarkOneRead(n.id)}
                        className="text-[10px] text-gray-400 hover:text-blue-500 shrink-0 mt-0.5"
                        title="Okundu işaretle"
                      >
                        ✓
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
