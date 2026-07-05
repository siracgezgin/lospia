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
  Quote,
  TrendingUp,
  ArrowRight,
  ShieldCheck,
  LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Wordmark } from "@/components/ui/Wordmark";
import { LOSPIA_ICON, LOSPIA_LOGO, PRODUCT_NAME } from "@/lib/branding";
import { SAVED_VIEW_SLUG_MAP } from "@/lib/utils/task-constants";
import { quoteForWeek } from "@/lib/utils/weekly-quotes";
import { canViewDestructivePages, canManageSettings } from "@/lib/auth/permissions";
import type { Workspace, SavedView, WorkspaceRole } from "@/types";

type NavItem = { href: string; label: string; icon: typeof Kanban; adminOnly: boolean };

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Çalışma alanı",
    items: [
      { href: "/board",        label: "Pano",            icon: Kanban,          adminOnly: false },
      { href: "/admin-board",  label: "Yönetici Pano",   icon: ShieldCheck,     adminOnly: true  },
      { href: "/list",         label: "Liste",           icon: List,            adminOnly: false },
      { href: "/modules",      label: "Operasyon Modülleri", icon: LayoutGrid,  adminOnly: true  },
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
  // Team totals (admin card)
  teamDoneThisMonth?: number;
  teamReviewCount?: number;
  // Personal totals (member card)
  myDoneThisMonth?: number;
  myReviewCount?: number;
  myPoints?: number;
}

export function AppSidebar({
  workspace, savedViews, userRole = "member",
  teamDoneThisMonth = 0, teamReviewCount = 0,
  myDoneThisMonth = 0, myReviewCount = 0, myPoints = 0,
}: Props) {
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
      {/* Brand row — Lospia product icon + workspace wordmark. The icon is the
          product mark (collapsed state shows it alone); the wordmark is the
          tenant/workspace name and stays a separate concern. */}
      <div className={cn("flex items-center gap-2.5 h-14 border-b border-line", collapsed ? "justify-center px-0" : "px-4")}>
        <img
          src={LOSPIA_ICON}
          alt={PRODUCT_NAME}
          className="h-6 w-6 shrink-0 select-none"
          draggable={false}
        />
        {!collapsed && <Wordmark name={wsName} />}
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

      {/* Bottom stack: team progress (non-competitive) + weekly quote.
          (Logout now lives in the top-right profile menu.) */}
      {!collapsed && (
        <div className="px-3 pt-2 pb-3 mt-auto space-y-2.5">
          {/* İlerleme kartı — admin sees the team total; a member sees ONLY their
              own progress (no team figures, so there's no competitive framing). */}
          <div className="rounded-2xl border border-line bg-surface px-4 pt-3 pb-3.5 shadow-card">
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-subtle mb-2 flex items-center gap-1.5">
              <TrendingUp size={12} className="text-brand" />
              {isAdmin ? "Bu Ayın İlerlemesi" : "Bu Ayki İlerlemem"}
            </p>
            {isAdmin ? (
              <>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-muted">Ekipçe tamamlanan</span>
                    <span className="font-semibold text-ink tabular-nums">{teamDoneThisMonth}</span>
                  </div>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-muted">Kontrol bekleyen</span>
                    <span className="font-semibold text-ink tabular-nums">{teamReviewCount}</span>
                  </div>
                </div>
                <p className="text-[10.5px] leading-relaxed text-subtle mt-2.5">
                  Katkılar görünür oldukça ekip güçlenir.
                </p>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-muted">Tamamladığım işler</span>
                    <span className="font-semibold text-ink tabular-nums">{myDoneThisMonth}</span>
                  </div>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-muted">Kontrol bekleyen işlerim</span>
                    <span className="font-semibold text-ink tabular-nums">{myReviewCount}</span>
                  </div>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-muted">Puanım</span>
                    <span className="font-semibold text-ink tabular-nums">{myPoints}</span>
                  </div>
                </div>
                <p className="text-[10.5px] leading-relaxed text-subtle mt-2.5">
                  Katkın görünür oldukça süreç güçlenir.
                </p>
              </>
            )}
            <Link
              href="/dashboard#puan-motivasyon"
              className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:text-brand-strong transition-colors"
            >
              Puan özetini gör
              <ArrowRight size={11} />
            </Link>
          </div>

          {/* Haftanın sözü — weekly rotating editorial brand card. */}
          <div className="relative rounded-2xl border border-brand-soft bg-gradient-to-br from-[#f7ede9] via-brand-soft/40 to-surface px-4 pt-3.5 pb-4 overflow-hidden shadow-card">
            <Quote
              size={40}
              strokeWidth={1.5}
              className="absolute -top-1.5 -right-1 text-brand/15 rotate-180"
            />
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-brand-strong mb-1.5">
              Haftanın Sözü
            </p>
            <p className="relative text-[12px] leading-relaxed text-ink/85 italic font-medium">
              “{weeklyQuote}”
            </p>
          </div>

          {/* Lospia product lockup — anchors the expanded sidebar with the
              full product logo. Only rendered when expanded (this block is
              inside the !collapsed branch). */}
          <div className="pt-1.5 flex justify-center">
            <img
              src={LOSPIA_LOGO}
              alt={PRODUCT_NAME}
              className="h-7 w-auto object-contain opacity-80 select-none"
              draggable={false}
            />
          </div>
        </div>
      )}

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
