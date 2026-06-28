"use client";

import { useState, useTransition } from "react";
import { Trash2, Plus } from "lucide-react";
import { createContact, deleteContact } from "@/lib/actions/contacts";
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
    <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
      {contacts.length === 0 ? (
        <p className="px-5 py-4 text-sm text-gray-400">Henüz kişi eklenmemiş.</p>
      ) : (
        contacts.map((c) => (
          <div key={c.id} className="flex items-center justify-between px-5 py-3">
            <div>
              <p className="text-sm font-medium text-gray-900">{c.name}</p>
              {(c.email || c.role_label) && (
                <p className="text-xs text-gray-400">
                  {[c.role_label, c.email].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            <button
              onClick={() => handleDelete(c.id)}
              disabled={isPending}
              className="text-gray-300 hover:text-red-500 p-1.5 rounded transition-colors disabled:opacity-50"
              aria-label={`${c.name} kişisini sil`}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))
      )}

      <form onSubmit={handleAdd} className="px-5 py-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Kişi ekle</p>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="İsim *"
            required
            className="flex-1 min-w-[120px] rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-posta"
            className="flex-1 min-w-[140px] rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <input
            type="text"
            value={roleLabel}
            onChange={(e) => setRoleLabel(e.target.value)}
            placeholder="Rol / açıklama (opsiyonel)"
            className="flex-1 min-w-[140px] rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={isPending || !name.trim()}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Plus size={14} />
            Ekle
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </form>
    </div>
  );
}
