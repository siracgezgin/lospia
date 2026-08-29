"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  Boxes,
  CalendarRange,
  Home,
  Kanban,
  LogOut,
  Menu as MenuIcon,
  UserRound,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { signOut } from "@/lib/actions/auth";
import {
  NAV_DIRECTORY,
  activeNavHref,
  navSectionsForRole,
  type NavLink as NavLinkItem,
} from "@/lib/nav/app-nav";

/**
 * MOBİL GEZİNME — dört sekme + tam menü.
 *
 * Sıraç (2026-08-29): "Bunların hepsini yaparken aynı şekilde mobilde de
 * düzenleme yapman gerekiyor, responsive uyumlu gitmesi gerekiyor."
 *
 * Telefonda gerçek bir kopukluk vardı: sol menü `hidden md:flex` ile tamamen
 * gizli, alt sekmeler yalnız beş ekran taşıyordu ve Ana Sayfa'daki kısayol
 * ızgarası da kaldırılmıştı (2026-08-29). Sonuç: bir ÜYE telefondan AF
 * Teamwork'e, CRM'e ya da Reports'a HİÇBİR yerden ulaşamıyordu.
 *
 * Beşinci sekme artık "Menu": masaüstündeki sol menünün aynısını soldan gelen
 * bir çekmecede açar — aynı bölümler, aynı sıra, aynı adlar (lib/nav/app-nav
 * tek kaynak). Böylece telefonda da "ne nerede" masaüstüyle aynı yerde durur.
 *
 * Profil sekmesi yerine çekmecenin altındaki Profil + Çıkış satırları: sekme
 * yerini sık kullanılan Koleksiyon'a bıraktı, kimlik işleri tek yerde toplandı.
 */

type TabItem = { href: string; label: string; icon: typeof Kanban };

/** Başparmakla en sık gidilen dört ekran — rolden bağımsız aynı. */
const TABS: TabItem[] = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/board", label: "Board", icon: Kanban },
  { href: "/planning", label: "Calendar", icon: CalendarRange },
  { href: "/collection", label: "Collection", icon: Boxes },
];

/** SSR'de portal yok — ilk boyamada `document` yokken çizmemek için. */
const subscribe = () => () => {};
function useMounted() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

export function MobileNav({
  isAdmin = false,
  workspaceName,
  brandIcon,
  brandName,
}: {
  isAdmin?: boolean;
  workspaceName?: string | null;
  brandIcon?: string;
  brandName?: string;
}) {
  const pathname = usePathname();
  /* Çekmece HANGİ sayfada açıldığını tutar. Rota değişince eşleşme bozulur ve
     menü kendiliğinden kapanır — bunun için bir effect'e (ve effect içinde
     setState'e) gerek yok. */
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const menuOpen = openedAt === pathname;
  const closeMenu = useCallback(() => setOpenedAt(null), []);
  const activeHref = activeNavHref(pathname);

  const menuActive = menuOpen || (activeHref !== null && !TABS.some((t) => t.href === activeHref));

  return (
    <>
      <nav className="safe-bottom fixed bottom-0 left-0 right-0 z-40 border-t border-line bg-surface/95 backdrop-blur md:hidden">
        <div className="flex h-14 items-stretch justify-around">
          {TABS.map(({ href, label, icon: Icon }) => (
            <TabButton
              key={href}
              as="link"
              href={href}
              label={label}
              icon={Icon}
              active={href === activeHref}
            />
          ))}
          <TabButton
            as="button"
            label="Menu"
            icon={MenuIcon}
            active={menuActive}
            onClick={() => setOpenedAt(pathname)}
          />
        </div>
      </nav>

      <MobileMenu
        open={menuOpen}
        onClose={closeMenu}
        isAdmin={isAdmin}
        activeHref={activeHref}
        workspaceName={workspaceName ?? "Operasyon"}
        brandIcon={brandIcon}
        brandName={brandName}
      />
    </>
  );
}

