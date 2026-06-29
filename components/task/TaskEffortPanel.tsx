"use client";

import { useState, useTransition } from "react";
import { Gauge, Sparkles, Clock3 } from "lucide-react";
import { updateTask } from "@/lib/actions/tasks";
import { cn } from "@/lib/utils/cn";
import {
  EFFORT_OPTIONS, EFFORT_LABELS, pointsForEffort, type EffortSize,
} from "@/lib/points/effort";
import type { TaskStatus } from "@/types";

interface Props {
  taskId: string;
  effortSize: EffortSize;
  status: TaskStatus;
  participantCount: number;
  // Who has had points finalised for this task (only meaningful when done).
  earned: { name: string; points: number }[];
}

// Admin / Sistem Admini only. Members never render this panel and therefore
// never see effort, point values, pending points or who earned what.
export function TaskEffortPanel({ taskId, effortSize, status, participantCount, earned }: Props) {
  const [effort, setEffort] = useState<EffortSize>(effortSize);
  const [pending, startTransition] = useTransition();
  const points = pointsForEffort(effort);

  function changeEffort(next: EffortSize) {
    if (next === effort) return;
    setEffort(next);
    startTransition(async () => { await updateTask({ id: taskId, effort_size: next }); });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <Gauge size={14} /> Puan &amp; Motivasyon
        </h3>
        <span className="text-[11px] font-medium text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
          {EFFORT_LABELS[effort]} · {points} puan
        </span>
      </div>

      {/* Effort selector */}
      <div>
        <p className="text-xs text-gray-400 mb-1.5">Efor</p>
        <div className="flex gap-2">
          {EFFORT_OPTIONS.map((e) => (
            <button
              key={e}
              type="button"
              disabled={pending}
              onClick={() => changeEffort(e)}
              className={cn(
                "flex-1 rounded-lg border px-3 py-2 text-sm transition-colors disabled:opacity-60",
                effort === e
                  ? "bg-blue-50 border-blue-300 text-blue-700 font-medium"
                  : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50",
              )}
            >
              {EFFORT_LABELS[e]} <span className="text-[11px] text-gray-400">({pointsForEffort(e)})</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mt-1.5">
          Puan yalnızca yönetici onayından sonra kesinleşir.
        </p>
      </div>

      {/* Stage-aware points state */}
      {status === "review" && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2.5">
          <Clock3 size={14} className="text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800">
            Kontrol / Onay aşamasında. Onaylandığında{" "}
            {participantCount > 0 ? `${participantCount} sorumlunun her birine` : "sorumlulara"}{" "}
            <span className="font-semibold">{points} puan</span> kesinleşecek (bekleyen puan).
          </p>
        </div>
      )}

      {status === "done" && (
        earned.length > 0 ? (
          <div className="rounded-lg bg-green-50 border border-green-100 px-3 py-2.5 space-y-1">
            <p className="text-xs font-medium text-green-800 flex items-center gap-1.5">
              <Sparkles size={13} /> Kazanılan puan
            </p>
            <ul className="space-y-0.5">
              {earned.map((e, i) => (
                <li key={i} className="flex items-center justify-between text-xs text-green-800">
                  <span className="truncate">{e.name}</span>
                  <span className="font-semibold tabular-nums shrink-0 ml-2">+{e.points} puan</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-gray-400">
            Bu görevden henüz puan kesinleşmedi (ör. yalnızca kendi onayı nedeniyle atlanmış olabilir).
          </p>
        )
      )}
    </div>
  );
}
