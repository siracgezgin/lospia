"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { createTask } from "@/lib/actions/tasks";
import {
  STATUS_LABELS,
  PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_PRIORITIES,
} from "@/lib/utils/task-constants";
import { cn } from "@/lib/utils/cn";
import type { TaskStatus, TaskPriority, Profile, WorkspaceContact } from "@/types";

interface Props {
  onClose: () => void;
  workspaceId: string;
  defaultStatus?: TaskStatus;
  profiles: Pick<Profile, "id" | "full_name" | "email">[];
  contacts: WorkspaceContact[];
}

export function CreateTaskModal({
  onClose,
  workspaceId,
  defaultStatus = "backlog",
  profiles,
  contacts,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>(defaultStatus);
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [assigneeId, setAssigneeId] = useState("");
  const [collaborators, setCollaborators] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [category, setCategory] = useState("");
  const [successCriteria, setSuccessCriteria] = useState("");

  const allPeople = [
    ...profiles.map((p) => ({ id: p.id, name: p.full_name ?? p.email ?? "—" })),
    ...contacts.map((c) => ({ id: c.id, name: c.name })),
  ];

  function toggleCollaborator(name: string) {
    setCollaborators((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setError(null);

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const customFields: Record<string, unknown> = {};
    if (category.trim()) customFields.category = category.trim();
    if (successCriteria.trim()) customFields.success_criteria = successCriteria.trim();
    if (collaborators.length > 0) customFields.collaborators = collaborators;

    startTransition(async () => {
      const result = await createTask({
        workspace_id: workspaceId,
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        priority,
        assignee_id: assigneeId || null,
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="text-base font-semibold text-gray-900">Görev oluştur</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 rounded-lg p-1 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Başlık */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Başlık <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Görev başlığı"
              required
              autoFocus
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Açıklama */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Açıklama</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Görev açıklaması..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Durum + Öncelik */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Durum</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Öncelik</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Sorumlu */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Sorumlu</label>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Atanmamış</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name ?? p.email}
                </option>
              ))}
            </select>
          </div>

          {/* İş birliği kişileri */}
          {allPeople.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                İş birliği kişileri
              </label>
              <div className="border border-gray-200 rounded-lg p-2.5 max-h-28 overflow-y-auto flex flex-wrap gap-x-4 gap-y-2">
                {allPeople.map((person) => (
                  <label
                    key={person.id}
                    className="flex items-center gap-1.5 cursor-pointer text-sm text-gray-700"
                  >
                    <input
                      type="checkbox"
                      checked={collaborators.includes(person.name)}
                      onChange={() => toggleCollaborator(person.name)}
                      className="rounded text-blue-500 focus:ring-blue-500"
                    />
                    {person.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Tarihler */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Başlangıç tarihi
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Teslim tarihi
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Etiketler */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Etiketler</label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="etiket1, etiket2, etiket3"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Kategori / Konu */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Kategori / Konu
            </label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Örn: Pazarlama, Operasyon..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Başarı kriteri / KPI */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Başarı kriteri / KPI
            </label>
            <textarea
              value={successCriteria}
              onChange={(e) => setSuccessCriteria(e.target.value)}
              rows={2}
              placeholder="Başarı nasıl ölçülecek?"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

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
              disabled={isPending || !title.trim()}
              className={cn(
                "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                isPending || !title.trim()
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
