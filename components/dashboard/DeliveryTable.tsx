"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatDateTR } from "@/lib/utils/format-date";
import { getPersonDisplayName } from "@/lib/utils/person-display";
import { STATUS_LABELS } from "@/lib/utils/task-constants";
import { SortHeader } from "@/components/ui/SortHeader";
import { TextInput } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { istanbulTodayISO } from "./today";
import type { DueSoonTask } from "./DashboardView";

type SortKey = "due_date" | "title" | "who" | "status";
type Dir = "asc" | "desc";

/**
 * Teslim tablosu — "neyi, ne zaman" tarafı.
 *
 * Sıraç (2026-08-29): "Sayfanın yarısı boş, yani sıralama vs yok; sadece
 * gecikenler değil tüm görevler görünsün."
 *
 * Önce iki dar kart yan yana duruyordu (Geciken / Yaklaşan) ve YALNIZ teslim
 * tarihi yaklaşan işleri gösteriyordu: tarihi uzak ya da tarihsiz işler hiç
 * görünmüyordu, ekranın yarısı da boştu. Artık tek, tam genişlikte ve
 * SIRALANABİLİR bir tablo; açık işlerin tamamı burada.
 *
 * Sayı/rozet yok: satırların kendisi zaten listeyi anlatıyor (CLAUDE.md
 * sadelik kuralı — puanlayan sayı yasak, tarif eden serbest). Gecikmiş tarih
 * kırmızı yazılır ama ekran okuyucuya da "gecikti" denir; renk tek başına
 * sinyal değildir.
 *
 * Aynı tablo ÜYE raporunda da kullanılır (`showWho={false}`): kişi kendi
 * işlerine bakarken her satırda kendi adını okumasın — ama arama ve sıralama
 * onda da çalışsın. Tek tablo, tek tasarım dili.
 */
