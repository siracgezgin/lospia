"use client";

import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
} from "@tanstack/react-table";
import { useState, useOptimistic, useTransition, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Plus, FileSpreadsheet, Lock, ClipboardList, Search, SlidersHorizontal, X, AlertCircle, LayoutDashboard } from "lucide-react";
import { ADMIN_ONLY_CHIP_LABEL } from "@/lib/utils/visibility";
import type { Task, SavedView, TaskStatus, TaskPriority, Profile, WorkspaceContact, WorkspaceDepartment } from "@/types";
import {
  TASK_PRIORITIES,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  CARD_STATUS_OPTIONS,
  SAVED_VIEW_SLUG_MAP,
} from "@/lib/utils/task-constants";
import { ViewTabs, VIEW_META, tabClass, type ViewTabItem } from "@/components/shared/ViewTabs";
import { FIELD_LABELS } from "@/lib/i18n/tr";
import { updateTaskStatus } from "@/lib/actions/tasks";
import { cn } from "@/lib/utils/cn";
import { formatDateTR } from "@/lib/utils/format-date";
import { buildDeptMeta } from "@/lib/utils/departments";
import { resolvePersonDescriptor, resolvePersonName, taskMatchesPerson } from "@/lib/utils/task-person-match";
import { getDepartmentBadge, STATUS_CHIP_TONE, STATUS_DOT, PRIORITY_CHIP, PRIORITY_SHOW_ON_BOARD } from "@/lib/design/semantics";
import { Button } from "@/components/ui/Button";
import { TextInput, SelectInput } from "@/components/ui/Field";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import { assignPersonTones } from "@/lib/design/person-colors";
import { SortHeader } from "@/components/ui/SortHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { CreateTaskModal } from "@/components/task/CreateTaskModal";
import { CsvImportModal } from "@/components/task/CsvImportModal";

interface Props {
  tasks: Task[];
  savedViews: SavedView[];
  workspaceId: string;
  userId: string;
  profiles: Pick<Profile, "id" | "full_name" | "email">[];
  contacts: WorkspaceContact[];
  departments?: WorkspaceDepartment[];
  members?: { memberId: string; userId: string; name: string }[];
  /** Süzgeç şeridindeki kişi baloncukları — ekip üyeleri, kimlikleriyle. */
  people?: { userId: string; name: string; photoUrl: string | null; colorKey: string | null }[];
  deptMembers?: { department_id: string; member_id: string }[];
  isAdmin?: boolean;
  // Person filter seed from the URL (?person=<member userId | contact id>).
  initialPerson?: string;
  // View seed from the URL (?view=<slug>) — same vocabulary as the Board.
  initialView?: string;
}

// ── Shared view semantics (mirrors the Board's applyViewFilter) ──────────────
// The List speaks the SAME six views as the Board so switching surfaces never
// changes what a view means. Kept LOCAL (not in the presentational ViewTabs
// helper) so filter logic stays with the surface that owns the data. Weekly
// membership is DUE-DATE-ONLY and applies to EXACTLY "Bu hafta" — every other
// view is week-independent. Unlike the Board there is no week navigator here,
// so "Bu hafta" always means the CURRENT Monday–Sunday range.
function listLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function listMondayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d;
}

const LIST_VIEW_DESCRIPTIONS: Record<string, string> = {
  "all":              "Tüm erişilebilir görevler",
  "mine":             "Üzerinizdeki tüm görevler — haftadan bağımsız",
  "this-week":        "Bu haftanın son tarihli görevleri",
  "overdue":          "Son tarihi geçmiş açık görevler — haftadan bağımsız",
  "done":             "Tamamlanmış tüm görevler — haftadan bağımsız",
  "waiting-approval": "Kontrol/onay bekleyen tüm görevler — haftadan bağımsız",
};

function applyListView(tasks: Task[], slug: string, userId: string): Task[] {
  const today = listLocalISO(new Date());
  const monday = listMondayOf(new Date());
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const mondayStr = listLocalISO(monday);
  const sundayStr = listLocalISO(sunday);
  const dueDay = (t: Task) => (t.due_date ? t.due_date.slice(0, 10) : null);
  const live = (t: Task) => t.status !== "archived" && !t.deleted_at && !t.archived_at;

  switch (slug) {
    case "mine":
      return tasks.filter((t) => live(t) && t.assignee_id === userId);
    case "overdue":
      return tasks.filter((t) => {
        if (!live(t) || t.status === "done") return false;
        const d = dueDay(t);
        return d !== null && d < today;
      });
    case "done":
      return tasks.filter((t) => t.status === "done" && !t.deleted_at && !t.archived_at);
    case "waiting-approval":
      return tasks.filter((t) => {
        if (!live(t) || t.status === "done") return false;
        return (
          t.status === "review" ||
          t.approval_required === true ||
          t.waiting_on_member_id != null ||
          t.waiting_on_contact_id != null
        );
      });
    case "this-week":
      return tasks.filter((t) => {
        if (!live(t)) return false;
        const d = dueDay(t);
        return d !== null && d >= mondayStr && d <= sundayStr;
      });
    case "all":
    default:
      // "Tümü" da çöpe/arşive gidenleri göstermez — pano ile aynı sözleşme.
      return tasks.filter(live);
  }
}

