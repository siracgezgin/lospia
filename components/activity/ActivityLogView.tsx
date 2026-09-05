"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus, RefreshCw, CheckCircle2, RotateCcw, StickyNote, Users, Eye, Flag, CalendarClock, Archive, Trash2, Award, Pencil, Activity as ActivityIcon, Download,
} from "lucide-react";
import { formatDateTimeTR, formatDateTR } from "@/lib/utils/format-date";
import { getPersonDisplayName } from "@/lib/utils/person-display";
import { STATUS_LABELS, PRIORITY_LABELS } from "@/lib/utils/task-constants";
import { EFFORT_LABELS, isEffortSize } from "@/lib/points/effort";
import { VISIBILITY_LABELS } from "@/lib/utils/visibility";
import { cn } from "@/lib/utils/cn";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { loadMoreActivity } from "@/app/(app)/activity/actions";
import type { TaskStatus, TaskPriority } from "@/types";

// One audit row, flattened on the server (actor/task joins resolved to scalars).
export type ActivityRow = {
  id: string;
  action: string;
  created_at: string;
  task_id: string | null;
  old_value: unknown;
  new_value: unknown;
  metadata: unknown;
  actor_name: string | null;
  task_title: string | null;
};

// ── Action → visual identity (icon + tone + Turkish verb) ─────────────────────
/* Tonlar tasarım token'ından: yeşil YALNIZ tamamlanma, mavi bilgi/durum,
   amber tarih-görünürlük gibi "dikkat", mor atama/not, kırmızı silme.
   Önce ham palet (emerald-50, blue-700…) kullanılıyordu; uygulamanın geri
   kalanıyla aynı renkleri konuşmuyordu. Renk hiçbir zaman tek başına anlam
   taşımaz — ikon ve fiil hep yanında. */
type Tone = "success" | "info" | "warning" | "approval" | "danger" | "neutral";

const TONE_CLS: Record<Tone, string> = {
  success:  "bg-success/10 text-success",
  info:     "bg-info/10 text-info",
  warning:  "bg-warning/10 text-warning",
  approval: "bg-approval/10 text-approval",
  danger:   "bg-danger/10 text-danger",
  neutral:  "bg-surface-sunken text-muted",
};

type ActionMeta = { verb: string; tone: Tone; icon: typeof Plus };

