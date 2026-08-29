"use client";

import { useState, useEffect, useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  isToday as dfnsIsToday,
  isValid,
  addMonths,
  subMonths,
  parseISO,
} from "date-fns";
import { tr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, X, Plus, CalendarDays, ChevronDown, Lock } from "lucide-react";
import type { TaskStatus, TaskPriority, Profile, WorkspaceContact, WorkspaceDepartment } from "@/types";
import { cn } from "@/lib/utils/cn";
import { CreateTaskModal } from "@/components/task/CreateTaskModal";
import { buildDeptMeta } from "@/lib/utils/departments";
import { getDepartmentCardStyle } from "@/lib/design/semantics";

type CalTask = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  start_date: string | null;
  department_id: string | null;
  visibility?: string | null;
};

interface Props {
  tasks: CalTask[];
  workspaceId: string;
  profiles: Pick<Profile, "id" | "full_name" | "email">[];
  contacts: WorkspaceContact[];
  departments?: WorkspaceDepartment[];
  members?: { memberId: string; userId: string; name: string }[];
  deptMembers?: { department_id: string; member_id: string }[];
  isAdmin?: boolean;
  /** Calendar'ın "Ay" sekmesi olarak gömülü çalışır: kendi başlığını ve
   *  dış boşluğunu çizmez (sayfa başlığı zaten üstte). */
  embedded?: boolean;
  /** Açılışta gösterilecek gün (yyyy-MM-dd) — Yıl görünümünden gelen atlama. */
  initialDate?: string | null;
}

const DONE_CLS = "line-through text-subtle";

// Mount detection via useSyncExternalStore — tells client from server render
// without a setState-in-effect (which the lint rules reject).
const _subscribeMounted = () => () => {};
const _getMounted = () => true;
const _getServerMounted = () => false;

const TR_MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

/** Parse a stored date string defensively. Malformed/empty values never throw —
 *  they simply don't match any day, instead of crashing the whole calendar. */
function safeParseISO(value: string | null | undefined): Date | null {
  if (!value) return null;
  try {
    const d = parseISO(value);
    return isValid(d) ? d : null;
  } catch {
    return null;
  }
}

/** Compact month/year picker — integrated into the month label, Safari-safe
 *  (no native <input type="month">). Lets the user jump straight to 2028+. */
