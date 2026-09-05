"use client";

import { useState } from "react";
import { CalendarDays, ChevronDown, LayoutGrid, LineChart, List, Search } from "lucide-react";
import {
  BOARD_COLUMNS,
  CALENDAR_WEEK,
  DASH_DEPTS,
  DASH_FOCUS,
  DASH_TILES,
  DEPT,
  Chip,
  DeptChip,
  MiniTaskCard,
  OwnerDot,
  StatusChip,
  LIST_ROWS,
} from "./previewUi";

// Interactive Lospia product showcase for the landing page. Four clickable
// tabs (Pano / Liste / Takvim / Gösterge Paneli) switch a drawn, demo-safe
// Lospia UI — a real interactive walkthrough, not a static screenshot. Plain
// useState + CSS keyframe on remount: no heavy deps, no hydration risk (the
// initial tab is deterministic).

type TabId = "pano" | "liste" | "takvim" | "gosterge";

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "pano", label: "Pano", icon: LayoutGrid },
  { id: "liste", label: "Liste", icon: List },
  { id: "takvim", label: "Takvim", icon: CalendarDays },
  { id: "gosterge", label: "Gösterge Paneli", icon: LineChart },
];

const TAB_CAPTION: Record<TabId, string> = {
  pano: "İşler statüye, sorumluya ve onay durumuna göre kolonlarda ilerler.",
  liste: "Tüm işler kişi, departman, durum ve teslim tarihine göre filtrelenir.",
  takvim: "Haftalık teslim yoğunluğu ve onay bekleyen işler önceden görünür.",
  gosterge: "Yönetici, tek tek sormadan ekibin haftalık durumunu görür.",
};

function FilterPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-500">
      {children}
      <ChevronDown className="h-3 w-3 text-slate-400" />
    </span>
  );
}

