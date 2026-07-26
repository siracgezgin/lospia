"use client";

import {
  useState, useOptimistic, useTransition, useRef, useEffect, useSyncExternalStore,
  createContext, useContext,
} from "react";
import {
  DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors, closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, Trash2, Pencil, StickyNote, Check, X, GripVertical, ArrowRightCircle, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { createNote, updateNote, deleteNote, reorderNotes } from "@/lib/actions/notes";
import { createTask, softDeleteTask } from "@/lib/actions/tasks";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { WorkspaceNote, NoteColor } from "@/types";

// ── Note color palette — brand-derived warm tones ─────────────────────────────

const NOTE_COLORS: Record<NoteColor, { bg: string; border: string; title: string; dot: string }> = {
  yellow: { bg: "bg-[#faf6e3]", border: "border-[#d4cf9e]", title: "text-[#6b6748]", dot: "bg-[#c8c39e]" },
  blue:   { bg: "bg-[#e8f1f4]", border: "border-[#a0c0cf]", title: "text-[#406775]", dot: "bg-[#5b8fa0]" },
  green:  { bg: "bg-[#e8f0ea]", border: "border-[#90b898]", title: "text-[#3a6e42]", dot: "bg-[#60a070]" },
  purple: { bg: "bg-[#f2edf8]", border: "border-[#b8a0d0]", title: "text-[#5c40a0]", dot: "bg-[#8060c0]" },
};

const ALL_COLORS: NoteColor[] = ["yellow", "blue", "green", "purple"];

// ── Note author resolution (created_by → display name) ────────────────────────
const NoteAuthorsContext = createContext<Record<string, string>>({});

// "Bugün 14:32" / "Dün 18:10" / "5 Oca 09:00" — compact, professional metadata.
function formatNoteMeta(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const dayDiff = Math.round((startOfDay(new Date()).getTime() - startOfDay(d).getTime()) / 86400000);
  if (dayDiff === 0) return `Bugün ${time}`;
  if (dayDiff === 1) return `Dün ${time}`;
  return `${d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} ${time}`;
}

// ── Shared types ───────────────────────────────────────────────────────────────

type NoteHandlers = {
  onDelete: (_id: string) => void;
  onUpdate: (_id: string, _title: string, _body: string, _color: NoteColor) => void;
  onConvertToTask: (_id: string, _title: string, _body: string) => void;
  readOnly?: boolean;
};

type DragProps = {
  containerRef?: React.Ref<HTMLDivElement>;
  containerStyle?: React.CSSProperties;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  isDragging?: boolean;
};

// ── Note card content (shared, no DnD hook) ───────────────────────────────────

function NoteCardContent({
  note,
  onDelete,
  onUpdate,
  onConvertToTask,
  readOnly = false,
  canModify = true,
  containerRef,
  containerStyle,
  dragHandleProps,
  isDragging,
}: { note: WorkspaceNote; canModify?: boolean } & NoteHandlers & DragProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body ?? "");
  const [color, setColor] = useState<NoteColor>(note.color);
  const titleRef = useRef<HTMLInputElement>(null);
  const colors = NOTE_COLORS[note.color];

  useEffect(() => { if (editing) titleRef.current?.focus(); }, [editing]);

  function handleSave() {
    if (!title.trim()) return;
    onUpdate(note.id, title.trim(), body, color);
    setEditing(false);
  }

  function handleCancel() {
    setTitle(note.title);
    setBody(note.body ?? "");
    setColor(note.color);
    setEditing(false);
  }

  if (editing) {
    const editColors = NOTE_COLORS[color];
    return (
      <div
        className={cn(
          "rounded-lg border-2 p-2.5 shadow-card flex flex-col gap-1.5 anim-scale-in",
          editColors.bg, editColors.border,
        )}
      >
        <div className="flex items-center gap-1 mb-0.5">
          {ALL_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={cn(
                "w-3.5 h-3.5 rounded-full transition-[transform,opacity] duration-150 ease-standard",
                NOTE_COLORS[c].dot,
                color === c ? "ring-2 ring-offset-1 ring-gray-400 scale-110" : "opacity-60 hover:opacity-100 hover:scale-105",
              )}
              aria-label={c}
            />
          ))}
        </div>
        <input
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") handleCancel(); }}
          className={cn("text-sm font-medium bg-transparent border-b outline-none w-full pb-0.5", editColors.border)}
          placeholder="Başlık"
          maxLength={500}
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="text-xs text-gray-600 bg-transparent outline-none w-full resize-none"
          placeholder="Not içeriği…"
          rows={3}
          maxLength={5000}
        />
        <div className="flex gap-1 justify-end">
          <button onClick={handleCancel} className="p-1 text-gray-400 hover:text-gray-600 hover:bg-black/5 rounded transition-colors duration-150 active:scale-95" aria-label="Vazgeç"><X size={12} /></button>
          <button onClick={handleSave} className="p-1 text-green-600 hover:text-green-700 hover:bg-green-600/10 rounded transition-colors duration-150 active:scale-95" aria-label="Kaydet"><Check size={12} /></button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={containerStyle}
      className={cn(
        "rounded-lg border p-2.5 shadow-card group transition-shadow duration-200 ease-standard hover:shadow-card-hover",
        colors.bg, colors.border,
        isDragging && "opacity-40 shadow-pop",
      )}
    >
      <div className="flex items-start gap-1">
        {!readOnly ? (
          <button
            {...dragHandleProps}
            className="mt-0.5 p-0.5 rounded text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0"
            aria-label="Sürükle"
            tabIndex={-1}
          >
            <GripVertical size={11} />
          </button>
        ) : (
          <span className="mt-0.5 p-0.5 shrink-0 text-transparent"><GripVertical size={11} /></span>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <p className={cn("text-sm font-semibold leading-snug flex-1 min-w-0 break-words", colors.title)}>
              {note.title}
            </p>
            {!readOnly && canModify && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0">
              <button
                onClick={() => onConvertToTask(note.id, note.title, note.body ?? "")}
                className="p-0.5 text-gray-400 hover:text-[#406775] hover:bg-black/5 rounded transition-colors duration-150 active:scale-95"
                aria-label="Göreve dönüştür"
                title="Göreve dönüştür"
              >
                <ArrowRightCircle size={11} />
              </button>
              <button
                onClick={() => setEditing(true)}
                className="p-0.5 text-gray-400 hover:text-gray-600 hover:bg-black/5 rounded transition-colors duration-150 active:scale-95"
                aria-label="Notu düzenle"
              >
                <Pencil size={11} />
              </button>
              <button
                onClick={() => onDelete(note.id)}
                className="p-0.5 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded transition-colors duration-150 active:scale-95"
                aria-label="Notu sil"
              >
                <Trash2 size={11} />
              </button>
            </div>
            )}
          </div>
          {note.body && (
            <p className="text-[11px] text-gray-500 mt-1 leading-relaxed break-words whitespace-pre-wrap line-clamp-4">
              {note.body}
            </p>
          )}
          <NoteMeta note={note} />
        </div>
      </div>
    </div>
  );
}

