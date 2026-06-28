"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Kanban,
  List,
  Calendar,
  Settings,
  ChevronLeft,
  ChevronRight,
  Archive,
  Trash2,
  BookOpen,
  ScrollText,
  LogOut,
  Quote,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { signOut } from "@/lib/actions/auth";
import { Wordmark } from "@/components/ui/Wordmark";
import { SAVED_VIEW_SLUG_MAP } from "@/lib/utils/task-constants";
import { quoteForWeek } from "@/lib/utils/weekly-quotes";
import { canViewDestructivePages, canManageSettings } from "@/lib/auth/permissions";
import type { Workspace, SavedView, WorkspaceRole } from "@/types";

type NavItem = { href: string; label: string; icon: typeof Kanban; adminOnly: boolean };

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Çalışma alanı",
    items: [
      { href: "/board",     label: "Pano",            icon: Kanban,          adminOnly: false },
      { href: "/list",      label: "Liste",           icon: List,            adminOnly: false },
      { href: "/dashboard", label: "Gösterge Paneli", icon: LayoutDashboard, adminOnly: false },
      { href: "/calendar",  label: "Takvim",          icon: Calendar,        adminOnly: false },
    ],
  },
  {
    title: "Yönetim",
    items: [
      { href: "/rules",    label: "Kurallar",         icon: BookOpen,   adminOnly: false },
      { href: "/activity", label: "Aktivite Günlüğü", icon: ScrollText, adminOnly: true  },
      { href: "/archive",  label: "Arşiv",            icon: Archive,    adminOnly: true  },
      { href: "/trash",    label: "Çöp Kutusu",       icon: Trash2,     adminOnly: true  },
      { href: "/settings", label: "Ayarlar",          icon: Settings,   adminOnly: true  },
    ],
  },
];

interface Props {
  workspace: Workspace | null;
  savedViews: SavedView[];
  userId: string;
  userRole?: WorkspaceRole;
}

export function AppSidebar({ workspace, savedViews, userRole = "member" }: Props) {
  const isAdmin = canViewDestructivePages(userRole) || canManageSettings(userRole);
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const wsName = workspace?.name ?? "Operasyon";
  const weeklyQuote = quoteForWeek().text;

  return (
    <aside
      className={cn(
        "relative hidden md:flex flex-col bg-surface border-r border-line transition-all duration-200 shrink-0",
        collapsed ? "w-14" : "w-60",
      )}
    >
      {/* Brand row — text-based workspace identity, and only here. */}
      <div className={cn("flex items-center h-14 border-b border-line", collapsed ? "justify-center px-0" : "px-4")}>
        <Wordmark name={wsName} compact={collapsed} />
      </div>

      {/* Nav groups */}
      <nav className="flex-1 px-2 py-3 space-y-4 overflow-y-auto">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((i) => !i.adminOnly || isAdmin);
          if (items.length === 0) return null;
          return (
            <div key={group.title} className="space-y-0.5">
              {!collapsed && (
                <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-subtle">
                  {group.title}
                </p>
              )}
              {items.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-brand-soft text-brand-strong"
                        : "text-muted hover:bg-surface-muted hover:text-ink",
                      collapsed && "justify-center px-2",
                    )}
                    title={collapsed ? label : undefined}
                  >
                    {active && !collapsed && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r bg-brand" />
                    )}
                    <Icon size={16} className="shrink-0" />
                    {!collapsed && <span>{label}</span>}
                  </Link>
                );
              })}
            </div>
          );
        })}

        {/* Saved views — compact so they don't dominate the sidebar */}
        {!collapsed && savedViews.length > 0 && (
          <div className="space-y-px">
            <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-subtle">
              Kaydedilen görünümler
            </p>
            {savedViews.map((view) => (
              <Link
                key={view.id}
                href={`/board?view=${SAVED_VIEW_SLUG_MAP[view.name] ?? view.id}`}
                className="flex items-center gap-2 rounded-md pl-3 pr-2 py-1 text-[13px] text-muted hover:bg-surface-muted hover:text-ink transition-colors truncate"
              >
                <span className="h-1 w-1 rounded-full bg-line-strong shrink-0" />
                <span className="truncate">{view.name}</span>
              </Link>
            ))}
          </div>
        )}
      </nav>

      {/* Haftanın sözü — weekly rotating brand line, above logout */}
      {!collapsed && (
        <div className="px-2 pb-1.5">
          <div className="relative rounded-xl border border-brand-soft bg-gradient-to-br from-brand-soft/50 to-surface px-3 py-2.5 overflow-hidden">
            <Quote size={28} className="absolute -top-1 right-1 text-brand/15" />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-strong/80 mb-1">
              Haftanın sözü
            </p>
            <p className="relative text-[11.5px] leading-snug text-ink/80 italic line-clamp-3">
              {weeklyQuote}
            </p>
          </div>
        </div>
      )}

      {/* Footer: sign out */}
      <div className={cn("border-t border-line p-2", collapsed && "px-1")}>
        <form action={signOut}>
          <button
            type="submit"
            className={cn(
              "w-full flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-muted hover:bg-[#fbeae7] hover:text-[#a83a2c] transition-colors",
              collapsed && "justify-center",
            )}
            title={collapsed ? "Çıkış yap" : undefined}
          >
            <LogOut size={16} className="shrink-0" />
            {!collapsed && <span>Çıkış yap</span>}
          </button>
        </form>
      </div>

      {/* Floating edge control — vertically centered on the sidebar/content
          boundary. Subtle by default, fully visible on hover. Anchored to the
          sidebar's right edge so it tracks the width transition with no jump. */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="absolute top-1/2 -right-3 -translate-y-1/2 z-20 grid h-6 w-6 place-items-center rounded-full bg-surface border border-line shadow-card text-subtle opacity-60 hover:opacity-100 hover:text-muted hover:border-line-strong transition-all"
        aria-label={collapsed ? "Kenar çubuğunu genişlet" : "Kenar çubuğunu daralt"}
        title={collapsed ? "Genişlet" : "Daralt"}
      >
        {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
      </button>
    </aside>
  );
}
