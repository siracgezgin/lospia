"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Kanban,
  Settings,
  ChevronLeft,
  ChevronRight,
  Quote,
  ShieldCheck,
  LayoutGrid,
  Boxes,
  CalendarRange,
  Contact,
  FolderOpen,
  Home,
  Palette,
  Table2,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Wordmark } from "@/components/ui/Wordmark";
import { LOSPIA_BRAND, type AppBrand } from "@/lib/branding";
import { getWeeklyQuote } from "@/lib/content/weekly-quotes";
import { canViewDestructivePages, canManageSettings } from "@/lib/auth/permissions";
import type { Workspace, WorkspaceRole } from "@/types";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Kanban;
  adminOnly: boolean;
  children?: NavItem[];
};

// Bilgi mimarisi — bölüm dili hub (/modules) ile BİREBİR aynı:
//   Çekirdek Operasyon → günlük ritim ve iş takibi (herkes)
//   Ürün               → koleksiyon/föy + maliyet (herkes)
//   Ofis Merkezi       → doküman/şablon/tablo/kreatif (herkes görür)
//   İlişkiler          → CRM (herkes görür, yönetici düzenler)
//   Yönetim            → müdahale yüzeyleri (Yönetici Pano, Ayarlar: admin;
//                        hub genel bakışı herkese açık). Finans/Aktivite/
//                        Arşiv/Çöp sidebar'dan hub'a taşındı — sidebar'da
//                        yalnız sık kullanılan müdahale kapıları kalır.
// Kural: bir ekran TEK isimle yaşar (lib/modules/registry.ts kanonik kaynak).
/**
 * ÜÇ SABİT GRUP.
 *
 * Beş başlık vardı ve ikisi tek maddeliydi ("Product" → yalnız Collection,
 * "Relations" → yalnız CRM); göz beş başlık okuyup on iki maddeyi buluyordu.
 * Ofis ekranları ve CRM ürünle aynı gruba girdi. Bölüm dili registry'deki
 * MODULE_GROUP_TITLES ile birebir aynı olmalı (tek terminoloji kuralı).
 */
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Core Operations",
    items: [
      // Home Page = kişisel komuta merkezi (bana atananlar + kısayollar).
      // Calendar = TEK takvim: hafta ızgarası + ay + yıl aynı ekranda
      // (Aslı Hanım, 2026-08-19: "Bence tek takvim yap"). Liste kaldırıldı
      // ("buna gerek olmayabilir") — rota duruyor, hub'dan erişilir.
      { href: "/home",      label: "Home Page", icon: Home,            adminOnly: false },
      { href: "/planning",  label: "Calendar",  icon: CalendarRange,   adminOnly: false },
      { href: "/board",     label: "Board",     icon: Kanban,          adminOnly: false },
      { href: "/dashboard", label: "Reports",   icon: LayoutDashboard, adminOnly: false },
    ],
  },
  {
    // Maliyet ve Ödeme Tablosu, Collection sayfasının içindeki sekmelerdir —
    // sol bara ikinci giriş verilmez (kullanıcı isteği, 2026-07-27).
    title: "Product & Office",
    items: [
      { href: "/collection", label: "Collection",     icon: Boxes,      adminOnly: false },
      { href: "/documents",  label: "Documents",      icon: FolderOpen, adminOnly: false },
      { href: "/sheets",     label: "Sheets",         icon: Table2,     adminOnly: false },
      { href: "/creative",   label: "Creative Links", icon: Palette,    adminOnly: false },
      { href: "/crm",        label: "CRM",            icon: Contact,    adminOnly: false },
    ],
  },
  {
    title: "Admin",
    items: [
      { href: "/modules",     label: "Operation Modules", icon: LayoutGrid,  adminOnly: false },
      { href: "/admin-board", label: "Admin Board",       icon: ShieldCheck, adminOnly: true  },
      { href: "/settings",    label: "Settings",          icon: Settings,    adminOnly: true  },
    ],
  },
];

interface Props {
  workspace: Pick<Workspace, "id" | "name"> | null;
  /** Host-aware app-shell brand (Lospia, or AF on the pilot host). */
  brand?: AppBrand;
  userId: string;
  userRole?: WorkspaceRole;
}

