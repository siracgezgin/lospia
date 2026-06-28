"use client";

import { useState, useTransition, useActionState } from "react";
import { Pin, Trash2, PencilLine, StickyNote } from "lucide-react";
import type { TaskNoteWithAuthor } from "@/types";
import { addTaskNote, toggleNotePin, deleteTaskNote, updateTaskNote } from "@/lib/actions/notes";
import { formatDateTimeTR } from "@/lib/utils/format-date";

interface Props {
  taskId: string;
  initialNotes: TaskNoteWithAuthor[];
  currentUserId: string;
  isViewer: boolean;
}

function NoteItem({
  note,
  taskId,
  currentUserId,
  isViewer,
}: {
  note: TaskNoteWithAuthor;
  taskId: string;
  currentUserId: string;
  isViewer: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(note.content);
  const [, startTransition] = useTransition();

  const authorName = note.author?.full_name ?? note.author?.email ?? "Bilinmeyen";
  const canEdit = !isViewer && (note.author_id === currentUserId);
  const canDelete = !isViewer && (note.author_id === currentUserId);

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

  function handleDelete() {
    if (!confirm("Bu notu silmek istediğinizden emin misiniz?")) return;
    startTransition(async () => {
      await deleteTaskNote(note.id, taskId);
    });
  }

  return (
    <li className={`rounded-lg border p-3 space-y-1.5 ${note.is_pinned ? "border-amber-200 bg-amber-50" : "border-gray-100 bg-gray-50"}`}>
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
              className="w-full text-sm border border-blue-400 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          ) : (
            <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{note.content}</p>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>
          <span className="font-medium text-gray-600">{authorName}</span>
          {" · "}
          {formatDateTimeTR(note.created_at)}
        </span>
        <div className="flex items-center gap-1">
          {editing ? (
            <>
              <button onClick={handleSaveEdit} className="text-blue-600 hover:text-blue-700 font-medium">Kaydet</button>
              <button onClick={() => { setEditing(false); setEditValue(note.content); }} className="text-gray-500 hover:text-gray-700 ml-1">İptal</button>
            </>
          ) : (
            <>
              {canEdit && (
                <button onClick={() => setEditing(true)} className="p-1 hover:text-gray-600 rounded" title="Düzenle">
                  <PencilLine size={12} />
                </button>
              )}
              <button onClick={handlePin} className={`p-1 rounded ${note.is_pinned ? "text-amber-500 hover:text-amber-700" : "hover:text-amber-500"}`} title={note.is_pinned ? "Sabitlemeyi kaldır" : "Sabitle"}>
                <Pin size={12} />
              </button>
              {canDelete && (
                <button onClick={handleDelete} className="p-1 hover:text-red-500 rounded" title="Sil">
                  <Trash2 size={12} />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function AddNoteForm({ taskId, isViewer }: { taskId: string; isViewer: boolean }) {
  const [state, action, pending] = useActionState(
    async (_: null | { error?: string }, formData: FormData) => {
      const content = formData.get("content") as string;
      const result = await addTaskNote(taskId, content);
      if ("error" in result) return { error: result.error };
      return null;
    },
    null
  );

  if (isViewer) return null;

  return (
    <form action={action} className="flex gap-2 items-end">
      <textarea
        name="content"
        placeholder="Not ekle…"
        required
        rows={2}
        className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
      />
      <button
        type="submit"
        disabled={pending}
        className="text-sm bg-blue-600 text-white rounded-lg px-3 py-2 hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium whitespace-nowrap"
      >
        {pending ? "…" : "Not ekle"}
      </button>
      {state?.error && (
        <p className="text-xs text-red-600 col-span-2">{state.error}</p>
      )}
    </form>
  );
}

export function TaskNotesPanel({ taskId, initialNotes, currentUserId, isViewer }: Props) {
  const pinned = initialNotes.filter((n) => n.is_pinned);
  const rest = initialNotes.filter((n) => !n.is_pinned);
  const sorted = [...pinned, ...rest];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
        <StickyNote size={14} /> Notlar
      </h3>

      <AddNoteForm taskId={taskId} isViewer={isViewer} />

      {sorted.length === 0 ? (
        <p className="text-sm text-gray-400">Henüz not eklenmedi.</p>
      ) : (
        <ol className="space-y-2">
          {sorted.map((note) => (
            <NoteItem
              key={note.id}
              note={note}
              taskId={taskId}
              currentUserId={currentUserId}
              isViewer={isViewer}
            />
          ))}
        </ol>
      )}
    </div>
  );
}