const ACTION_META: Record<string, ActionMeta> = {
  task_created:                 { verb: "görev oluşturdu",                tone: "info",     icon: Plus },
  task_completed:               { verb: "görevi tamamladı",               tone: "success",  icon: CheckCircle2 },
  participant_completed:        { verb: "kendi işini tamamladı",          tone: "success",  icon: CheckCircle2 },
  auto_moved_to_review:         { verb: "görevi Kontrol / Onay'a taşıdı", tone: "info",     icon: RefreshCw },
  status_changed:               { verb: "durumu değiştirdi",              tone: "info",     icon: RefreshCw },
  task_reopened:                { verb: "görevi yeniden açtı",            tone: "warning",  icon: RotateCcw },
  participant_uncompleted:      { verb: "tamamlamayı geri aldı",          tone: "warning",  icon: RotateCcw },
  note_added:                   { verb: "not ekledi",                     tone: "approval", icon: StickyNote },
  assignee_changed:             { verb: "sorumluyu değiştirdi",           tone: "approval", icon: Users },
  responsible_contact_changed:  { verb: "sorumlu kişiyi değiştirdi",      tone: "approval", icon: Users },
  waiting_person_changed:       { verb: "beklenen kişiyi değiştirdi",     tone: "approval", icon: Users },
  priority_changed:             { verb: "önceliği değiştirdi",            tone: "warning",  icon: Flag },
  due_date_changed:             { verb: "teslim tarihini değiştirdi",     tone: "warning",  icon: CalendarClock },
  visibility_changed:           { verb: "görünürlüğü değiştirdi",         tone: "warning",  icon: Eye },
  title_changed:                { verb: "başlığı değiştirdi",             tone: "neutral",  icon: Pencil },
  description_changed:          { verb: "açıklamayı güncelledi",          tone: "neutral",  icon: Pencil },
  category_changed:             { verb: "konuyu değiştirdi",              tone: "neutral",  icon: Pencil },
  tags_changed:                 { verb: "etiketleri güncelledi",          tone: "neutral",  icon: Pencil },
  effort_changed:               { verb: "eforu değiştirdi",               tone: "neutral",  icon: Pencil },
  approval_changed:             { verb: "onay durumunu güncelledi",       tone: "neutral",  icon: Pencil },
  task_archived:                { verb: "görevi arşivledi",               tone: "neutral",  icon: Archive },
  task_unarchived:              { verb: "görevi arşivden çıkardı",        tone: "neutral",  icon: Archive },
  task_trashed:                 { verb: "görevi çöpe taşıdı",             tone: "danger",   icon: Trash2 },
  task_restored:                { verb: "görevi geri yükledi",            tone: "info",     icon: RotateCcw },
  task_duplicated:              { verb: "görevi çoğalttı",                tone: "neutral",  icon: Plus },
  points_finalized:             { verb: "puanı kesinleştirdi",            tone: "success",  icon: Award },
  points_revoked:               { verb: "kazanılan puanı geri aldı",      tone: "danger",   icon: Award },
  points_self_approval_skipped: { verb: "kendi onayı nedeniyle puan verilmedi", tone: "neutral", icon: Award },

  /* GÖREV DIŞI OLAYLAR (workspace_activity_logs, 20240332).
     Sıraç (2026-08-29): "Bu indirme, silme kısımları da loglarda çıksın."
     Föy indirmek ve kategori/klasör silmek bir göreve bağlı değil; ayrı bir
     tabloda tutulur ama AYNI akışta okunur — denetim yaparken iki listeye
     bakmak istemezsiniz. */
  sheet_downloaded:     { verb: "föyü Excel olarak indirdi",      tone: "info",     icon: Download },
  sheets_exported:      { verb: "tüm föyleri indirdi",            tone: "info",     icon: Download },
  sheet_printed:        { verb: "föyün çıktısını aldı",           tone: "info",     icon: Download },
  file_downloaded:      { verb: "dosya indirdi",                  tone: "info",     icon: Download },
  sheet_sent:           { verb: "föyü üreticiye gönderdi",        tone: "approval", icon: Users },
  sheet_deleted:        { verb: "föyü sildi",                     tone: "danger",   icon: Trash2 },
  sheet_archived:       { verb: "föyü arşivledi",                 tone: "neutral",  icon: Archive },
  category_created:     { verb: "kategori açtı",                  tone: "info",     icon: Plus },
  category_renamed:     { verb: "kategoriyi yeniden adlandırdı",  tone: "neutral",  icon: Pencil },
  category_deleted:     { verb: "kategoriyi sildi",               tone: "danger",   icon: Trash2 },
  document_deleted:     { verb: "dokümanı sildi",                 tone: "danger",   icon: Trash2 },
  folder_deleted:       { verb: "klasörü sildi",                  tone: "danger",   icon: Trash2 },
  spreadsheet_deleted:  { verb: "tabloyu sildi",                  tone: "danger",   icon: Trash2 },
  contact_deleted:      { verb: "ilişki kaydını sildi",           tone: "danger",   icon: Trash2 },
};

const FALLBACK_META: ActionMeta = { verb: "görevi güncelledi", tone: "neutral", icon: ActivityIcon };
/* Göreve bağlı OLMAYAN, tanınmayan olay: "görevi güncelledi" demek yanlış
   olurdu (ortada görev yok — föy, kategori, klasör olabilir). */
const FALLBACK_WORKSPACE_META: ActionMeta = { verb: "bir işlem yaptı", tone: "neutral", icon: ActivityIcon };

function metaFor(row: { action: string; task_id: string | null }): ActionMeta {
  return ACTION_META[row.action] ?? (row.task_id === null ? FALLBACK_WORKSPACE_META : FALLBACK_META);
}

// ── Filters (user-facing groups → action sets) ────────────────────────────────
type FilterKey = "all" | "created" | "status" | "completed" | "assignment" | "date" | "download" | "deleted";

