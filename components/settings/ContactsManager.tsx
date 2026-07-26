"use client";

import { useState, useTransition } from "react";
import { Trash2, Plus, Users } from "lucide-react";
import { createContact, deleteContact } from "@/lib/actions/contacts";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import type { WorkspaceContact } from "@/types";

interface Props {
  workspaceId: string;
  initialContacts: WorkspaceContact[];
}

export function ContactsManager({ workspaceId, initialContacts }: Props) {
  const [contacts, setContacts] = useState(initialContacts);
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roleLabel, setRoleLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);

    startTransition(async () => {
      const result = await createContact({
        workspace_id: workspaceId,
        name: name.trim(),
        email: email.trim() || null,
        role_label: roleLabel.trim() || null,
      });

      if ("error" in result) {
        setError(result.error);
        return;
      }

      setContacts((prev) => [
        ...prev,
        {
          id: result.id,
          workspace_id: workspaceId,
          name: name.trim(),
          email: email.trim() || null,
          role_label: roleLabel.trim() || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);
      setName("");
      setEmail("");
      setRoleLabel("");
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteContact(id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setContacts((prev) => prev.filter((c) => c.id !== id));
    });
  }

  return (
    <Card className="divide-y divide-hairline">
      {contacts.length === 0 ? (
        <EmptyState icon={Users} title="Henüz kişi eklenmemiş." className="py-8" />
      ) : (
        contacts.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-3 px-5 py-3 transition-colors duration-150 hover:bg-surface-hover">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink truncate">{c.name}</p>
              {(c.email || c.role_label) && (
                <p className="text-xs text-subtle truncate">
                  {[c.role_label, c.email].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            <button
              onClick={() => handleDelete(c.id)}
              disabled={isPending}
              className="shrink-0 text-subtle hover:text-danger hover:bg-danger/10 p-1.5 rounded-md transition-colors duration-150 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
              aria-label={`${c.name} kişisini sil`}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))
      )}

      <form onSubmit={handleAdd} className="px-5 py-4 space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-subtle">Kişi ekle</p>
        <div className="flex flex-wrap gap-2">
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="İsim *"
            required
            className="flex-1 min-w-[120px] h-8"
          />
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-posta"
            className="flex-1 min-w-[140px] h-8"
          />
          <Input
            type="text"
            value={roleLabel}
            onChange={(e) => setRoleLabel(e.target.value)}
            placeholder="Rol / açıklama (opsiyonel)"
            className="flex-1 min-w-[140px] h-8"
          />
          <Button type="submit" size="sm" disabled={isPending || !name.trim()}>
            <Plus size={14} />
            Ekle
          </Button>
        </div>
        {error && <p role="alert" className="anim-fade-down text-xs text-danger">{error}</p>}
      </form>
    </Card>
  );
}