// ── Author + timestamp metadata row ───────────────────────────────────────────
function NoteMeta({ note }: { note: WorkspaceNote }) {
  const authors = useContext(NoteAuthorsContext);
  const author = note.created_by ? authors[note.created_by] ?? "Bilinmeyen kullanıcı" : "Bilinmeyen kullanıcı";
  const when = note.created_at ? formatNoteMeta(note.created_at) : "";
  return (
    <p className="mt-1.5 text-[10px] text-gray-400 truncate">
      <span className="font-medium text-gray-500">{author}</span>
      {when && <span> · {when}</span>}
    </p>
  );
}

// ── Sortable wrapper — only mounted client-side to avoid aria-describedby mismatch ──

function SortableNoteCard({ note, canModify, ...handlers }: { note: WorkspaceNote; canModify?: boolean } & NoteHandlers) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: note.id });
  return (
    <NoteCardContent
      note={note}
      canModify={canModify}
      {...handlers}
      containerRef={setNodeRef}
      containerStyle={{ transform: CSS.Transform.toString(transform), transition }}
      dragHandleProps={({ ...attributes, ...listeners } as React.HTMLAttributes<HTMLButtonElement>)}
      isDragging={isDragging}
    />
  );
}

// ── Static wrapper — SSR-safe, no dnd-kit hooks ───────────────────────────────