const FILTERS: { key: FilterKey; label: string; actions: string[]; icon: typeof Plus }[] = [
  { key: "all",        label: "Tümü",              actions: [],                                                                   icon: ActivityIcon },
  { key: "created",    label: "Oluşturma",         actions: ["task_created"],                                                    icon: Plus },
  { key: "status",     label: "Durum",             actions: ["status_changed", "auto_moved_to_review"],                          icon: RefreshCw },
  { key: "completed",  label: "Tamamlanan",        actions: ["task_completed", "participant_completed"],                         icon: CheckCircle2 },
  { key: "assignment", label: "Atama",             actions: ["assignee_changed", "responsible_contact_changed", "waiting_person_changed"], icon: Users },
  { key: "date",       label: "Tarih",             actions: ["due_date_changed"],                                                icon: CalendarClock },
  /* İki yeni süzgeç: denetimde en çok aranan iki soru "kim ne indirdi" ve
     "kim ne sildi" (2026-08-29). */
  { key: "download",   label: "İndirme",           actions: ["sheet_downloaded", "sheets_exported", "sheet_printed", "file_downloaded"], icon: Download },
  { key: "deleted",    label: "Silme",             actions: ["sheet_deleted", "category_deleted", "document_deleted", "folder_deleted", "spreadsheet_deleted", "contact_deleted", "task_trashed"], icon: Trash2 },
];

// ── Change-detail extraction (old → new) ──────────────────────────────────────
function statusLabel(v: unknown): string {
  return typeof v === "string" && v in STATUS_LABELS ? STATUS_LABELS[v as TaskStatus] : String(v ?? "—");
}
function priorityLabel(v: unknown): string {
  return typeof v === "string" && v in PRIORITY_LABELS ? PRIORITY_LABELS[v as TaskPriority] : String(v ?? "—");
}
function effortLabel(v: unknown): string {
  return isEffortSize(v) ? EFFORT_LABELS[v] : String(v ?? "—");
}
function visibilityLabel(v: unknown): string {
  return typeof v === "string" && v in VISIBILITY_LABELS ? VISIBILITY_LABELS[v as keyof typeof VISIBILITY_LABELS] : String(v ?? "—");
}
function dateLabel(v: unknown): string {
  if (typeof v !== "string" || !v) return "—";
  try { return formatDateTR(v, { day: "numeric", month: "long" }); } catch { return v; }
}
function cleanStr(v: unknown): string {
  if (v == null) return "—";
  let s = String(v).trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  return s || "—";
}

// Returns { label, from, to } for transition-style edits, else null.
function changeDetail(row: ActivityRow): { label: string; from: string; to: string } | null {
  const { action, old_value: o, new_value: n } = row;
  switch (action) {
    case "status_changed":   return { label: "Durum", from: statusLabel(o), to: statusLabel(n) };
    case "priority_changed": return { label: "Öncelik", from: priorityLabel(o), to: priorityLabel(n) };
    case "due_date_changed": return { label: "Teslim tarihi", from: dateLabel(o), to: dateLabel(n) };
    case "category_changed": return { label: "Konu", from: cleanStr(o), to: cleanStr(n) };
    case "effort_changed":   return { label: "Efor", from: effortLabel(o), to: effortLabel(n) };
    case "visibility_changed": return { label: "Görünürlük", from: visibilityLabel(o), to: visibilityLabel(n) };
    default: return null;
  }
}

/** "Durum: Yapılacak → Devam ediyor" — eskiden yeni. */
function Transition({ detail }: { detail: { label: string; from: string; to: string } }) {
  return (
    <span className="text-muted">
      {detail.label}:{" "}
      <span className="text-subtle">{detail.from}</span>
      <span className="mx-1 text-subtle" aria-hidden>→</span>
      <span className="sr-only">sonra</span>
      <span className="font-medium text-ink">{detail.to}</span>
    </span>
  );
}

