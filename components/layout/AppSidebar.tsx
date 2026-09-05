"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Wordmark } from "@/components/ui/Wordmark";
import { LOSPIA_BRAND, type AppBrand } from "@/lib/branding";
import { getWeeklyQuote } from "@/lib/content/weekly-quotes";
import { canViewDestructivePages, canManageSettings } from "@/lib/auth/permissions";
import {
  NAV_DIRECTORY,
  activeNavHref,
  navSectionsForRole,
  type NavLink as NavLinkItem,
} from "@/lib/nav/app-nav";
import type { Workspace, WorkspaceRole } from "@/types";

/**
 * SOL MENÜ.
 *
 * Sıraç (2026-08-29): "Sol taraftaki başlıkların olduğu kısım dümdüz yazı gibi
 * duruyor, ayırt edilemiyor, karmaşık duruyor… daha net, daha belirgin, daha
 * kolay olmalı; insan dokununca kaymak gibi hissetmeli."
 *
 * Üç şey düzeltildi:
 *  1. HİYERARŞİ — bölüm başlığı satırlarla aynı gri tonda, aynı hizada, aynı
 *     boydaydı; göz "başlık mı bağlantı mı" ayıramıyordu. Artık her bölümün
 *     üstünde ince bir ayraç, başlık kendi satırında ve daha küçük/aralıklı;
 *     bağlantılar ise daha iri ve koyu. Başlık ile bağlantı artık BENZEMİYOR.
 *  2. AKTİF DURUM — soft dolgu tek başına zayıftı. Şimdi dolgu + sol kenar
 *     çubuğu + koyulaşan yazı + marka rengine dönen ikon birlikte çalışıyor;
 *     nerede olduğun ekranın karşısından okunuyor.
 *  3. GRUPLAMA — "Operation Modules" yönetici bölümünün içinde, Ayarlar'ın
 *     yanında duruyordu; oysa o herkese açık bir DİZİN. Gruptan çıkarılıp
 *     gezinme listesinin SONUNA, kendi ince ayracıyla alındı — menünün dibine
 *     sabitlenmedi, çünkü öyleyken kısa menülerde son bölümle satır arasına
 *     kocaman bir boşluk giriyordu (Sıraç, 2026-08-29). Yönetim bölümünde
 *     artık yalnız yöneticinin müdahale ettiği üç yüzey var (Admin Board ·
 *     Finance · Settings) ve üyede bölüm hiç çizilmiyor.
 *
 * Satır listesi buraya YAZILMAZ: lib/nav/app-nav.ts tek kaynaktır ve o da
 * MODULE_DIRECTORY'den türer (mobil menü aynı listeyi kullanır).
 */

interface Props {
  workspace: Pick<Workspace, "id" | "name"> | null;
  /** Host-aware app-shell brand (Lospia, or AF on the pilot host). */
  brand?: AppBrand;
  userId: string;
  userRole?: WorkspaceRole;
}

const COLLAPSE_KEY = "af.sidebar.collapsed";

/* Daraltma tercihi TARAYICIDA yaşar (kullanıcı başına, cihaz başına) ve
   sunucuda okunamaz. useSyncExternalStore, SSR anlık görüntüsünü ayrı
   vermemize izin verdiği için hydration uyuşmazlığı olmadan okunur: sunucu
   her zaman "açık" çizer, tarayıcı ilk boyamadan hemen sonra tercihi uygular.
   (Effect içinde setState yapan sürüm React'ın basamaklı render uyarısını
   veriyordu.) */
function subscribeCollapse(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}
function readCollapse(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false; // gizli sekmede storage kapalı olabilir
  }
}

