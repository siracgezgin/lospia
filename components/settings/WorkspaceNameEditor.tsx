"use client";

import { useState, useTransition } from "react";
import { Pencil, Check, X } from "lucide-react";
import { updateWorkspaceName } from "@/lib/actions/workspace";
import { TextInput } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/Button";

interface Props {
  workspaceId: string;
  currentName: string;
}

/**
 * Çalışma alanı adı — yerinde düzenleme.
 *
 * Kalem düğmesi önce yalnız fareyle üstüne gelince görünüyordu (opacity-0 →
 * group-hover). Telefonda hover yok; düğme HİÇ bulunamıyordu. Artık sürekli
 * görünür, dinlenirken sessiz (ghost).
 */
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
      <div className="flex items-center justify-end gap-1">
        <span className="min-w-0 truncate text-[13.5px] font-medium text-ink">{name}</span>
        <IconButton size="sm" onClick={startEdit} aria-label="Çalışma alanı adını düzenle">
          <Pencil size={13} />
        </IconButton>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <TextInput
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
          className="h-8 flex-1"
          maxLength={100}
          autoFocus
          disabled={isPending}
          aria-label="Çalışma alanı adı"
          invalid={!!error}
        />
        <IconButton
          size="sm"
          variant="primary"
          onClick={save}
          disabled={isPending || !draft.trim()}
          aria-label="Kaydet"
        >
          <Check size={14} />
        </IconButton>
        <IconButton size="sm" onClick={cancel} disabled={isPending} aria-label="Vazgeç">
          <X size={14} />
        </IconButton>
      </div>
      {error && <p role="alert" className="anim-fade-down text-[12px] text-danger">{error}</p>}
    </div>
  );
}
