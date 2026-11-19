"use client";

import { useMemo, useState } from "react";
import { Plus, Search, UserRound } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { CustomerDialog } from "@/components/customers/CustomerDialog";
import { fmtDay, groupByYear, STATUS_LABEL, type Customer, type CustomerTier } from "@/lib/customers/model";

/**
 * BİR KATMANIN KİŞİLERİ — yıla göre gruplu (bu yıl · geçen yıl · öncekiler).
 * Satırda: ad · e-posta · telefon · son işlem. Adres hatalıysa ya da kişi
 * abonelikten çıktıysa TEK rozet (silinmez, işaretlenir). Satıra tıklayınca
 * kişi kartı açılır.
 */
const ROW_GRID = "grid grid-cols-1 gap-x-4 gap-y-0.5 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_9.5rem_7.5rem_8.5rem]";

export function CustomerList({
  tier, initialQuery, rows, canMarkTop, thisYear,
}: {
  tier: CustomerTier | null;
  initialQuery: string;
  rows: Customer[];
  canMarkTop: boolean;
  thisYear: number;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState<Customer | "new" | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    if (!q) return rows;
    /* Telefon yalnız arama RAKAMLARDAN oluşuyorsa aranır ("sahte003"teki
       "003" bütün numaralara takılmasın). */
    const digits = /^[\d\s+()-]+$/.test(q) ? q.replace(/\D/g, "") : "";
    return rows.filter((c) =>
      c.full_name.toLocaleLowerCase("tr").includes(q)
      || c.email.includes(q)
      || (digits.length >= 3 && c.phone.replace(/\D/g, "").includes(digits)));
  }, [rows, query]);
  const groups = useMemo(() => groupByYear(shown, thisYear), [shown, thisYear]);

  return (
    <div className="anim-fade">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {tier && <h2 className="mr-1 text-lg font-semibold tracking-tight text-ink sm:text-xl">{tier}</h2>}
        <div className="relative w-full min-w-0 sm:w-auto sm:max-w-sm sm:flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
          <TextInput
            type="search"
            aria-label="Kişi ara"
            placeholder="Ad, e-posta ya da telefon"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <span className="text-[12.5px] tabular-nums text-muted">{shown.length.toLocaleString("tr-TR")} kişi</span>
        <Button size="sm" className="ml-auto" onClick={() => setOpen("new")}>
          <Plus size={14} aria-hidden /> Yeni kişi
        </Button>
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={UserRound} title={rows.length === 0 ? "Henüz kişi yok" : "Kişi bulunamadı"} />
      ) : (
        <>
          <div className={cn(ROW_GRID, "mb-1.5 hidden px-3 text-[12px] font-semibold uppercase tracking-[0.05em] text-muted md:grid")}>
            <span>Ad Soyad</span>
            <span>E-posta</span>
            <span>Telefon</span>
            <span>Son işlem</span>
            <span />
          </div>
          {groups.map((g) => (
            <section key={g.key} className="mb-4">
              <h3 className="mb-1.5 px-1 text-[12.5px] font-semibold tabular-nums text-muted">{g.label}</h3>
              <ul className="divide-y divide-line rounded-card border border-line bg-surface">
                {g.rows.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setOpen(c)}
                      className={cn(ROW_GRID, "w-full items-center px-3 py-2.5 text-left transition-all hover:bg-surface-hover")}
                    >
                      <span className="truncate text-[14px] font-medium text-ink">{c.full_name || "—"}</span>
                      <span className="truncate text-[13px] text-muted">{c.email}</span>
                      <span className="truncate text-[13px] tabular-nums text-muted">{c.phone}</span>
                      <span className="text-[13px] tabular-nums text-muted">{fmtDay(c.last_activity)}</span>
                      <span className="md:text-right">
                        {c.email_status !== "ok" && (
                          <span className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-[12px] font-medium",
                            c.email_status === "hatali" ? "bg-danger/10 text-danger" : "bg-surface-sunken text-muted",
                          )}>
                            {STATUS_LABEL[c.email_status]}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}

      {open && (
        <CustomerDialog
          key={open === "new" ? "new" : open.id}
          customer={open === "new" ? null : open}
          defaultTier={tier ?? "C"}
          canMarkTop={canMarkTop}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