export function DeliveryTable({
  tasks, nameOf, today, showWho = true,
}: {
  tasks: DueSoonTask[];
  nameOf: Record<string, string>;
  /**
   * "Bugün" (YYYY-MM-DD, İstanbul). Sunucudan gelir; verilmezse burada
   * hesaplanır — her iki yol da saat dilimi bilinçlidir, bu yüzden sunucu ve
   * tarayıcı aynı sonucu üretir (hydration uyuşmazlığı yok).
   */
  today?: string;
  /** "Kim" sütunu — ekip raporunda var, kişisel raporda yok. */
  showWho?: boolean;
}) {
  const todayIso = today ?? istanbulTodayISO();
  const [sort, setSort] = useState<SortKey>("due_date");
  const [dir, setDir] = useState<Dir>("asc");
  const [query, setQuery] = useState("");
  /* Uzun listede her tuşa basımda yeniden sıralama yapmak yazmayı takıyordu;
     ertelenmiş değer aramayı akıcı tutar, sonuç bir kare sonra oturur. */
  const deferredQuery = useDeferredValue(query);

  function toggle(key: SortKey) {
    if (key === sort) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSort(key); setDir("asc"); }
  }

  const rows = useMemo(() => {
    const q = deferredQuery.trim().toLocaleLowerCase("tr");
    const filtered = q
      ? tasks.filter((t) => {
          const who = showWho && t.assignee_id ? nameOf[t.assignee_id] ?? "" : "";
          return (
            t.title.toLocaleLowerCase("tr").includes(q) ||
            who.toLocaleLowerCase("tr").includes(q)
          );
        })
      : tasks;

    const key = (t: DueSoonTask): string => {
      switch (sort) {
        // Tarihsiz iş en SONA — "ne zaman?" cevapsız kalanlar listeyi
        // yönetmesin ama kaybolmasın da.
        case "due_date": return t.due_date || "9999-99-99";
        case "who": return t.assignee_id ? nameOf[t.assignee_id] ?? "" : "￿";
        case "status": return STATUS_LABELS[t.status] ?? "";
        default: return t.title;
      }
    };
    return [...filtered].sort((a, b) => {
      const r = key(a).localeCompare(key(b), "tr");
      return dir === "asc" ? r : -r;
    });
  }, [tasks, nameOf, sort, dir, deferredQuery, showWho]);

  return (
    <div className="rounded-card border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <h2 className="text-[13.5px] font-semibold tracking-tight text-ink">
          {showWho ? "Tüm işler" : "İşlerim"}
        </h2>
        <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2 text-subtle" aria-hidden />
          <TextInput
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={showWho ? "İş veya kişi ara…" : "İş ara…"}
            aria-label={showWho ? "İş veya kişi ara" : "İş ara"}
            className={cn("h-8 pl-8 text-[13px]", query && "pr-8")}
          />
          {/* Aramayı temizlemek için alanı elle silmek gerekiyordu. */}
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Aramayı temizle"
              title="Aramayı temizle"
              className="absolute right-1 top-1/2 z-10 grid size-6 -translate-y-1/2 place-items-center rounded-control text-subtle transition-colors duration-150 hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring"
            >
              <X size={13} aria-hidden />
            </button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          compact
          title={query ? "Eşleşen iş yok." : "Açık iş yok."}
          description={query ? "Farklı bir kelime deneyin." : "Şu an açık bir iş görünmüyor."}
          action={
            query ? (
              <Button variant="secondary" onClick={() => setQuery("")}>
                Aramayı temizle
              </Button>
            ) : undefined
          }
        />
      ) : (
        /* Geniş tablo KENDİ kabında kayar — sayfa gövdesi yatayda kaymaz. */
        <div className="overflow-x-auto">
          <table className={cn("w-full text-left text-sm", showWho ? "min-w-[600px]" : "min-w-[420px]")}>
            <thead>
              <tr>
                <Th><SortHeader active={sort === "title"} dir={dir} onSort={() => toggle("title")}>İş</SortHeader></Th>
                {showWho && (
                  <Th className="w-40"><SortHeader active={sort === "who"} dir={dir} onSort={() => toggle("who")}>Kim</SortHeader></Th>
                )}
                <Th className="w-36"><SortHeader active={sort === "status"} dir={dir} onSort={() => toggle("status")}>Durum</SortHeader></Th>
                {/* Tarih sağa yaslı: rakamlar alt alta hizalanır, göz tek
                    sütunda tarar. */}
                <Th className="w-28 text-right"><SortHeader align="right" active={sort === "due_date"} dir={dir} onSort={() => toggle("due_date")}>Teslim</SortHeader></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const who = t.assignee_id ? nameOf[t.assignee_id] : null;
                const late = !!t.due_date && t.due_date < todayIso;
                return (
                  <tr key={t.id} className="group border-b border-hairline last:border-b-0 transition-colors duration-150 hover:bg-surface-hover">
                    <td className="px-3 py-2">
                      <Link
                        prefetch={false}
                        href={`/tasks/${t.id}`}
                        className="text-[13.5px] font-medium text-ink transition-colors duration-150 group-hover:text-brand"
                      >
                        {t.title}
                      </Link>
                    </td>
                    {showWho && (
                      <td className="px-3 py-2 text-[13px] text-muted">
                        {who ? getPersonDisplayName(who) : "—"}
                      </td>
                    )}
                    <td className="px-3 py-2 text-[13px] text-muted">
                      {STATUS_LABELS[t.status] ?? t.status}
                    </td>
                    <td className={cn(
                      "whitespace-nowrap px-3 py-2 text-right text-[13px] font-medium tabular-nums",
                      late ? "text-danger" : "text-muted",
                    )}>
                      {late && <span className="sr-only">Gecikti: </span>}
                      {t.due_date
                        ? formatDateTR(t.due_date, { day: "numeric", month: "short" })
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Başlık hücresi — sıralama düğmesini taşır. */
function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn("border-b border-line px-3 py-2.5 text-left", className)}>{children}</th>;
}
