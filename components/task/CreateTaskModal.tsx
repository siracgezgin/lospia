"use client";

import { useState, useTransition, useMemo } from "react";
import { X, ChevronDown } from "lucide-react";
import { createTask } from "@/lib/actions/tasks";
import {
  STATUS_LABELS,
  PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_PRIORITIES,
  CARD_STATUS_OPTIONS,
} from "@/lib/utils/task-constants";
import { cn } from "@/lib/utils/cn";
import type { TaskStatus, TaskPriority, Profile, WorkspaceContact } from "@/types";

interface Props {
  onClose: () => void;
  workspaceId: string;
  defaultStatus?: TaskStatus;
  defaultDueDate?: string;
  profiles: Pick<Profile, "id" | "full_name" | "email">[];
  contacts: WorkspaceContact[];
}

function encodeResponsible(type: "member" | "contact", id: string) {
  return `${type}:${id}`;
}
function decodeResponsible(value: string): { assignee_id: string | null; responsible_contact_id: string | null } {
  if (value.startsWith("member:")) return { assignee_id: value.slice(7), responsible_contact_id: null };
  if (value.startsWith("contact:")) return { assignee_id: null, responsible_contact_id: value.slice(8) };
  return { assignee_id: null, responsible_contact_id: null };
}

// Map the 3-column targetStatuses to display labels for the modal
const SIMPLE_STATUS_OPTIONS = CARD_STATUS_OPTIONS;

