import { NotificationBell } from "@/components/notifications/NotificationBell";
import type { Workspace, Notification } from "@/types";

interface Props {
  workspace: Workspace | null;
  unreadCount: number;
  userId: string;
  notifications?: Notification[];
}

export function AppHeader({ workspace, unreadCount, userId, notifications = [] }: Props) {
  return (
    <header className="h-12 bg-white border-b border-gray-200 flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        {workspace && (
          <span className="font-medium text-gray-700">{workspace.name}</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <NotificationBell
          unreadCount={unreadCount}
          userId={userId}
          notifications={notifications}
        />
      </div>
    </header>
  );
}