/** Sekme — bağlantı ve düğme aynı gövdeyi paylaşır (aynı yükseklik, aynı pill). */
function TabButton(
  props: {
    label: string;
    icon: typeof Kanban;
    active: boolean;
  } & (
    | { as: "link"; href: string; onClick?: never }
    | { as: "button"; href?: never; onClick: () => void }
  ),
) {
  const { label, icon: Icon, active } = props;
  const inner = (
    <>
      <span
        className={cn(
          "grid h-7 w-12 place-items-center rounded-full transition-[background-color,scale] duration-200 ease-standard group-active:scale-95",
          active ? "bg-brand-soft" : "bg-transparent",
        )}
      >
        <Icon
          size={20}
          strokeWidth={active ? 2.2 : 2}
          className={cn("transition-transform duration-200 ease-standard", active ? "scale-110 text-brand" : "scale-100")}
        />
      </span>
      <span className={cn(active && "font-semibold")}>{label}</span>
    </>
  );
  const className = cn(
    // 44px+ dokunma hedefi, hücrenin tamamı.
    "group relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors duration-150",
    active ? "text-brand-strong" : "text-muted active:text-ink",
  );

  if (props.as === "link") {
    return (
      <Link href={props.href} aria-current={active ? "page" : undefined} className={className}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={props.onClick} aria-label="Menü" aria-expanded={active} className={className}>
      {inner}
    </button>
  );
}

/** Soldan gelen tam menü — masaüstü sol menüsünün telefondaki karşılığı. */
function MobileMenu({
  open, onClose, isAdmin, activeHref, workspaceName, brandIcon, brandName,
}: {
  open: boolean;
  onClose: () => void;
  isAdmin: boolean;
  activeHref: string | null;
  workspaceName: string;
  brandIcon?: string;
  brandName?: string;
}) {
  const mounted = useMounted();
  const sections = navSectionsForRole(isAdmin);

  // Esc + arkadaki sayfanın kaymasını durdur (Overlay ile aynı sözleşme).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const body = document.body;
    const prev = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="anim-fade fixed inset-0 z-[100] bg-ink/45 backdrop-blur-[2px] md:hidden"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Menü"
    >
      <div className="anim-drawer-left absolute inset-y-0 left-0 flex w-[19rem] max-w-[86vw] flex-col bg-surface shadow-drawer">
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-line px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            {brandIcon && (
              <img src={brandIcon} alt={brandName ?? ""} className="h-6 w-auto shrink-0 select-none" draggable={false} />
            )}
            <span className="truncate text-[15px] font-semibold tracking-tight text-ink">{workspaceName}</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="-mr-1.5 shrink-0 rounded-lg p-1.5 text-subtle transition-colors duration-150 hover:bg-surface-muted hover:text-ink"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-3">
          {sections.map((section, i) => (
            <div key={section.title} className={i > 0 ? "mt-4 border-t border-hairline pt-4" : ""}>
              <p className="mb-1.5 select-none px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.13em] text-subtle">
                {section.title}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <MenuRow key={item.href} item={item} active={item.href === activeHref} onGo={onClose} />
                ))}
              </div>
            </div>
          ))}

          <div className="mt-4 border-t border-hairline pt-4">
            <MenuRow item={NAV_DIRECTORY} active={NAV_DIRECTORY.href === activeHref} onGo={onClose} muted />
          </div>
        </nav>

        {/* Kimlik — masaüstünde sağ üst profil menüsünde duran iki satır. */}
        <div className="safe-bottom shrink-0 border-t border-line px-2.5 py-2">
          <MenuRow
            item={{ href: "/profile", label: "Profilim", icon: UserRound, adminOnly: false }}
            active={activeHref === "/profile"}
            onGo={onClose}
          />
          <form action={signOut}>
            <button
              type="submit"
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[9px] text-[13.5px] font-medium text-muted transition-colors duration-150 hover:bg-danger/10 hover:text-danger"
            >
              <LogOut size={17} strokeWidth={1.9} className="shrink-0 text-subtle" />
              Çıkış yap
            </button>
          </form>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Çekmece satırı — sol menüdeki satırla aynı dil (aynı boy, aynı aktif hali). */
function MenuRow({
  item, active, onGo, muted = false,
}: {
  item: NavLinkItem;
  active: boolean;
  onGo: () => void;
  muted?: boolean;
}) {
  const { href, label, icon: Icon } = item;
  return (
    <Link
      href={href}
      onClick={onGo}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-[10px] text-[13.5px] transition-colors duration-150",
        active
          ? "bg-brand-soft font-semibold text-brand-strong"
          : cn("font-medium active:bg-surface-muted", muted ? "text-subtle" : "text-muted"),
      )}
    >
      {active && (
        <span aria-hidden className="absolute -left-0.5 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-brand" />
      )}
      <Icon
        size={17}
        strokeWidth={active ? 2.2 : 1.9}
        className={cn("shrink-0", active ? "text-brand" : "text-subtle")}
      />
      <span className="truncate">{label}</span>
    </Link>
  );
}
