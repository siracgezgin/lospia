"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatDateTR } from "@/lib/utils/format-date";
import { getPersonDisplayName } from "@/lib/utils/person-display";
import { STATUS_LABELS } from "@/lib/utils/task-constants";
import { SortHeader } from "@/components/ui/SortHeader";
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
 * sadelik kuralı — puanlayan sayı yasak, tarif eden serbest).
 */
export function DeliveryTable({
  tasks, nameOf,
}: {
  tasks: DueSoonTask[];
  nameOf: Record<string, string>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [sort, setSort] = useState<SortKey>("due_date");
  const [dir, setDir] = useState<Dir>("asc");
  const [query, setQuery] = useState("");

  function toggle(key: SortKey) {
    if (key === sort) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSort(key); setDir("asc"); }
  }

  const rows = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    const filtered = q
      ? tasks.filter((t) => {
          const who = t.assignee_id ? nameOf[t.assignee_id] ?? "" : "";
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
  }, [tasks, nameOf, sort, dir, query]);

  return (
    <div className="rounded-2xl border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <h2 className="text-sm font-semibold text-ink">Tüm işler</h2>
        <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="İş veya kişi ara…"
            className="h-8 w-full rounded-lg border border-line bg-surface pl-8 pr-3 text-[13px] text-ink placeholder:text-subtle transition-colors hover:border-line-strong focus:border-brand-ring focus:outline-none focus:ring-2 focus:ring-brand-ring/40"
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-[13px] text-subtle">Eşleşen iş yok.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead>
              <tr>
                <Th><SortHeader active={sort === "title"} dir={dir} onSort={() => toggle("title")}>İş</SortHeader></Th>
                <Th className="w-40"><SortHeader active={sort === "who"} dir={dir} onSort={() => toggle("who")}>Kim</SortHeader></Th>
                <Th className="w-36"><SortHeader active={sort === "status"} dir={dir} onSort={() => toggle("status")}>Durum</SortHeader></Th>
                <Th className="w-28"><SortHeader active={sort === "due_date"} dir={dir} onSort={() => toggle("due_date")}>Teslim</SortHeader></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const who = t.assignee_id ? nameOf[t.assignee_id] : null;
                const late = !!t.due_date && t.due_date < today;
                return (
                  <tr key={t.id} className="group border-b border-hairline last:border-b-0 transition-colors hover:bg-surface-hover">
                    <td className="px-3 py-2">
                      <Link
                        prefetch={false}
                        href={`/tasks/${t.id}`}
                        className="font-medium text-ink transition-colors group-hover:text-brand"
                      >
                        {t.title}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-[13px] text-muted">
                      {who ? getPersonDisplayName(who) : "—"}
                    </td>
                    <td className="px-3 py-2 text-[13px] text-muted">
                      {STATUS_LABELS[t.status] ?? t.status}
                    </td>
                    <td className={cn(
                      "whitespace-nowrap px-3 py-2 text-[13px] font-medium tabular-nums",
                      late ? "text-danger" : "text-muted",
                    )}>
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
