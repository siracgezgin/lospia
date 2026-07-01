"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus, RefreshCw, CheckCircle2, RotateCcw, StickyNote, Users, Eye,
  Flag, CalendarClock, Archive, Trash2, Award, Pencil, Activity as ActivityIcon,
} from "lucide-react";
import { formatDateTimeTR, formatDateTR } from "@/lib/utils/format-date";
import { getPersonDisplayName } from "@/lib/utils/person-display";
import { STATUS_LABELS, PRIORITY_LABELS } from "@/lib/utils/task-constants";
import { EFFORT_LABELS, isEffortSize } from "@/lib/points/effort";
import { VISIBILITY_LABELS } from "@/lib/utils/visibility";
import { cn } from "@/lib/utils/cn";
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
type Tone = "green" | "blue" | "amber" | "violet" | "rose" | "slate";

const TONE_CLS: Record<Tone, { chip: string; icon: string }> = {
  green:  { chip: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "bg-emerald-100 text-emerald-600" },
  blue:   { chip: "bg-blue-50 text-blue-700 border-blue-200",          icon: "bg-blue-100 text-blue-600" },
  amber:  { chip: "bg-amber-50 text-amber-700 border-amber-200",       icon: "bg-amber-100 text-amber-600" },
  violet: { chip: "bg-violet-50 text-violet-700 border-violet-200",    icon: "bg-violet-100 text-violet-600" },
  rose:   { chip: "bg-rose-50 text-rose-700 border-rose-200",          icon: "bg-rose-100 text-rose-600" },
  slate:  { chip: "bg-slate-100 text-slate-600 border-slate-200",      icon: "bg-slate-100 text-slate-500" },
};

type ActionMeta = { label: string; verb: string; tone: Tone; icon: typeof Plus };

const ACTION_META: Record<string, ActionMeta> = {
  task_created:                 { label: "Oluşturuldu",    verb: "görev oluşturdu",                tone: "green",  icon: Plus },
  task_completed:               { label: "Tamamlandı",     verb: "görevi tamamladı",               tone: "green",  icon: CheckCircle2 },
  participant_completed:        { label: "Tamamlandı",     verb: "kendi işini tamamladı",          tone: "green",  icon: CheckCircle2 },
  auto_moved_to_review:         { label: "Durum",          verb: "görevi Kontrol / Onay'a taşıdı", tone: "blue",   icon: RefreshCw },
  status_changed:               { label: "Durum",          verb: "durumu değiştirdi",              tone: "blue",   icon: RefreshCw },
  task_reopened:                { label: "Yeniden açıldı",  verb: "görevi yeniden açtı",            tone: "amber",  icon: RotateCcw },
  participant_uncompleted:      { label: "Yeniden açıldı",  verb: "tamamlamayı geri aldı",          tone: "amber",  icon: RotateCcw },
  note_added:                   { label: "Not",            verb: "not ekledi",                     tone: "violet", icon: StickyNote },
  assignee_changed:             { label: "Sorumlu",        verb: "sorumluyu değiştirdi",           tone: "violet", icon: Users },
  responsible_contact_changed:  { label: "Sorumlu",        verb: "sorumlu kişiyi değiştirdi",      tone: "violet", icon: Users },
  waiting_person_changed:       { label: "Sorumlu",        verb: "beklenen kişiyi değiştirdi",     tone: "violet", icon: Users },
  priority_changed:             { label: "Öncelik",        verb: "önceliği değiştirdi",            tone: "rose",   icon: Flag },
  due_date_changed:             { label: "Tarih",          verb: "teslim tarihini değiştirdi",     tone: "amber",  icon: CalendarClock },
  visibility_changed:           { label: "Görünürlük",     verb: "görünürlüğü değiştirdi",         tone: "amber",  icon: Eye },
  title_changed:                { label: "Güncelleme",     verb: "başlığı değiştirdi",             tone: "slate",  icon: Pencil },
  description_changed:          { label: "Güncelleme",     verb: "açıklamayı güncelledi",          tone: "slate",  icon: Pencil },
  category_changed:             { label: "Güncelleme",     verb: "konuyu değiştirdi",              tone: "slate",  icon: Pencil },
  tags_changed:                 { label: "Güncelleme",     verb: "etiketleri güncelledi",          tone: "slate",  icon: Pencil },
  effort_changed:               { label: "Efor",           verb: "eforu değiştirdi",               tone: "slate",  icon: Pencil },
  approval_changed:             { label: "Güncelleme",     verb: "onay durumunu güncelledi",       tone: "slate",  icon: Pencil },
  task_archived:                { label: "Arşiv",          verb: "görevi arşivledi",               tone: "slate",  icon: Archive },
  task_unarchived:              { label: "Arşiv",          verb: "görevi arşivden çıkardı",        tone: "slate",  icon: Archive },
  task_trashed:                 { label: "Çöp",            verb: "görevi çöpe taşıdı",             tone: "rose",   icon: Trash2 },
  task_restored:                { label: "Geri yüklendi",  verb: "görevi geri yükledi",            tone: "blue",   icon: RotateCcw },
  task_duplicated:              { label: "Çoğaltıldı",     verb: "görevi çoğalttı",                tone: "slate",  icon: Plus },
  points_finalized:             { label: "Puan",           verb: "puanı kesinleştirdi",            tone: "green",  icon: Award },
  points_revoked:               { label: "Puan",           verb: "kazanılan puanı geri aldı",      tone: "rose",   icon: Award },
  points_self_approval_skipped: { label: "Puan",           verb: "kendi onayı nedeniyle puan verilmedi", tone: "slate", icon: Award },
};