// Person matching (assignee / responsible contact / collaborators / original
// owner, by id or name) lives in a shared helper so the List filter and the CRM
// "X görev" counts always agree. See lib/utils/task-person-match.

// ---- Status display — simplified user-facing labels ----

const SIMPLIFIED_STATUS_LABEL: Record<TaskStatus, string> = {
  backlog:     "Yapılacak",
  ready:       "Yapılacak",
  in_progress: "Devam ediyor",
  review:      "Kontrol / Onay",
  blocked:     "Bekliyor",
  done:        "Tamamlandı",
  archived:    "Arşivlendi",
};

// Status filter options (user-facing groups → internal status arrays).
// Mirrors the board's columns so Kontrol / Onay is its own filterable stage.
type StatusFilterKey = "all" | "yapilacak" | "devam_ediyor" | "kontrol_onay" | "bekliyor" | "tamamlandi";

const STATUS_FILTER_OPTIONS: { key: StatusFilterKey; label: string; statuses: TaskStatus[] }[] = [
  { key: "all",          label: "Tüm durumlar",   statuses: [] },
  { key: "yapilacak",    label: "Yapılacak",       statuses: ["backlog", "ready"] },
  { key: "devam_ediyor", label: "Devam ediyor",    statuses: ["in_progress"] },
  { key: "kontrol_onay", label: "Kontrol / Onay",  statuses: ["review"] },
  { key: "bekliyor",     label: "Bekliyor",        statuses: ["blocked"] },
  { key: "tamamlandi",   label: "Tamamlandı",      statuses: ["done"] },
];

// ---- Safe category extractor ----

function safeCategory(task: Task): string {
  try {
    const cf = task.custom_fields;
    if (!cf || typeof cf !== "object" || Array.isArray(cf)) return "";
    const cat = (cf as Record<string, unknown>).category;
    if (typeof cat === "string") return cat;
    // Fallback: first tag
    const tags = task.tags;
    if (Array.isArray(tags) && tags.length > 0) return String(tags[0]);
    return "";
  } catch {
    return "";
  }
}

const columnHelper = createColumnHelper<Task>();

/* Tablo başlığı tipografisi — SortHeader ile birebir aynı (sıralanamayan
   sütunlar da aynı ölçüde dursun). */
const TH_TEXT = "text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle whitespace-nowrap";
/* Sağa hizalı (tarih) sütunlar — sayı/tarih hep tabular ve sağda. */
const RIGHT_ALIGNED = new Set(["due_date", "updated_at"]);

// ---- Status cell (inline editable) ----
// Minimum dekorasyon: renkli nokta + metin; dolgulu çip yok. Görünmez <select>
// üstte durur, tıklayınca durum değişir (davranış korunuyor).
function StatusCell({ task }: { task: Task }) {
  const [_isPending, startTransition] = useTransition();
  const [optimisticStatus, setOptimisticStatus] = useOptimistic<TaskStatus>(task.status);

  function handleChange(newStatus: TaskStatus) {
    startTransition(async () => {
      setOptimisticStatus(newStatus);
      await updateTaskStatus(task.id, newStatus);
    });
  }

  return (
    <div className="group/status relative inline-flex items-center rounded-control -ml-1.5 pl-1.5 pr-1 py-0.5 hover:bg-surface-sunken transition-colors duration-150">
      <span className="inline-flex items-center gap-1.5 text-[13.5px] text-ink whitespace-nowrap pointer-events-none">
        <span className={cn("h-2 w-2 rounded-full shrink-0", STATUS_DOT[optimisticStatus])} aria-hidden />
        {SIMPLIFIED_STATUS_LABEL[optimisticStatus]}
        <ChevronDown
          size={12}
          strokeWidth={2}
          className="shrink-0 text-subtle opacity-60 transition-opacity duration-150 group-hover/status:opacity-100"
          aria-hidden
        />
      </span>
      <select
        value={optimisticStatus}
        onChange={(e) => handleChange(e.target.value as TaskStatus)}
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-0 opacity-0 cursor-pointer w-full"
        aria-label="Durum değiştir"
      >
        {CARD_STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ---- Priority badge ----
function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <span className={cn(
      "text-[12px] font-medium rounded-md px-1.5 py-0.5 leading-none whitespace-nowrap",
      PRIORITY_CHIP[priority],
    )}>
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

// ---- Due date (shared by table + mobile card) ----
// Gecikme: renk TEK BAŞINA sinyal değil — yanında ikon; emoji yok.
function DueDate({ value, done }: { value: string | null; done: boolean }) {
  if (!value) return <span className="text-[12.5px] text-subtle">—</span>;
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = value < today && !done;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-[13.5px] tabular-nums whitespace-nowrap",
      isOverdue ? "text-danger font-medium" : "text-muted",
    )}>
      {isOverdue && <AlertCircle size={12} aria-label="Gecikti" />}
      {formatDateTR(value, { day: "numeric", month: "short" })}
    </span>
  );
}

