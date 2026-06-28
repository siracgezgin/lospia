"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Kanban, List, Calendar, LayoutDashboard, Settings } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const MOBILE_NAV = [
  { href: "/board",     label: "Pano",   icon: Kanban          },
  { href: "/list",      label: "Liste",  icon: List            },
  { href: "/calendar",  label: "Takvim", icon: Calendar        },
  { href: "/dashboard", label: "Rapor",  icon: LayoutDashboard },
  { href: "/settings",  label: "Ayarlar",icon: Settings        },
];

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 safe-bottom">
      <div className="flex items-center justify-around h-14">
        {MOBILE_NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-1 text-[10px] font-medium transition-colors",
                active ? "text-blue-600" : "text-gray-500",
              )}
            >
              <Icon size={20} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
