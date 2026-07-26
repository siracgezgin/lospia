"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Boxes, Plus, Search, ChevronRight, FileDown,
  FileSpreadsheet, ClipboardList, Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { COLLECTION_TAXONOMY, categoryLabel, subcategoryLabel } from "@/lib/collection/taxonomy";
import type { ProductionSheet } from "@/types";

/** Tarayıcı yalnızca meta + kategori + fiyat + beden dağılımı taşır. */
export type CollectionItem = Pick<
  ProductionSheet,
  | "id" | "workspace_id" | "title" | "status" | "product_code" | "product_kind"
  | "producer" | "delivery_date" | "season" | "photo_refs" | "category" | "subcategory"
  | "pricing" | "size_distribution" | "created_by" | "updated_by" | "archived_at"
  | "created_at" | "updated_at"
>;

interface Props {
  sheets: CollectionItem[];
  memberNames: Record<string, string>;
  isAdmin: boolean;
}

const UNCAT = "__uncat__";

function norm(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c").replace(/İ/g, "i");
}

function coverImage(s: CollectionItem): string | null {
  const imgs = Array.isArray(s.photo_refs) ? s.photo_refs : [];
  const drawing = imgs.find((i) => i?.section === "technical_drawing" && i?.url);
  return (drawing ?? imgs.find((i) => i?.url))?.url ?? null;
}

