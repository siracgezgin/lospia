"use client";

import { useTransition, useOptimistic } from "react";
import Link from "next/link";
import { Archive, RotateCcw } from "lucide-react";
import { unarchiveTask } from "@/lib/actions/tasks";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { formatDateTR } from "@/lib/utils/format-date";
import type { Task } from "@/types";

interface Props {
  manuallyArchived: Task[];
  oldCompleted: Task[];
  workspaceId: string;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return formatDateTR(iso, { day: "numeric", month: "short", year: "numeric" });
}

/* Satır: ad · tarih · (varsa) tek eylem. "Geri al" artık her zaman görünür —
   yalnız hover'da beliren düğmeye telefonda ulaşılamıyordu. */
function TaskRow({ task, onUnarchive }: { task: Task; onUnarchive: (_id: string) => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 px-4 sm:px-5 hover:bg-surface-hover transition-colors duration-150">
      <div className="flex-1 min-w-0">
        <Link
          href={`/tasks/${task.id}`}
          className="text-[13.5px] font-medium text-ink hover:text-brand transition-colors duration-150 truncate block"
        >
          {task.title}
        </Link>
        <p className="text-[12px] text-subtle mt-0.5 tabular-nums">
          {task.archived_at
            ? `Arşivlendi: ${formatDate(task.archived_at)}`
            : `Tamamlandı: ${formatDate(task.completed_at)}`}
        </p>
      </div>
      {task.archived_at && (
        <Button
          variant="ghost"
          size="sm"
          loading={pending}
          onClick={() => startTransition(async () => { await unarchiveTask(task.id); onUnarchive(task.id); })}
          className="shrink-0"
        >
          {!pending && <RotateCcw size={13} aria-hidden />} Geri al
        </Button>
      )}
    </div>
  );
}

/* Sayfa başlığı ("Archive") AppHeader'da zaten yazıyor — burada tekrar
   edilmez. Bölüm eyebrow'undaki sayı listeyi TARİF eder (kaç kayıt var),
   kimseyi puanlamaz; sadelik kuralına göre serbest. */
export function ArchiveView({ manuallyArchived, oldCompleted }: Props) {
  const [archived, setArchived] = useOptimistic(manuallyArchived, (state, id: string) =>
    state.filter((t) => t.id !== id),
  );
  const [_p, startTransition] = useTransition();

  function handleUnarchive(id: string) {
    startTransition(() => { setArchived(id); });
  }

  const totalCount = archived.length + oldCompleted.length;

  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8 space-y-6">
      {archived.length > 0 && (
        <section className="anim-fade-up">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle mb-2 tabular-nums">
            Manuel arşivlenenler · {archived.length}
          </h2>
          <div className="bg-surface border border-line rounded-card shadow-card divide-y divide-hairline overflow-hidden">
            {archived.map((task) => (
              <TaskRow key={task.id} task={task} onUnarchive={handleUnarchive} />
            ))}
          </div>
        </section>
      )}

      {oldCompleted.length > 0 && (
        <section className="anim-fade-up">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle mb-2 tabular-nums">
            Önceki haftalarda tamamlananlar · {oldCompleted.length}
          </h2>
          <div className="bg-surface border border-line rounded-card shadow-card divide-y divide-hairline overflow-hidden">
            {oldCompleted.map((task) => (
              <TaskRow key={task.id} task={task} onUnarchive={() => {}} />
            ))}
          </div>
        </section>
      )}

      {totalCount === 0 && (
        <EmptyState
          icon={Archive}
          title="Arşiv boş"
          description="Arşivlenen ve önceki haftalarda tamamlanan işler burada toplanır."
        />
      )}
    </div>
  );
}
