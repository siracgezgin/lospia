"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus, Search, ClipboardList, Archive, FileDown, FileSpreadsheet,
} from "lucide-react";
import { archiveProductionSheet } from "@/lib/actions/production";
import { cn } from "@/lib/utils/cn";
import { useConfirm } from "@/components/ui/useConfirm";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import type { ProductionSheet } from "@/types";

/** Liste yalnızca meta kolonlarını taşır (jsonb blokları düzenleyicide). */
export type ProductionListItem = Pick<
  ProductionSheet,
  | "id" | "workspace_id" | "title" | "status" | "product_code" | "product_kind"
  | "producer" | "delivery_date" | "season" | "photo_refs" | "created_by" | "updated_by"
  | "archived_at" | "created_at" | "updated_at"
>;

/**
 * Kapak görseli — ÜRÜNÜN KENDİ FOTOĞRAFI (dekupe).
 *
 * Aslı Hanım (2026-08-24): "Buradaki ana sayfadaki fotoğraflar dekupeler olsun.
 * Yani denim yelek kod kumaşı olmasın — denim yeleğin fotoğrafı olsun."
 *
 * Liste eskiden teknik çizimi öne alıyordu; kapakta ürün yerine kalıp krokisi
 * ya da kumaş kodu görünüyordu. Sıralama artık şu: önce ürün fotoğrafı
 * (general), sonra süsleme/aksesuar gibi ürün üstü çekimler, kumaş swatch'ı ve
 * teknik çizim ise EN SON — başka hiçbir görsel yoksa.
 */
const COVER_PRIORITY = ["general", "embellishments", "accessories", "sewing", "fabric"] as const;

function coverImage(s: ProductionListItem): string | null {
  const imgs = (Array.isArray(s.photo_refs) ? s.photo_refs : []).filter((i) => i?.url);
  for (const section of COVER_PRIORITY) {
    const hit = imgs.find((i) => i.section === section);
    if (hit) return hit.url;
  }
  // Hiç ürün görseli yoksa teknik çizim boş kapaktan iyidir.
  return imgs[0]?.url ?? null;
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

export function ProductionSheetsView({ sheets, isAdmin }: Props) {
  const { ask, dialog } = useConfirm();
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

  async function handleArchive(s: ProductionListItem) {
    if (!(await ask({
      tone: "default",
      title: "Föy arşivlensin mi?",
      message: `"${s.title}" listeden kalkar ama SİLİNMEZ; arşivden geri alınabilir.`,
      confirmLabel: "Arşivle",
    }))) return;
    startArchive(async () => {
      await archiveProductionSheet(s.id);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <ModulePageHeader
        title="Production Sheet"
        description="Her ürün bir föy. Ölçüler, beden dağılımı ve talimatları buradan girin — kimin girdiği herkese görünür."
        icon={ClipboardList}
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
        /* GÖRSEL ÖNCE.
           Kart eskiden 56px'lik bir küçük resim + üstünde iki rozet + altında
           iki satır iz kaydı taşıyordu; ürün, kendi föyünün kartında en küçük
           öğeydi. Aslı Hanım (2026-08-24): "Buradaki fotoğraflar dekupeler
           olsun… denim yeleğin fotoğrafı olsun." Ekibi görsel çalışıyor: kart
           artık büyük ürün fotoğrafıyla açılıyor, yazı fotoğrafın altında.
           Durum rozeti yalnız Taslak/Arşiv için çizilir — "Aktif" rozeti her
           kartta tekrarlayan, hiçbir şey söylemeyen bir etiketti. */
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((s) => {
            const cover = coverImage(s);
            return (
              <div key={s.id} className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition-shadow hover:shadow-pop">
                <Link href={`/production/${s.id}`} className="flex min-w-0 flex-1 flex-col">
                  <div className="relative aspect-[3/4] w-full overflow-hidden bg-surface-muted">
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cover}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-300 ease-standard group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-subtle">
                        <ClipboardList size={26} strokeWidth={1.5} />
                      </div>
                    )}
                    {s.status !== "active" && (
                      <span className={cn("absolute left-2 top-2 rounded-md px-2 py-0.5 text-[10.5px] font-medium shadow-sm", STATUS_TONE[s.status])}>
                        {STATUS_LABEL[s.status]}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 px-3 pb-3 pt-2.5">
                    <h3 className="truncate text-[13.5px] font-medium leading-snug text-ink transition-colors group-hover:text-brand-strong" title={s.title}>
                      {s.title}
                    </h3>
                    {/* Kod ve teslim tarihi — föyün kimliği ve tarihi. Üretici,
                        ürün türü ve iz kaydı (kim oluşturdu / kim son girdi)
                        kartta değil, föyün kendi sayfasında. */}
                    <p className="mt-0.5 truncate text-[12px] text-subtle">
                      {[s.product_code, s.delivery_date].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                </Link>

                {/* İndir / arşivle — fotoğrafın üstünde, yalnız fare gelince */}
                <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <a
                    href={`/production/${s.id}/export`}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded-md bg-surface/90 p-1.5 text-muted shadow-sm backdrop-blur transition-colors hover:text-ink"
                    title="Föyü Excel (.xlsx) olarak indir"
                  >
                    <FileDown size={13} />
                  </a>
                  {isAdmin && s.status !== "archived" && (
                    <button
                      onClick={() => handleArchive(s)}
                      disabled={isArchiving}
                      className="rounded-md bg-surface/90 p-1.5 text-muted shadow-sm backdrop-blur transition-colors hover:text-ink"
                      title="Arşivle"
                    >
                      <Archive size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {dialog}
    </div>
  );
}
