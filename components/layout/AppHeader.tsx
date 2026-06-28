"use client";

import { usePathname } from "next/navigation";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { getPersonDisplayName } from "@/lib/utils/person-display";
import type { Workspace, Notification, WorkspaceRole } from "@/types";

interface Props {
  workspace: Workspace | null;
  unreadCount: number;
  userId: string;
  userName?: string | null;
  userEmail?: string | null;
  notifications?: Notification[];
  userRole?: WorkspaceRole;
}

const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: "Sahip",
  admin: "Yönetici",
  member: "Üye",
  viewer: "İzleyici",
};

// Page-context titles. Header shows WHERE you are; the sidebar owns brand/workspace.
const PAGE_TITLES: { match: (p: string) => boolean; title: string }[] = [
  { match: (p) => p.startsWith("/board"), title: "Pano" },
  { match: (p) => p.startsWith("/list"), title: "Liste" },
  { match: (p) => p.startsWith("/dashboard"), title: "Gösterge Paneli" },
  { match: (p) => p.startsWith("/calendar"), title: "Takvim" },
  { match: (p) => p.startsWith("/rules"), title: "Kurallar" },
  { match: (p) => p.startsWith("/archive"), title: "Arşiv" },
  { match: (p) => p.startsWith("/trash"), title: "Çöp Kutusu" },
  { match: (p) => p.startsWith("/settings"), title: "Ayarlar" },
  { match: (p) => p.startsWith("/tasks/"), title: "Görev" },
];

export function AppHeader({
  unreadCount, userId, userName, userEmail, notifications = [], userRole = "member",
}: Props) {
  const pathname = usePathname();
  const title = PAGE_TITLES.find((t) => t.match(pathname))?.title ?? "";
  const displayName = getPersonDisplayName(userName ?? userEmail ?? null);

  return (
    <header className="h-14 bg-surface border-b border-line flex items-center justify-between px-5 shrink-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <h1 className="text-[15px] font-semibold text-ink truncate">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        <NotificationBell unreadCount={unreadCount} userId={userId} notifications={notifications} />
        {/* Current user identity — initials avatar, name on sm+, role badge */}
        <div className="flex items-center gap-2 pl-3 border-l border-line" title={`${displayName} · ${ROLE_LABELS[userRole]}`}>
          <Avatar name={displayName} size="sm" />
          <div className="hidden sm:flex flex-col leading-tight">
            <span className="text-xs font-medium text-ink truncate max-w-[140px]">{displayName}</span>
            <span className="text-[10px] text-subtle">{ROLE_LABELS[userRole]}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
