"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Kanban, LayoutDashboard, User, CalendarRange, Shirt, Home } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type NavItem = { href: string; label: string; icon: typeof Kanban };

// Mobil sekmeler operasyonun ritmini izler: Home Page (kısayollar + bana
// atananlar) ilk durak; Calendar ve Koleksiyon telefonda da bir dokunuş
// uzaklıkta — Aslı Hanım takvimi telefondan açar. Liste, Yönetici Pano ve
// diğer ekranlara Home Page kısayollarından ulaşılır.
const MEMBER_NAV: NavItem[] = [
  { href: "/home",       label: "Home Page", icon: Home          },
  { href: "/board",      label: "Pano",      icon: Kanban        },
  { href: "/planning",   label: "Calendar",  icon: CalendarRange },
  { href: "/collection", label: "Koleksiyon", icon: Shirt        },
  { href: "/profile",    label: "Profil",    icon: User          },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/home",       label: "Home Page", icon: Home          },
  { href: "/board",      label: "Pano",      icon: Kanban        },
  { href: "/planning",   label: "Calendar",  icon: CalendarRange },
  { href: "/collection", label: "Koleksiyon", icon: Shirt        },
  { href: "/dashboard",  label: "Raporlar",  icon: LayoutDashboard },
];

export function MobileNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const items: NavItem[] = isAdmin ? ADMIN_NAV : MEMBER_NAV;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur border-t border-line safe-bottom">
      <div className="flex items-stretch justify-around h-14">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                // 44px+ touch target across the full cell height.
                "group relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors duration-150",
                active ? "text-brand-strong" : "text-muted active:text-ink",
              )}
            >
              {/* Aktif sekme — üst çubuk yerine ikonun arkasında yumuşak pill;
                  basılı tutunca hafifçe küçülür (dokunsal geri bildirim). */}
              <span
                className={cn(
                  "grid h-7 w-12 place-items-center rounded-full transition-[background-color,scale] duration-200 ease-standard group-active:scale-95",
                  active ? "bg-brand-soft" : "bg-transparent",
                )}
              >
                <Icon
                  size={20}
                  strokeWidth={active ? 2.2 : 2}
                  className={cn(
                    "transition-transform duration-200 ease-standard",
                    active ? "scale-110 text-brand" : "scale-100",
                  )}
                />
              </span>
              <span className={cn(active && "font-semibold")}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
