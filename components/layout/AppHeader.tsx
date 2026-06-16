import Link from "next/link";
import { Bell } from "lucide-react";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import type { Workspace } from "@/types/database";

interface Props {
  workspace: Workspace | null;
  unreadCount: number;
  userId: string;
}

export function AppHeader({ workspace, unreadCount, userId }: Props) {
  return (
    <header className="h-12 bg-white border-b border-gray-200 flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        {workspace && (
          <>
            <span className="font-medium text-gray-700">{workspace.name}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <NotificationBell unreadCount={unreadCount} userId={userId} />
      </div>
    </header>
  );
}