export function CreateTaskModal({
  onClose,
  workspaceId,
  defaultStatus = "ready",
  defaultDueDate = "",
  profiles,
  contacts,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  // Primary fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [responsibleValue, setResponsibleValue] = useState("");
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [status, setStatus] = useState<TaskStatus>(defaultStatus);
  const [priority, setPriority] = useState<TaskPriority>("medium");

  // İş birliği
  const [collaborators, setCollaborators] = useState<string[]>([]);
  const [collabSearch, setCollabSearch] = useState("");

  // Secondary (Ek bilgiler)
  const [startDate, setStartDate] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [successCriteria, setSuccessCriteria] = useState("");

  const allPeople = useMemo(() => [
    ...profiles.map((p) => ({ key: p.id, name: p.full_name ?? p.email ?? "—" })),
    ...contacts.map((c) => ({ key: c.id, name: c.name })),
  ], [profiles, contacts]);

  const filteredPeople = useMemo(() => {
    const q = collabSearch.trim().toLowerCase();
    return q ? allPeople.filter((p) => p.name.toLowerCase().includes(q)) : allPeople;
  }, [allPeople, collabSearch]);

  function toggleCollaborator(name: string) {
    setCollaborators((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  }

  const workspaceIdMissing = !workspaceId || workspaceId.length < 10;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || workspaceIdMissing) return;
    setError(null);

    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    const customFields: Record<string, unknown> = {};
    if (category.trim()) customFields.category = category.trim();
    if (successCriteria.trim()) customFields.success_criteria = successCriteria.trim();
    if (collaborators.length > 0) customFields.collaborators = collaborators;

    const { assignee_id, responsible_contact_id } = decodeResponsible(responsibleValue);

    startTransition(async () => {
      const result = await createTask({
        workspace_id: workspaceId,
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        priority,
        assignee_id,
        responsible_contact_id,
        due_date: dueDate || null,
        start_date: startDate || null,
        tags,
        custom_fields: customFields,
      });

      if ("error" in result) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  const inputCls = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
  const selectCls = "w-full rounded-lg border border-gray-200 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
  const labelCls = "block text-xs font-medium text-gray-600 mb-1";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="text-base font-semibold text-gray-900">Görev oluştur</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 rounded-lg p-1 transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* İş başlığı */}
          <div>
            <label className={labelCls}>İş başlığı <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Görev / iş başlığı"
              required
              autoFocus
              className={inputCls}
            />
          </div>

          {/* Açıklama / Stratejik adım */}
          <div>
            <label className={labelCls}>Açıklama / Stratejik adım</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Açıklama, hedef veya stratejik adım…"
              className={cn(inputCls, "resize-none")}
            />
          </div>

          {/* Kategori / Konu */}
          <div>
            <label className={labelCls}>Kategori / Konu</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Örn: Pazarlama, Operasyon, Finans…"
              className={inputCls}
            />
          </div>

          {/* Sorumlu */}
          <div>
            <label className={labelCls}>Sorumlu</label>
            <select
              value={responsibleValue}
              onChange={(e) => setResponsibleValue(e.target.value)}
              className={selectCls}
            >
              <option value="">— Atanmamış</option>
              {profiles.length > 0 && (
                <optgroup label="Üyeler">
                  {profiles.map((p) => (
                    <option key={p.id} value={encodeResponsible("member", p.id)}>
                      {p.full_name ?? p.email}
                    </option>
                  ))}
                </optgroup>
              )}
              {contacts.length > 0 && (
                <optgroup label="Kişiler">
                  {contacts.map((c) => (
                    <option key={c.id} value={encodeResponsible("contact", c.id)}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* İş birliği kişileri */}
          {allPeople.length > 0 && (
            <div>
              <label className={labelCls}>İş birliği kişileri</label>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <input
                  type="text"
                  value={collabSearch}
                  onChange={(e) => setCollabSearch(e.target.value)}
                  placeholder="Kişi ara…"
                  className="w-full px-3 py-1.5 text-sm border-b border-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <div className="max-h-24 overflow-y-auto p-2 flex flex-wrap gap-x-4 gap-y-2">
                  {filteredPeople.map((person) => (
                    <label key={person.key} className="flex items-center gap-1.5 cursor-pointer text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={collaborators.includes(person.name)}
                        onChange={() => toggleCollaborator(person.name)}
                        className="rounded text-blue-500 focus:ring-blue-500"
                      />
                      {person.name}
                    </label>
                  ))}
                  {filteredPeople.length === 0 && <p className="text-xs text-gray-400 px-1">Eşleşen kişi yok</p>}
                </div>
              </div>
              {collaborators.length > 0 && (
                <p className="text-xs text-gray-400 mt-1">Seçili: {collaborators.join(", ")}</p>
              )}
            </div>
          )}

          {/* Teslim tarihi */}
          <div>
            <label className={labelCls}>Teslim tarihi</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={selectCls}
            />
          </div>

          {/* Durum + Öncelik */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Durum</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className={selectCls}
              >
                {SIMPLE_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Öncelik</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className={selectCls}
              >
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Ek bilgiler (collapsible) */}
          <div className="border border-gray-100 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="flex items-center justify-between w-full px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
            >
              Ek bilgiler
              <ChevronDown size={14} className={cn("transition-transform", showDetails && "rotate-180")} />
            </button>
            {showDetails && (
              <div className="px-3 pb-3 space-y-3 border-t border-gray-100">
                <div className="pt-3">
                  <label className={labelCls}>Başlangıç tarihi</label>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={selectCls} />
                </div>
                <div>
                  <label className={labelCls}>Etiketler</label>
                  <input
                    type="text"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    placeholder="etiket1, etiket2, etiket3"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Başarı kriteri / KPI</label>
                  <textarea
                    value={successCriteria}
                    onChange={(e) => setSuccessCriteria(e.target.value)}
                    rows={2}
                    placeholder="Başarı nasıl ölçülecek?"
                    className={cn(inputCls, "resize-none")}
                  />
                </div>
              </div>
            )}
          </div>

          {workspaceIdMissing && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Çalışma alanı bilgisi yüklenemedi. Sayfayı yenileyin.
            </p>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={isPending || !title.trim() || workspaceIdMissing}
              className={cn(
                "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                isPending || !title.trim() || workspaceIdMissing
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              )}
            >
              {isPending ? "Oluşturuluyor…" : "Görev oluştur"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Keep STATUS_LABELS exported for compatibility with other components that may import from here
export { STATUS_LABELS, TASK_STATUSES };
