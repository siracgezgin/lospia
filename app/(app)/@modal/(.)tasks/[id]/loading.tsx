import { Skeleton } from "@/components/ui/Skeleton";
import { TaskDetailDrawer } from "@/components/task/TaskDetailDrawer";

/**
 * ÇEKMECE YÜKLENİYOR EKRANI.
 *
 * Bu segmentte bir `loading.tsx` YOKTU: listede/panoda bir göreve tıklayınca
 * sunucu yanıtı gelene kadar ekranda HİÇBİR ŞEY olmuyordu (tıklama düşmüş
 * gibi hissettiriyordu, kullanıcı ikinci kez tıklıyordu). Artık çekmece
 * anında açılır, içi iskelet olarak dolar; Esc ve arka plan bu sırada da
 * çalışır (bekleyen gezinme geri alınır).
 *
 * İskelet dili tam sayfadaki `tasks/[id]/loading.tsx` ile aynıdır.
 */
export default function InterceptedTaskDetailLoading() {
  return (
    <TaskDetailDrawer>
      <div className="w-full px-4 py-4 sm:px-6 lg:px-8" aria-busy="true" aria-label="Görev yükleniyor">
        <div className="flex items-center justify-between gap-3 py-2 pr-14">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-9 w-24 rounded-control" />
        </div>

        <div className="bg-surface rounded-card border border-line shadow-card p-5 space-y-3 mt-4">
          <Skeleton className="h-7 w-3/4" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-24 rounded-md" />
            <Skeleton className="h-5 w-32 rounded-full" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          <div className="bg-surface rounded-card border border-line shadow-card p-5 space-y-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-20 w-full rounded-control" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Skeleton className="h-9 w-full rounded-control" />
              <Skeleton className="h-9 w-full rounded-control" />
              <Skeleton className="h-9 w-full rounded-control" />
              <Skeleton className="h-9 w-full rounded-control" />
            </div>
          </div>

          <div className="bg-surface rounded-card border border-line shadow-card p-5 space-y-3">
            <Skeleton className="h-4 w-32" />
            <div className="rounded-control border border-hairline divide-y divide-hairline">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2.5 px-3 py-2.5">
                  <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="ml-auto h-5 w-20 rounded-full shrink-0" />
                </div>
              ))}
            </div>
          </div>

          <div className="bg-surface rounded-card border border-line shadow-card p-5 space-y-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-16 w-full rounded-control" />
            <div className="space-y-2">
              <Skeleton className="h-14 w-full rounded-control" />
              <Skeleton className="h-14 w-full rounded-control" />
            </div>
          </div>
        </div>
      </div>
    </TaskDetailDrawer>
  );
}