const FALLBACK_META: ActionMeta = { label: "Güncelleme", verb: "görevi güncelledi", tone: "slate", icon: ActivityIcon };

function metaFor(action: string): ActionMeta {
  return ACTION_META[action] ?? FALLBACK_META;
}

// ── Filters (user-facing groups → action sets) ────────────────────────────────
type FilterKey = "all" | "created" | "status" | "completed" | "assignment" | "date";

const FILTERS: { key: FilterKey; label: string; actions: string[] }[] = [
  { key: "all",        label: "Tümü",                actions: [] },
  { key: "created",    label: "Görev oluşturma",      actions: ["task_created"] },
  { key: "status",     label: "Durum değişiklikleri", actions: ["status_changed", "auto_moved_to_review"] },
  { key: "completed",  label: "Tamamlananlar",        actions: ["task_completed", "participant_completed"] },
  { key: "assignment", label: "Atamalar",             actions: ["assignee_changed", "responsible_contact_changed", "waiting_person_changed"] },
  { key: "date",       label: "Tarih değişiklikleri", actions: ["due_date_changed"] },
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

export function ActivityLogView({ rows }: { rows: ActivityRow[] }) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { all: rows.length, created: 0, status: 0, completed: 0, assignment: 0, date: 0 };
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
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Aktivite Günlüğü</h1>
        <p className="text-sm text-gray-500 mt-1">
          Çalışma alanındaki son işlemler — kim, ne yaptı, hangi görevde. Yalnızca yöneticiler görür.
        </p>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
                active
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50",
              )}
            >
              {f.label}
              <span className={cn("text-[11px] tabular-nums", active ? "text-white/70" : "text-gray-400")}>
                {counts[f.key]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
        {groups.length === 0 ? (
          <p className="px-5 py-10 text-sm text-gray-400 text-center">Bu filtreyle eşleşen kayıt yok.</p>
        ) : (
          groups.map((g) => {
            const head = g.rows[0];
            const headMeta = metaFor(head.action);
            const headTone = TONE_CLS[headMeta.tone];
            const HeadIcon = headMeta.icon;
            const actorName = getPersonDisplayName(head.actor_name);
            const isGroup = g.rows.length > 1;

            return (
              <div key={g.key} className="flex items-start gap-3 px-4 py-3.5 hover:bg-gray-50/60 transition-colors">
                <div className={cn("mt-0.5 grid h-8 w-8 place-items-center rounded-full shrink-0", headTone.icon)}>
                  <HeadIcon size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  {/* Header: actor + task (once per group) + latest time */}
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-gray-600 leading-snug">
                      <span className="font-semibold text-gray-900">{actorName}</span>{" "}
                      {isGroup ? (
                        <span className="text-gray-500">{g.rows.length} değişiklik yaptı</span>
                      ) : (
                        headMeta.verb
                      )}
                      {head.task_title && head.task_id && (
                        <>
                          {" — "}
                          <Link
                            href={`/tasks/${head.task_id}`}
                            prefetch={false}
                            className="font-medium text-gray-900 hover:text-blue-600 hover:underline underline-offset-2 break-words"
                          >
                            {head.task_title}
                          </Link>
                        </>
                      )}
                    </p>
                    <span className="text-xs text-gray-400 shrink-0 text-right tabular-nums">
                      {formatDateTimeTR(head.created_at)}
                    </span>
                  </div>

                  {isGroup ? (
                    // Grouped: one compact line per change (no repeated actor/task).
                    <ul className="mt-2 space-y-1.5">
                      {g.rows.map((r) => {
                        const m = metaFor(r.action);
                        const detail = changeDetail(r);
                        return (
                          <li key={r.id} className="flex items-center gap-2 flex-wrap text-[11px]">
                            <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 font-medium", TONE_CLS[m.tone].chip)}>
                              {m.label}
                            </span>
                            <span className="text-gray-500">{m.verb}</span>
                            {detail && (
                              <span className="text-gray-500">
                                {detail.label}:{" "}
                                <span className="text-gray-400">{detail.from}</span>
                                <span className="mx-1 text-gray-300">→</span>
                                <span className="text-gray-700 font-medium">{detail.to}</span>
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    // Single change: label + optional from → to detail.
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium", headTone.chip)}>
                        {headMeta.label}
                      </span>
                      {changeDetail(head) && (
                        <span className="text-[11px] text-gray-500">
                          {changeDetail(head)!.label}:{" "}
                          <span className="text-gray-400">{changeDetail(head)!.from}</span>
                          <span className="mx-1 text-gray-300">→</span>
                          <span className="text-gray-700 font-medium">{changeDetail(head)!.to}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
