"use client";

import { useState, useTransition } from "react";
import { Pencil, Check, X } from "lucide-react";
import { updateWorkspaceName } from "@/lib/actions/workspace";
import { Input } from "@/components/ui/Input";

interface Props {
  workspaceId: string;
  currentName: string;
}

export function WorkspaceNameEditor({ workspaceId, currentName }: Props) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(currentName);
  const [draft, setDraft] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function startEdit() {
    setDraft(name);
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setDraft(name);
    setError(null);
    setEditing(false);
  }

  function save() {
    if (!draft.trim() || draft.trim() === name) { cancel(); return; }
    setError(null);
    startTransition(async () => {
      const result = await updateWorkspaceName(workspaceId, draft.trim());
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setName(draft.trim());
      setEditing(false);
    });
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2 group">
        <span className="text-sm font-medium text-ink">{name}</span>
        <button
          onClick={startEdit}
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-1 rounded-md text-subtle hover:text-ink hover:bg-surface-muted active:scale-95 transition-all duration-150"
          aria-label="Çalışma alanı adını düzenle"
        >
          <Pencil size={13} />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
          className="flex-1 h-8"
          maxLength={100}
          autoFocus
          disabled={isPending}
        />
        <button
          onClick={save}
          disabled={isPending || !draft.trim()}
          className="p-1.5 rounded-lg bg-brand text-white hover:bg-brand-strong active:scale-95 transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50"
          aria-label="Kaydet"
        >
          <Check size={14} />
        </button>
        <button
          onClick={cancel}
          disabled={isPending}
          className="p-1.5 rounded-lg text-muted hover:bg-surface-muted hover:text-ink active:scale-95 transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50"
          aria-label="İptal"
        >
          <X size={14} />
        </button>
      </div>
      {error && <p role="alert" className="anim-fade-down text-xs text-danger">{error}</p>}
    </div>
  );
}
