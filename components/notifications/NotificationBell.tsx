"use client";

import { Bell } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";

interface Props {
  unreadCount: number;
  userId: string;
}

export function NotificationBell({ unreadCount }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [_pending, startTransition] = useTransition();

  function handleMarkAllRead() {
    // Will be wired to a server action in Phase 12
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          {/* Popover */}
          <div className="absolute right-0 top-8 z-20 w-80 rounded-xl bg-white shadow-lg border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className={cn("py-3", unreadCount === 0 && "py-8")}>
              {unreadCount === 0 ? (
                <p className="text-center text-sm text-gray-400">No new notifications</p>
              ) : (
                <p className="text-center text-sm text-gray-500 py-2">
                  {unreadCount} unread — full list in Phase 12
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
