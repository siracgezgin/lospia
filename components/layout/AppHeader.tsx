"use client";

import { usePathname } from "next/navigation";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { Badge } from "@/components/ui/Badge";
import type { Workspace, Notification, WorkspaceRole } from "@/types";

interface Props {
  workspace: Workspace | null;
  unreadCount: number;
  userId: string;
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

export function AppHeader({ unreadCount, userId, notifications = [], userRole = "member" }: Props) {
  const pathname = usePathname();
  const title = PAGE_TITLES.find((t) => t.match(pathname))?.title ?? "";

  return (
    <header className="h-14 bg-surface border-b border-line flex items-center justify-between px-5 shrink-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <h1 className="text-[15px] font-semibold text-ink truncate">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        <Badge size="xs" className="bg-surface-sunken text-subtle font-medium">
          {ROLE_LABELS[userRole]}
        </Badge>
        <NotificationBell unreadCount={unreadCount} userId={userId} notifications={notifications} />
      </div>
    </header>
  );
}
