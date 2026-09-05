"use client";

import { useState, useEffect, useRef, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  isBefore,
  isValid,
  addMonths,
  subMonths,
  parseISO,
  startOfToday,
} from "date-fns";
import { tr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus, CalendarDays, ChevronDown, Lock, Loader2, X } from "lucide-react";
import type { TaskStatus, TaskPriority, Profile, WorkspaceContact, WorkspaceDepartment } from "@/types";
import { cn } from "@/lib/utils/cn";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { CalendarToolbar } from "@/components/planning/CalendarToolbar";
import { CreateTaskModal } from "@/components/task/CreateTaskModal";
import { updateTask } from "@/lib/actions/tasks";
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
  /** Hafta/Ay/Yıl seçici — araç çubuğunun sağ ucuna konur. */
  viewSwitch?: React.ReactNode;
  /** Açılışta gösterilecek gün (yyyy-MM-dd) — Yıl görünümünden gelen atlama. */
  initialDate?: string | null;
}

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

/** Teslim tarihi geçmiş ve bitmemiş iş — takvimde ayrı okunmalı. Tarih-bazlı
 *  karşılaştırma: bugünün işi "gecikmiş" sayılmaz. */
function isOverdue(t: CalTask): boolean {
  if (t.status === "done") return false;
  const due = safeParseISO(t.due_date);
  return !!due && isBefore(due, startOfToday());
}

/** Compact month/year picker — integrated into the month label, Safari-safe
 *  (no native <input type="month">). Lets the user jump straight to 2028+. */
