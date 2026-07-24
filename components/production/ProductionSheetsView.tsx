"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import {
  Plus, Search, ClipboardList, Archive, ArrowUpRight, User, Clock, FileDown, FileSpreadsheet,
} from "lucide-react";
import { archiveProductionSheet } from "@/lib/actions/production";
import { cn } from "@/lib/utils/cn";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import type { ProductionSheet } from "@/types";

/** Liste yalnızca meta kolonlarını taşır (jsonb blokları düzenleyicide). */
export type ProductionListItem = Pick<
  ProductionSheet,
  | "id" | "workspace_id" | "title" | "status" | "product_code" | "product_kind"
  | "producer" | "delivery_date" | "season" | "photo_refs" | "created_by" | "updated_by"
  | "archived_at" | "created_at" | "updated_at"
>;

/** Kapak görseli — önce teknik çizim, yoksa ilk görsel. */
function coverImage(s: ProductionListItem): string | null {
  const imgs = Array.isArray(s.photo_refs) ? s.photo_refs : [];
  const drawing = imgs.find((i) => i?.section === "technical_drawing" && i?.url);
  return (drawing ?? imgs.find((i) => i?.url))?.url ?? null;
}

interface Props {
  sheets: ProductionListItem[];
  memberNames: Record<string, string>;
  isAdmin: boolean;
}

function norm(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/İ/g, "i");
}

const STATUS_TONE: Record<ProductionSheet["status"], string> = {
  draft: "bg-surface-muted text-muted",
  active: "bg-emerald-50 text-emerald-700",
  archived: "bg-surface-muted text-subtle",
};
const STATUS_LABEL: Record<ProductionSheet["status"], string> = {
  draft: "Taslak",
  active: "Aktif",
  archived: "Arşiv",
};

export function ProductionSheetsView({ sheets, memberNames, isAdmin }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [isArchiving, startArchive] = useTransition();

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    return sheets.filter((s) => {
      if (!showArchived && s.status === "archived") return false;
      if (!q) return true;
      return norm(
        [s.title, s.product_code, s.product_kind, s.producer].filter(Boolean).join(" "),
      ).includes(q);
    });
  }, [sheets, query, showArchived]);

  function handleArchive(s: ProductionListItem) {
    if (!confirm(`"${s.title}" föyünü arşivlemek istiyor musunuz?`)) return;
    startArchive(async () => {
      await archiveProductionSheet(s.id);
      router.refresh();
    });
  }

  function relTime(iso: string): string {
    try {
      return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: tr });
    } catch {
      return "";
    }
  }

  const nameOf = (id: string | null) => (id && memberNames[id]) || "—";

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <ModulePageHeader
        title="Üretim Föyü"
        description="Her ürün bir föy. Ölçüler, beden dağılımı ve talimatları buradan girin — kimin girdiği herkese görünür."
        icon={ClipboardList}
        secondaryBackHref="/board"
        rightSlot={
          <div className="flex shrink-0 items-center gap-2">
            {sheets.some((s) => s.status !== "archived") && (
              <a
                href="/production/export-all"
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-surface-muted hover:text-ink"
                title="Tüm föyleri tek Excel dosyası olarak indir (her föy ayrı sekme)"
              >
                <FileSpreadsheet size={15} />
                Tümünü indir
              </a>
            )}
            <Link
              href="/production/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-brand-strong"
            >
              <Plus size={15} />
              Yeni föy
            </Link>
          </div>
        }
      />

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ürün adı, kod veya üretici ara…"
            className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-ring focus:border-brand-ring"
          />
        </div>
        <label className="flex items-center gap-1.5 text-[12.5px] text-muted">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="accent-brand" />
          Arşivi göster
        </label>
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface px-6 py-14 text-center shadow-card">
          <p className="text-[13.5px] text-subtle">
            {sheets.length === 0
              ? "Henüz üretim föyü eklenmedi. İlk ürününüz için bir föy oluşturun."
              : "Aramaya uyan föy bulunamadı."}
          </p>
          {sheets.length === 0 && (
            <Link
              href="/production/new"
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-brand-strong"
            >
              <Plus size={15} />
              İlk föyü oluştur
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((s) => (
            <div key={s.id} className="group flex flex-col rounded-2xl border border-line bg-surface p-4 shadow-card transition-shadow hover:shadow-pop">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {s.product_kind && (
                    <span className="rounded-md bg-surface-muted px-2 py-0.5 text-[10.5px] font-medium text-muted">
                      {s.product_kind}
                    </span>
                  )}
                  <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-medium", STATUS_TONE[s.status])}>
                    {STATUS_LABEL[s.status]}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <a
                    href={`/production/${s.id}/export`}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded-md p-1 text-subtle transition-colors hover:bg-surface-muted hover:text-ink"
                    title="Föyü Excel (.xlsx) olarak indir"
                  >
                    <FileDown size={13} />
                  </a>
                  {isAdmin && s.status !== "archived" && (
                    <button
                      onClick={() => handleArchive(s)}
                      disabled={isArchiving}
                      className="rounded-md p-1 text-subtle transition-colors hover:bg-surface-muted hover:text-ink"
                      title="Arşivle"
                    >
                      <Archive size={13} />
                    </button>
                  )}
                </div>
              </div>

              <Link href={`/production/${s.id}`} className="flex min-w-0 items-start gap-3">
                {/* Kapak görseli — hızlı görsel tanıma için küçük önizleme */}
                {coverImage(s) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={coverImage(s)!}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-lg border border-line object-cover"
                  />
                ) : (
                  <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg border border-dashed border-line bg-surface-muted text-subtle">
                    <ClipboardList size={18} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="flex items-start justify-between gap-2 text-[14px] font-medium leading-snug text-ink transition-colors group-hover:text-brand-strong">
                    <span className="min-w-0">{s.title}</span>
                    <ArrowUpRight size={14} className="mt-0.5 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
                  </h3>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-subtle">
                    {s.product_code && <span>Kod: {s.product_code}</span>}
                    {s.producer && <span>Üretici: {s.producer}</span>}
                    {s.delivery_date && <span>Teslim: {s.delivery_date}</span>}
                  </div>
                </div>
              </Link>

              {/* Kim girdi — föy düzeyi iz */}
              <div className="mt-3 space-y-1 border-t border-line/60 pt-2.5 text-[11px] text-subtle">
                <span className="flex items-center gap-1.5">
                  <User size={11} className="shrink-0 text-subtle" />
                  Oluşturan: <span className="font-medium text-muted">{nameOf(s.created_by)}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock size={11} className="shrink-0 text-subtle" />
                  Son giren: <span className="font-medium text-muted">{nameOf(s.updated_by)}</span>
                  <span className="text-subtle">· {relTime(s.updated_at)}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 px-1 text-[12px] text-subtle">{filtered.length} föy gösteriliyor</p>
    </div>
  );
}
