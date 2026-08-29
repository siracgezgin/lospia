"use client";

import { useState, useTransition } from "react";
import { Trash2, Plus, Users } from "lucide-react";
import { createContact, deleteContact } from "@/lib/actions/contacts";
import { Card } from "@/components/ui/Card";
import { Button, IconButton } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { useConfirm } from "@/components/ui/useConfirm";
import type { WorkspaceContact } from "@/types";

interface Props {
  workspaceId: string;
  initialContacts: WorkspaceContact[];
}

/**
 * Dış kişiler listesi. Kendi başına bir yüzey (Card) — bir bölüm kartının
 * içine konmaz. Silme onay sorar; alanların etiketi görünür (placeholder
 * etiket değildir).
 */
export function ContactsManager({ workspaceId, initialContacts }: Props) {
  const { ask, dialog } = useConfirm();
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

  async function handleDelete(c: WorkspaceContact) {
    const ok = await ask({
      title: "Kişiyi silmek istiyor musunuz?",
      message: `${c.name} listeden silinecek.`,
      confirmLabel: "Sil",
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteContact(c.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setContacts((prev) => prev.filter((x) => x.id !== c.id));
    });
  }

  return (
    <Card className="divide-y divide-hairline">
      {contacts.length === 0 ? (
        <EmptyState icon={Users} title="Henüz kişi yok" compact />
      ) : (
        contacts.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3 transition-colors duration-150 hover:bg-surface-hover sm:px-5">
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-medium text-ink">{c.name}</p>
              {(c.email || c.role_label) && (
                <p className="truncate text-[12.5px] text-muted">
                  {[c.role_label, c.email].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            <IconButton
              size="sm"
              onClick={() => handleDelete(c)}
              disabled={isPending}
              aria-label={`${c.name} kişisini sil`}
              className="hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 size={14} />
            </IconButton>
          </div>
        ))
      )}

      <form onSubmit={handleAdd} className="space-y-3 px-4 py-4 sm:px-5">
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle">Kişi ekle</p>
        <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-3">
          <Field label="İsim" required>
            <TextInput
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </Field>
          <Field label="E-posta">
            <TextInput
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Rol / açıklama">
            <TextInput
              type="text"
              value={roleLabel}
              onChange={(e) => setRoleLabel(e.target.value)}
            />
          </Field>
        </div>
        {error && <p role="alert" className="anim-fade-down text-[12.5px] text-danger">{error}</p>}
        <div className="flex justify-end">
          <Button type="submit" size="sm" loading={isPending} disabled={!name.trim()}>
            <Plus size={14} aria-hidden />
            Ekle
          </Button>
        </div>
      </form>

      {dialog}
    </Card>
  );
}