// ---- Mobile task card (replaces the wide table below md) ----
// Telefonda en önemli dört şey: başlık · durum · sorumlu · tarih. Departman
// düz metin, öncelik yalnız yüksek/acilse. Kart başına TEK rozet (durum).
function MobileTaskCard({
  task,
  deptMeta,
  responsibleNames,
}: {
  task: Task;
  deptMeta: ReturnType<typeof buildDeptMeta>;
  responsibleNames: Record<string, string>;
}) {
  const meta = task.department_id ? deptMeta[task.department_id] : undefined;
  const badge = meta ? getDepartmentBadge(meta.color) : null;
  const responsible =
    responsibleNames[task.assignee_id ?? ""] ??
    responsibleNames[(task as { responsible_contact_id?: string | null }).responsible_contact_id ?? ""] ??
    "";
  const done = task.status === "done";

  return (
    <Link
      prefetch={false}
      href={`/tasks/${task.id}`}
      className="block rounded-card border border-line bg-surface p-3.5 shadow-card active:bg-surface-hover transition-colors duration-150"
    >
      <div className="flex items-start justify-between gap-2">
        <p className={cn(
          "text-[14px] font-medium leading-snug line-clamp-2 flex-1 min-w-0",
          done ? "text-muted line-through" : "text-ink",
        )}>
          {task.title}
        </p>
        <span className={cn(
          "text-[12px] font-medium rounded-md px-2 py-0.5 whitespace-nowrap shrink-0",
          STATUS_CHIP_TONE[task.status],
        )}>
          {SIMPLIFIED_STATUS_LABEL[task.status]}
        </span>
      </div>

      <div className="flex items-center gap-x-3 gap-y-1 mt-2 flex-wrap text-[12.5px] text-muted">
        <DueDate value={task.due_date} done={done} />
        {meta && badge && (
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", badge.dot)} aria-hidden />
            <span className="truncate">{meta.name}</span>
          </span>
        )}
        {PRIORITY_SHOW_ON_BOARD[task.priority] && (
          <span className={cn("font-medium", task.priority === "urgent" ? "text-urgent" : "text-overdue")}>
            {PRIORITY_LABELS[task.priority]}
          </span>
        )}
      </div>

      {/* Sorumlu kişi en altta — "görev oluşturan" satırı geri bildirimle kaldırıldı. */}
      {responsible && (
        <p className="mt-1.5 text-[12.5px] text-subtle truncate">
          Sorumlu: <span className="font-medium text-muted">{responsible}</span>
        </p>
      )}
    </Link>
  );
}

// ---- Main component ----