export function CollectionBrowser({ sheets }: Props) {
  const [query, setQuery] = useState("");
  // Seçim: null = tümü. category = ana kategori anahtarı ya da UNCAT. sub = alt kategori.
  const [selCat, setSelCat] = useState<string | null>(null);
  const [selSub, setSelSub] = useState<string | null>(null);
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});

  const visible = useMemo(() => sheets.filter((s) => s.status !== "archived"), [sheets]);

  // Kategori/alt kategori sayaçları (arşivsiz).
  const counts = useMemo(() => {
    const cat: Record<string, number> = {};
    const sub: Record<string, number> = {};
    for (const s of visible) {
      const c = s.category ?? UNCAT;
      cat[c] = (cat[c] ?? 0) + 1;
      if (s.category && s.subcategory) {
        const k = `${s.category}/${s.subcategory}`;
        sub[k] = (sub[k] ?? 0) + 1;
      }
    }
    return { cat, sub };
  }, [visible]);

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    return visible.filter((s) => {
      if (selCat) {
        const c = s.category ?? UNCAT;
        if (c !== selCat) return false;
        if (selSub && s.subcategory !== selSub) return false;
      }
      if (!q) return true;
      return norm([s.title, s.product_code, s.product_kind, s.producer].filter(Boolean).join(" ")).includes(q);
    });
  }, [visible, query, selCat, selSub]);

  const hasUncat = (counts.cat[UNCAT] ?? 0) > 0;

  const selectAll = () => { setSelCat(null); setSelSub(null); };
  const selectCat = (key: string) => {
    setSelCat(key); setSelSub(null);
    setOpenCats((o) => ({ ...o, [key]: true }));
  };
  const selectSub = (cat: string, sub: string) => { setSelCat(cat); setSelSub(sub); };
  const toggleOpen = (key: string) => setOpenCats((o) => ({ ...o, [key]: !o[key] }));

  const headingLabel = !selCat
    ? "Tüm ürünler"
    : selCat === UNCAT
      ? "Kategorisiz"
      : selSub
        ? `${categoryLabel(selCat)} · ${subcategoryLabel(selCat, selSub)}`
        : categoryLabel(selCat);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      <ModulePageHeader
        title="Koleksiyon"
        description="Ürünler web sitesindeki gibi kategorilere ayrılır — her ürünün üretim föyü ve maliyeti bir arada."
        icon={Boxes}
        secondaryBackHref="/board"
        rightSlot={
          <div className="flex shrink-0 items-center gap-2">
            {visible.length > 0 && (
              <a
                href="/production/export-all"
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-2 text-[13px] font-medium text-muted transition-[background-color,border-color,color,transform] duration-150 ease-standard hover:border-line-strong hover:bg-surface-muted hover:text-ink active:scale-[0.98]"
                title="Tüm föyleri tek Excel dosyası olarak indir"
              >
                <FileSpreadsheet size={15} /> Tümünü indir
              </a>
            )}
            <Link
              href="/production/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[13px] font-medium text-white transition-[background-color,transform] duration-150 ease-standard hover:bg-brand-strong active:scale-[0.98]"
            >
              <Plus size={15} /> Yeni föy
            </Link>
          </div>
        }
      />

      {/* Sekme çubuğu — Üretim Föyleri (aktif) | Maliyet */}
      <div className="mb-4 flex items-center gap-1 border-b border-line">
        <span className="flex items-center gap-1.5 border-b-2 border-brand px-3 py-2 text-[13px] font-semibold text-ink">
          <ClipboardList size={15} /> Üretim Föyleri
        </span>
        <Link
          href="/collection/maliyet"
          className="flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-[13px] font-medium text-muted transition-colors duration-150 hover:border-line-strong hover:text-ink"
        >
          <Wallet size={15} /> Maliyet
        </Link>
      </div>

      <div className="flex flex-col gap-5 lg:flex-row">
        {/* Sol — kategori ağacı (web nav yapısı) */}
        <aside className="shrink-0 lg:w-60">
          <div className="rounded-xl border border-line bg-surface p-2 shadow-card">
            <button
              onClick={selectAll}
              className={cn(
                "flex w-full items-center justify-between rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-150",
                !selCat ? "bg-brand-soft text-brand-strong" : "text-muted hover:bg-surface-muted hover:text-ink",
              )}
            >
              <span>Tüm ürünler</span>
              <span className={cn("text-[11px] tabular-nums", !selCat ? "text-brand" : "text-subtle")}>{visible.length}</span>
            </button>

            <div className="mt-1 space-y-0.5">
              {COLLECTION_TAXONOMY.map((c) => {
                const count = counts.cat[c.key] ?? 0;
                const open = openCats[c.key] ?? false;
                const hasSubs = c.subcategories.length > 0;
                const active = selCat === c.key;
                return (
                  <div key={c.key}>
                    <div
                      className={cn(
                        "flex items-center rounded-lg text-[13px] transition-colors duration-150",
                        active && !selSub ? "bg-brand-soft text-brand-strong" : "text-muted hover:bg-surface-muted",
                      )}
                    >
                      {hasSubs ? (
                        <button
                          onClick={() => toggleOpen(c.key)}
                          className="shrink-0 rounded-l-lg p-2 text-subtle transition-colors duration-150 hover:text-ink"
                          aria-label={open ? "Kapat" : "Aç"}
                        >
                          <ChevronRight
                            size={14}
                            className={cn("transition-transform duration-200 ease-standard", open && "rotate-90")}
                          />
                        </button>
                      ) : (
                        <span className="w-[30px] shrink-0" />
                      )}
                      <button
                        onClick={() => selectCat(c.key)}
                        className="flex flex-1 items-center justify-between py-2 pr-3 text-left font-medium"
                      >
                        <span>{c.label}</span>
                        <span className={cn("text-[11px] tabular-nums", active && !selSub ? "text-brand" : "text-subtle")}>{count}</span>
                      </button>
                    </div>
                    {hasSubs && open && (
                      <div className="anim-fade-down ml-4 space-y-0.5 border-l border-line pl-1.5">
                        {c.subcategories.map((sub) => {
                          const sc = counts.sub[`${c.key}/${sub.key}`] ?? 0;
                          const subActive = selCat === c.key && selSub === sub.key;
                          return (
                            <button
                              key={sub.key}
                              onClick={() => selectSub(c.key, sub.key)}
                              className={cn(
                                "flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-[12.5px] transition-colors duration-150",
                                subActive ? "bg-brand-soft font-medium text-brand-strong" : "text-muted hover:bg-surface-muted hover:text-ink",
                              )}
                            >
                              <span>{sub.label}</span>
                              <span className={cn("text-[10.5px] tabular-nums", subActive ? "text-brand" : "text-subtle")}>{sc || ""}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {hasUncat && (
                <button
                  onClick={() => selectCat(UNCAT)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-3 py-2 text-[13px] transition-colors duration-150",
                    selCat === UNCAT ? "bg-brand-soft font-medium text-brand-strong" : "text-muted hover:bg-surface-muted hover:text-ink",
                  )}
                >
                  <span className="pl-[30px]">Kategorisiz</span>
                  <span className={cn("text-[11px] tabular-nums", selCat === UNCAT ? "text-brand" : "text-subtle")}>{counts.cat[UNCAT]}</span>
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* Sağ — föy kartları */}
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold tracking-tight text-ink">{headingLabel}</h2>
            <div className="relative min-w-[200px]">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ürün ara…"
                className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-subtle transition-[border-color,box-shadow] duration-150 hover:border-line-strong focus:outline-none focus:ring-2 focus:ring-brand-ring focus:border-brand-ring"
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="anim-fade-up rounded-2xl border border-line bg-surface px-6 py-14 text-center shadow-card">
              <div className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-surface-sunken text-subtle">
                <Boxes size={20} />
              </div>
              <p className="text-[13.5px] text-subtle">
                {visible.length === 0
                  ? "Henüz ürün eklenmedi. İlk föyü oluşturun."
                  : "Bu kategoride ürün bulunamadı."}
              </p>
            </div>
          ) : (
            <div className="stagger-children grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {filtered.map((s) => (
                <Link
                  key={s.id}
                  href={`/production/${s.id}`}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition-[box-shadow,transform,border-color] duration-200 ease-standard hover:-translate-y-px hover:border-line-strong hover:shadow-card-hover"
                >
                  {/* Görsel — katalog hissi: hover'da yumuşak zoom, kart içinde kırpılır */}
                  <div className="aspect-square w-full overflow-hidden bg-surface-muted">
                    {coverImage(s) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={coverImage(s)!}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-300 ease-standard group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-subtle">
                        <ClipboardList size={24} strokeWidth={1.75} />
                      </div>
                    )}
                  </div>
                  {/* İndir — yalnızca hover'da, köşede sade */}
                  <a
                    href={`/production/${s.id}/export`}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-2 top-2 rounded-md bg-surface/90 p-1.5 text-subtle opacity-0 shadow-sm backdrop-blur transition-[opacity,color,transform] duration-150 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 active:scale-95"
                    title="Föyü Excel olarak indir"
                  >
                    <FileDown size={13} />
                  </a>
                  <div className="border-t border-hairline p-3">
                    <h3 className="truncate text-[13.5px] font-medium tracking-tight text-ink transition-colors duration-150 group-hover:text-brand-strong">
                      {s.title}
                    </h3>
                    {s.product_kind && (
                      <p className="mt-0.5 truncate text-[11.5px] text-subtle">{s.product_kind}</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}

          <p className="mt-3 px-1 text-[12px] tabular-nums text-subtle">{filtered.length} ürün gösteriliyor</p>
        </div>
      </div>
    </div>
  );
}
