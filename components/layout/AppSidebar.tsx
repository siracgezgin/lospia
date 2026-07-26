"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
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
  ScrollText,
  Quote,
  ShieldCheck,
  LayoutGrid,
  Bookmark,
  Boxes,
  CalendarRange,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Wordmark } from "@/components/ui/Wordmark";
import { LOSPIA_BRAND, type AppBrand } from "@/lib/branding";
import { SAVED_VIEW_SLUG_MAP } from "@/lib/utils/task-constants";
import { VIEW_META } from "@/components/shared/ViewTabs";
import { getWeeklyQuote } from "@/lib/content/weekly-quotes";
import { canViewDestructivePages, canManageSettings } from "@/lib/auth/permissions";
import type { Workspace, SavedView, WorkspaceRole } from "@/types";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Kanban;
  adminOnly: boolean;
  children?: NavItem[];
};

// Bilgi mimarisi — Jira/DevOps netliği: üç grup, her grubun tek işi var.
//   Çalışma  → günlük ritim ve iş takibi (herkes)
//   Ürün     → koleksiyon/föy çekirdeği (herkes; Maliyet sekmesi sayfanın içinde)
//   Yönetim  → yalnız yöneticinin gördüğü her şey (modül kapısı dahil)
// Kural: bir ekran tek yerden erişilir; ikincil modüllerin kapısı Operasyon
// Modülleri hub'ıdır — sidebar'a yeni başlık eklemeden önce hub'ı düşün.
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Çalışma",
    items: [
      // Sıra operasyonun ritmini izler: haftalık takvim (Planlama) en üstte —
      // "ilk panon buna dönecek"; ardından iş akışı ekranları.
      { href: "/planning",    label: "Planlama",       icon: CalendarRange,   adminOnly: false },
      { href: "/board",       label: "Pano",           icon: Kanban,          adminOnly: false },
      { href: "/admin-board", label: "Yönetici Pano",  icon: ShieldCheck,     adminOnly: true  },
      { href: "/list",        label: "Liste",          icon: List,            adminOnly: false },
      { href: "/calendar",    label: "Görev Takvimi",  icon: Calendar,        adminOnly: false },
      { href: "/dashboard",   label: "Raporlar",       icon: LayoutDashboard, adminOnly: false },
    ],
  },
  {
    title: "Ürün",
    items: [
      { href: "/collection", label: "Koleksiyon", icon: Boxes, adminOnly: false },
    ],
  },
  {
    title: "Yönetim",
    items: [
      // Kurallar — Nisa Hanım'ın isteğiyle şimdilik gizlendi (route/veri korunur).
      // { href: "/rules",    label: "Kurallar",         icon: BookOpen,   adminOnly: false },
      { href: "/modules",  label: "Operasyon Modülleri", icon: LayoutGrid, adminOnly: true },
      { href: "/finance",  label: "Finans",           icon: Wallet,     adminOnly: true  },
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
  /** Host-aware app-shell brand (Lospia, or AF on the pilot host). */
  brand?: AppBrand;
  userId: string;
  userRole?: WorkspaceRole;
}

export function AppSidebar({
  workspace, savedViews, brand = LOSPIA_BRAND, userRole = "member",
}: Props) {
  const isAdmin = canViewDestructivePages(userRole) || canManageSettings(userRole);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // The board view currently open (drives saved-view active state). Defaults to
  // "all" — the board's own default (haftalık bölümleme kaldırıldı).
  const activeBoardView =
    pathname === "/board" ? searchParams.get("view") ?? "all" : null;
  const [collapsed, setCollapsed] = useState(false);
  const wsName = workspace?.name ?? "Operasyon";
  const weeklyQuote = getWeeklyQuote();

  return (
    <aside
      className={cn(
        "relative hidden md:flex flex-col bg-surface border-r border-line transition-all duration-200 shrink-0",
        collapsed ? "w-14" : "w-60",
      )}
    >
      {/* Brand row — host-aware product/pilot icon + workspace wordmark. The icon
          is the brand mark (collapsed state shows it alone); the wordmark is the
          tenant/workspace name and stays a separate concern. w-auto so a
          non-square pilot mark (AF) isn't distorted. */}
      <div className={cn("flex items-center gap-2.5 h-14 border-b border-line", collapsed ? "justify-center px-0" : "px-4")}>
        <img
          src={brand.icon}
          alt={brand.name}
          className="h-6 w-auto shrink-0 select-none"
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
              {items.map(({ href, label, icon: Icon, children }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                const kids = (children ?? []).filter((c) => !c.adminOnly || isAdmin);
                // Alt linkleri, bu bölümdeyken (parent veya çocuk aktif) ve panel
                // açıkken göster (web nav'daki gibi kategori açılımı).
                const showKids = kids.length > 0 && !collapsed && active;
                return (
                  <div key={href}>
                    <Link
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
                    {showKids && (
                      <div className="ml-4 mt-0.5 space-y-0.5 border-l border-line pl-2">
                        {kids.map(({ href: kHref, label: kLabel, icon: KIcon }) => {
                          // Tam eşleşme — /collection çocuğu /collection/maliyet'te aktif kalmasın.
                          const kActive = pathname === kHref;
                          return (
                            <Link
                              key={kHref}
                              href={kHref}
                              aria-current={kActive ? "page" : undefined}
                              className={cn(
                                "flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-medium transition-colors",
                                kActive
                                  ? "bg-brand-soft text-brand-strong"
                                  : "text-muted hover:bg-surface-muted hover:text-ink",
                              )}
                            >
                              <KIcon size={14} className="shrink-0" />
                              <span>{kLabel}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Saved views — proper rows sharing the board/list tab icon vocabulary,
            with an active state when the matching board view is open. */}
        {!collapsed && savedViews.length > 0 && (
          <div className="space-y-0.5">
            <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-subtle">
              Kaydedilen görünümler
            </p>
            {savedViews.map((view) => {
              const slug = SAVED_VIEW_SLUG_MAP[view.name] ?? view.id;
              const Icon = VIEW_META[slug as keyof typeof VIEW_META]?.icon ?? Bookmark;
              const active = activeBoardView === slug;
              return (
                <Link
                  key={view.id}
                  href={`/board?view=${slug}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] font-medium transition-colors truncate",
                    active
                      ? "bg-brand-soft text-brand-strong"
                      : "text-muted hover:bg-surface-muted hover:text-ink",
                  )}
                >
                  <Icon size={15} className={cn("shrink-0", active ? "text-brand" : "text-subtle group-hover:text-muted")} />
                  <span className="truncate">{view.name}</span>
                </Link>
              );
            })}
          </div>
        )}
      </nav>

      {/* Bottom stack: weekly quote. (Logout lives in the top-right profile
          menu.) İlerleme/puan kartı kaldırıldı — puan sistemi Aslı/Nisa
          isteğiyle gizli; verisi de artık layout'ta sorgulanmıyor. */}
      {!collapsed && (
        <div className="px-3 pt-2 pb-3 mt-auto space-y-2.5">
          {/* Haftanın sözü — weekly rotating editorial brand card. */}
          <div className="relative rounded-2xl border border-brand-soft bg-gradient-to-br from-[#f7ede9] via-brand-soft/40 to-surface px-4 pt-3.5 pb-4 overflow-hidden shadow-card">
            <Quote
              size={40}
              strokeWidth={1.5}
              className="absolute -top-1.5 -right-1 text-brand/15 rotate-180"
            />
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-brand-strong mb-1.5">
              {weeklyQuote.uiDisplaySuggestion || "Haftanın Sözü"}
            </p>
            <p
              className="relative text-[12px] leading-relaxed text-ink/85 italic font-medium line-clamp-5"
              title={weeklyQuote.quoteTr}
            >
              “{weeklyQuote.quoteTr}”
            </p>
            <p className="relative mt-2 text-[11px] font-semibold text-ink/70 not-italic">
              {weeklyQuote.author}
            </p>
            <p className="relative text-[10px] italic text-subtle leading-snug">
              {weeklyQuote.authorRole}
            </p>
          </div>

          {/* Brand sign-off — anchors the expanded sidebar with the full
              product/pilot logo (host-aware). A deliberate lockup, not a
              watermark: a hairline separates it from the content above, and its
              height is brand-driven (AF's wide wordmark reads small, so it sits
              taller than the Lospia lockup). Only rendered when expanded (this
              block is inside the !collapsed branch). */}
          <div className="mt-1 border-t border-hairline pt-4 pb-1 flex justify-center">
            <img
              src={brand.logo}
              alt={brand.name}
              className={cn(
                "w-auto max-w-[75%] object-contain opacity-90 transition-opacity duration-200 hover:opacity-100 select-none",
                brand.footerLogoHeightClass,
              )}
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