/**
 * ACTIVITY LOG — denetim akışı (yalnız yönetici).
 *
 * Bir SATIR = kim · ne yaptı · hangi işte · ne zaman; tek satırda okunur.
 * Ekranın üstünde bir zamanlar altı büyük sayaç karosu (her biri ikon + iri
 * rakam), sağda "Denetim merkezi" paneli ve sayfa başlığı bloğu vardı.
 * Sayaçlar aslında süzgeçti — şimdi süzgeç şeridindeki küçük sayı olarak
 * duruyorlar (listeyi tarif eder: "Silme 12"). Panel ve başlık gitti; başlık
 * uygulama çubuğunda zaten yazıyor.
 */
export function ActivityLogView({
  rows: initialRows,
  initialCursor = null,
}: {
  rows: ActivityRow[];
  /** Bir sonraki turun başlangıcı; null ise akış bitmiştir. */
  initialCursor?: string | null;
}) {
  const [filter, setFilter] = useState<FilterKey>("all");

  /* SAYFALAMA. Akış 200 satırda kesiliyor ve orada BİTİYORDU — daha eskisine
     ulaşmanın hiçbir yolu yoktu. Süzgeç seçimi istemcide durduğu için tam
     sayfa gezinmesi yerine eylemle yükleniyor: "Silme"yi seçip daha fazla
     istediğinizde süzgeç yerinde kalır. */
  const [rows, setRows] = useState<ActivityRow[]>(initialRows);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    setLoadError(null);
    void loadMoreActivity(cursor)
      .then((res) => {
        if ("error" in res) { setLoadError(res.error); return; }
        setRows((prev) => {
          const seen = new Set(prev.map((r) => r.id));
          return [...prev, ...res.rows.filter((r) => !seen.has(r.id))];
        });
        setCursor(res.nextCursor);
      })
      .catch(() => setLoadError("Kayıtlar yüklenemedi. Lütfen tekrar deneyin."))
      .finally(() => setLoading(false));
  }

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = {
      all: rows.length, created: 0, status: 0, completed: 0, assignment: 0, date: 0,
      download: 0, deleted: 0,
    };
    for (const f of FILTERS) {
      if (f.key === "all") continue;
      c[f.key] = rows.filter((r) => f.actions.includes(r.action)).length;
    }
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const active = FILTERS.find((f) => f.key === filter);
    if (!active || active.actions.length === 0) return rows;
    return rows.filter((r) => active.actions.includes(r.action));
  }, [rows, filter]);

  // Collapse the visual repetition: consecutive changes by the SAME person on the
  // SAME task within a short window read as one editing session. We group them so
  // the actor + task title appear once, with each change listed compactly beneath.
  // No audit record is dropped — this is purely presentational.
  const groups = useMemo(() => {
    const GAP_MS = 5 * 60 * 1000; // 5 dk içinde art arda gelen değişiklikler
    const out: { key: string; rows: ActivityRow[] }[] = [];
    for (const r of visible) {
      const last = out[out.length - 1];
      const lastRow = last?.rows[last.rows.length - 1];
      const sameContext =
        lastRow &&
        lastRow.task_id === r.task_id &&
        r.task_id != null &&
        lastRow.actor_name === r.actor_name &&
        Math.abs(new Date(lastRow.created_at).getTime() - new Date(r.created_at).getTime()) <= GAP_MS;
      if (sameContext) last!.rows.push(r);
      else out.push({ key: r.id, rows: [r] });
    }
    return out;
  }, [visible]);

  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      <h1 className="sr-only">Activity Log</h1>

      {/* ── Süzgeç şeridi — segment düğmeleri; sayı listeyi tarif eder ──────── */}
      <div
        role="group"
        aria-label="Hareket türü süzgeci"
        className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1"
      >
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const Icon = f.icon;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={active}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] font-medium",
                "transition-[background-color,border-color,color] duration-150 ease-standard active:scale-[0.98]",
                active
                  ? "border-brand bg-brand text-white"
                  : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink",
              )}
            >
              <Icon size={13} aria-hidden />
              {f.label}
              <span className={cn("text-[12px] tabular-nums", active ? "text-white/80" : "text-subtle")}>
                {counts[f.key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Akış ─────────────────────────────────────────────────────────────── */}
      <div key={filter} className="anim-fade divide-y divide-hairline overflow-hidden rounded-card border border-line bg-surface shadow-card">
        {groups.length === 0 ? (
          <EmptyState
            compact
            icon={ActivityIcon}
            title={rows.length === 0 ? "Henüz kayıt yok." : "Bu süzgeçle eşleşen kayıt yok."}
            description={
              rows.length === 0
                ? "Görev oluşturma, durum değişikliği, indirme ve silme işlemleri burada birikir."
                : "Başka bir süzgeç deneyin ya da daha eski kayıtları yükleyin."
            }
          />
        ) : (
          groups.map((g) => {
            const head = g.rows[0];
            const headMeta = metaFor(head);
            const HeadIcon = headMeta.icon;
            const actorName = getPersonDisplayName(head.actor_name);
            const isGroup = g.rows.length > 1;
            const headDetail = isGroup ? null : changeDetail(head);

            return (
              <div key={g.key} className="flex items-start gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-surface-hover">
                <span className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full", TONE_CLS[headMeta.tone])}>
                  <HeadIcon size={14} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  {/* Kim · ne · hangi iş — solda; ne zaman — sağda. Tek satır. */}
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 text-[13.5px] leading-snug text-muted">
                      <span className="font-semibold text-ink">{actorName}</span>{" "}
                      {isGroup ? (
                        <span className="tabular-nums">{g.rows.length} değişiklik yaptı</span>
                      ) : (
                        headMeta.verb
                      )}
                      {head.task_title && head.task_id && (
                        <>
                          {" — "}
                          <Link
                            href={`/tasks/${head.task_id}`}
                            prefetch={false}
                            className="break-words font-medium text-ink underline-offset-2 transition-colors duration-150 hover:text-brand hover:underline"
                          >
                            {head.task_title}
                          </Link>
                        </>
                      )}
                      {head.task_title && !head.task_id && (
                        /* Göreve bağlı olmayan olay: nesnenin adı, bağlantı yok. */
                        <>{" — "}<span className="font-medium text-ink">{head.task_title}</span></>
                      )}
                    </p>
                    <time
                      dateTime={head.created_at}
                      className="shrink-0 whitespace-nowrap text-[12px] tabular-nums text-subtle"
                    >
                      {formatDateTimeTR(head.created_at)}
                    </time>
                  </div>

                  {headDetail && (
                    <p className="mt-0.5 text-[12.5px] leading-snug"><Transition detail={headDetail} /></p>
                  )}

                  {isGroup && (
                    // Grouped: one compact line per change (no repeated actor/task).
                    <ul className="mt-1 space-y-0.5">
                      {g.rows.map((r) => {
                        const m = metaFor(r);
                        const RowIcon = m.icon;
                        const detail = changeDetail(r);
                        return (
                          <li key={r.id} className="flex flex-wrap items-baseline gap-x-1.5 text-[12.5px] leading-snug text-muted">
                            <RowIcon size={12} className="relative top-px shrink-0 text-subtle" aria-hidden />
                            <span>{m.verb}</span>
                            {detail && <Transition detail={detail} />}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Daha eskisi ──────────────────────────────────────────────────────
          Akış imleçle ilerler; her tur sabit maliyettedir. Bittiğinde düğme
          yerine tek satırlık bir kapanış yazar — "yükleniyor mu, bitti mi"
          sorusu ekranda kalmasın. */}
      {(cursor || loadError) && (
        <div className="mt-3 flex flex-col items-center gap-2">
          {loadError && (
            <p role="alert" className="anim-fade-down text-[12.5px] text-danger">{loadError}</p>
          )}
          {cursor && (
            <Button variant="secondary" size="sm" onClick={loadMore} loading={loading}>
              Daha fazla yükle
            </Button>
          )}
        </div>
      )}
      {!cursor && !loadError && rows.length > 0 && (
        <p className="mt-3 text-center text-[12px] text-subtle">Kayıtların tamamı listelendi.</p>
      )}
    </div>
  );
}
