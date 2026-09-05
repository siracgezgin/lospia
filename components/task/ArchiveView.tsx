"use client";

import { useState, useTransition } from "react";
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

/* Sunucu bazen İngilizce teknik metin döner; kullanıcıya Türkçe cümle. */
function errText(msg: string | undefined, fallback: string): string {
  if (!msg) return fallback;
  if (/not authenticated/i.test(msg)) return "Oturumunuz sona ermiş. Sayfayı yenileyip tekrar deneyin.";
  return msg;
}

/* Satır: ad · tarih · (varsa) tek eylem. "Geri al" artık her zaman görünür —
   yalnız hover'da beliren düğmeye telefonda ulaşılamıyordu. */
function TaskRow({ task }: { task: Task }) {
  const [pending, startTransition] = useTransition();
  /* Arşivden çıkarma yetkisi yoksa (üye) sunucu reddediyor ama satır yine de
     listeden siliniyordu: kullanıcı işin olduğunu sanıyordu. Hata artık
     görünür, satır yerinde kalır. */
  const [error, setError] = useState<string | null>(null);

  function handleUnarchive() {
    setError(null);
    startTransition(async () => {
      const res = await unarchiveTask(task.id);
      if (res && "error" in res) { setError(errText(res.error, "Görev arşivden çıkarılamadı.")); return; }
      /* Satır listeden `unarchiveTask`ın revalidatePath("/archive") tazelemesiyle
         düşer. Eskiden bir de iyimser silme vardı ama kendisini kuran geçiş aynı
         karede bittiği için hiç görünmüyordu — iki yarım çözüm yerine tek,
         sunucunun doğruladığı sonuç. */
    });
  }

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
        {error && (
          <p role="alert" className="anim-fade-down mt-1 text-[12.5px] text-danger">{error}</p>
        )}
      </div>
      {task.archived_at && (
        <Button
          variant="ghost"
          size="sm"
          loading={pending}
          onClick={handleUnarchive}
          title="Görevi arşivden çıkar"
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
  const archived = manuallyArchived;
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
              <TaskRow key={task.id} task={task} />
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
              <TaskRow key={task.id} task={task} />
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
