"use client";

import { useConfirm } from "@/components/ui/useConfirm";

import { useMemo, useRef, useState, useTransition } from "react";
import { Pin, Trash2, PencilLine, StickyNote, ChevronDown, Check, Eye, HandHelping, CalendarCheck } from "lucide-react";
import type { TaskNoteWithAuthor, TaskNoteType } from "@/types";
import {
  addTaskNoteWorkflow, acknowledgeTaskNote, toggleNotePin, deleteTaskNote, updateTaskNote,
} from "@/lib/actions/notes";
import {
  NOTE_TYPES, NOTE_TYPE_LABELS, NOTE_TYPE_BADGE, asNoteType, asNoteActionStatus,
  NOTE_ASSIGNMENT_LABELS, type NoteAssignmentAction,
} from "@/lib/notes/note-types";
import { formatNoteTimeTR, formatDateTR } from "@/lib/utils/format-date";
import { Avatar } from "@/components/ui/Avatar";

// One selectable person in the "Kime bildirilsin?" picker — a flattened
// AssignablePerson (members ∪ contacts, duplicates already collapsed).
export type NotePerson = {
  id: string;
  name: string;
  type: "user" | "contact";
  userId: string | null;
  memberId: string | null;
  contactId: string | null;
};

type AckRow = { note_id: string; user_id: string; action: string };

interface Props {
  taskId: string;
  initialNotes: TaskNoteWithAuthor[];
  currentUserId: string;
  isViewer: boolean;
  isAdmin?: boolean;
  /** Task's current delivery date (YYYY-MM-DD) — the value the form confirms. */
  taskDueDate: string | null;
  /** Mirrors canEditTask server rule for the due-date field. */
  canEditDueDate: boolean;
  /** Mirrors canManageTaskAssignment server rule for the responsibility action. */
  canManageAssignment: boolean;
  people: NotePerson[];
  acks: AckRow[];
}

const ACTIONABLE_TYPES: TaskNoteType[] = ["action_required", "handoff", "approval_waiting"];

// Shared class for the compact form controls in the add-note row — token-based
// (line/surface/brand focus) so they match the Görev bilgileri inputs.
const noteControlCls =
  "w-full text-sm text-ink bg-surface border border-line rounded-lg px-2 py-1.5 " +
  "transition-[color,background-color,border-color,box-shadow] duration-150 ease-standard hover:border-line-strong " +
  "focus:outline-none focus:border-brand-ring focus:ring-2 focus:ring-brand-ring/40 " +
  "disabled:bg-surface-sunken disabled:text-subtle disabled:hover:border-line";

function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return formatDateTR(iso.slice(0, 10), { day: "numeric", month: "short" });
  } catch {
    return iso;
  }
}

// ── Single note row ───────────────────────────────────────────────────────────

