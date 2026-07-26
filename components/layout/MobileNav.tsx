"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Kanban, List, LayoutDashboard, User, ShieldCheck, CalendarRange, Shirt } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type NavItem = { href: string; label: string; icon: typeof Kanban };

// Mobil sekmeler operasyonun ritmini izler: Planlama (haftalık takvim) ve
// Koleksiyon (üretim föyleri) telefonda da bir dokunuş uzaklıkta — Aslı Hanım
// takvimi telefondan açar. Ay takvimi ve ikincil ekranlar masaüstünde kalır.
const MEMBER_NAV: NavItem[] = [
  { href: "/board",      label: "Pano",      icon: Kanban        },
  { href: "/planning",   label: "Planlama",  icon: CalendarRange },
  { href: "/collection", label: "Koleksiyon", icon: Shirt        },
  { href: "/list",       label: "Liste",     icon: List          },
  { href: "/profile",    label: "Profil",    icon: User          },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/board",       label: "Pano",      icon: Kanban        },
  { href: "/planning",    label: "Planlama",  icon: CalendarRange },
  { href: "/collection",  label: "Koleksiyon", icon: Shirt        },
  { href: "/admin-board", label: "Yönetici",  icon: ShieldCheck   },
  { href: "/dashboard",   label: "Rapor",     icon: LayoutDashboard },
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
                "relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
                active ? "text-brand" : "text-muted active:text-ink",
              )}
            >
              {active && (
                <span className="absolute top-0 h-0.5 w-8 rounded-b bg-brand" />
              )}
              <Icon size={20} strokeWidth={active ? 2.4 : 2} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
