"use client";

import { useConfirm } from "@/components/ui/useConfirm";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { Pin, Trash2, PencilLine, StickyNote, ChevronDown, Check, Eye, HandHelping, CalendarCheck } from "lucide-react";
import type { TaskNoteWithAuthor, TaskNoteType } from "@/types";
import {
  addTaskNoteWorkflow, acknowledgeTaskNote, toggleNotePin, deleteTaskNote, updateTaskNote,
} from "@/lib/actions/notes";
import {
  NOTE_TYPES, NOTE_TYPE_LABELS, asNoteType, asNoteActionStatus,
  NOTE_ASSIGNMENT_LABELS, type NoteAssignmentAction,
} from "@/lib/notes/note-types";
import { formatNoteTimeTR, formatDateTR } from "@/lib/utils/format-date";
import { Avatar } from "@/components/ui/Avatar";
import { Button, IconButton } from "@/components/ui/Button";
import { Field, TextArea, TextInput, SelectInput } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils/cn";

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

/* Not türü rozeti — TEK sakin renk sistemi, hepsi durum token'ından:
   bilgi → info · aksiyon → warning · devir → marka · onay → approval.
   (lib/notes/note-types.ts'teki NOTE_TYPE_BADGE ham blue/amber/sky/violet
   paletiyle yazılmış; lib dokunulmaz olduğundan görsel ton burada seçilir,
   etiket metni oradan gelir.) */