function NoteItem({
  note,
  taskId,
  currentUserId,
  isViewer,
  isAdmin,
  people,
  acks,
}: {
  note: TaskNoteWithAuthor;
  taskId: string;
  currentUserId: string;
  isViewer: boolean;
  isAdmin: boolean;
  people: NotePerson[];
  acks: AckRow[];
}) {
  const { ask, dialog } = useConfirm();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(note.content);
  const [ackError, setAckError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const authorName = note.author?.full_name ?? note.author?.email ?? "Bilinmeyen kullanıcı";
  const canEdit = !isViewer && (isAdmin || note.author_id === currentUserId);
  const canDelete = !isViewer && (isAdmin || note.author_id === currentUserId);

  const noteType = asNoteType(note.note_type);
  const actionStatus = asNoteActionStatus(note.action_status);
  const meta = (note.metadata ?? {}) as Record<string, unknown>;

  // Resolve notify targets (stored as ids in metadata) to display names.
  const notifiedNames = useMemo(() => {
    const userIds = Array.isArray(meta.notify_user_ids) ? (meta.notify_user_ids as string[]) : [];
    const contactIds = Array.isArray(meta.notify_contact_ids) ? (meta.notify_contact_ids as string[]) : [];
    const names: string[] = [];
    for (const id of userIds) {
      const p = people.find((x) => x.userId === id);
      if (p) names.push(p.name);
    }
    for (const id of contactIds) {
      const p = people.find((x) => x.contactId === id);
      if (p && !names.includes(p.name)) names.push(p.name);
    }
    return names;
  }, [meta.notify_user_ids, meta.notify_contact_ids, people]);

  const isActionable = ACTIONABLE_TYPES.includes(noteType);
  const seenByMe = acks.some((a) => a.note_id === note.id && a.user_id === currentUserId && a.action === "seen");
  const claimedByMe = acks.some((a) => a.note_id === note.id && a.user_id === currentUserId && a.action === "claimed");
  const claimedById = typeof meta.claimed_by === "string" ? meta.claimed_by : null;
  const isClaimed = actionStatus === "claimed" || claimedByMe || !!claimedById;
  const claimedByName = claimedByMe
    ? "siz"
    : claimedById
      ? people.find((x) => x.userId === claimedById)?.name ?? null
      : null;

  function handleAck(action: "seen" | "claimed") {
    setAckError(null);
    startTransition(async () => {
      const res = await acknowledgeTaskNote(note.id, action);
      if ("error" in res) setAckError(res.error);
    });
  }

  function handleSaveEdit() {
    setEditing(false);
    if (editValue.trim() === note.content) return;
    startTransition(async () => {
      await updateTaskNote(note.id, taskId, editValue);
    });
  }

  function handlePin() {
    startTransition(async () => {
      await toggleNotePin(note.id, taskId, !note.is_pinned);
    });
  }

  async function handleDelete() {
    if (!(await ask({
      title: "Not silinsin mi?",
      message: "Not kalıcı olarak silinir; bu işlem geri alınamaz.",
    }))) return;
    startTransition(async () => {
      await deleteTaskNote(note.id, taskId);
    });
  }

  return (
    <li className={`rounded-lg border p-3 space-y-1.5 transition-colors duration-150 ${note.is_pinned ? "border-amber-200 bg-amber-50" : "border-hairline bg-surface-muted hover:border-line hover:bg-surface-hover"}`}>
      {/* Workflow context row — type badge, delivery date confirmed, targets */}
      {(noteType !== "info" || note.due_date_at_note_time || notifiedNames.length > 0) && (
        <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
          {noteType !== "info" && (
            <span className={`rounded px-1.5 py-0.5 leading-none font-medium ${NOTE_TYPE_BADGE[noteType]}`}>
              {NOTE_TYPE_LABELS[noteType]}
            </span>
          )}
          {note.due_date_at_note_time && (
            <span className="inline-flex items-center gap-0.5 text-subtle" title="Not eklenirken kontrol edilen teslim tarihi">
              <CalendarCheck size={10} /> Teslim: {shortDate(note.due_date_at_note_time)}
            </span>
          )}
          {notifiedNames.length > 0 && (
            <span className="text-subtle truncate max-w-full">
              Muhatap: <span className="text-muted font-medium">{notifiedNames.join(", ")}</span>
            </span>
          )}
        </div>
      )}

      <div className="flex items-start gap-2">
        {note.is_pinned && <Pin size={12} className="text-amber-500 mt-0.5 shrink-0" />}
        <div className="flex-1 min-w-0">
          {editing ? (
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.ctrlKey) handleSaveEdit();
                if (e.key === "Escape") { setEditing(false); setEditValue(note.content); }
              }}
              autoFocus
              rows={3}
              className="w-full text-sm text-ink bg-surface border border-brand-ring rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-ring/40 resize-none"
            />
          ) : (
            <p className="text-sm text-ink whitespace-pre-wrap break-words">{note.content}</p>
          )}
        </div>
      </div>

      {/* Gördüm / Üzerime aldım — only on actionable note types */}
      {isActionable && !editing && (
        <div className="flex items-center gap-2 flex-wrap">
          {isClaimed ? (
            <span className="anim-fade inline-flex items-center gap-1 text-[11px] text-teal-700 bg-teal-50 border border-teal-200 rounded px-1.5 py-0.5 font-medium">
              <Check size={11} /> Üzerine alındı{claimedByName ? ` · ${claimedByName}` : ""}
            </span>
          ) : (
            !isViewer && note.author_id !== currentUserId && (
              <button
                onClick={() => handleAck("claimed")}
                disabled={pending}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-700 border border-teal-200 bg-surface hover:bg-teal-50 active:scale-[0.98] rounded px-2 py-0.5 transition-colors duration-150 disabled:opacity-60 disabled:pointer-events-none"
              >
                <HandHelping size={11} /> Üzerime aldım
              </button>
            )
          )}
          {seenByMe ? (
            <span className="anim-fade inline-flex items-center gap-1 text-[11px] text-subtle">
              <Eye size={11} /> Görüldü
            </span>
          ) : (
            <button
              onClick={() => handleAck("seen")}
              disabled={pending}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-muted border border-line bg-surface hover:bg-surface-hover hover:border-line-strong active:scale-[0.98] rounded px-2 py-0.5 transition-colors duration-150 disabled:opacity-60 disabled:pointer-events-none"
            >
              <Eye size={11} /> Gördüm
            </button>
          )}
          {ackError && <span className="anim-fade-down text-[11px] text-danger">{ackError}</span>}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 text-xs text-subtle">
        <span className="flex items-center gap-1.5 min-w-0" title={authorName}>
          <Avatar name={authorName} size="xs" />
          <span className="font-medium text-muted truncate max-w-[10rem]">{authorName}</span>
          <span className="text-subtle shrink-0">·</span>
          <span className="shrink-0 whitespace-nowrap tabular-nums">{formatNoteTimeTR(note.created_at)}</span>
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {editing ? (
            <>
              <button onClick={handleSaveEdit} className="text-brand hover:text-brand-strong font-medium transition-colors duration-150">Kaydet</button>
              <button onClick={() => { setEditing(false); setEditValue(note.content); }} className="text-muted hover:text-ink ml-1 transition-colors duration-150">İptal</button>
            </>
          ) : (
            <>
              {canEdit && (
                <button onClick={() => setEditing(true)} className="p-1 rounded-md text-subtle hover:text-ink hover:bg-surface-sunken active:scale-[0.98] transition-colors duration-150" title="Düzenle">
                  <PencilLine size={12} />
                </button>
              )}
              <button onClick={handlePin} className={`p-1 rounded-md active:scale-[0.98] transition-colors duration-150 ${note.is_pinned ? "text-amber-500 hover:text-amber-700 hover:bg-amber-100/60" : "text-subtle hover:text-amber-500 hover:bg-surface-sunken"}`} title={note.is_pinned ? "Sabitlemeyi kaldır" : "Sabitle"}>
                <Pin size={12} />
              </button>
              {canDelete && (
                <button onClick={handleDelete} className="p-1 rounded-md text-subtle hover:text-danger hover:bg-danger/10 active:scale-[0.98] transition-colors duration-150" title="Sil">
                  <Trash2 size={12} />
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {dialog}
    </li>
  );
}

// ── "Kime bildirilsin?" multi-select (compact checkbox dropdown) ──────────────

function PeoplePicker({
  people,
  selected,
  onToggle,
}: {
  people: NotePerson[];
  selected: Set<string>;
  onToggle: (_id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selectedNames = people.filter((p) => selected.has(p.id)).map((p) => p.name);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-1 text-sm border border-line rounded-lg px-2.5 py-1.5 bg-surface text-left hover:border-line-strong transition-colors duration-150"
      >
        <span className={`truncate ${selectedNames.length === 0 ? "text-subtle" : "text-ink"}`}>
          {selectedNames.length === 0 ? "Kişi seçin…" : selectedNames.join(", ")}
        </span>
        <ChevronDown size={13} className={`text-subtle shrink-0 transition-transform duration-200 ease-standard ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          {/* click-away layer */}
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden />
          <div className="anim-fade-down absolute z-30 mt-1 w-full max-h-52 overflow-y-auto rounded-lg border border-line bg-surface shadow-pop py-1">
            {people.length === 0 && (
              <p className="px-3 py-2 text-xs text-subtle">Kişi bulunamadı.</p>
            )}
            {people.map((p) => {
              const on = selected.has(p.id);
              return (
                <label
                  key={p.id}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-surface-hover transition-colors duration-150"
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => onToggle(p.id)}
                    className="rounded border-line accent-brand"
                  />
                  <span className="flex-1 truncate text-ink">{p.name}</span>
                  {p.type === "contact" && (
                    <span className="text-[10px] text-subtle shrink-0">kişi</span>
                  )}
                </label>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Add-note form (note type + due-date confirmation + notify + assignment) ──

function AddNoteForm({
  taskId,
  taskDueDate,
  canEditDueDate,
  canManageAssignment,
  people,
}: {
  taskId: string;
  taskDueDate: string | null;
  canEditDueDate: boolean;
  canManageAssignment: boolean;
  people: NotePerson[];
}) {
  const currentDue = taskDueDate ? taskDueDate.slice(0, 10) : "";
  const [content, setContent] = useState("");
  const [noteType, setNoteType] = useState<TaskNoteType>("info");
  const [dueDate, setDueDate] = useState(currentDue);
  const [selectedPeople, setSelectedPeople] = useState<Set<string>>(new Set());
  const [assignmentAction, setAssignmentAction] = useState<NoteAssignmentAction>("none");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedList = people.filter((p) => selectedPeople.has(p.id));
  const memberTargets = selectedList.filter((p) => p.memberId != null);
  const needsPeopleHint =
    (noteType === "action_required" || noteType === "approval_waiting") && selectedList.length === 0;
  // The user cannot set a due date on an undated task → note adding is blocked.
  const dueBlocked = !currentDue && !canEditDueDate;

  function togglePerson(id: string) {
    setSelectedPeople((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setWarning(null);

    if (!content.trim()) { setError("Not boş olamaz."); return; }
    if (!dueDate && !currentDue) {
      setError(
        canEditDueDate
          ? "Not eklemek için teslim tarihini belirleyin."
          : "Bu göreve not eklemek için teslim tarihi gerekli. Teslim tarihi belirleme yetkiniz yok.",
      );
      return;
    }
    if (noteType === "handoff" && (assignmentAction === "none" || memberTargets.length === 0)) {
      setError("Devir notu için kişi ve sorumluluk aksiyonu seçin.");
      return;
    }
    if (assignmentAction !== "none" && memberTargets.length === 0) {
      setError("Sorumluluk aksiyonu için sistemde hesabı olan bir kişi seçin.");
      return;
    }

    startTransition(async () => {
      const res = await addTaskNoteWorkflow({
        taskId,
        body: content,
        noteType,
        dueDate: dueDate || null,
        notifyUserIds: selectedList.filter((p) => p.type === "user" && p.userId).map((p) => p.userId as string),
        notifyContactIds: selectedList.filter((p) => p.type === "contact" && p.contactId).map((p) => p.contactId as string),
        assignmentAction,
        assignmentTargetMemberIds:
          assignmentAction === "none" ? [] : memberTargets.map((p) => p.memberId as string),
      });
      if ("error" in res) { setError(res.error); return; }
      if (res.warning) setWarning(res.warning);
      setContent("");
      setNoteType("info");
      setDueDate(currentDue);
      setSelectedPeople(new Set());
      setAssignmentAction("none");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Not ekle…"
        rows={2}
        className="w-full text-sm text-ink bg-surface border border-line rounded-lg px-3 py-2 placeholder:text-subtle transition-colors focus:outline-none focus:border-brand-ring focus:ring-2 focus:ring-brand-ring/40 resize-none"
      />

      {/* Desktop: single control row; mobile: stacked */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <label className="block">
          <span className="block text-[11px] font-medium text-muted mb-0.5">Not tipi</span>
          <select
            value={noteType}
            onChange={(e) => setNoteType(e.target.value as TaskNoteType)}
            className={noteControlCls}
          >
            {NOTE_TYPES.map((t) => (
              <option key={t} value={t}>{NOTE_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="block text-[11px] font-medium text-muted mb-0.5">Teslim tarihi</span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            disabled={!canEditDueDate}
            title={!canEditDueDate ? "Teslim tarihini değiştirme yetkiniz yok." : undefined}
            className={noteControlCls}
          />
        </label>

        <div className="block">
          <span className="block text-[11px] font-medium text-muted mb-0.5">Kime bildirilsin?</span>
          <PeoplePicker people={people} selected={selectedPeople} onToggle={togglePerson} />
        </div>

        <label className="block">
          <span className="block text-[11px] font-medium text-muted mb-0.5">Sorumluluk aksiyonu</span>
          <select
            value={assignmentAction}
            onChange={(e) => setAssignmentAction(e.target.value as NoteAssignmentAction)}
            disabled={!canManageAssignment}
            title={!canManageAssignment ? "Bu göreve sorumlu kişi atama yetkiniz yok." : undefined}
            className={noteControlCls}
          >
            {(Object.keys(NOTE_ASSIGNMENT_LABELS) as NoteAssignmentAction[]).map((a) => (
              <option key={a} value={a}>{NOTE_ASSIGNMENT_LABELS[a]}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="text-[11px] text-subtle space-y-0.5 min-w-0">
          <p>Not eklerken teslim tarihini ve gerekiyorsa sıradaki sorumluyu netleştirin.</p>
          {!canManageAssignment && (
            <p className="text-subtle">Bu göreve sorumlu kişi atama yetkiniz yok.</p>
          )}
          {dueBlocked && (
            <p className="text-danger">
              Bu göreve not eklemek için teslim tarihi gerekli. Teslim tarihi belirleme yetkiniz yok.
            </p>
          )}
          {needsPeopleHint && (
            <p className="text-warning">Bu not tipi için muhatap kişi seçmeniz önerilir.</p>
          )}
        </div>
        <button
          type="submit"
          disabled={pending || dueBlocked}
          className="text-sm bg-brand text-white shadow-xs rounded-lg px-3 py-2 hover:bg-brand-strong active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none disabled:shadow-none transition-all duration-150 font-medium whitespace-nowrap shrink-0"
        >
          {pending ? "…" : "Not ekle"}
        </button>
      </div>

      {error && <p role="alert" className="anim-fade-down text-xs text-danger">{error}</p>}
      {warning && <p className="anim-fade-down text-xs text-warning">{warning}</p>}
    </form>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function TaskNotesPanel({
  taskId,
  initialNotes,
  currentUserId,
  isViewer,
  isAdmin = false,
  taskDueDate,
  canEditDueDate,
  canManageAssignment,
  people,
  acks,
}: Props) {
  const pinned = initialNotes.filter((n) => n.is_pinned);
  const rest = initialNotes.filter((n) => !n.is_pinned);
  const sorted = [...pinned, ...rest];

  return (
    <div className="bg-surface rounded-card border border-line shadow-card p-5 space-y-4">
      <h3 className="text-sm font-semibold tracking-tight text-ink flex items-center gap-1.5">
        <StickyNote size={14} className="text-muted" /> Notlar
      </h3>

      {!isViewer && (
        <AddNoteForm
          taskId={taskId}
          taskDueDate={taskDueDate}
          canEditDueDate={canEditDueDate}
          canManageAssignment={canManageAssignment}
          people={people}
        />
      )}

      {sorted.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line bg-surface-muted/40 px-4 py-6 text-center text-sm text-subtle">
          Henüz not eklenmedi.
        </p>
      ) : (
        <ol className="space-y-2">
          {sorted.map((note) => (
            <NoteItem
              key={note.id}
              note={note}
              taskId={taskId}
              currentUserId={currentUserId}
              isViewer={isViewer}
              isAdmin={isAdmin}
              people={people}
              acks={acks}
            />
          ))}
        </ol>
      )}
    </div>
  );
}
