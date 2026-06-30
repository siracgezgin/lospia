"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Kanban, List, Calendar, LayoutDashboard, User, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type NavItem = { href: string; label: string; icon: typeof Kanban };

// A member's tabs end in their own profile; an admin trades that slot for the
// Yönetici Pano (Ayarlar moves to the top-right profile menu on mobile).
const MEMBER_NAV: NavItem[] = [
  { href: "/board",     label: "Pano",   icon: Kanban          },
  { href: "/list",      label: "Liste",  icon: List            },
  { href: "/calendar",  label: "Takvim", icon: Calendar        },
  { href: "/dashboard", label: "Rapor",  icon: LayoutDashboard },
  { href: "/profile",   label: "Profil", icon: User            },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/board",       label: "Pano",     icon: Kanban          },
  { href: "/admin-board", label: "Yönetici", icon: ShieldCheck     },
  { href: "/list",        label: "Liste",    icon: List            },
  { href: "/calendar",    label: "Takvim",   icon: Calendar        },
  { href: "/dashboard",   label: "Rapor",    icon: LayoutDashboard },
];

export function MobileNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const items: NavItem[] = isAdmin ? ADMIN_NAV : MEMBER_NAV;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t border-gray-200 safe-bottom">
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
                active ? "text-blue-600" : "text-gray-500 active:text-gray-700",
              )}
            >
              {active && (
                <span className="absolute top-0 h-0.5 w-8 rounded-b bg-blue-600" />
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
