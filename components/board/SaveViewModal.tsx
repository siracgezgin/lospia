"use client";

import { useActionState, useState } from "react";
import { createSavedView } from "@/lib/actions/tasks";
import { X } from "lucide-react";

interface Props {
  workspaceId: string;
  currentFilters?: Record<string, unknown>;
  currentViewType?: "board" | "list";
  onClose: () => void;
}

export function SaveViewModal({ workspaceId, currentFilters, currentViewType, onClose }: Props) {
  const [state, action, pending] = useActionState(
    async (_: null | { error?: string }, formData: FormData) => {
      const name = (formData.get("name") as string).trim();
      if (!name) return { error: "View name is required" };
      const isShared = formData.get("is_shared") === "on";
      const result = await createSavedView({
        workspace_id: workspaceId,
        name,
        config: {
          filters: currentFilters ?? {},
          view_type: currentViewType ?? "board",
        },
        is_shared: isShared,
      });
      if ("error" in result) return { error: result.error };
      onClose();
      return null;
    },
    null
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Save current view</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <form action={action} className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">View name</label>
            <input
              name="name"
              type="text"
              autoFocus
              required
              placeholder="e.g. My open tasks"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input name="is_shared" type="checkbox" className="rounded" defaultChecked />
            Share with workspace
          </label>

          {state?.error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{state.error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-200 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-lg bg-blue-600 py-2 text-sm text-white font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {pending ? "Saving…" : "Save view"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