function BoardView() {
  return (
    <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
      {BOARD_COLUMNS.map((col) => (
        <div key={col.title} className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between px-0.5">
            <span className={`text-[11px] font-semibold uppercase tracking-wide ${col.status === "review" ? "text-emerald-600" : col.status === "done" ? "text-emerald-700" : "text-slate-500"}`}>
              {col.title}
            </span>
            <span className="rounded-full bg-slate-200/70 px-1.5 text-[10px] font-medium text-slate-500">
              {col.tasks.length}
            </span>
          </div>
          {col.tasks.map((task) => (
            <MiniTaskCard key={task.title} task={task} />
          ))}
          {col.status === "review" ? (
            <div className="rounded-lg border border-dashed border-violet-200 bg-violet-50/60 px-2.5 py-2 text-[10px] font-medium text-violet-700">
              Onay bekleyen işler ayrı akışta görünür
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ListView() {
  return (
    <div className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <FilterPill>Tüm durumlar</FilterPill>
        <FilterPill>Tüm departmanlar</FilterPill>
        <FilterPill>Tüm kişiler</FilterPill>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-400">
          <Search className="h-3 w-3" /> Ara…
        </span>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="hidden grid-cols-[2.4fr_1fr_1.2fr_1fr_0.7fr] gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:grid">
          <span>Başlık</span>
          <span>Departman</span>
          <span>Durum</span>
          <span>Sorumlu</span>
          <span>Teslim</span>
        </div>
        {LIST_ROWS.map((row, i) => (
          <div
            key={row.title}
            className={`grid grid-cols-[2fr_1fr_0.7fr] items-center gap-2 px-4 py-2.5 sm:grid-cols-[2.4fr_1fr_1.2fr_1fr_0.7fr] ${i < LIST_ROWS.length - 1 ? "border-b border-slate-100" : ""} ${row.status === "done" ? "bg-emerald-50/40" : ""}`}
          >
            <span className="truncate text-[12px] font-semibold text-slate-800">{row.title}</span>
            <span className="hidden sm:block"><DeptChip dept={row.dept} /></span>
            <span><StatusChip status={row.status} /></span>
            <span className="hidden items-center gap-1.5 sm:flex">
              <OwnerDot id={row.owners[0]} />
              <span className="text-[11px] text-slate-500">{row.owners[0]}</span>
            </span>
            <span className={`text-[11px] font-medium ${row.due === "Bitti" ? "text-emerald-600" : row.overdue ? "text-rose-500" : "text-slate-500"}`}>
              {row.due}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CalendarView() {
  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[12px] font-semibold text-slate-700">6 – 12 Temmuz</p>
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-violet-500" /> Onay bekliyor</span>
          <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Tamamlandı</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-4 lg:grid-cols-7">
        {CALENDAR_WEEK.map((day) => (
          <div key={day.day} className={`min-h-[130px] p-2 ${day.today ? "bg-indigo-50/50" : "bg-white"}`}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{day.day}</span>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${day.today ? "bg-indigo-600 text-white" : "text-slate-600"}`}>
                {day.date}
              </span>
            </div>
            <div className="space-y-1">
              {day.chips.map((chip) => {
                const d = DEPT[chip.dept];
                return (
                  <div
                    key={chip.label}
                    className={`flex items-center gap-1.5 truncate rounded-md border px-1.5 py-1 text-[10px] font-medium ${chip.done ? "border-emerald-100 bg-emerald-50 text-emerald-700 line-through" : chip.approval ? "border-violet-100 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-600"}`}
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${d.dot}`} />
                    <span className="truncate">{chip.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardView() {
  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {DASH_TILES.map((tile) => (
          <div key={tile.label} className="rounded-xl border border-slate-200 bg-white p-3.5">
            <p className="text-[11px] font-medium text-slate-500">{tile.label}</p>
            <p className={`mt-1 text-2xl font-semibold tracking-tight ${tile.tone}`}>{tile.value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-3 text-[12px] font-semibold text-slate-800">Bu haftanın odağı</p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {DASH_FOCUS.map((f) => (
              <div key={f.label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-[10px] text-slate-500">{f.label}</p>
                <p className="mt-0.5 text-lg font-semibold text-slate-900">{f.value}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-3 text-[12px] font-semibold text-slate-800">Departman ilerlemesi</p>
          <div className="space-y-2.5">
            {DASH_DEPTS.map(({ dept, done, total }) => {
              const d = DEPT[dept];
              return (
                <div key={dept}>
                  <div className="mb-1 flex items-center justify-between text-[10px] font-medium">
                    <span className="flex items-center gap-1.5 text-slate-600">
                      <span className={`h-1.5 w-1.5 rounded-full ${d.dot}`} /> {d.label}
                    </span>
                    <span className="text-slate-400">{done}/{total}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${d.dot}`} style={{ width: `${(done / total) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const VIEWS: Record<TabId, () => React.ReactElement> = {
  pano: BoardView,
  liste: ListView,
  takvim: CalendarView,
  gosterge: DashboardView,
};

export function ProductPreviewTabs() {
  const [active, setActive] = useState<TabId>("pano");
  const ActiveView = VIEWS[active];

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_30px_70px_-30px_rgba(15,23,42,0.3)] ring-1 ring-slate-900/[0.03]">
      {/* keyframe for the tab-switch transition — scoped, tiny, no deps */}
      <style>{`@keyframes lospia-panel-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* App header with clickable view tabs */}
      <div className="flex flex-col gap-2 border-b border-slate-200 bg-white px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-600 text-[11px] font-bold text-white">L</span>
          <span className="text-[13px] font-semibold text-slate-800">Lospia Demo Operasyon</span>
          <span className="hidden rounded-md border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500 md:inline">
            6 – 12 Temmuz
          </span>
        </div>
        <div role="tablist" aria-label="Ürün görünümleri" className="flex flex-wrap items-center gap-1">
          {TABS.map((tab) => {
            const isActive = tab.id === active;
            return (
              <button
                key={tab.id}
                id={`preview-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`preview-panel-${tab.id}`}
                onClick={() => setActive(tab.id)}
                /* Parmakla kullanılan gerçek bir kontrol: telefonda 40px,
                   masaüstünde önizlemenin kompakt yoğunluğu korunur. */
                className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-1 sm:min-h-0 ${
                  isActive
                    ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-800 active:bg-slate-200/70"
                }`}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active view */}
      <div
        key={active}
        id={`preview-panel-${active}`}
        role="tabpanel"
        aria-labelledby={`preview-tab-${active}`}
        className="min-h-[340px] bg-slate-50/70"
        style={{ animation: "lospia-panel-in 260ms cubic-bezier(0.4,0,0.2,1)" }}
      >
        <ActiveView />
      </div>

      {/* Caption strip */}
      <div className="border-t border-slate-200 bg-white px-4 py-3">
        <p className="text-[12.5px] text-slate-500">{TAB_CAPTION[active]}</p>
      </div>
    </div>
  );
}
