"use client";

import { Bell } from "lucide-react";
import { useState, useTransition, useOptimistic } from "react";
import Link from "next/link";
import { markAllNotificationsRead, markNotificationsRead } from "@/lib/actions/tasks";
import type { Notification } from "@/types/database";
import { cn } from "@/lib/utils/cn";

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
        aria-label={`Notifications${optimisticCount > 0 ? ` (${optimisticCount} unread)` : ""}`}
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
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-20 w-80 rounded-xl bg-white shadow-lg border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">
                Notifications
                {optimisticCount > 0 && (
                  <span className="ml-2 text-xs font-normal text-gray-400">{optimisticCount} unread</span>
                )}
              </h3>
              {optimisticCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  Mark all read
                </button>
              )}
            </div>

            {/* List */}
            <div className={cn("overflow-y-auto max-h-80", notifications.length === 0 && "py-8")}>
              {notifications.length === 0 ? (
                <p className="text-center text-sm text-gray-400">No notifications yet</p>
              ) : (
                notifications.slice(0, 20).map((n) => (
                  <div
                    key={n.id}
                    className={cn(
                      "px-4 py-3 border-b border-gray-50 last:border-0 flex gap-3 items-start",
                      !n.is_read && "bg-blue-50/60"
                    )}
                  >
                    <div className={cn(
                      "h-2 w-2 rounded-full mt-1.5 shrink-0",
                      !n.is_read ? "bg-blue-500" : "bg-transparent"
                    )} />
                    <div className="flex-1 min-w-0">
                      {n.task_id ? (
                        <Link
                          href={`/tasks/${n.task_id}`}
                          onClick={() => { setOpen(false); if (!n.is_read) handleMarkOneRead(n.id); }}
                          className="text-sm font-medium text-gray-800 hover:text-blue-600 block truncate"
                        >
                          {n.title}
                        </Link>
                      ) : (
                        <p className="text-sm font-medium text-gray-800 truncate">{n.title}</p>
                      )}
                      {n.body && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
                      )}
                      <p className="text-[10px] text-gray-400 mt-1">
                        {new Date(n.created_at).toLocaleString()}
                      </p>
                    </div>
                    {!n.is_read && (
                      <button
                        onClick={() => handleMarkOneRead(n.id)}
                        className="text-[10px] text-gray-400 hover:text-blue-500 shrink-0 mt-0.5"
                        title="Mark as read"
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
