"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { ChevronDown, LogOut, Mail, Shield, Sparkles, Clock3, Settings } from "lucide-react";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { Avatar } from "@/components/ui/Avatar";
import { getPersonDisplayName } from "@/lib/utils/person-display";
import { ROLE_LABELS } from "@/lib/utils/roles";
import { canManageSettings } from "@/lib/auth/permissions";
import { signOut } from "@/lib/actions/auth";
import type { Workspace, Notification, WorkspaceRole } from "@/types";

interface Props {
  workspace: Workspace | null;
  unreadCount: number;
  userId: string;
  userName?: string | null;
  userEmail?: string | null;
  notifications?: Notification[];
  deadTaskIds?: string[];
  userRole?: WorkspaceRole;
  pointsThisMonth?: number;
  pendingPoints?: number;
}

// Page-context titles. Header shows WHERE you are; the sidebar owns brand/workspace.
const PAGE_TITLES: { match: (p: string) => boolean; title: string }[] = [
  { match: (p) => p.startsWith("/admin-board"), title: "Yönetici Pano" },
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

function ProfileMenu({
  displayName,
  email,
  role,
  pointsThisMonth,
  pendingPoints,
}: {
  displayName: string;
  email: string | null;
  role: WorkspaceRole;
  pointsThisMonth: number;
  pendingPoints: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 pl-3 border-l border-line rounded-lg py-1 pr-1 hover:bg-surface-muted transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
        title={`${displayName} · ${ROLE_LABELS[role]}`}
      >
        <Avatar name={displayName} size="sm" />
        <div className="hidden sm:flex flex-col leading-tight text-left">
          <span className="text-xs font-medium text-ink truncate max-w-[140px]">{displayName}</span>
          <span className="text-[10px] text-subtle">{ROLE_LABELS[role]}</span>
        </div>
        <ChevronDown size={13} className={`text-subtle transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-surface border border-line rounded-xl shadow-pop z-50 overflow-hidden">
          {/* Identity card — name + email (role lives once, in Details below) */}
          <div className="flex items-center gap-3 px-4 py-3.5 bg-surface-muted/60 border-b border-line">
            <Avatar name={displayName} size="md" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink truncate">{displayName}</p>
              {/* Canonical display e-mail (never a @lospia.local placeholder);
                  muted fallback when the person has no real address. */}
              <p className="flex items-center gap-1.5 text-[11px] text-subtle truncate">
                <Mail size={11} className="shrink-0" />
                <span className={email ? "truncate" : "truncate italic text-subtle/80"}>
                  {email ?? "E-posta eklenmedi"}
                </span>
              </p>
            </div>
          </div>

          {/* Details — role shown exactly once */}
          <div className="px-4 py-3 border-b border-line">
            <div className="flex items-center gap-2 text-[12px] text-muted">
              <Shield size={13} className="text-subtle shrink-0" />
              <span>{ROLE_LABELS[role]}</span>
            </div>
          </div>

          {/* Kişisel puan özeti — yalnızca kendi puanınız. Başka kimsenin puanı görünmez. */}
          <div className="px-4 py-3 border-b border-line space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-[12px] text-muted">
                <Sparkles size={13} className="text-brand shrink-0" />
                Bu ay
              </span>
              <span className="text-[12px] font-semibold text-ink tabular-nums">
                {pointsThisMonth} puan
              </span>
            </div>
            <div
              className="flex items-center justify-between"
              title="Görev yönetici tarafından tamamlandığında kesinleşir."
            >
              <span className="flex items-center gap-2 text-[12px] text-muted">
                <Clock3 size={13} className="text-subtle shrink-0" />
                Onay bekleyen
              </span>
              <span className="text-[12px] font-medium text-muted tabular-nums">
                {pendingPoints} puan
              </span>
            </div>
          </div>

          {/* Ayarlar — admin-only. On mobile the bottom nav no longer carries
              Ayarlar (it shows Yönetici Pano), so this is its primary phone entry. */}
          {canManageSettings(role) && (
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-muted hover:bg-surface-muted hover:text-ink transition-colors border-b border-line"
            >
              <Settings size={15} className="shrink-0" />
              Ayarlar
            </Link>
          )}

          {/* Sign out */}
          <form action={signOut}>
            <button
              type="submit"
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-muted hover:bg-danger/10 hover:text-danger transition-colors"
            >
              <LogOut size={15} className="shrink-0" />
              Çıkış yap
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export function AppHeader({
  unreadCount, userId, userName, userEmail, notifications = [], deadTaskIds = [], userRole = "member",
  pointsThisMonth = 0, pendingPoints = 0,
}: Props) {
  const pathname = usePathname();
  const title = PAGE_TITLES.find((t) => t.match(pathname))?.title ?? "";
  const displayName = getPersonDisplayName(userName ?? userEmail ?? null);

  // Mobile profile access lives in the bottom nav (members get a Profil tab),
  // so the top-right avatar is redundant on phones for members — and on the
  // /profile page itself for everyone. Admins keep it on mobile (their bottom
  // nav shows Ayarlar, not Profil). Desktop always shows it.
  const isAdmin = userRole === "owner" || userRole === "admin";
  const onProfile = pathname.startsWith("/profile");
  const showProfileOnMobile = isAdmin && !onProfile;

  return (
    <header className="relative z-30 h-14 bg-surface border-b border-line flex items-center justify-between px-5 shrink-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <h1 className="text-[15px] font-semibold text-ink truncate">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        <NotificationBell unreadCount={unreadCount} userId={userId} notifications={notifications} deadTaskIds={deadTaskIds} />
        <div className={showProfileOnMobile ? "block" : "hidden md:block"}>
          <ProfileMenu
            displayName={displayName}
            email={userEmail ?? null}
            role={userRole}
            pointsThisMonth={pointsThisMonth}
            pendingPoints={pendingPoints}
          />
        </div>
      </div>
    </header>
  );
}