function StaticNoteCard({ note, canModify, ...handlers }: { note: WorkspaceNote; canModify?: boolean } & NoteHandlers) {
  return <NoteCardContent note={note} canModify={canModify} {...handlers} />;
}

// ── Add note form ──────────────────────────────────────────────────────────────

function AddNoteForm({
  workspaceId,
  onAdd,
  onCancel,
}: {
  workspaceId: string;
  onAdd: (_title: string, _body: string, _color: NoteColor) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [color, setColor] = useState<NoteColor>("yellow");
  const inputRef = useRef<HTMLInputElement>(null);
  void workspaceId;

  useEffect(() => { inputRef.current?.focus(); }, []);

  const editColors = NOTE_COLORS[color];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd(title.trim(), body.trim(), color);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn("rounded-lg border-2 p-2.5 shadow-sm flex flex-col gap-1.5", editColors.bg, editColors.border)}
    >
      <div className="flex items-center gap-1 mb-0.5">
        {ALL_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            className={cn(
              "w-3.5 h-3.5 rounded-full transition-transform",
              NOTE_COLORS[c].dot,
              color === c ? "ring-2 ring-offset-1 ring-gray-400 scale-110" : "opacity-60 hover:opacity-100",
            )}
            aria-label={c}
          />
        ))}
      </div>
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
        className={cn("text-sm font-medium bg-transparent border-b outline-none w-full pb-0.5", editColors.border)}
        placeholder="Not başlığı…"
        maxLength={500}
        required
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="text-xs text-gray-600 bg-transparent outline-none w-full resize-none"
        placeholder="Not içeriği (isteğe bağlı)…"
        rows={2}
        maxLength={5000}
      />
      <div className="flex gap-1 justify-end">
        <button type="button" onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-600 rounded"><X size={12} /></button>
        <button type="submit" disabled={!title.trim()} className="p-1 text-green-600 hover:text-green-700 disabled:opacity-40 rounded"><Check size={12} /></button>
      </div>
    </form>
  );
}

// ── Mount detection via useSyncExternalStore (avoids setState-in-effect lint error) ──

const _subscribeMounted = () => () => {};
const _getMounted = () => true;
const _getServerMounted = () => false;

// ── Main column ────────────────────────────────────────────────────────────────

