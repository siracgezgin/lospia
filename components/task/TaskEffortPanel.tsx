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
    <div className="bg-surface rounded-card border border-line shadow-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink flex items-center gap-1.5">
          <Gauge size={14} className="text-muted" /> Puan &amp; Motivasyon
        </h3>
        <span className="text-[11px] font-medium text-muted bg-surface-sunken rounded-full px-2 py-0.5">
          {EFFORT_LABELS[effort]} · {points} puan
        </span>
      </div>

      {/* Effort selector */}
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-subtle mb-1.5">Efor</p>
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
                  ? "bg-brand-soft border-brand-ring text-brand-strong font-medium"
                  : "bg-surface border-line text-muted hover:bg-surface-hover",
              )}
            >
              {EFFORT_LABELS[e]} <span className="text-[11px] text-subtle">({pointsForEffort(e)})</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-subtle mt-1.5">
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
          <p className="text-xs text-subtle">
            Bu görevden henüz puan kesinleşmedi (ör. yalnızca kendi onayı nedeniyle atlanmış olabilir).
          </p>
        )
      )}
    </div>
  );
}
