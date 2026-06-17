"use client";

import { useState, useOptimistic, useTransition, useRef, useEffect } from "react";
import { Plus, Trash2, Pencil, StickyNote, Check, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { createNote, updateNote, deleteNote } from "@/lib/actions/notes";
import type { WorkspaceNote } from "@/types";

// ── Note card ──────────────────────────────────────────────────────────────

function NoteCard({
  note,
  onDelete,
  onUpdate,
}: {
  note: WorkspaceNote;
  onDelete: (_id: string) => void;
  onUpdate: (_id: string, _title: string, _body: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body ?? "");
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) titleRef.current?.focus();
  }, [editing]);

  function handleSave() {
    if (!title.trim()) return;
    onUpdate(note.id, title.trim(), body);
    setEditing(false);
  }

  function handleCancel() {
    setTitle(note.title);
    setBody(note.body ?? "");
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-2.5 shadow-sm flex flex-col gap-1.5">
        <input
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") handleCancel(); }}
          className="text-sm font-medium bg-transparent border-b border-yellow-300 outline-none w-full pb-0.5"
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
    <div className="rounded-lg border border-yellow-200 bg-yellow-50/80 p-2.5 shadow-sm group">
      <div className="flex items-start justify-between gap-1">
        <p className="text-sm font-medium text-gray-800 leading-snug flex-1 min-w-0 break-words">{note.title}</p>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
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
      </div>
      {note.body && (
        <p className="text-[11px] text-gray-500 mt-1 leading-relaxed break-words whitespace-pre-wrap line-clamp-4">{note.body}</p>
      )}
    </div>
  );
}

// ── Add note form ──────────────────────────────────────────────────────────

function AddNoteForm({
  workspaceId,
  onAdd,
  onCancel,
}: {
  workspaceId: string;
  onAdd: (_title: string, _body: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd(title.trim(), body.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-yellow-300 bg-yellow-50 p-2.5 shadow-sm flex flex-col gap-1.5">
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
        className="text-sm font-medium bg-transparent border-b border-yellow-300 outline-none w-full pb-0.5"
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

// ── Main column ────────────────────────────────────────────────────────────

export function NotesColumn({
  notes: initialNotes,
  workspaceId,
}: {
  notes: WorkspaceNote[];
  workspaceId: string;
}) {
  const [_isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);

  const [optimisticNotes, applyOptimistic] = useOptimistic(
    initialNotes,
    (state: WorkspaceNote[], action:
      | { type: "add"; note: WorkspaceNote }
      | { type: "delete"; id: string }
      | { type: "update"; id: string; title: string; body: string }
    ) => {
      if (action.type === "add") return [...state, action.note];
      if (action.type === "delete") return state.filter((n) => n.id !== action.id);
      if (action.type === "update") {
        return state.map((n) =>
          n.id === action.id ? { ...n, title: action.title, body: action.body } : n
        );
      }
      return state;
    }
  );

  function handleAdd(title: string, body: string) {
    const tempNote: WorkspaceNote = {
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      title,
      body: body || null,
      position: optimisticNotes.length,
      created_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setAdding(false);
    startTransition(async () => {
      applyOptimistic({ type: "add", note: tempNote });
      await createNote({ workspace_id: workspaceId, title, body: body || undefined });
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      applyOptimistic({ type: "delete", id });
      await deleteNote(id);
    });
  }

  function handleUpdate(id: string, title: string, body: string) {
    startTransition(async () => {
      applyOptimistic({ type: "update", id, title, body });
      await updateNote({ id, title, body: body || null });
    });
  }

  return (
    <div className="flex flex-col gap-2 w-72 shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-2">
          <StickyNote size={13} className="text-yellow-500" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-yellow-600">Notlar</h3>
          <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5 leading-none">
            {optimisticNotes.length}
          </span>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="p-0.5 text-gray-300 hover:text-yellow-500 rounded transition-colors"
          aria-label="Not ekle"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Cards area */}
      <div className={cn(
        "flex flex-col gap-2 rounded-lg p-1 min-h-20",
        optimisticNotes.length === 0 && !adding && "border-2 border-dashed border-yellow-100"
      )}>
        {optimisticNotes.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            onDelete={handleDelete}
            onUpdate={handleUpdate}
          />
        ))}

        {adding && (
          <AddNoteForm
            workspaceId={workspaceId}
            onAdd={handleAdd}
            onCancel={() => setAdding(false)}
          />
        )}
      </div>
    </div>
  );
}
