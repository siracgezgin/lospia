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
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { signOut } from "@/lib/actions/auth";
import type { Workspace, SavedView } from "@/types";

const NAV_ITEMS = [
  { href: "/board",     label: "Pano",           icon: Kanban },
  { href: "/list",      label: "Liste",           icon: List },
  { href: "/dashboard", label: "Gösterge Paneli", icon: LayoutDashboard },
  { href: "/calendar",  label: "Takvim",          icon: Calendar },
  { href: "/settings",  label: "Ayarlar",         icon: Settings },
] as const;

interface Props {
  workspace: Workspace | null;
  savedViews: SavedView[];
  userId: string;
}

export function AppSidebar({ workspace, savedViews }: Props) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "relative flex flex-col bg-white border-r border-gray-200 transition-all duration-200 shrink-0",
        collapsed ? "w-14" : "w-56"
      )}
    >
      {/* Workspace header */}
      <div className={cn("flex items-center gap-2 px-3 py-4 border-b border-gray-100", collapsed && "justify-center px-0")}>
        <div className="h-7 w-7 rounded-md bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
          {workspace?.name?.[0]?.toUpperCase() ?? "S"}
        </div>
        {!collapsed && (
          <span className="font-semibold text-sm text-gray-900 truncate">
            {workspace?.name ?? "SpikOS TaskOS"}
          </span>
        )}
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                collapsed && "justify-center px-2"
              )}
              title={collapsed ? label : undefined}
            >
              <Icon size={16} className="shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}

        {/* Saved views — only in expanded mode */}
        {!collapsed && savedViews.length > 0 && (
          <div className="pt-3 pb-1">
            <p className="px-2 mb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Kaydedilen görünümler
            </p>
            {savedViews.map((view) => (
              <Link
                key={view.id}
                href={`/board?view=${view.id}`}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors truncate",
                  "text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                )}
              >
                <span className="text-gray-400">⊙</span>
                <span className="truncate">{view.name}</span>
              </Link>
            ))}
          </div>
        )}
      </nav>

      {/* Footer: timer indicator + sign out */}
      <div className={cn("border-t border-gray-100 p-2 space-y-0.5", collapsed && "px-1")}>
        {!collapsed && (
          <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-gray-400">
            <Clock size={12} />
            <span>Zamanlayıcı: —</span>
          </div>
        )}
        <form action={signOut}>
          <button
            type="submit"
            className={cn(
              "w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors",
              collapsed && "justify-center"
            )}
            title={collapsed ? "Çıkış yap" : undefined}
          >
            <span className="text-base leading-none">↩</span>
            {!collapsed && <span>Çıkış yap</span>}
          </button>
        </form>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 h-6 w-6 rounded-full border border-gray-200 bg-white shadow-sm flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
        aria-label={collapsed ? "Kenar çubuğunu genişlet" : "Kenar çubuğunu daralt"}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
    </aside>
  );
}
