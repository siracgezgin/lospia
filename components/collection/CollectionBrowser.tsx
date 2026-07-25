"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Boxes, Plus, Search, ChevronRight, ChevronDown, ArrowUpRight, FileDown,
  FileSpreadsheet, Wallet, ClipboardList, Tag,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { COLLECTION_TAXONOMY, categoryLabel, subcategoryLabel } from "@/lib/collection/taxonomy";
import { costOfSheet, formatMoney } from "@/lib/collection/cost";
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
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-surface-muted hover:text-ink"
                title="Tüm föyleri tek Excel dosyası olarak indir"
              >
                <FileSpreadsheet size={15} /> Tümünü indir
              </a>
            )}
            <Link
              href="/production/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-brand-strong"
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
          className="flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-[13px] font-medium text-muted transition-colors hover:text-ink"
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
                "flex w-full items-center justify-between rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                !selCat ? "bg-brand/10 text-brand-strong" : "text-muted hover:bg-surface-muted hover:text-ink",
              )}
            >
              <span>Tüm ürünler</span>
              <span className="text-[11px] text-subtle">{visible.length}</span>
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
                        "flex items-center rounded-lg text-[13px] transition-colors",
                        active && !selSub ? "bg-brand/10 text-brand-strong" : "text-muted hover:bg-surface-muted",
                      )}
                    >
                      {hasSubs ? (
                        <button
                          onClick={() => toggleOpen(c.key)}
                          className="shrink-0 rounded-l-lg p-2 text-subtle hover:text-ink"
                          aria-label={open ? "Kapat" : "Aç"}
                        >
                          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      ) : (
                        <span className="w-[30px] shrink-0" />
                      )}
                      <button
                        onClick={() => selectCat(c.key)}
                        className="flex flex-1 items-center justify-between py-2 pr-3 text-left font-medium"
                      >
                        <span>{c.label}</span>
                        <span className="text-[11px] text-subtle">{count}</span>
                      </button>
                    </div>
                    {hasSubs && open && (
                      <div className="ml-4 space-y-0.5 border-l border-line pl-1.5">
                        {c.subcategories.map((sub) => {
                          const sc = counts.sub[`${c.key}/${sub.key}`] ?? 0;
                          const subActive = selCat === c.key && selSub === sub.key;
                          return (
                            <button
                              key={sub.key}
                              onClick={() => selectSub(c.key, sub.key)}
                              className={cn(
                                "flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-[12.5px] transition-colors",
                                subActive ? "bg-brand/10 font-medium text-brand-strong" : "text-muted hover:bg-surface-muted hover:text-ink",
                              )}
                            >
                              <span>{sub.label}</span>
                              <span className="text-[10.5px] text-subtle">{sc || ""}</span>
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
                    "flex w-full items-center justify-between rounded-lg px-3 py-2 text-[13px] transition-colors",
                    selCat === UNCAT ? "bg-brand/10 font-medium text-brand-strong" : "text-muted hover:bg-surface-muted hover:text-ink",
                  )}
                >
                  <span className="pl-[30px]">Kategorisiz</span>
                  <span className="text-[11px] text-subtle">{counts.cat[UNCAT]}</span>
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* Sağ — föy kartları */}
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold text-ink">{headingLabel}</h2>
            <div className="relative min-w-[200px]">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ürün ara…"
                className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-ring focus:border-brand-ring"
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-line bg-surface px-6 py-14 text-center shadow-card">
              <p className="text-[13.5px] text-subtle">
                {visible.length === 0
                  ? "Henüz ürün eklenmedi. İlk föyü oluşturun."
                  : "Bu kategoride ürün bulunamadı."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((s) => {
                const cost = costOfSheet(s);
                return (
                  <div key={s.id} className="group flex flex-col rounded-2xl border border-line bg-surface p-4 shadow-card transition-shadow hover:shadow-pop">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        {s.category && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-surface-muted px-2 py-0.5 text-[10.5px] font-medium text-muted">
                            <Tag size={10} />
                            {categoryLabel(s.category)}
                            {s.subcategory && <span className="text-subtle">· {subcategoryLabel(s.category, s.subcategory)}</span>}
                          </span>
                        )}
                      </div>
                      <a
                        href={`/production/${s.id}/export`}
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 rounded-md p-1 text-subtle transition-colors hover:bg-surface-muted hover:text-ink"
                        title="Föyü Excel olarak indir"
                      >
                        <FileDown size={13} />
                      </a>
                    </div>

                    <Link href={`/production/${s.id}`} className="flex min-w-0 items-start gap-3">
                      {coverImage(s) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={coverImage(s)!} alt="" className="h-16 w-16 shrink-0 rounded-lg border border-line object-cover" />
                      ) : (
                        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-lg border border-dashed border-line bg-surface-muted text-subtle">
                          <ClipboardList size={18} />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <h3 className="flex items-start justify-between gap-2 text-[14px] font-medium leading-snug text-ink transition-colors group-hover:text-brand-strong">
                          <span className="min-w-0">{s.title}</span>
                          <ArrowUpRight size={14} className="mt-0.5 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
                        </h3>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-subtle">
                          {s.product_kind && <span>{s.product_kind}</span>}
                          {s.producer && <span>Üretici: {s.producer}</span>}
                        </div>
                      </div>
                    </Link>

                    {/* Maliyet özeti — föy pricing + beden dağılımı toplamından */}
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line/60 pt-2.5 text-[11.5px]">
                      <span className="text-subtle">Adet: <span className="font-semibold text-ink">{cost.qty || "—"}</span></span>
                      <span className="text-subtle">Birim: <span className="font-semibold text-ink">{cost.unitPrice ? formatMoney(cost.unitPrice) : "—"}</span></span>
                      <span className="ml-auto font-bold text-ink">{cost.lineTotal ? formatMoney(cost.lineTotal) : "—"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <p className="mt-3 px-1 text-[12px] text-subtle">{filtered.length} ürün gösteriliyor</p>
        </div>
      </div>
    </div>
  );
}
