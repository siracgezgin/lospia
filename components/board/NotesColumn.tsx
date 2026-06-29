"use client";

import {
  useState, useOptimistic, useTransition, useRef, useEffect, useSyncExternalStore,
} from "react";
import {
  DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors, closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, Trash2, Pencil, StickyNote, Check, X, GripVertical, ArrowRightCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { createNote, updateNote, deleteNote, reorderNotes } from "@/lib/actions/notes";
import { createTask } from "@/lib/actions/tasks";
import type { WorkspaceNote, NoteColor } from "@/types";

// ── Note color palette — brand-derived warm tones ─────────────────────────────

const NOTE_COLORS: Record<NoteColor, { bg: string; border: string; title: string; dot: string }> = {
  yellow: { bg: "bg-[#faf6e3]", border: "border-[#d4cf9e]", title: "text-[#6b6748]", dot: "bg-[#c8c39e]" },
  blue:   { bg: "bg-[#e8f1f4]", border: "border-[#a0c0cf]", title: "text-[#406775]", dot: "bg-[#5b8fa0]" },
  green:  { bg: "bg-[#e8f0ea]", border: "border-[#90b898]", title: "text-[#3a6e42]", dot: "bg-[#60a070]" },
  purple: { bg: "bg-[#f2edf8]", border: "border-[#b8a0d0]", title: "text-[#5c40a0]", dot: "bg-[#8060c0]" },
};

const ALL_COLORS: NoteColor[] = ["yellow", "blue", "green", "purple"];

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
  containerRef,
  containerStyle,
  dragHandleProps,
  isDragging,
}: { note: WorkspaceNote } & NoteHandlers & DragProps) {
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
          "rounded-lg border-2 p-2.5 shadow-sm flex flex-col gap-1.5",
          editColors.bg, editColors.border,
        )}
      >
        <div className="flex items-center gap-1 mb-0.5">
          {ALL_COLORS.map((c) => (
            <button
              key={c}
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
          <button onClick={handleCancel} className="p-1 text-gray-400 hover:text-gray-600 rounded"><X size={12} /></button>
          <button onClick={handleSave} className="p-1 text-green-600 hover:text-green-700 rounded"><Check size={12} /></button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={containerStyle}
      className={cn(
        "rounded-lg border p-2.5 shadow-sm group",
        colors.bg, colors.border,
        isDragging && "opacity-50 shadow-lg",
      )}
    >
      <div className="flex items-start gap-1">
        {!readOnly ? (
          <button
            {...dragHandleProps}
            className="mt-0.5 p-0.5 rounded text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
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
            {!readOnly && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button
                onClick={() => onConvertToTask(note.id, note.title, note.body ?? "")}
                className="p-0.5 text-gray-300 hover:text-[#406775] rounded"
                aria-label="Göreve dönüştür"
                title="Göreve dönüştür"
              >
                <ArrowRightCircle size={11} />
              </button>
              <button
                onClick={() => setEditing(true)}
                className="p-0.5 text-gray-300 hover:text-gray-600 rounded"
                aria-label="Notu düzenle"
              >
                <Pencil size={11} />
              </button>
              <button
                onClick={() => onDelete(note.id)}
                className="p-0.5 text-gray-300 hover:text-red-500 rounded"
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
        </div>
      </div>
    </div>
  );
}

// ── Sortable wrapper — only mounted client-side to avoid aria-describedby mismatch ──

function SortableNoteCard({ note, ...handlers }: { note: WorkspaceNote } & NoteHandlers) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: note.id });
  return (
    <NoteCardContent
      note={note}
      {...handlers}
      containerRef={setNodeRef}
      containerStyle={{ transform: CSS.Transform.toString(transform), transition }}
      dragHandleProps={({ ...attributes, ...listeners } as React.HTMLAttributes<HTMLButtonElement>)}
      isDragging={isDragging}
    />
  );
}

// ── Static wrapper — SSR-safe, no dnd-kit hooks ───────────────────────────────

function StaticNoteCard({ note, ...handlers }: { note: WorkspaceNote } & NoteHandlers) {
  return <NoteCardContent note={note} {...handlers} />;
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
}: {
  notes: WorkspaceNote[];
  workspaceId: string;
  readOnly?: boolean;
}) {
  // Detects client vs server render without triggering a state update in effect
  const mounted = useSyncExternalStore(_subscribeMounted, _getMounted, _getServerMounted);
  const [_isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);

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

  function handleDelete(id: string) {
    startTransition(async () => {
      applyOptimistic({ type: "delete", id });
      await deleteNote(id);
    });
  }

  function handleUpdate(id: string, title: string, body: string, color: NoteColor) {
    startTransition(async () => {
      applyOptimistic({ type: "update", id, title, body, color });
      await updateNote({ id, title, body: body || null, color });
    });
  }

  function handleConvertToTask(id: string, title: string, body: string) {
    startTransition(async () => {
      await createTask({
        workspace_id: workspaceId,
        title,
        description: body || undefined,
        status: "backlog",
        priority: "medium",
        tags: [],
        custom_fields: {},
      });
      applyOptimistic({ type: "delete", id });
      await deleteNote(id);
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

  const emptyState = optimisticNotes.length === 0 && !adding;
  const listCls = cn(
    "flex flex-col gap-2 rounded-lg p-1 min-h-20",
    emptyState && "border-2 border-dashed border-[#d4cf9e]",
  );

  const handlers: NoteHandlers = {
    onDelete: handleDelete,
    onUpdate: handleUpdate,
    onConvertToTask: handleConvertToTask,
    readOnly,
  };

  return (
    <div className="flex flex-col gap-2 w-[80vw] max-w-64 sm:w-64 shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between sticky top-0 z-20 h-11">
        <div className="flex items-center gap-2">
          <StickyNote size={13} className="text-[#c8c39e]" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#6b6748]">Notlar</h3>
          <span className="text-[10px] text-[#6b6748] bg-[#f0ece4] rounded-full px-1.5 py-0.5 leading-none">
            {optimisticNotes.length}
          </span>
        </div>
        {!readOnly && (
          <button
            onClick={() => setAdding(true)}
            className="p-0.5 text-gray-300 hover:text-[#406775] rounded transition-colors"
            aria-label="Not ekle"
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      {/* Pre-mount: static list — no dnd-kit, no aria-describedby generation */}
      {!mounted && (
        <div className={listCls}>
          {optimisticNotes.map((note) => (
            <StaticNoteCard key={note.id} note={note} {...handlers} />
          ))}
        </div>
      )}

      {/* Post-mount: full DnD list */}
      {mounted && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={noteIds} strategy={verticalListSortingStrategy}>
            <div className={listCls}>
              {optimisticNotes.map((note) => (
                <SortableNoteCard key={note.id} note={note} {...handlers} />
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
    </div>
  );
}