export function NotesColumn({
  notes: initialNotes,
  workspaceId,
  readOnly = false,
  authorsById = {},
  mobile = false,
  currentUserId,
  isAdmin = false,
  feed,
  feedLabel = "Bu haftaki görev notları",
}: {
  notes: WorkspaceNote[];
  workspaceId: string;
  readOnly?: boolean;
  authorsById?: Record<string, string>;
  // Mobile single-column view: drop the fixed kanban width and fill the screen.
  mobile?: boolean;
  // Per-note edit/delete gating: admins manage any note; members only their own.
  currentUserId?: string;
  isAdmin?: boolean;
  // Haftanın Not Akışı — the primary content of the column (weekly task-note
  // feed rendered by the board). The sticky "Pano notları" stay below it.
  feed?: React.ReactNode;
  // Feed heading — the board overrides it with the selected week's label when
  // the user is browsing a week other than the current one.
  feedLabel?: string;
}) {
  // A note is modifiable by an owner/admin, or by the member who authored it.
  const canModifyNote = (note: WorkspaceNote) =>
    isAdmin || (!!currentUserId && note.created_by === currentUserId);
  // Detects client vs server render without triggering a state update in effect
  const mounted = useSyncExternalStore(_subscribeMounted, _getMounted, _getServerMounted);
  const [_isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);

  // Confirm popup (before a destructive note action) + short-lived undo toast.
  const [confirmAction, setConfirmAction] = useState<
    | { kind: "delete"; note: WorkspaceNote }
    | { kind: "convert"; note: WorkspaceNote }
    | null
  >(null);
  const [undo, setUndo] = useState<
    | { kind: "delete"; note: WorkspaceNote }
    | { kind: "convert"; note: WorkspaceNote; taskId: string }
    | null
  >(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showUndo(u: NonNullable<typeof undo>) {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo(u);
    undoTimer.current = setTimeout(() => setUndo(null), 7000);
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const [optimisticNotes, applyOptimistic] = useOptimistic(
    initialNotes,
    (state: WorkspaceNote[], action:
      | { type: "add"; note: WorkspaceNote }
      | { type: "delete"; id: string }
      | { type: "update"; id: string; title: string; body: string; color: NoteColor }
      | { type: "reorder"; notes: WorkspaceNote[] }
    ) => {
      if (action.type === "add") return [...state, action.note];
      if (action.type === "delete") return state.filter((n) => n.id !== action.id);
      if (action.type === "update") {
        return state.map((n) =>
          n.id === action.id ? { ...n, title: action.title, body: action.body, color: action.color } : n,
        );
      }
      if (action.type === "reorder") return action.notes;
      return state;
    },
  );

  function handleAdd(title: string, body: string, color: NoteColor) {
    const tempNote: WorkspaceNote = {
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      title,
      body: body || null,
      color,
      position: optimisticNotes.length,
      created_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setAdding(false);
    startTransition(async () => {
      applyOptimistic({ type: "add", note: tempNote });
      await createNote({ workspace_id: workspaceId, title, body: body || undefined, color });
    });
  }

  function handleUpdate(id: string, title: string, body: string, color: NoteColor) {
    startTransition(async () => {
      applyOptimistic({ type: "update", id, title, body, color });
      await updateNote({ id, title, body: body || null, color });
    });
  }

  // ── Destructive note actions: confirm popup → act → undo toast ───────────────
  // Both "notu sil" and "göreve dönüştür" first ask for confirmation (a stray
  // click shouldn't destroy a note), then surface an undo affordance.
  function requestDelete(id: string) {
    const note = optimisticNotes.find((n) => n.id === id);
    if (note) setConfirmAction({ kind: "delete", note });
  }
  function requestConvert(id: string) {
    const note = optimisticNotes.find((n) => n.id === id);
    if (note) setConfirmAction({ kind: "convert", note });
  }

  function performDelete(note: WorkspaceNote) {
    startTransition(async () => {
      applyOptimistic({ type: "delete", id: note.id });
      await deleteNote(note.id);
      showUndo({ kind: "delete", note });
    });
  }

  function performConvert(note: WorkspaceNote) {
    startTransition(async () => {
      const created = await createTask({
        workspace_id: workspaceId,
        title: note.title,
        description: note.body || undefined,
        status: "backlog",
        priority: "medium",
        tags: [],
        custom_fields: {},
        participant_member_ids: [],
      });
      applyOptimistic({ type: "delete", id: note.id });
      await deleteNote(note.id);
      if (created && "id" in created) showUndo({ kind: "convert", note, taskId: created.id });
    });
  }

  function runConfirmed() {
    if (!confirmAction) return;
    const action = confirmAction;
    setConfirmAction(null);
    if (action.kind === "delete") performDelete(action.note);
    else performConvert(action.note);
  }

  // Undo re-creates the note (and, for a conversion, removes the just-created
  // task). Best-effort within the session — enough to recover a misclick.
  function runUndo() {
    if (!undo) return;
    const u = undo;
    setUndo(null);
    startTransition(async () => {
      if (u.kind === "convert") await softDeleteTask(u.taskId);
      const restored: WorkspaceNote = { ...u.note, id: crypto.randomUUID() };
      applyOptimistic({ type: "add", note: restored });
      await createNote({
        workspace_id: workspaceId,
        title: u.note.title,
        body: u.note.body || undefined,
        color: u.note.color,
      });
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = optimisticNotes.findIndex((n) => n.id === active.id);
    const newIndex = optimisticNotes.findIndex((n) => n.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(optimisticNotes, oldIndex, newIndex).map((n, i) => ({ ...n, position: i }));
    startTransition(async () => {
      applyOptimistic({ type: "reorder", notes: reordered });
      await reorderNotes(reordered.map((n) => ({ id: n.id, position: n.position })));
    });
  }

  const noteIds = optimisticNotes.map((n) => n.id);

  // No dashed placeholder box — an empty sticky-note list renders nothing (the
  // weekly feed above is the column's primary content).
  const listCls = "flex flex-col gap-2 rounded-lg p-1";

  const handlers: NoteHandlers = {
    onDelete: requestDelete,
    onUpdate: handleUpdate,
    onConvertToTask: (id: string) => requestConvert(id),
    readOnly,
  };

  return (
    <NoteAuthorsContext.Provider value={authorsById}>
    <div className={cn("flex flex-col gap-2 shrink-0", mobile ? "w-full" : "w-[80vw] max-w-64 sm:w-64")}>
      {/* Header */}
      <div className="flex items-center justify-between sticky top-0 z-20 h-11">
        <div className="flex items-center gap-2">
          <StickyNote size={13} className="text-[#c8c39e]" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#6b6748]">Notlar</h3>
        </div>
      </div>

      {/* Haftanın Not Akışı — primary content */}
      {feed && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-1">
            {feedLabel}
          </p>
          {feed}
        </div>
      )}

      {/* Pano notları (sticky quick notes) — secondary section */}
      <div className="flex items-center justify-between px-1 mt-1">
        <div className="flex items-center gap-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Pano notları</p>
          <span className="text-[10px] text-[#6b6748] bg-[#f0ece4] rounded-full px-1.5 py-0.5 leading-none">
            {optimisticNotes.length}
          </span>
        </div>
        {!readOnly && (
          <button
            onClick={() => setAdding(true)}
            className="p-0.5 text-gray-300 hover:text-[#406775] rounded transition-colors"
            aria-label="Pano notu ekle"
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      {/* Pre-mount: static list — no dnd-kit, no aria-describedby generation */}
      {!mounted && (
        <div className={listCls}>
          {optimisticNotes.map((note) => (
            <StaticNoteCard key={note.id} note={note} canModify={canModifyNote(note)} {...handlers} />
          ))}
        </div>
      )}

      {/* Post-mount: full DnD list */}
      {mounted && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={noteIds} strategy={verticalListSortingStrategy}>
            <div className={listCls}>
              {optimisticNotes.map((note) => (
                <SortableNoteCard key={note.id} note={note} canModify={canModifyNote(note)} {...handlers} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {!readOnly && adding && (
        <AddNoteForm
          workspaceId={workspaceId}
          onAdd={handleAdd}
          onCancel={() => setAdding(false)}
        />
      )}

      {/* Confirm before converting / deleting a note (guards against misclicks) */}
      <ConfirmDialog
        open={confirmAction !== null}
        title={
          confirmAction?.kind === "convert"
            ? "Bu notu göreve dönüştürmek istediğinizden emin misiniz?"
            : "Bu notu silmek istediğinizden emin misiniz?"
        }
        message={
          confirmAction?.kind === "convert"
            ? `"${confirmAction.note.title}" notu bir göreve dönüştürülecek ve not listesinden kaldırılacak.`
            : confirmAction?.kind === "delete"
              ? `"${confirmAction.note.title}" notu silinecek.`
              : ""
        }
        confirmLabel={confirmAction?.kind === "convert" ? "Evet, dönüştür" : "Evet, sil"}
        cancelLabel="İptal"
        onConfirm={runConfirmed}
        onCancel={() => setConfirmAction(null)}
      />

      {/* Undo toast — recover a just-converted/deleted note within the session */}
      {undo && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] pointer-events-auto bg-[#1d2127] text-white text-sm px-4 py-2.5 rounded-lg shadow-pop flex items-center gap-3 max-w-sm">
          <span className="flex-1">
            {undo.kind === "convert" ? "Not göreve dönüştürüldü." : "Not silindi."}
          </span>
          <button
            onClick={runUndo}
            className="shrink-0 inline-flex items-center gap-1 font-medium text-[#8fc7d6] hover:text-white underline underline-offset-2"
          >
            <Undo2 size={13} /> Geri al
          </button>
          <button
            onClick={() => setUndo(null)}
            className="shrink-0 text-white/50 hover:text-white"
            aria-label="Kapat"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
    </NoteAuthorsContext.Provider>
  );
}
