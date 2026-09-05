"use client";

import { useState, useTransition, useOptimistic } from "react";
import Link from "next/link";
import { Trash2, RotateCcw, X } from "lucide-react";
import { restoreTask, permanentDeleteTask } from "@/lib/actions/tasks";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/useConfirm";
import { formatDateTR } from "@/lib/utils/format-date";
import type { Task } from "@/types";

interface Props {
  tasks: Task[];
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

/* Satır: ad · silinme tarihi · iki eylem (geri yükle / kalıcı sil). Eylemler
   her zaman görünür — hover'a saklanan düğme telefonda yoktu. Kalıcı silme
   satır içi "Evet/İptal" yerine ortak onay penceresinden geçer. */
function TrashRow({
  task,
  onRemove,
}: {
  task: Task;
  onRemove: (_id: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  /* Sunucu reddettiğinde satır eskiden yine de listeden siliniyor, kullanıcı
     yenileyene kadar işlemin tuttuğunu sanıyordu. Artık hata GÖRÜNÜR ve satır
     yerinde kalır. */
  const [error, setError] = useState<string | null>(null);
  const { ask, dialog } = useConfirm();

  async function handlePermanentDelete() {
    if (!(await ask({
      title: "Kalıcı olarak silinsin mi?",
      message: `"${task.title}" geri getirilemeyecek şekilde silinecek.`,
      confirmLabel: "Kalıcı sil",
      tone: "danger",
    }))) return;
    setError(null);
    startTransition(async () => {
      const res = await permanentDeleteTask(task.id);
      if (res && "error" in res) { setError(errText(res.error, "Görev silinemedi.")); return; }
      onRemove(task.id);
    });
  }

  function handleRestore() {
    setError(null);
    startTransition(async () => {
      const res = await restoreTask(task.id);
      if (res && "error" in res) { setError(errText(res.error, "Görev geri yüklenemedi.")); return; }
      onRemove(task.id);
    });
  }

  return (
    /* Telefonda ad ve iki eylem tek satıra sığmıyordu — alt alta düşer. */
    <div className="flex flex-col gap-2 py-2.5 px-4 sm:px-5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 hover:bg-surface-hover transition-colors duration-150">
      <div className="flex-1 min-w-0">
        <Link
          href={`/tasks/${task.id}`}
          className="text-[13.5px] font-medium text-muted hover:text-ink transition-colors duration-150 truncate block line-through decoration-line-strong"
        >
          {task.title}
        </Link>
        <p className="text-[12px] text-subtle mt-0.5 tabular-nums">
          Silindi: {formatDate(task.deleted_at)}
        </p>
        {error && (
          <p role="alert" className="anim-fade-down mt-1 text-[12.5px] text-danger">{error}</p>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={handleRestore}
          title="Görevi listeye geri getir"
        >
          <RotateCcw size={13} aria-hidden /> Geri yükle
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={handlePermanentDelete}
          className="text-danger hover:text-danger-strong hover:bg-danger/10"
        >
          <X size={13} aria-hidden /> Kalıcı sil
        </Button>
      </div>
      {dialog}
    </div>
  );
}

/* Sayfa başlığı ("Trash") AppHeader'da zaten yazıyor — burada tekrar edilmez. */
export function TrashView({ tasks: initialTasks }: Props) {
  const [tasks, setTasks] = useOptimistic(initialTasks, (state, id: string) =>
    state.filter((t) => t.id !== id),
  );
  const [_p, startTransition] = useTransition();

  function handleRemove(id: string) {
    startTransition(() => { setTasks(id); });
  }

  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      {tasks.length > 0 ? (
        <section className="anim-fade-up">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle mb-2 tabular-nums">
            Silinen görevler · {tasks.length}
          </h2>
          <div className="bg-surface border border-line rounded-card shadow-card divide-y divide-hairline overflow-hidden">
            {tasks.map((task) => (
              <TrashRow key={task.id} task={task} onRemove={handleRemove} />
            ))}
          </div>
        </section>
      ) : (
        <EmptyState
          icon={Trash2}
          title="Çöp kutusu boş"
          description="Silinen görevler burada tutulur; geri yükleyebilir ya da kalıcı olarak silebilirsiniz."
        />
      )}
    </div>
  );
}