export function AppSidebar({
  workspace, brand = LOSPIA_BRAND, userRole = "member",
}: Props) {
  const isAdmin = canViewDestructivePages(userRole) || canManageSettings(userRole);
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const wsName = workspace?.name ?? "Operasyon";
  const weeklyQuote = getWeeklyQuote();

  // Aktif öğe = EN UZUN eşleşen href (tek kazanan) — /collection/maliyet
  // açıkken hem "Koleksiyon" hem "Maliyet Tablosu" yanmasın.
  const activeHref =
    NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href))
      .filter((h) => pathname === h || pathname.startsWith(h + "/"))
      .sort((a, b) => b.length - a.length)[0] ?? null;

  return (
    <aside
      className={cn(
        // w-72 — beş gruplu menü + Haftanın Notu kartı rahat nefes alsın
        // (240px'te uzun etiketler ve alt kart sıkışıyordu).
        "relative hidden md:flex flex-col bg-surface border-r border-line transition-[width] duration-200 ease-standard shrink-0",
        collapsed ? "w-14" : "w-72",
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
        {NAV_GROUPS.map((group, groupIndex) => {
          const items = group.items.filter((i) => !i.adminOnly || isAdmin);
          if (items.length === 0) return null;
          return (
            <div key={group.title} className="space-y-0.5">
              {collapsed ? (
                // Daraltıldığında başlık yerine sessiz bir ayraç — gruplar
                // ikon sütununda da okunur kalır.
                groupIndex > 0 && (
                  <div className="mx-2.5 mb-2 border-t border-hairline" aria-hidden />
                )
              ) : (
                <p className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-subtle select-none">
                  {group.title}
                </p>
              )}
              {items.map(({ href, label, icon: Icon, children }) => {
                const active = href === activeHref;
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
                        "group relative flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm font-medium transition-colors duration-150",
                        active
                          ? "bg-brand-soft text-brand-strong"
                          : "text-muted hover:bg-surface-muted hover:text-ink",
                        collapsed && "justify-center px-2",
                      )}
                      title={collapsed ? label : undefined}
                    >
                      {active && (
                        <span
                          aria-hidden
                          className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[3px] rounded-full bg-brand anim-fade"
                        />
                      )}
                      <Icon
                        size={16}
                        className={cn(
                          "shrink-0 transition-colors duration-150",
                          active ? "text-brand" : "text-subtle group-hover:text-muted",
                        )}
                      />
                      {!collapsed && <span className="truncate">{label}</span>}
                    </Link>
                    {showKids && (
                      <div className="ml-4 mt-0.5 space-y-0.5 border-l border-line pl-2 anim-fade-down">
                        {kids.map(({ href: kHref, label: kLabel, icon: KIcon }) => {
                          // Tam eşleşme — /collection çocuğu /collection/maliyet'te aktif kalmasın.
                          const kActive = pathname === kHref;
                          return (
                            <Link
                              key={kHref}
                              href={kHref}
                              aria-current={kActive ? "page" : undefined}
                              className={cn(
                                "group flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-medium transition-colors duration-150",
                                kActive
                                  ? "bg-brand-soft text-brand-strong"
                                  : "text-muted hover:bg-surface-muted hover:text-ink",
                              )}
                            >
                              <KIcon
                                size={14}
                                className={cn(
                                  "shrink-0 transition-colors duration-150",
                                  kActive ? "text-brand" : "text-subtle group-hover:text-muted",
                                )}
                              />
                              <span className="truncate">{kLabel}</span>
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
      </nav>

      {/* Bottom stack: weekly quote. (Logout lives in the top-right profile
          menu.) Kart kompakt tutulur ve kısa ekranlarda tamamen gizlenir —
          menü maddelerinin önünü asla kesmez. */}
      {!collapsed && (
        <div className="px-3 pt-2 pb-3 mt-auto space-y-2.5 hidden [@media(min-height:47.5rem)]:block">
          {/* Haftanın Notu — geniş sütunda tek nefeslik editoryal kart. */}
          <div className="group relative rounded-2xl border border-brand-soft bg-gradient-to-br from-[#f7ede9] via-brand-soft/40 to-surface px-4 pt-3 pb-3.5 overflow-hidden shadow-card transition-shadow duration-200 ease-standard hover:shadow-card-hover">
            <Quote
              size={32}
              strokeWidth={1.5}
              className="absolute -top-1 -right-1 text-brand/15 rotate-180 transition-colors duration-300 ease-standard group-hover:text-brand/25"
            />
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-brand-strong select-none">
              Haftanın Notu
            </p>
            {/* Editoryal ayraç — etiketle alıntı arasında kısa bir marka çizgisi. */}
            <span aria-hidden className="mt-1.5 mb-2 block h-px w-8 rounded-full bg-brand/20" />
            <p
              className="relative text-[12px] leading-[1.65] text-ink/85 italic font-medium line-clamp-3"
              title={weeklyQuote.quoteTr}
            >
              “{weeklyQuote.quoteTr}”
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
        className="absolute top-1/2 -right-3 -translate-y-1/2 z-20 grid h-6 w-6 place-items-center rounded-full bg-surface border border-line shadow-card text-subtle opacity-60 hover:opacity-100 hover:text-muted hover:border-line-strong hover:shadow-card-hover active:scale-95 transition-all duration-150 ease-standard"
        aria-label={collapsed ? "Kenar çubuğunu genişlet" : "Kenar çubuğunu daralt"}
        title={collapsed ? "Genişlet" : "Daralt"}
      >
        {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
      </button>
    </aside>
  );
}