function MonthYearPicker({ value, onChange }: { value: Date; onChange: (_d: Date) => void }) {
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
    <div ref={ref} className="relative h-full">
      <button
        type="button"
        data-testid="calendar-month-picker-button"
        onClick={toggle}
        className="flex h-full w-36 items-center justify-center gap-1.5 border-x border-line text-[13px] font-semibold capitalize tracking-tight text-ink transition-colors duration-150 hover:bg-surface-hover active:bg-surface-sunken focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-ring sm:w-40"
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
        /* z-30: kabuğun (z-40) altında, yapışkan gün başlığının (z-10) üstünde. */
        <div
          role="dialog"
          aria-label="Ay ve yıl seçici"
          data-testid="calendar-month-picker-popover"
          className="anim-fade-down absolute left-1/2 top-full z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 rounded-card border border-line bg-surface p-3 shadow-pop"
        >
          {/* Year navigation */}
          <div className="mb-2 flex items-center justify-between">
            <IconButton size="sm" aria-label="Önceki yıl" onClick={() => setViewYear((y) => y - 1)}>
              <ChevronLeft size={16} />
            </IconButton>
            <span className="text-[14px] font-semibold tracking-tight text-ink tabular-nums" aria-live="polite">{viewYear}</span>
            <IconButton size="sm" aria-label="Sonraki yıl" onClick={() => setViewYear((y) => y + 1)}>
              <ChevronRight size={16} />
            </IconButton>
          </div>
          {/* Month grid */}
          <div className="grid grid-cols-3 gap-1">
            {TR_MONTHS.map((m, i) => {
              const isSelected = i === month && viewYear === selectedYear;
              const isCurrent = i === todayMonth && viewYear === todayYear;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => pick(i)}
                  aria-pressed={isSelected}
                  className={cn(
                    "h-9 rounded-control text-[13.5px] font-medium transition-colors duration-150",
                    isSelected
                      ? "bg-brand text-white"
                      : isCurrent
                        ? "bg-brand-soft text-brand-strong ring-1 ring-inset ring-brand-ring/50"
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

/** Araç çubuğu kabuğu — gömülüyken ortak `CalendarToolbar`, değilken düz satır. */
function ToolbarShell({
  embedded, viewSwitch, children,
}: { embedded: boolean; viewSwitch?: React.ReactNode; children: React.ReactNode }) {
  if (embedded && viewSwitch) {
    return <CalendarToolbar viewSwitch={viewSwitch}>{children}</CalendarToolbar>;
  }
  return <div className="flex shrink-0 flex-wrap items-center gap-3">{children}</div>;
}

export function CalendarView({ tasks, workspaceId, profiles, contacts, departments = [], members = [], deptMembers = [], isAdmin = false, embedded = false, initialDate = null, viewSwitch }: Props) {
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
  const [createModalDate, setCreateModalDate] = useState<string | null>(null);

  /* TARİH DEĞİŞTİRME — takvim artık okunan değil, ÇALIŞILAN bir ekran.
     Bir işin teslim tarihini değiştirmek için görev detayını açmak
     gerekiyordu; ay görünümünde tarih zaten gözün önündedir. Gün panelindeki
     her satır kendi tarih alanını taşır (telefonda da çalışır, sürüklemenin
     aksine). Sunucu reddederse (yetkisi olmayan üye, geçersiz tarih) hata
     TÜRKÇE olarak panelde yazar — sessiz başarısızlık yok. */
  const router = useRouter();
  /* Telefonda gün paneli IZGARANIN ALTINDA duruyor: bir güne dokununca liste
     ekranın dışında güncelleniyor ve "hiçbir şey olmadı" hissi veriyordu.
     Dar ekranda seçim yapılınca panel görüş alanına getirilir. */
  const agendaRef = useRef<HTMLElement>(null);
  function selectDay(day: Date) {
    setSelectedDay(day);
    if (typeof window !== "undefined" && !window.matchMedia("(min-width: 1024px)").matches) {
      agendaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
  const [dateError, setDateError] = useState<string | null>(null);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [, startDateSave] = useTransition();

  function changeDueDate(task: CalTask, iso: string) {
    const currentIso = (task.due_date ?? "").slice(0, 10);
    if (!iso || iso === currentIso) return;
    const next = safeParseISO(iso);
    if (!next) { setDateError("Geçersiz tarih."); return; }
    setDateError(null);
    setSavingTaskId(task.id);
    startDateSave(async () => {
      const res = await updateTask({ id: task.id, due_date: iso });
      setSavingTaskId(null);
      if ("error" in res) {
        setDateError(`“${task.title}” taşınamadı: ${res.error}`);
        return;
      }
      // İş yeni gününde görünsün — kullanıcı "kayboldu" sanmasın.
      setCurrent(next);
      setSelectedDay(next);
      router.refresh();
    });
  }

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

  const selectedDayTasks = getTasksForDay(selectedDay);
  const selectedIsToday = dfnsIsToday(selectedDay);
  // The view is "on today" when today is the selected day AND we're looking at
  // today's month — drives the pressed state of the Bugün button.
  const viewingToday = selectedIsToday && isSameMonth(selectedDay, current);

  const outerCls = cn("flex flex-col", embedded ? "h-full min-h-0 gap-0" : "h-full gap-4 p-4 sm:p-6");

  // Server / pre-hydration skeleton — same outer shape so layout doesn't jump.
  if (!mounted) {
    return (
      <div className={outerCls}>
        {!embedded && <h1 className="text-2xl font-semibold tracking-tight text-ink">Calendar</h1>}
        <div className={cn("flex min-h-0 flex-1 flex-col", embedded && "p-3 sm:p-4")}>
          <Skeleton className="min-h-0 flex-1 rounded-card" />
        </div>
      </div>
    );
  }

  return (
    <div className={outerCls}>
      {/* Gömülü modda (Calendar sayfası) araç çubuğu HAFTA GÖRÜNÜMÜYLE AYNI
          gövdedir: solda gezinme, sağda ölçek seçici, üstte tek çerçeveli bar
          (2026-08-29: "hepsi aynı yerde olsun"). Tek başına kullanıldığında
          eski serbest satır korunur. */}
      <ToolbarShell embedded={embedded} viewSwitch={viewSwitch}>
        {!embedded && <h1 className="text-2xl font-semibold tracking-tight text-ink">Calendar</h1>}

        {/* Prev · clickable month/year picker · next.
            NOTE: no `overflow-hidden` here — it would clip the picker popover
            (rendered at top-full, outside this box) and the picker would appear
            to "do nothing" on click. End buttons are rounded individually. */}
        {/* h-9 — uygulama genelindeki araç çubuğu yüksekliği. */}
        <div className="flex h-9 items-stretch rounded-control border border-line bg-surface">
          <button
            type="button"
            onClick={() => setCurrent((d) => subMonths(d, 1))}
            className="tap-target inline-flex w-9 items-center justify-center rounded-l-control text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-ink active:bg-surface-sunken"
            aria-label="Önceki ay"
          >
            <ChevronLeft size={16} />
          </button>
          <MonthYearPicker value={current} onChange={(d) => setCurrent(isValid(d) ? d : new Date())} />
          <button
            type="button"
            onClick={() => setCurrent((d) => addMonths(d, 1))}
            className="tap-target inline-flex w-9 items-center justify-center rounded-r-control text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-ink active:bg-surface-sunken"
            aria-label="Sonraki ay"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* "Bugün" İKİNCİL kontrol: ekranın tek birincil eylemi "Bu güne görev
            ekle". Eskiden bugünden uzaklaşınca marka rengine dönüyor ve
            ızgarayla yarışıyordu. Bugündeyken basılı (seçili) durur. */}
        <Button
          variant="secondary"
          onClick={() => { setCurrent(new Date()); setSelectedDay(new Date()); }}
          aria-pressed={viewingToday}
          className={cn(viewingToday && "border-line-strong bg-surface-muted")}
        >
          Bugün
        </Button>
      </ToolbarShell>

      {/* GÖVDE: masaüstünde ızgara + sağda gün paneli yan yana ve sabit
          yükseklik; telefonda ALT ALTA ve sayfa kayar — ızgara kompakt
          (yalnız gün numarası + renk noktaları), seçili günün listesi hemen
          altında. Eskiden telefonda alttan açılan bir yaprak vardı; masaüstü
          ızgarasının küçültülmüşü içinde 7 sütuna sıkışmış okunmaz çipler
          kalıyordu. */}
      <div className={cn(
        "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto lg:flex-row lg:gap-4 lg:overflow-hidden",
        embedded && "p-3 sm:p-4",
      )}>
        {/* Calendar */}
        <div className="flex shrink-0 flex-col overflow-hidden rounded-card border border-line bg-surface lg:min-h-0 lg:min-w-0 lg:flex-1">
          {/* Day-of-week headers */}
          <div className="grid shrink-0 grid-cols-7 border-b border-line bg-surface-muted/60">
            {["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].map((d) => (
              <div key={d} className="py-1.5 text-center text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle">{d}</div>
            ))}
          </div>

          {/* Grid — masaüstünde kalan yüksekliği hafta sayısına eşit böler;
              telefonda satırlar içeriğe göre (44px taban) eşit yükseklikte. */}
          <div
            className="grid grid-cols-7 lg:min-h-0 lg:flex-1"
            style={{ gridTemplateRows: `repeat(${weekCount}, minmax(0, 1fr))` }}
          >
            {days.map((day) => {
              const dayTasks = getTasksForDay(day);
              const isToday = dfnsIsToday(day);
              const inMonth = isSameMonth(day, current);
              const isSelected = isSameDay(day, selectedDay);
              const MAX_SHOWN = 4;
              const MAX_DOTS = 3;

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => selectDay(day)}
                  aria-current={isToday ? "date" : undefined}
                  aria-pressed={isSelected}
                  aria-label={`${format(day, "d MMMM EEEE", { locale: tr })}${dayTasks.length ? `, ${dayTasks.length} iş` : ""}`}
                  className={cn(
                    "relative flex min-h-[44px] min-w-0 flex-col gap-1 overflow-hidden border-b border-r border-hairline p-1 text-left transition-colors duration-150 sm:p-1.5 lg:min-h-0",
                    !inMonth && "bg-surface-muted/60",
                    // Seçili > bugün > diğer. Bugün sürekli yumuşak zemin;
                    // seçili gün iç halka; ikisi bir aradaysa halka koyulaşır.
                    isToday && isSelected
                      ? "bg-brand-soft ring-2 ring-inset ring-brand"
                      : isSelected
                        ? "bg-brand-soft/50 ring-2 ring-inset ring-brand-ring"
                        : isToday
                          ? "bg-brand-soft/60 hover:bg-brand-soft"
                          : inMonth && "hover:bg-surface-hover",
                  )}
                >
                  <span className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-medium tabular-nums transition-colors duration-150",
                    isToday && "bg-brand font-semibold text-white",
                    !isToday && isSelected && "bg-brand-soft font-semibold text-brand-strong ring-1 ring-brand-ring/60",
                    !isToday && !isSelected && inMonth && "text-muted",
                    !isToday && !isSelected && !inMonth && "text-subtle/60",
                  )}>
                    {format(day, "d")}
                  </span>

                  {/* Telefon: renk noktaları — başlık okunmuyorsa çip gürültüdür. */}
                  {dayTasks.length > 0 && (
                    <span className="flex items-center gap-0.5 px-0.5 lg:hidden" aria-hidden>
                      {dayTasks.slice(0, MAX_DOTS).map((task) => (
                        <span key={task.id} className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotFor(task))} />
                      ))}
                      {dayTasks.length > MAX_DOTS && (
                        <span className="text-[12px] leading-none text-subtle tabular-nums">+{dayTasks.length - MAX_DOTS}</span>
                      )}
                    </span>
                  )}

                  {/* Masaüstü: başlık çipleri. */}
                  <span className="hidden min-w-0 flex-col gap-0.5 overflow-hidden lg:flex">
                    {dayTasks.slice(0, MAX_SHOWN).map((task) => {
                      const late = isOverdue(task);
                      return (
                        <span
                          key={task.id}
                          title={late ? `${task.title} — gecikmiş` : task.title}
                          className={cn(
                            "flex items-center gap-1 rounded-md border border-hairline bg-surface-muted px-1.5 py-0.5 text-[12px] leading-tight",
                            late && "border-overdue/30 bg-overdue/10",
                          )}
                        >
                          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotFor(task))} />
                          {task.visibility === "admin_only" && <Lock size={11} className="shrink-0 text-warning" aria-label="Yalnız yönetici" />}
                          <span className={cn(
                            "truncate",
                            task.status === "done" ? "text-subtle line-through" : late ? "font-medium text-overdue" : "text-muted",
                          )}>
                            {task.title}
                          </span>
                        </span>
                      );
                    })}
                    {dayTasks.length > MAX_SHOWN && (
                      <span className="self-start rounded-md bg-brand-soft px-1.5 py-0.5 text-[12px] font-semibold leading-none text-brand-strong tabular-nums">
                        +{dayTasks.length - MAX_SHOWN} daha
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Seçili günün listesi — masaüstünde sağ panel, telefonda ızgaranın
            altında. TEK gövde, iki yerleşim. */}
        <aside ref={agendaRef} className="flex shrink-0 flex-col overflow-hidden rounded-card border border-line bg-surface lg:min-h-0 lg:w-80">
          <div className="flex shrink-0 items-center gap-2 border-b border-hairline px-4 py-3">
            <CalendarDays size={15} className="shrink-0 text-brand" aria-hidden />
            <h2 className="min-w-0 flex-1 truncate text-[14px] font-semibold capitalize tracking-tight text-ink">
              {format(selectedDay, "d MMMM EEEE", { locale: tr })}
            </h2>
            {selectedIsToday && <Badge className="bg-brand-soft text-brand-strong">Bugün</Badge>}
          </div>
          <div className="space-y-1.5 px-3 py-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            {selectedDayTasks.length === 0 ? (
              <EmptyState compact icon={CalendarDays} title="Bu tarihte iş yok." />
            ) : (
              selectedDayTasks.map((task) => {
                const late = isOverdue(task);
                const dueIso = (task.due_date ?? "").slice(0, 10);
                return (
                  /* SATIR = bağlantı + tarih alanı. İkisi KARDEŞ: bir <a>
                     içine form kontrolü koymak hem geçersiz HTML hem de
                     tıklamayı yanlış hedefe götürür. */
                  <div
                    key={task.id}
                    className="group flex min-h-[44px] items-center gap-2 rounded-control border border-hairline pl-2.5 pr-1.5 py-1.5 transition-colors duration-150 hover:border-line hover:bg-surface-hover"
                  >
                    <Link
                      prefetch={false}
                      href={`/tasks/${task.id}`}
                      title={task.title}
                      className="flex min-w-0 flex-1 items-center gap-2.5 rounded-control focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring"
                    >
                      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", dotFor(task))} aria-hidden />
                      {task.visibility === "admin_only" && <Lock size={12} className="shrink-0 text-warning" aria-label="Yalnız yönetici" />}
                      <span className={cn(
                        "min-w-0 flex-1 truncate text-[13.5px] text-ink group-hover:text-brand-strong",
                        task.status === "done" && "text-subtle line-through",
                        late && "font-medium text-overdue",
                      )}>
                        {task.title}
                      </span>
                    </Link>
                    {savingTaskId === task.id ? (
                      <span className="grid size-9 shrink-0 place-items-center text-muted" role="status" aria-label="Kaydediliyor">
                        <Loader2 size={14} className="animate-spin" aria-hidden />
                      </span>
                    ) : (
                      /* Teslim tarihi YERİNDE değişir. Tarayıcının kendi
                         tarih seçicisi kullanılır: telefonda tekerlek, masaüstünde
                         takvim — ayrıca bir pencere açmaya gerek yok. */
                      <input
                        type="date"
                        value={dueIso}
                        onChange={(e) => changeDueDate(task, e.target.value)}
                        aria-label={`${task.title} — teslim tarihi`}
                        title={late ? "Teslim tarihi geçti — değiştirmek için tıklayın" : "Teslim tarihini değiştir"}
                        className={cn(
                          "h-9 w-[7.5rem] shrink-0 rounded-control border bg-surface px-2 text-[12.5px] tabular-nums text-muted",
                          "transition-[border-color,box-shadow] duration-150 hover:border-line-strong",
                          "focus:border-brand-ring focus:outline-none focus:ring-2 focus:ring-brand-ring/40",
                          late ? "border-overdue/40 text-overdue" : "border-line",
                        )}
                      />
                    )}
                  </div>
                );
              })
            )}
          </div>

          {dateError && (
            <p role="alert" className="anim-fade-down mx-3 mb-2 flex items-start gap-2 rounded-control border border-danger/30 bg-danger/10 px-2.5 py-2 text-[12.5px] font-medium text-danger">
              <span className="min-w-0 flex-1">{dateError}</span>
              <button
                type="button"
                onClick={() => setDateError(null)}
                aria-label="Hatayı kapat"
                title="Kapat"
                className="tap-target grid size-6 shrink-0 place-items-center rounded text-danger/70 transition-colors duration-150 hover:text-danger"
              >
                <X size={14} aria-hidden />
              </button>
            </p>
          )}
          <div className="shrink-0 border-t border-hairline px-3 py-3">
            <Button className="w-full" onClick={() => setCreateModalDate(format(selectedDay, "yyyy-MM-dd"))}>
              <Plus size={14} aria-hidden />
              Bu güne görev ekle
            </Button>
          </div>
        </aside>
      </div>

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
