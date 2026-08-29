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
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold tracking-tight text-ink flex items-center gap-1.5">
          <Gauge size={14} className="text-muted" aria-hidden /> Puan &amp; Motivasyon
        </h3>
        {/* Tek rozet: seçili efor + puanı. Renk yok — bilgi, durum değil. */}
        <span className="text-[12px] font-medium text-muted bg-surface-sunken rounded-full px-2 py-0.5 tabular-nums whitespace-nowrap">
          {EFFORT_LABELS[effort]} · {points} puan
        </span>
      </div>

      {/* Effort selector — segment düğmeleri; seçili olan marka dolgusu alır. */}
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle mb-1.5">Efor</p>
        <div className="flex gap-2" role="group" aria-label="Efor">
          {EFFORT_OPTIONS.map((e) => (
            <button
              key={e}
              type="button"
              disabled={pending}
              onClick={() => changeEffort(e)}
              aria-pressed={effort === e}
              className={cn(
                "flex-1 h-9 rounded-control border px-3 text-[13.5px] transition-colors duration-150 ease-standard active:scale-[0.98] disabled:pointer-events-none disabled:text-subtle",
                effort === e
                  ? "bg-brand-soft border-brand-ring text-brand-strong font-medium"
                  : "bg-surface border-line text-muted hover:bg-surface-hover hover:border-line-strong",
              )}
            >
              {EFFORT_LABELS[e]} <span className="text-[12px] text-subtle tabular-nums">({pointsForEffort(e)})</span>
            </button>
          ))}
        </div>
        <p className="text-[12px] text-subtle mt-1.5">
          Puan yalnızca yönetici onayından sonra kesinleşir.
        </p>
      </div>

      {/* Stage-aware points state — durum renkleri token'dan (warning / success). */}
      {status === "review" && (
        <div className="anim-fade-up flex items-start gap-2 rounded-control bg-warning/10 border border-warning/30 px-3 py-2.5">
          <Clock3 size={14} className="text-warning mt-0.5 shrink-0" aria-hidden />
          <p className="text-[13px] leading-relaxed text-ink">
            Kontrol / Onay aşamasında. Onaylandığında{" "}
            {participantCount > 0 ? `${participantCount} sorumlunun her birine` : "sorumlulara"}{" "}
            <span className="font-semibold tabular-nums">{points} puan</span> kesinleşecek (bekleyen puan).
          </p>
        </div>
      )}

      {status === "done" && (
        earned.length > 0 ? (
          <div className="anim-fade-up rounded-control bg-success/10 border border-success/25 px-3 py-2.5 space-y-1">
            <p className="text-[13px] font-medium text-success flex items-center gap-1.5">
              <Sparkles size={13} aria-hidden /> Kazanılan puan
            </p>
            <ul className="space-y-0.5">
              {earned.map((e, i) => (
                <li key={i} className="flex items-center justify-between text-[13px] text-ink">
                  <span className="truncate">{e.name}</span>
                  <span className="font-semibold tabular-nums shrink-0 ml-2">+{e.points} puan</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-[12.5px] text-subtle">
            Bu görevden henüz puan kesinleşmedi (ör. yalnızca kendi onayı nedeniyle atlanmış olabilir).
          </p>
        )
      )}
    </div>
  );
}