const NOTE_TYPE_TONE: Record<TaskNoteType, string> = {
  info:             "bg-info/10 text-info border-info/25",
  action_required:  "bg-warning/10 text-warning border-warning/30",
  handoff:          "bg-brand-soft text-brand-strong border-brand-ring/50",
  approval_waiting: "bg-approval/10 text-approval border-approval/25",
};

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
  /* Not işlemlerinin (düzenle · sabitle · sil) hatası eskiden yutuluyordu:
     düğmeye basılıyor, hiçbir şey olmuyor, kimse nedenini bilmiyordu. */
  const [error, setError] = useState<string | null>(null);
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
    setError(null);
    startTransition(async () => {
      const res = await acknowledgeTaskNote(note.id, action);
      if ("error" in res) setError(res.error);
    });
  }

  function handleSaveEdit() {
    setError(null);
    if (!editValue.trim()) { setError("Not boş olamaz."); return; }
    if (editValue.trim() === note.content) { setEditing(false); return; }
    startTransition(async () => {
      const res = await updateTaskNote(note.id, taskId, editValue);
      // Kayıt başarısızsa düzenleme AÇIK kalır — yazılan metin kaybolmaz.
      if (res && "error" in res) { setError(res.error || "Not kaydedilemedi."); return; }
      setEditing(false);
    });
  }

  function handlePin() {
    setError(null);
    startTransition(async () => {
      const res = await toggleNotePin(note.id, taskId, !note.is_pinned);
      if (res && "error" in res) setError(res.error || "Not sabitlenemedi.");
    });
  }

  async function handleDelete() {
    if (!(await ask({
      title: "Not silinsin mi?",
      message: "Not kalıcı olarak silinir; bu işlem geri alınamaz.",
      confirmLabel: "Sil",
      tone: "danger",
    }))) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteTaskNote(note.id, taskId);
      if (res && "error" in res) setError(res.error || "Not silinemedi.");
    });
  }

  return (
    <li
      className={cn(
        "rounded-control border p-3 space-y-2 transition-colors duration-150",
        // Sabitlenmiş not: uyarı tonunda hafif dolgu (ham amber yerine token).
        note.is_pinned
          ? "border-warning/30 bg-warning/5"
          : "border-hairline bg-surface-muted hover:border-line",
      )}
    >
      {/* Workflow context row — type badge, delivery date confirmed, targets.
          Satırda tek rozet (tür); tarih ve muhatap düz metin. */}
      {(noteType !== "info" || note.due_date_at_note_time || notifiedNames.length > 0) && (
        <div className="flex items-center gap-2 flex-wrap text-[12px]">
          {noteType !== "info" && (
            <span className={cn("rounded-md border px-1.5 py-0.5 leading-none font-medium", NOTE_TYPE_TONE[noteType])}>
              {NOTE_TYPE_LABELS[noteType]}
            </span>
          )}
          {note.due_date_at_note_time && (
            <span className="inline-flex items-center gap-1 text-subtle tabular-nums" title="Not eklenirken kontrol edilen teslim tarihi">
              <CalendarCheck size={12} aria-hidden /> Teslim: {shortDate(note.due_date_at_note_time)}
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
        {note.is_pinned && <Pin size={13} className="text-warning mt-1 shrink-0" aria-label="Sabitlenmiş" />}
        <div className="flex-1 min-w-0">
          {editing ? (
            <TextArea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.ctrlKey) handleSaveEdit();
                if (e.key === "Escape") {
                  // Esc yalnız düzenlemeyi kapatır — çekmeceyi DEĞİL.
                  e.preventDefault();
                  e.stopPropagation();
                  setEditing(false);
                  setEditValue(note.content);
                  setError(null);
                }
              }}
              autoFocus
              rows={3}
              aria-label="Notu düzenle"
              className="resize-none"
            />
          ) : (
            <p className="text-[13.5px] leading-relaxed text-ink whitespace-pre-wrap break-words">{note.content}</p>
          )}
        </div>
      </div>

      {/* Gördüm / Üzerime aldım — only on actionable note types */}
      {isActionable && !editing && (
        <div className="flex items-center gap-2 flex-wrap">
          {isClaimed ? (
            <span className="anim-fade inline-flex items-center gap-1 rounded-md border border-brand-ring/50 bg-brand-soft px-2 py-1 text-[12px] font-medium text-brand-strong">
              <Check size={12} aria-hidden /> Üzerine alındı{claimedByName ? ` · ${claimedByName}` : ""}
            </span>
          ) : (
            !isViewer && note.author_id !== currentUserId && (
              <Button variant="secondary" size="sm" disabled={pending} onClick={() => handleAck("claimed")}>
                <HandHelping size={13} aria-hidden /> Üzerime aldım
              </Button>
            )
          )}
          {seenByMe ? (
            <span className="anim-fade inline-flex items-center gap-1 text-[12px] text-subtle">
              <Eye size={12} aria-hidden /> Görüldü
            </span>
          ) : (
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => handleAck("seen")}>
              <Eye size={13} aria-hidden /> Gördüm
            </Button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 text-[12px] text-subtle">
        <span className="flex items-center gap-1.5 min-w-0" title={authorName}>
          <Avatar name={authorName} size="xs" />
          <span className="font-medium text-muted truncate max-w-[10rem]">{authorName}</span>
          <span className="text-subtle shrink-0">·</span>
          <span className="shrink-0 whitespace-nowrap tabular-nums">{formatNoteTimeTR(note.created_at)}</span>
        </span>
        <div className="flex items-center gap-0.5 shrink-0">
          {editing ? (
            <>
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => { setEditing(false); setEditValue(note.content); setError(null); }}>
                Vazgeç
              </Button>
              <Button variant="ghost" size="sm" loading={pending} onClick={handleSaveEdit} className="text-brand hover:text-brand-strong">
                Kaydet
              </Button>
            </>
          ) : (
            <>
              {canEdit && (
                <IconButton size="sm" disabled={pending} onClick={() => setEditing(true)} aria-label="Notu düzenle" title="Düzenle">
                  <PencilLine size={14} />
                </IconButton>
              )}
              <IconButton
                size="sm"
                disabled={pending}
                onClick={handlePin}
                aria-pressed={note.is_pinned}
                aria-label={note.is_pinned ? "Sabitlemeyi kaldır" : "Sabitle"}
                title={note.is_pinned ? "Sabitlemeyi kaldır" : "Sabitle"}
                className={note.is_pinned ? "text-warning hover:text-warning hover:bg-warning/10" : undefined}
              >
                <Pin size={14} />
              </IconButton>
              {canDelete && (
                <IconButton
                  size="sm"
                  disabled={pending}
                  onClick={handleDelete}
                  aria-label="Notu sil"
                  title="Sil"
                  className="hover:text-danger hover:bg-danger/10"
                >
                  <Trash2 size={14} />
                </IconButton>
              )}
            </>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="anim-fade-down text-[12.5px] text-danger">{error}</p>
      )}
      {dialog}
    </li>
  );
}

// ── "Kime bildirilsin?" multi-select (compact checkbox dropdown) ──────────────

function PeoplePicker({
  id,
  people,
  selected,
  onToggle,
}: {
  id?: string;
  people: NotePerson[];
  selected: Set<string>;
  onToggle: (_id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selectedNames = people.filter((p) => selected.has(p.id)).map((p) => p.name);

  // Dışarı tıklayınca / Esc ile kapan. Eskiden tüm ekranı kaplayan görünmez bir
  // `fixed inset-0` katmanı vardı; sayfadaki başka hiçbir şeye tıklanamıyordu.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    /* Esc, document dinleyicisiyle değil React olayıyla yakalanır: çekmecenin
       kendi Esc'i document üzerindedir ve daha önce kaydedilmiştir — React
       olayı önce koştuğu için preventDefault ile listeyi kapatıp çekmeceyi
       açık bırakabiliyoruz. */
    <div
      className="relative"
      ref={ref}
      onKeyDown={(e) => {
        if (open && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); }
      }}
    >
      {/* Field'ın kontrol görünümüyle aynı ölçü/çerçeve (h-9, rounded-control). */}
      <button
        id={id}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="h-9 w-full flex items-center justify-between gap-1 rounded-control border border-line bg-surface px-3 text-left text-[13.5px] transition-[border-color,box-shadow] duration-150 hover:border-line-strong"
      >
        <span className={cn("truncate", selectedNames.length === 0 ? "text-subtle" : "text-ink")}>
          {selectedNames.length === 0 ? "Kişi seçin…" : selectedNames.join(", ")}
        </span>
        <ChevronDown size={14} className={cn("text-subtle shrink-0 transition-transform duration-200 ease-standard", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div className="anim-fade-down absolute z-30 mt-1 w-full max-h-52 overflow-y-auto rounded-control border border-line bg-surface shadow-pop py-1">
          {people.length === 0 && (
            <p className="px-3 py-2 text-[12.5px] text-subtle">Kişi bulunamadı.</p>
          )}
          {people.map((p) => {
            const on = selected.has(p.id);
            return (
              <label
                key={p.id}
                className="flex items-center gap-2 px-3 py-1.5 text-[13.5px] cursor-pointer hover:bg-surface-hover transition-colors duration-150"
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => onToggle(p.id)}
                  className="rounded border-line accent-brand"
                />
                <span className="flex-1 truncate text-ink">{p.name}</span>
                {p.type === "contact" && (
                  <span className="text-[12px] text-subtle shrink-0">kişi</span>
                )}
              </label>
            );
          })}
        </div>
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
  const notifyId = useId();
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
    <form onSubmit={handleSubmit} className="space-y-3">
      <TextArea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Not ekle…"
        aria-label="Not"
        rows={2}
        className="resize-none"
      />

      {/* Desktop: single control row; mobile: stacked. Etiketler görünür,
          alanlar ortak Field ölçüsünde. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Field label="Not tipi">
          <SelectInput value={noteType} onChange={(e) => setNoteType(e.target.value as TaskNoteType)}>
            {NOTE_TYPES.map((t) => (
              <option key={t} value={t}>{NOTE_TYPE_LABELS[t]}</option>
            ))}
          </SelectInput>
        </Field>

        <Field label="Teslim tarihi" hint={!canEditDueDate ? "Teslim tarihini değiştirme yetkiniz yok." : undefined}>
          <TextInput
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            disabled={!canEditDueDate}
            className="tabular-nums"
          />
        </Field>

        <Field label="Kime bildirilsin?" htmlFor={notifyId}>
          <PeoplePicker id={notifyId} people={people} selected={selectedPeople} onToggle={togglePerson} />
        </Field>

        <Field label="Sorumluluk aksiyonu" hint={!canManageAssignment ? "Bu göreve sorumlu kişi atama yetkiniz yok." : undefined}>
          <SelectInput
            value={assignmentAction}
            onChange={(e) => setAssignmentAction(e.target.value as NoteAssignmentAction)}
            disabled={!canManageAssignment}
          >
            {(Object.keys(NOTE_ASSIGNMENT_LABELS) as NoteAssignmentAction[]).map((a) => (
              <option key={a} value={a}>{NOTE_ASSIGNMENT_LABELS[a]}</option>
            ))}
          </SelectInput>
        </Field>
      </div>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="text-[12px] leading-relaxed text-subtle space-y-0.5 min-w-0">
          <p>Not eklerken teslim tarihini ve gerekiyorsa sıradaki sorumluyu netleştirin.</p>
          {dueBlocked && (
            <p className="text-danger">
              Bu göreve not eklemek için teslim tarihi gerekli. Teslim tarihi belirleme yetkiniz yok.
            </p>
          )}
          {needsPeopleHint && (
            <p className="text-warning">Bu not tipi için muhatap kişi seçmeniz önerilir.</p>
          )}
        </div>
        {/* Ekranın tek primary'si üstteki "Kaydet"; not ekleme çerçeveli düğme. */}
        <Button type="submit" variant="secondary" loading={pending} disabled={dueBlocked} className="shrink-0 ml-auto">
          Not ekle
        </Button>
      </div>

      {error && <p role="alert" className="anim-fade-down text-[12.5px] text-danger">{error}</p>}
      {warning && <p className="anim-fade-down text-[12.5px] text-warning">{warning}</p>}
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
        <StickyNote size={14} className="text-muted" aria-hidden /> Notlar
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
        <EmptyState compact title="Henüz not yok." />
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