export function TaskListView({ tasks, savedViews, workspaceId, userId, profiles, contacts, departments = [], members = [], people = [], deptMembers = [], isAdmin = false, initialPerson = "", initialView = "" }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const deptMeta = useMemo(() => buildDeptMeta(departments), [departments]);
  const responsibleNames = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    profiles.forEach((p) => { map[p.id] = p.full_name ?? p.email ?? "?"; });
    contacts.forEach((c) => { map[c.id] = c.name; });
    return map;
  }, [profiles, contacts]);

  /* Baloncukların rengi Pano'daki kişi kartıyla AYNI kaynaktan gelir: yönetici
     Ayarlar'dan seçtiyse o renk, seçmediyse id'den deterministik atama. */
  const personTones = useMemo(
    () =>
      assignPersonTones(
        people.map((p) => p.userId),
        Object.fromEntries(people.map((p) => [p.userId, { colorKey: p.colorKey }])),
      ),
    [people],
  );

  const [sorting, setSorting] = useState<SortingState>([{ id: "updated_at", desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  /* Varsayılan sütunlar: İş · Departman · Konu · Durum · Teslim · Sorumlu ·
     İş birliği. Açıklama sütunu kapalı — başlığın yanında ikinci bir metin
     sütunu tabloyu okunmaz yapıyordu ve ayrıntı zaten görevin sayfasında.
     (Aslı Hanım, 2026-08-24: "Bize ne kadar fazla bilgi verirsen o kadar
     yavaşlarız.") */
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    created_at: false,
    updated_at: false,
    priority: false,
    description: false,
  });

  const [search, setSearch] = useState("");
  const [filterStatusKey, setFilterStatusKey] = useState<StatusFilterKey>("all");
  const [filterPriority, setFilterPriority] = useState<TaskPriority | "all">("all");
  const [personFilter, setPersonFilter] = useState(initialPerson);
  /* Nadir süzgeçler (öncelik) "Filtreler"in arkasında; uygulanmışsa kendiliğinden
     açık kalır ki gizli bir süzgeç listeyi sessizce daraltmasın. */
  const [moreFilters, setMoreFilters] = useState(false);
  // Active view (same six as the Board). Unknown/legacy values fall back to the
  // full "Tüm işler" list so the table never opens filtered to nothing.
  const KNOWN_VIEW_SLUGS = ["all", "mine", "this-week", "overdue", "done", "waiting-approval"];
  const [viewSlug, setViewSlug] = useState<string>(
    KNOWN_VIEW_SLUGS.includes(initialView) ? initialView : "all",
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // Person dropdown options — same data source as the board's Kişi filter:
  // workspace members first, then contacts. Value is the bare id.
  /* Yalnız DIŞ kişiler. Ekip üyeleri artık süzgeç şeridinde yüz olarak
     duruyor (bkz. kişi baloncukları), bu yüzden burada ikinci kez listelenmez. */
  const personOptions = useMemo(() => ({
    contacts: contacts.map((c) => ({ id: c.id, name: c.name })),
  }), [contacts]);

  // Keep the selection in the URL (?person=…) so a refresh preserves the filter.
  const handlePersonChange = useCallback((value: string) => {
    setPersonFilter(value);
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("person", value);
    else params.delete("person");
    const qs = params.toString();
    router.replace(qs ? `/list?${qs}` : "/list", { scroll: false });
  }, [router, searchParams]);

  const allowedStatuses = STATUS_FILTER_OPTIONS.find((o) => o.key === filterStatusKey)?.statuses ?? [];

  // Resolve the selected person (?person=<contact id | member user id>) into a
  // full descriptor + display name for matching and the filter banner.
  const personDescriptor = useMemo(
    () => (personFilter ? resolvePersonDescriptor(personFilter, { contacts, profiles }) : null),
    [personFilter, contacts, profiles],
  );
  const personDisplayName = useMemo(
    () => (personFilter ? resolvePersonName(personFilter, { contacts, profiles }) : null),
    [personFilter, contacts, profiles],
  );

  // View lens first (all / mine / this-week / overdue / done / waiting-approval),
  // then the toolbar filters compose on top — mirrors the Board's filter order.
  const viewedTasks = useMemo(
    () => applyListView(tasks, viewSlug, userId),
    [tasks, viewSlug, userId],
  );

  const filteredTasks = useMemo(() => viewedTasks.filter((t) => {
    if (allowedStatuses.length > 0 && !allowedStatuses.includes(t.status)) return false;
    if (filterPriority !== "all" && t.priority !== filterPriority) return false;
    if (personDescriptor && !taskMatchesPerson(t, personDescriptor)) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [viewedTasks, allowedStatuses, filterPriority, personDescriptor, search]);

  const hasActiveFilters =
    !!search || filterStatusKey !== "all" || filterPriority !== "all" || !!personFilter;

  function clearFilters() {
    setSearch("");
    setFilterStatusKey("all");
    setFilterPriority("all");
    if (personFilter) handlePersonChange("");
  }

  // Switch view without a full reload: update local state + the URL (?view=…),
  // preserving the person filter already in the query string.
  const handleViewChange = useCallback((slug: string) => {
    setViewSlug(slug);
    const params = new URLSearchParams(searchParams.toString());
    if (slug && slug !== "all") params.set("view", slug);
    else params.delete("view");
    const qs = params.toString();
    router.replace(qs ? `/list?${qs}` : "/list", { scroll: false });
  }, [router, searchParams]);

  // Build the shared view-tab strip from the workspace saved views, mapped to the
  // canonical slugs. "Bu hafta" is set apart with a divider (as on the Board).
  const viewTabItems = useMemo<ViewTabItem[]>(() => {
    return savedViews
      .map((view): ViewTabItem => {
        const slug = SAVED_VIEW_SLUG_MAP[view.name] ?? view.id;
        return {
          slug,
          label: view.name,
          icon: VIEW_META[slug as keyof typeof VIEW_META]?.icon,
          active: viewSlug === slug,
          dividerBefore: false,
        };
      })
      // "Bu hafta" sekmesi gizlendi — haftalık bölümleme kaldırıldı (geri alınabilir).
      .filter((it) => KNOWN_VIEW_SLUGS.includes(it.slug) && it.slug !== "this-week");
  }, [savedViews, viewSlug]); // eslint-disable-line react-hooks/exhaustive-deps -- KNOWN_VIEW_SLUGS is a stable literal

  // Columns MUST be memoized — recreating the array every render causes TanStack Table
  // to re-derive its internal model on every keystroke/sort click, which freezes the UI.
  const columns = useMemo(() => [
    columnHelper.accessor("title", {
      id: "title",
      header: FIELD_LABELS.title,
      cell: (info) => {
        const t = info.row.original;
        const done = t.status === "done";
        const tags = [...new Set(t.tags ?? [])].slice(0, 3);
        return (
          <div className="min-w-0">
            <Link
              prefetch={false}
              href={`/tasks/${t.id}`}
              title={info.getValue()}
              className={cn(
                "font-medium text-[14px] line-clamp-2 block leading-snug break-words transition-colors duration-150 hover:text-brand",
                done ? "text-muted line-through" : "text-ink",
              )}
            >
              {info.getValue()}
            </Link>
            {/* Satır içi ikincil bilgi düz metin — rozet yığını yok. */}
            {((t as unknown as { visibility?: string }).visibility === "admin_only" || tags.length > 0) && (
              <p className="mt-0.5 flex items-center gap-1.5 flex-wrap text-[12px] text-subtle">
                {(t as unknown as { visibility?: string }).visibility === "admin_only" && (
                  <span className="inline-flex items-center gap-1 text-warning">
                    <Lock size={11} aria-hidden /> {ADMIN_ONLY_CHIP_LABEL}
                  </span>
                )}
                {tags.length > 0 && <span className="truncate">{tags.join(" · ")}</span>}
              </p>
            )}
          </div>
        );
      },
      enableSorting: false,
    }),
    // Description column
    columnHelper.accessor("description", {
      id: "description",
      header: "Açıklama",
      cell: (info) => {
        const val = info.getValue();
        return val
          ? <span className="text-[13.5px] text-muted line-clamp-1">{val}</span>
          : <span className="text-[12.5px] text-subtle">—</span>;
      },
      enableSorting: false,
    }),
    // Departman column — colored chip from the task's department
    columnHelper.accessor((row) => (row.department_id ? deptMeta[row.department_id]?.name ?? "" : ""), {
      id: "department",
      header: "Departman",
      cell: (info) => {
        const row = info.row.original;
        const meta = row.department_id ? deptMeta[row.department_id] : undefined;
        if (!meta) return <span className="text-[12.5px] text-subtle">—</span>;
        const badge = getDepartmentBadge(meta.color);
        // Departman rengi tasarım sistemi verisidir (semantics) — korunur.
        // Uzun ad kesilmez, iki satıra sarar.
        return (
          <span
            className={cn(
              "inline-flex items-start gap-1.5 max-w-[15rem] rounded-md py-0.5 pl-2 pr-2 text-[12px] font-medium ring-1",
              badge.chip,
              badge.ring,
            )}
            title={meta.name}
          >
            <span className={cn("mt-1.5 h-1.5 w-1.5 rounded-full shrink-0", badge.dot)} aria-hidden />
            <span className="line-clamp-2 leading-snug text-left">{meta.name}</span>
          </span>
        );
      },
      sortingFn: (a, b) => {
        const na = a.original.department_id ? deptMeta[a.original.department_id]?.name ?? "" : "";
        const nb = b.original.department_id ? deptMeta[b.original.department_id]?.name ?? "" : "";
        return na.localeCompare(nb, "tr", { sensitivity: "base" });
      },
    }),
    // Konu column (changing topic; stored under legacy custom_fields.category)
    columnHelper.accessor((row) => safeCategory(row), {
      id: "konu",
      header: "Konu",
      cell: (info) => {
        const val = info.getValue();
        return val
          ? <span className="block text-[13.5px] text-muted max-w-[12rem] truncate" title={val}>{val}</span>
          : <span className="text-[12.5px] text-subtle">—</span>;
      },
      sortingFn: (a, b) => {
        const ca = safeCategory(a.original);
        const cb = safeCategory(b.original);
        return ca.localeCompare(cb, "tr", { sensitivity: "base" });
      },
    }),
    columnHelper.accessor("status", {
      id: "status",
      header: FIELD_LABELS.status,
      cell: (info) => <StatusCell task={info.row.original} />,
      sortingFn: (a, b) => {
        const order: TaskStatus[] = ["backlog", "ready", "in_progress", "review", "blocked", "done", "archived"];
        return order.indexOf(a.original.status) - order.indexOf(b.original.status);
      },
    }),
    columnHelper.accessor("priority", {
      id: "priority",
      header: FIELD_LABELS.priority,
      cell: (info) => <PriorityBadge priority={info.getValue()} />,
      sortingFn: (a, b) =>
        PRIORITY_ORDER[a.original.priority] - PRIORITY_ORDER[b.original.priority],
    }),
    columnHelper.accessor("due_date", {
      id: "due_date",
      header: FIELD_LABELS.dueDate,
      cell: (info) => <DueDate value={info.getValue()} done={info.row.original.status === "done"} />,
      sortingFn: (a, b) => {
        const da = a.original.due_date ?? "9999-12-31";
        const db = b.original.due_date ?? "9999-12-31";
        return da < db ? -1 : da > db ? 1 : 0;
      },
    }),
    // Responsible column — reads assignee_id or responsible_contact_id
    columnHelper.accessor(
      (row) => responsibleNames[row.assignee_id ?? ""] ?? responsibleNames[(row as { responsible_contact_id?: string | null }).responsible_contact_id ?? ""] ?? "",
      {
        id: "responsible",
        header: FIELD_LABELS.assignee,
        cell: (info) => <span className="text-[13.5px] text-muted whitespace-nowrap">{info.getValue() || "—"}</span>,
        sortingFn: (a, b) => {
          const na = responsibleNames[a.original.assignee_id ?? ""] ?? responsibleNames[(a.original as { responsible_contact_id?: string | null }).responsible_contact_id ?? ""] ?? "";
          const nb = responsibleNames[b.original.assignee_id ?? ""] ?? responsibleNames[(b.original as { responsible_contact_id?: string | null }).responsible_contact_id ?? ""] ?? "";
          return na.localeCompare(nb, "tr", { sensitivity: "base" });
        },
      }
    ),
    /* İŞ BİRLİĞİ — katılımcılar `custom_fields.collaborators` içinde KİŞİ
       KİMLİĞİ (uuid) olarak durur. Değerler eskiden olduğu gibi birleştirilip
       basılıyordu; haritada karşılığı olmayan bir kimlik ekrana ham uuid
       olarak düşüyordu ("00000000-0000-…-41" — canlı taramada görüldü).
       Kullanıcıya teknik değer gösterilmez: kimlik ada çevrilir, çevrilemeyen
       kimlik hiç yazılmaz (satır "—" kalır). */
    columnHelper.accessor(
      (row) => {
        try {
          const cf = row.custom_fields;
          if (!cf || typeof cf !== "object" || Array.isArray(cf)) return "";
          const c = (cf as Record<string, unknown>).collaborators;
          const ids = Array.isArray(c) ? c : typeof c === "string" ? [c] : [];
          return ids
            .map((id) => (typeof id === "string" ? responsibleNames[id] : undefined))
            .filter((n): n is string => !!n)
            .join(", ");
        } catch { return ""; }
      },
      {
        id: "collaborators",
        header: "İş birliği",
        cell: (info) => {
          const val = info.getValue();
          return val
            ? <span className="text-[13.5px] text-muted">{val}</span>
            : <span className="text-[13px] text-subtle">—</span>;
        },
        enableSorting: false,
      }
    ),
    // "Oluşturan" kolonu geri bildirimle kaldırıldı — sorumlu kişi kolonu (üstte
    // "responsible") görev sahipliğini gösterir.
    columnHelper.accessor("updated_at", {
      id: "updated_at",
      header: FIELD_LABELS.updatedAt,
      cell: (info) => (
        <span className="text-[13.5px] text-muted tabular-nums whitespace-nowrap">
          {formatDateTR(info.getValue() as string, { day: "numeric", month: "short" })}
        </span>
      ),
      sortingFn: (a, b) => {
        const da = a.original.updated_at;
        const db = b.original.updated_at;
        return da < db ? -1 : da > db ? 1 : 0;
      },
    }),
    // Hidden: created_at — present so TanStack can sort on it without crashing
    columnHelper.accessor("created_at", {
      id: "created_at",
      header: "Oluşturuldu",
      cell: () => null,
      sortingFn: (a, b) => {
        const da = a.original.created_at;
        const db = b.original.created_at;
        return da < db ? -1 : da > db ? 1 : 0;
      },
    }),
  ], [responsibleNames, deptMeta]); // closure deps

  const table = useReactTable({
    data: filteredTasks,
    columns,
    state: { sorting, columnFilters, columnVisibility },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const totalRows = table.getFilteredRowModel().rows.length;
  /* Nadir süzgeçler: gizli bir süzgeç listeyi sessizce daraltmasın — öncelik
     ya da DIŞ KİŞİ seçiliyse bölüm kendiliğinden açık kalır. */
  const contactFilterActive = !!personFilter && contacts.some((c) => c.id === personFilter);
  const showPriorityFilter = moreFilters || filterPriority !== "all" || contactFilterActive;

  return (
    // Desktop: fixed-height shell, table scrolls internally. Mobile (max-md):
    // natural height so tabs + filters scroll away and the card list flows.
    <div className="flex flex-col h-full max-md:h-auto max-md:min-h-full">
      {/* Shared segmented view tabs — identical vocabulary + styling to the Board
          (Tüm işler / Bana atananlar / Bu hafta / Gecikenler / Tamamlananlar /
          Onay bekleyenler). Client-side selection keeps the person filter. */}
      {viewTabItems.length > 0 && (
        <div className="px-4 pt-3 pb-2 border-b border-line bg-surface shrink-0 space-y-1.5">
          {/* RAPORLAR aynı şeridin son sekmesi.
              Sıraç (2026-08-29): "reports kısmı burdaki olmalı, rapor
              kısımlarını da buraya ekleyip entegre edelim."
              Üye için Reports zaten bu tablonun anlattığını anlatıyordu
              (bana atanan işler + teslim tarihleri). Artık iki yüzey tek şerit:
              görevler burada, özetler bir sekme ötede. Ayrı ROTA kalır —
              rapor sorguları liste açılışına binmesin (kabuk/hız kuralı). */}
          <ViewTabs
            iconsEverywhere
            items={viewTabItems}
            onSelect={handleViewChange}
            trailing={
              <Link href="/dashboard" className={tabClass(false)}>
                <LayoutDashboard size={14} className="shrink-0" aria-hidden />
                Raporlar
              </Link>
            }
          />
          <p className="text-[12.5px] text-muted">{LIST_VIEW_DESCRIPTIONS[viewSlug] ?? ""}</p>
        </div>
      )}

      {/* Toolbar — tek primary (Görev oluştur), sonra en sık süzgeçler: arama ·
          durum · kişi. Öncelik "Filtreler"in arkasında; "Temizle" yalnız bir
          süzgeç uygulanmışken. Sağdaki sayı listeyi tarif eder. */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-surface border-b border-hairline shrink-0">
        <Button onClick={() => setModalOpen(true)}>
          <Plus size={14} aria-hidden />
          Görev oluştur
        </Button>
        {/* CSV içe aktar — geri bildirimle şimdilik gizlendi (kod/action korunur). */}
        {false && isAdmin && (
          <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
            <FileSpreadsheet size={14} />
            CSV&apos;den içe aktar
          </Button>
        )}
        <div className="hidden sm:block w-px h-5 bg-line mx-1" aria-hidden />

        <div className="relative flex-1 min-w-[12rem] sm:flex-none sm:w-64">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
          <TextInput
            type="search"
            placeholder="Görev ara…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Görev ara"
            className="pl-8"
          />
        </div>

        <SelectInput
          value={filterStatusKey}
          onChange={(e) => setFilterStatusKey(e.target.value as StatusFilterKey)}
          aria-label="Duruma göre filtrele"
          className={cn("w-auto", filterStatusKey !== "all" ? "text-ink font-medium" : "text-muted")}
        >
          {STATUS_FILTER_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </SelectInput>

        {/* KİŞİ SÜZGECİ — açılır liste değil, YÜZLER.
            Sıraç (2026-08-29): "kişiler de filtrelerin yanında yuvarlak
            baloncuk şeklinde olsun, tüm kişiler kısmını da kaldır alan açılsın."
            "Tüm kişiler" kutusu satırda ~14rem yer kaplıyor ve kişiyi seçmek
            için açılıp okunması gerekiyordu. Yüzler tek bakışta taranır, tek
            tıkla süzer, ikinci tıkla bırakır. Ekip verisi PANO ile aynı
            kaynaktan gelir; aynı kişi her yerde aynı renk ve fotoğrafla görünür.
            Dış kişiler (tedarikçi/usta) ekip değildir — onlar "Filtreler"in
            altında listelenir, satırı kalabalıklaştırmazlar. */}
        {people.length > 0 && (
          <div className="flex items-center gap-1" role="group" aria-label="Kişiye göre filtrele">
            {people.map((p) => {
              const on = personFilter === p.userId;
              return (
                <button
                  key={p.userId}
                  type="button"
                  onClick={() => handlePersonChange(on ? "" : p.userId)}
                  aria-pressed={on}
                  aria-label={on ? `${p.name} süzgecini kaldır` : `${p.name} kişisinin işleri`}
                  title={p.name}
                  className={cn(
                    "tap-target grid size-9 shrink-0 place-items-center rounded-full transition-[background-color,box-shadow] duration-150 ease-standard",
                    on ? "ring-2 ring-brand ring-offset-1 ring-offset-surface" : "hover:bg-surface-muted",
                    /* Seçili olmayan yüzler bir tık geride durur: satırın ana
                       işi süzmek, yüzler bir gösterge panosu değil. */
                    !on && personFilter ? "opacity-45 hover:opacity-100" : "",
                  )}
                >
                  <PersonAvatar
                    name={p.name}
                    photoUrl={p.photoUrl}
                    colorHex={personTones[p.userId]?.hex ?? null}
                    size="sm"
                  />
                </button>
              );
            })}
          </div>
        )}

        {showPriorityFilter && (
          <SelectInput
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value as TaskPriority | "all")}
            aria-label="Önceliğe göre filtrele"
            className={cn("anim-fade w-auto", filterPriority !== "all" ? "text-ink font-medium" : "text-muted")}
          >
            <option value="all">Tüm öncelikler</option>
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
            ))}
          </SelectInput>
        )}

        {/* Dış kişiler — usta, tedarikçi, influencer. Ekip yüzlerinin yanında
            değil, nadir süzgeçlerin arasında: bir işin sorumlusu çoğu zaman
            ekipten biridir. Seçiliyken açılır kalır ki gizli bir süzgeç listeyi
            sessizce daraltmasın. */}
        {showPriorityFilter && personOptions.contacts.length > 0 && (
          <SelectInput
            value={personOptions.contacts.some((c) => c.id === personFilter) ? personFilter : ""}
            onChange={(e) => handlePersonChange(e.target.value)}
            aria-label="Dış kişiye göre filtrele"
            className={cn(
              "anim-fade w-auto max-w-[13rem]",
              personOptions.contacts.some((c) => c.id === personFilter) ? "border-brand-ring text-brand font-medium" : "text-muted",
            )}
          >
            <option value="">Dış kişiler</option>
            {personOptions.contacts.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </SelectInput>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setMoreFilters((v) => !v)}
          aria-expanded={showPriorityFilter}
          className="h-9"
        >
          <SlidersHorizontal size={14} aria-hidden />
          {showPriorityFilter ? "Daha az" : "Filtreler"}
        </Button>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="anim-fade h-9">
            <X size={14} aria-hidden />
            Temizle
          </Button>
        )}

        <span className="ml-auto text-[12.5px] font-medium text-muted self-center tabular-nums whitespace-nowrap">{totalRows} görev</span>
      </div>

      {/* Active person filter banner — makes a deep-link from CRM explicit and
          gives a one-click way to clear it. */}
      {personFilter && (
        <div className="flex items-center justify-between gap-2 px-4 py-1.5 bg-brand-soft/60 border-b border-brand-ring/30 shrink-0">
          <span className="text-[13px] text-brand-strong">
            <span className="font-semibold">{personDisplayName ?? "Seçili kişi"}</span> ile ilişkili görevler
          </span>
          <Button variant="ghost" size="sm" onClick={() => handlePersonChange("")} className="text-brand hover:text-brand-strong">
            Filtreyi temizle
          </Button>
        </div>
      )}

      {/* Mobile: card list (no horizontal table) — flows into the page scroll */}
      <div className="md:hidden bg-app px-3 py-3">
        {table.getRowModel().rows.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Görev bulunamadı"
            description={hasActiveFilters ? "Geçerli filtrelerle eşleşen görev yok." : undefined}
            action={hasActiveFilters ? <Button variant="secondary" size="sm" onClick={clearFilters}>Filtreleri temizle</Button> : undefined}
          />
        ) : (
          <div className="flex flex-col gap-2.5">
            {table.getRowModel().rows.map((row) => (
              <MobileTaskCard
                key={row.id}
                task={row.original}
                deptMeta={deptMeta}
                responsibleNames={responsibleNames}
              />
            ))}
          </div>
        )}
      </div>

      {/* Table — desktop / tablet. Wide content scrolls INSIDE this wrapper
          (overflow-x-auto); the page itself never scrolls horizontally.
          Gerçek tablo: yapışkan düz başlık, dikey kenarlık yok, tarih sağda. */}
      <div className="hidden md:block flex-1 overflow-x-auto overflow-y-auto bg-app">
        <table className="w-full min-w-[56rem] text-[13.5px] border-collapse">
          <thead className="sticky top-0 z-10 bg-surface shadow-[inset_0_-1px_0_var(--color-line)]">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const right = RIGHT_ALIGNED.has(header.column.id);
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={sorted ? (sorted === "asc" ? "ascending" : "descending") : undefined}
                      className={cn("px-4 py-2.5 select-none", right ? "text-right" : "text-left")}
                    >
                      {header.column.getCanSort() ? (
                        <SortHeader
                          active={!!sorted}
                          dir={sorted === "desc" ? "desc" : "asc"}
                          onSort={() => header.column.toggleSorting()}
                          align={right ? "right" : "left"}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </SortHeader>
                      ) : (
                        <span className={TH_TEXT}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </span>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-hairline bg-surface">
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="p-0">
                  <EmptyState
                    icon={ClipboardList}
                    title="Görev bulunamadı"
                    description={hasActiveFilters ? "Geçerli filtrelerle eşleşen görev yok." : undefined}
                    action={hasActiveFilters ? <Button variant="secondary" size="sm" onClick={clearFilters}>Filtreleri temizle</Button> : undefined}
                  />
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="transition-colors duration-150 hover:bg-surface-hover"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={cn(
                        "px-4 py-2.5 align-middle",
                        RIGHT_ALIGNED.has(cell.column.id) && "text-right",
                        cell.column.id === "title" && "w-full min-w-[16rem]",
                        cell.column.id === "description" && "min-w-[12rem]",
                        cell.column.id === "department" && "min-w-[11rem]",
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <CreateTaskModal
          onClose={() => setModalOpen(false)}
          workspaceId={workspaceId}
          profiles={profiles}
          contacts={contacts}
          departments={departments}
          members={members}
          deptMembers={deptMembers}
          isAdmin={isAdmin}
        />
      )}
      {importOpen && (
        <CsvImportModal onClose={() => setImportOpen(false)} />
      )}
    </div>
  );
}