function MonthYearPicker({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const [open, setOpen] = useState(false);
  // The popover browses a year independently of the calendar so the user can
  // page to 2028 and pick a month there in one go — no month-by-month clicking.
  const [viewYear, setViewYear] = useState(value.getFullYear());
  const ref = useRef<HTMLDivElement>(null);

  const month = value.getMonth();
  const selectedYear = value.getFullYear();
  const now = new Date();
  const todayMonth = now.getMonth();
  const todayYear = now.getFullYear();

  // Toggle the popover, re-syncing the browsing year to the calendar on open.
  // (Done here rather than in an effect — setState-in-effect is lint-rejected.)
  function toggle() {
    if (!open) setViewYear(value.getFullYear());
    setOpen((o) => !o);
  }

  // Close on outside click and on Escape — only while open.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(monthIndex: number) {
    onChange(new Date(viewYear, monthIndex, 1));
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        data-testid="calendar-month-picker-button"
        onClick={toggle}
        className="flex h-9 w-40 items-center justify-center gap-1.5 border-x border-line text-[13px] font-semibold capitalize tracking-tight text-ink transition-colors duration-150 hover:bg-surface-hover active:bg-surface-sunken focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-ring"
        aria-label="Ay ve yıl seç"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {format(value, "MMMM yyyy", { locale: tr })}
        <ChevronDown
          size={14}
          className={cn("text-subtle shrink-0 transition-transform duration-200 ease-standard", open && "rotate-180 text-muted")}
        />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Ay ve yıl seçici"
          data-testid="calendar-month-picker-popover"
          className="anim-fade-down absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 w-80 rounded-xl border border-line bg-surface shadow-pop p-4"
        >
          {/* Year navigation */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => setViewYear((y) => y - 1)}
              className="p-1.5 rounded-lg text-muted hover:bg-surface-hover hover:text-ink active:bg-surface-sunken transition-colors duration-150"
              aria-label="Önceki yıl"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-base font-semibold tracking-tight text-ink tabular-nums" aria-live="polite">{viewYear}</span>
            <button
              type="button"
              onClick={() => setViewYear((y) => y + 1)}
              className="p-1.5 rounded-lg text-muted hover:bg-surface-hover hover:text-ink active:bg-surface-sunken transition-colors duration-150"
              aria-label="Sonraki yıl"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          {/* Month grid */}
          <div className="grid grid-cols-3 gap-1.5">
            {TR_MONTHS.map((m, i) => {
              const isSelected = i === month && viewYear === selectedYear;
              const isCurrent = i === todayMonth && viewYear === todayYear;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => pick(i)}
                  className={cn(
                    "text-sm py-2 rounded-lg transition-colors duration-150 font-medium",
                    isSelected
                      ? "bg-brand text-white shadow-xs"
                      : isCurrent
                        ? "bg-brand-soft text-brand-strong ring-1 ring-brand-ring/50 hover:ring-brand-ring"
                        : "text-muted hover:bg-surface-hover hover:text-ink active:bg-surface-sunken",
                  )}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function CalendarView({ tasks, workspaceId, profiles, contacts, departments = [], members = [], deptMembers = [], isAdmin = false, embedded = false, initialDate = null }: Props) {
  const deptMeta = buildDeptMeta(departments);
  const dotFor = (t: CalTask) => {
    if (t.status === "done") return "bg-success";
    const color = t.department_id ? deptMeta[t.department_id]?.color : null;
    return getDepartmentCardStyle(color).dot;
  };

  // Yıl görünümünden bir güne tıklanarak gelinmişse o gün açılır; yoksa bugün.
  const seedDay = safeParseISO(initialDate) ?? new Date();
  const [current, setCurrent] = useState(seedDay);
  // Default the agenda to the seed day so the side panel is never empty on load.
  const [selectedDay, setSelectedDay] = useState<Date>(seedDay);
  const [showMobilePanel, setShowMobilePanel] = useState(false);
  const [createModalDate, setCreateModalDate] = useState<string | null>(null);

  // The whole grid is derived from `new Date()`, which differs between the
  // server (UTC) and the client (local TZ). Rendering it during SSR produced a
  // hydration mismatch that left the calendar half-drawn until a manual refresh.
  // Render a stable skeleton until mounted, then draw the real, client-only grid.
  const mounted = useSyncExternalStore(_subscribeMounted, _getMounted, _getServerMounted);

  const monthStart = startOfMonth(current);
  const monthEnd = endOfMonth(current);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  // Months span 5 or 6 weeks — size rows to the real week count so a 5-week
  // month never leaves an empty 6th row (the old "blank area below the grid").
  const weekCount = days.length / 7;

  function getTasksForDay(day: Date) {
    return tasks.filter((t) => {
      const due = safeParseISO(t.due_date);
      const start = safeParseISO(t.start_date);
      return (!!due && isSameDay(due, day)) || (!!start && isSameDay(start, day));
    });
  }

  function selectDay(day: Date) {
    setSelectedDay(day);
    setShowMobilePanel(true);
  }

  const selectedDayTasks = getTasksForDay(selectedDay);
  // The view is "on today" when today is the selected day AND we're looking at
  // today's month — drives the filled/active state of the Bugün button.
  const viewingToday = dfnsIsToday(selectedDay) && isSameMonth(selectedDay, current);

  // Server / pre-hydration skeleton — same outer shape so layout doesn't jump.
  if (!mounted) {
    return (
      <div className={cn("flex flex-col gap-4", embedded ? "min-h-[70vh]" : "p-4 sm:p-6 h-full")}>
        {!embedded && (
          <div className="flex items-center gap-3 shrink-0">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Calendar</h1>
          </div>
        )}
        <div className="flex-1 min-h-0 rounded-xl border border-line anim-shimmer bg-gradient-to-r from-surface-sunken via-surface-muted to-surface-sunken" />
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-4", embedded ? "min-h-[70vh]" : "p-4 sm:p-6 h-full")}>
      {/* Header — a single month/year control next to the title (no duplicates).
          The month label itself opens the month/year picker for jumping ahead.
          Gömülü modda başlık üstteki sayfa başlığıdır; burada tekrar edilmez. */}
      <div className="flex items-center gap-3 flex-wrap shrink-0">
        {!embedded && <h1 className="text-2xl font-semibold tracking-tight text-ink">Calendar</h1>}

        {/* Prev · clickable month/year picker · next.
            NOTE: no `overflow-hidden` here — it would clip the picker popover
            (rendered at top-full, outside this box) and the picker would appear
            to "do nothing" on click. End buttons are rounded individually. */}
        {/* h-9 — uygulama genelindeki araç çubuğu yüksekliği. */}
        <div className="flex h-9 items-center rounded-lg border border-line bg-surface shadow-xs">
          <button
            onClick={() => setCurrent((d) => subMonths(d, 1))}
            className="p-1.5 rounded-l-lg text-muted hover:bg-surface-hover hover:text-ink active:bg-surface-sunken transition-colors duration-150"
            aria-label="Önceki ay"
          >
            <ChevronLeft size={18} />
          </button>
          <MonthYearPicker value={current} onChange={(d) => setCurrent(isValid(d) ? d : new Date())} />
          <button
            onClick={() => setCurrent((d) => addMonths(d, 1))}
            className="p-1.5 rounded-r-lg text-muted hover:bg-surface-hover hover:text-ink active:bg-surface-sunken transition-colors duration-150"
            aria-label="Sonraki ay"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <button
          onClick={() => { setCurrent(new Date()); setSelectedDay(new Date()); }}
          aria-pressed={!viewingToday}
          className={cn(
            "inline-flex h-9 items-center rounded-lg border px-3 text-[13px] font-medium transition-all duration-150 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring focus-visible:ring-offset-1",
            viewingToday
              ? "bg-surface border-line text-subtle hover:bg-surface-muted hover:text-muted"
              : "bg-brand border-brand text-white shadow-xs hover:bg-brand-strong",
          )}
        >
          Bugün
        </button>
      </div>

      {/* Body: calendar grid + agenda side panel */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Calendar */}
        <div className="flex-1 min-w-0 flex flex-col bg-surface rounded-xl border border-line shadow-card overflow-hidden">
          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 border-b border-line bg-surface-muted/60 shrink-0">
            {["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].map((d) => (
              <div key={d} className="text-center text-[11px] font-semibold text-subtle py-2 uppercase tracking-wider">{d}</div>
            ))}
          </div>

          {/* Grid — fills remaining height evenly across the real week count */}
          <div
            className="grid grid-cols-7 flex-1 min-h-0"
            style={{ gridTemplateRows: `repeat(${weekCount}, minmax(0, 1fr))` }}
          >
            {days.map((day) => {
              const dayTasks = getTasksForDay(day);
              const isToday = dfnsIsToday(day);
              const inMonth = isSameMonth(day, current);
              const isSelected = isSameDay(day, selectedDay);
              const MAX_SHOWN = 4;

              return (
                <button
                  key={day.toISOString()}
                  onClick={() => selectDay(day)}
                  aria-current={isToday ? "date" : undefined}
                  aria-pressed={isSelected}
                  className={cn(
                    "relative border-r border-b border-hairline p-1.5 text-left transition-colors duration-150 flex flex-col gap-1 min-h-0 overflow-hidden",
                    !inMonth && "bg-surface-muted/60",
                    // Selected wins; today (unselected) keeps a soft persistent tint;
                    // everything else gets a clear hover affordance.
                    isToday && isSelected
                      ? "bg-brand-soft ring-2 ring-inset ring-brand"
                      : isSelected
                        ? "ring-2 ring-inset ring-brand-ring bg-brand-soft/50"
                        : isToday
                          ? "bg-brand-soft/60 ring-1 ring-inset ring-brand-ring/70 hover:bg-brand-soft"
                          : inMonth && "hover:bg-surface-hover",
                  )}
                >
                  <span className={cn(
                    "text-xs font-medium tabular-nums h-6 w-6 flex items-center justify-center rounded-full shrink-0 transition-colors duration-150",
                    isToday && "bg-brand text-white font-semibold shadow-xs",
                    !isToday && isSelected && "bg-brand-soft text-brand-strong font-semibold ring-1 ring-brand-ring/60",
                    !isToday && !isSelected && inMonth && "text-muted",
                    !isToday && !isSelected && !inMonth && "text-subtle/60",
                  )}>
                    {format(day, "d")}
                  </span>
                  <div className="flex flex-col gap-0.5 overflow-hidden">
                    {dayTasks.slice(0, MAX_SHOWN).map((task) => (
                      <span
                        key={task.id}
                        className={cn(
                          "flex items-center gap-1 text-[11px] leading-tight rounded-md px-1.5 py-0.5 bg-surface-muted border border-hairline",
                          task.status === "done" && DONE_CLS,
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", dotFor(task))} />
                        {task.visibility === "admin_only" && <Lock size={9} className="shrink-0 text-warning" />}
                        <span className="truncate text-muted">{task.title}</span>
                      </span>
                    ))}
                    {dayTasks.length > MAX_SHOWN && (
                      <span className="self-start text-[10px] text-brand-strong font-semibold tabular-nums bg-brand-soft rounded-md px-1.5 py-0.5 leading-none">
                        +{dayTasks.length - MAX_SHOWN} daha
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Agenda side panel (lg+) */}
        <aside className="w-80 shrink-0 hidden lg:flex flex-col bg-surface rounded-xl border border-line shadow-card overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-hairline shrink-0">
            <CalendarDays size={15} className="text-brand" />
            <h2 className="text-sm font-semibold tracking-tight text-ink capitalize">
              {format(selectedDay, "d MMMM EEEE", { locale: tr })}
            </h2>
            {dfnsIsToday(selectedDay) && (
              <span className="text-[10px] bg-brand-soft text-brand-strong rounded-full px-2 py-0.5 font-medium">Bugün</span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
            {selectedDayTasks.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center gap-1 py-10 anim-fade">
                <CalendarDays size={28} className="text-subtle/40" />
                <p className="text-sm text-subtle">Bu tarihte iş yok.</p>
              </div>
            ) : (
              selectedDayTasks.map((task) => (
                <Link
                  key={task.id}
                  prefetch={false}
                  href={`/tasks/${task.id}`}
                  className={cn(
                    "flex items-center gap-2.5 p-2.5 rounded-lg border border-hairline hover:border-line hover:bg-surface-hover transition-colors duration-150 group",
                    task.status === "done" && "opacity-60",
                  )}
                >
                  <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", dotFor(task))} />
                  {task.visibility === "admin_only" && <Lock size={12} className="shrink-0 text-warning" />}
                  <span className={cn(
                    "text-sm text-ink group-hover:text-brand-strong flex-1 truncate",
                    task.status === "done" && "line-through text-subtle",
                  )}>
                    {task.title}
                  </span>
                </Link>
              ))
            )}
          </div>
          <div className="px-3 py-3 border-t border-hairline shrink-0">
            <button
              onClick={() => setCreateModalDate(format(selectedDay, "yyyy-MM-dd"))}
              className="flex items-center justify-center gap-2 w-full px-3 py-2 bg-brand text-white text-sm font-medium rounded-lg shadow-xs hover:bg-brand-strong active:scale-[0.98] transition-all duration-150"
            >
              <Plus size={14} />
              Bu güne görev ekle
            </button>
          </div>
        </aside>
      </div>

      {/* Mobile day panel (bottom sheet) — only below lg, where there is no side
          panel. z-50 so it sits ABOVE the fixed bottom nav (z-40); otherwise the
          sticky footer "Bu güne görev ekle" button is painted over by the nav and
          only peeks through when the sheet is dragged. dvh (not vh) keeps the
          height correct against the mobile browser's dynamic toolbar. */}
      {showMobilePanel && (
        <div className="anim-fade fixed inset-0 z-50 flex items-end justify-center bg-ink/45 backdrop-blur-[2px] lg:hidden" onClick={() => setShowMobilePanel(false)}>
          <div
            className="anim-slide-up flex max-h-[85dvh] w-full flex-col rounded-t-modal border border-line bg-surface shadow-drawer"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-hairline">
              <h2 className="text-sm font-semibold tracking-tight text-ink capitalize">
                {format(selectedDay, "d MMMM EEEE", { locale: tr })}
              </h2>
              <button onClick={() => setShowMobilePanel(false)} className="text-subtle hover:text-ink hover:bg-surface-muted p-1 rounded-lg transition-colors duration-150">
                <X size={16} />
              </button>
            </div>
            {/* Scrollable list — min-h-0 lets it shrink so the footer stays put */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3 space-y-2">
              {selectedDayTasks.length === 0 ? (
                <p className="text-sm text-subtle py-6 text-center">Bu tarihte iş yok.</p>
              ) : (
                selectedDayTasks.map((task) => (
                  <Link
                    key={task.id}
                    prefetch={false}
                    href={`/tasks/${task.id}`}
                    onClick={() => setShowMobilePanel(false)}
                    className={cn(
                      "flex items-center gap-2 p-2.5 rounded-lg hover:bg-surface-hover transition-colors duration-150 group",
                      task.status === "done" && "opacity-60",
                    )}
                  >
                    <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", dotFor(task))} />
                    {task.visibility === "admin_only" && <Lock size={12} className="shrink-0 text-warning" />}
                    <span className={cn("text-sm text-ink group-hover:text-brand-strong flex-1 truncate", task.status === "done" && "line-through")}>
                      {task.title}
                    </span>
                  </Link>
                ))
              )}
            </div>
            {/* Sticky footer — always visible the moment the sheet opens. Extra
                bottom padding clears the iOS home-indicator safe area. */}
            <div className="shrink-0 px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] border-t border-hairline">
              <button
                onClick={() => {
                  setCreateModalDate(format(selectedDay, "yyyy-MM-dd"));
                  setShowMobilePanel(false);
                }}
                className="flex items-center justify-center gap-2 w-full px-3 py-2.5 bg-brand text-white text-sm font-medium rounded-lg shadow-xs hover:bg-brand-strong active:scale-[0.98] transition-all duration-150"
              >
                <Plus size={14} />
                Bu güne görev ekle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create task modal with prefilled due date */}
      {createModalDate && (
        <CreateTaskModal
          key={createModalDate}
          onClose={() => setCreateModalDate(null)}
          workspaceId={workspaceId}
          profiles={profiles}
          contacts={contacts}
          departments={departments}
          members={members}
          deptMembers={deptMembers}
          defaultDueDate={createModalDate}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}