export function AppSidebar({
  workspace, brand = LOSPIA_BRAND, userRole = "member",
}: Props) {
  const isAdmin = canViewDestructivePages(userRole) || canManageSettings(userRole);
  const pathname = usePathname();
  /* Kayıtlı tercih + bu oturumdaki seçim. Kullanıcı düğmeye bastığında
     `override` kazanır; başka bir sekmede değiştirilirse storage olayı
     üzerinden kayıtlı değer güncellenir. */
  const stored = useSyncExternalStore(subscribeCollapse, readCollapse, () => false);
  const [override, setOverride] = useState<boolean | null>(null);
  const collapsed = override ?? stored;
  const wsName = workspace?.name ?? "Operasyon";
  const weeklyQuote = getWeeklyQuote();
  const sections = navSectionsForRole(isAdmin);
  const activeHref = activeNavHref(pathname);

  function toggle() {
    const next = !collapsed;
    setOverride(next);
    try {
      window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
    } catch {
      /* yoksay — tercih yalnız bu oturumda yaşar */
    }
  }

  return (
    <aside
      className={cn(
        "relative hidden md:flex flex-col bg-surface border-r border-line shrink-0",
        "transition-[width] duration-[280ms] ease-emphasized",
        collapsed ? "w-[4.5rem]" : "w-[16.5rem]",
      )}
    >
      {/* Marka satırı — başlık çubuğuyla aynı yükseklikte (h-14) durur ki
          menü ile içerik aynı çizgide başlasın. */}
      <div
        className={cn(
          "flex h-14 shrink-0 items-center gap-2.5 border-b border-line",
          collapsed ? "justify-center px-0" : "px-4",
        )}
      >
        <img
          src={brand.icon}
          alt={brand.name}
          className="h-6 w-auto shrink-0 select-none"
          draggable={false}
        />
        {!collapsed && <Wordmark name={wsName} />}
      </div>

      <nav
        aria-label="Ana gezinme"
        className={cn(
          "flex-1 overflow-y-auto overflow-x-hidden py-3",
          collapsed ? "px-2" : "px-2.5",
        )}
      >
        {sections.map((section, i) => (
          <div key={section.title} className={i > 0 ? "mt-4 pt-4 border-t border-hairline" : ""}>
            {collapsed ? null : (
              <p className="mb-1.5 px-2.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle select-none">
                {section.title}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <SidebarLink
                  key={item.href}
                  item={item}
                  active={item.href === activeHref}
                  collapsed={collapsed}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Dizin kapısı — bir modül değil, modüllerin haritası. Bölümlerin
            İÇİNDE değil ama listenin AKIŞINDA: bölümler arası ayracın aynısıyla
            (mt-4 pt-4) son bölümün hemen altında durur. Menü uzasa da kısalsa
            da satır yerinden oynamaz; mobil menüde de dizilim böyledir. */}
        <div className="mt-4 border-t border-hairline pt-4">
          <SidebarLink
            item={NAV_DIRECTORY}
            active={NAV_DIRECTORY.href === activeHref}
            collapsed={collapsed}
            muted
          />
        </div>
      </nav>

      {/* Haftanın Notu + marka imzası. Kısa ekranlarda tamamen gizlenir —
          menü satırlarının önünü asla kesmez. */}
      {!collapsed && (
        <div className="hidden shrink-0 space-y-2.5 px-3 pb-3 pt-1 [@media(min-height:47.5rem)]:block">
          {/* Haftanın Notu — düz yüzey, dekor yok. Not bir içerik, bir süs değil:
              zemin bir ton koyu, sol kenarda ince marka çizgisi, o kadar. */}
          <div className="rounded-card border border-line bg-surface-muted px-3.5 py-3">
            <p className="select-none text-[12px] font-semibold uppercase tracking-[0.08em] text-brand-strong">
              Haftanın Notu
            </p>
            <p
              className="mt-1.5 line-clamp-3 text-[12.5px] leading-[1.6] text-muted"
              title={weeklyQuote.quoteTr}
            >
              “{weeklyQuote.quoteTr}”
            </p>
          </div>

          <div className="flex justify-center border-t border-hairline pb-1 pt-4">
            <img
              src={brand.logo}
              alt={brand.name}
              className={cn(
                "w-auto max-w-[75%] select-none object-contain opacity-90 transition-opacity duration-150 hover:opacity-100",
                brand.footerLogoHeightClass,
              )}
              draggable={false}
            />
          </div>
        </div>
      )}

      {/* Kenardaki daraltma düğmesi — genişlik geçişini takip etsin diye
          menünün sağ kenarına sabitli. */}
      <button
        onClick={toggle}
        className="absolute -right-3 top-1/2 z-20 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full border border-line bg-surface text-subtle opacity-60 shadow-card transition-all duration-150 ease-standard hover:border-line-strong hover:text-muted hover:opacity-100 hover:shadow-card-hover focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-brand-ring active:scale-95"
        aria-label={collapsed ? "Kenar çubuğunu genişlet" : "Kenar çubuğunu daralt"}
        title={collapsed ? "Genişlet" : "Daralt"}
      >
        {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
      </button>
    </aside>
  );
}

/**
 * Menü satırı — açık ve daralmış durumun TEK gövdesi.
 *
 * `muted` yalnız dizin kapısında kullanılır: aynı satır dilini korur ama bir
 * ton geride durur, çünkü o bir ekran değil bir harita.
 */
function SidebarLink({
  item, active, collapsed, muted = false,
}: {
  item: NavLinkItem;
  active: boolean;
  collapsed: boolean;
  muted?: boolean;
}) {
  const { href, label, icon: Icon } = item;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-lg text-[13.5px] transition-colors duration-150 ease-standard",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring",
        collapsed ? "justify-center px-0 py-2.5" : "px-2.5 py-[9px]",
        active
          ? "bg-brand-soft font-semibold text-brand-strong"
          : cn(
              "font-medium hover:bg-surface-muted hover:text-ink",
              muted ? "text-subtle" : "text-muted",
            ),
      )}
    >
      {active && (
        <span
          aria-hidden
          className={cn(
            "absolute top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-brand",
            collapsed ? "left-0" : "-left-0.5",
          )}
        />
      )}
      <Icon
        size={17}
        strokeWidth={active ? 2.2 : 1.9}
        className={cn(
          "shrink-0 transition-colors duration-150",
          active ? "text-brand" : "text-subtle group-hover:text-muted",
        )}
      />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}
