"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, ImagePlus, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import {
  addUpcycleItem, deleteUpcycleItem, importUpcycle, removeUpcyclePhoto, updateUpcycleItem,
  type UpcycleItemPatch,
} from "@/lib/actions/upcycle";
import { formatDateTr, rowNo } from "@/lib/order-review/model";
import { SECTIONS, SIZES, sizeTotal, UPCYCLE_BUCKET, upcyclePrefix } from "@/lib/upcycle/model";
import { Button, IconButton } from "@/components/ui/Button";
import { Overlay } from "@/components/ui/Overlay";
import { useConfirm } from "@/components/ui/useConfirm";
import { CollectionTabs } from "@/components/collection/PaymentTable";
import {
  AutoText, FIELD, FieldLabel, fmtNumber, InlineInput, parseNumber, PhotoField,
} from "@/components/shared/CardFields";
import type { OrderReviewPhoto, UpcycleItem, UpcycleSection, UpcycleSize } from "@/types";

/**
 * UPCYCLE YAPILACAKLAR LİSTESİ.
 *
 * Gül Hanım'ın Excel'i (04.11.2026); Aslı Hanım "takvim gibi" uygulamada
 * olsun istedi. Calendar gibi TEK yaşayan liste — kutucuk/dönem yok. Excel'in
 * iki bölümü iki sekme: Ürünler · Malzeme listesi (seçili sekme adreste).
 *
 * Order Review ile aynı kart dili (TEK TASARIM DİLİ): ürün başına kart, yatay
 * kaydırma yok; fotoğraflar solda büyük, durum + açıklama ortada, adetler
 * sağda; ekran daraldıkça sütunlar alt alta iner. Her alan yerinde düzenlenir,
 * alandan çıkınca kaydolur.
 */

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const ROOT = "/collection/upcycle";

const norm = (s: string) => s.toLocaleLowerCase("tr").trim();

export function UpcycleBoard({
  initialItems, initialSection, workspaceId, userId, isAdmin, importWarnings,
}: {
  initialItems: UpcycleItem[];
  initialSection: UpcycleSection;
  workspaceId: string;
  userId: string;
  isAdmin: boolean;
  importWarnings: string[];
}) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState(initialItems);
  const [prevInitial, setPrevInitial] = useState(initialItems);
  /* Aktarımdan sonra sayfa tazelenince yeni satırlar ekrana gelsin. */
  if (initialItems !== prevInitial) { setPrevInitial(initialItems); setItems(initialItems); }
  const [section, setSection] = useState<UpcycleSection>(initialSection);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState(importWarnings);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [importing, setImporting] = useState<string | null>(null);
  const [adding, startAdd] = useTransition();
  const [lightbox, setLightbox] = useState<string | null>(null);
  const prefix = upcyclePrefix(workspaceId);

  /* Kayıt bekleyen alan varken sayfadan çıkılırsa tarayıcı uyarır. */
  useEffect(() => {
    if (pending === 0) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [pending]);

  async function track<T>(p: Promise<T>): Promise<T> {
    setPending((n) => n + 1);
    try { return await p; } finally { setPending((n) => n - 1); }
  }

  function switchSection(next: UpcycleSection) {
    setSection(next);
    router.replace(next === "malzeme" ? `${ROOT}?bolum=malzeme` : ROOT, { scroll: false });
  }

  /** Alan kaydı: ekran hemen güncellenir, sunucu cevabı satırı tazeler. */
  async function saveItem(id: string, patch: UpcycleItemPatch) {
    setItems((list) => list.map((it) => (it.id === id ? ({ ...it, ...patch } as UpcycleItem) : it)));
    setError(null);
    try {
      const res = await track(updateUpcycleItem(id, patch));
      if ("error" in res) { setError(`Kaydedilemedi: ${res.error}`); return; }
      setItems((list) => list.map((it) => (it.id === id ? res.item : it)));
    } catch (e) {
      setError(`Kaydedilemedi: ${e instanceof Error ? e.message : "bağlantı kurulamadı"}`);
    }
  }

  async function savePhotos(id: string, key: "before_photos" | "after_photos", next: OrderReviewPhoto[], removed?: OrderReviewPhoto) {
    await saveItem(id, { [key]: next });
    if (removed) await removeUpcyclePhoto(removed.path);
  }

  function addItem() {
    setError(null);
    setQuery("");
    startAdd(async () => {
      try {
        const res = await addUpcycleItem(section);
        if ("error" in res) { setError(res.error); return; }
        setItems((list) => [...list, res.item]);
        requestAnimationFrame(() =>
          document.getElementById(`upcycle-${res.item.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Satır eklenemedi.");
      }
    });
  }

  async function removeItem(it: UpcycleItem, index: number) {
    const name = [it.name, it.color].filter(Boolean).join(" · ") || `${rowNo(index)}. satır`;
    if (!(await ask({ title: "Satır silinsin mi?", message: `“${name}” fotoğraflarıyla birlikte silinir.`, confirmLabel: "Sil", tone: "danger" }))) return;
    const res = await track(deleteUpcycleItem(it.id));
    if ("error" in res) { setError(res.error); return; }
    setItems((list) => list.filter((x) => x.id !== it.id));
  }

  /* EXCEL'DEN AKTAR — dosya önce tarayıcıdan doğrudan depoya gider (sunucu
     eyleminin 4,5 MB'lık gövde sınırı fotoğraflı Excel'i taşımaz). */
  async function importFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setNotice(null);
    if (!/\.(xlsx|xlsm)$/i.test(file.name)) {
      setError("Yalnız .xlsx dosyası aktarılabilir. Eski .xls ise Excel'de .xlsx olarak kaydedin.");
      return;
    }
    if (items.length > 0 && !(await ask({
      title: "Excel listeye eklensin mi?",
      message: "Dosyadaki satırlar listenin sonuna eklenir. Listede zaten olan satırlar atlanır; mevcut hiçbir satır değişmez.",
      confirmLabel: "Ekle",
    }))) {
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setImporting(file.name);
    try {
      const supabase = createBrowserSupabase();
      const path = `${workspaceId}/_imports/${crypto.randomUUID()}.xlsx`;
      const { error: upErr } = await supabase.storage.from("documents").upload(path, file, { contentType: XLSX_MIME, upsert: false });
      if (upErr) { setError(`Dosya yüklenemedi: ${upErr.message}`); return; }
      const res = await importUpcycle(path);
      if ("error" in res) { setError(res.error); return; }
      setNotice(res.added ? `${res.added} satır eklendi.` : null);
      setWarnings(res.warnings);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Excel aktarılamadı.");
    } finally {
      setImporting(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const sectionItems = useMemo(
    () => items.filter((it) => it.section === section).map((it, index) => ({ it, index })),
    [items, section],
  );
  const q = norm(query);
  const visible = q
    ? sectionItems.filter(({ it }) =>
        [it.name, it.color, it.code, it.material_type, it.owners, it.status_note].some((t) => norm(t).includes(q)))
    : sectionItems;
  const lastUpdate = items.reduce<string | null>((m, i) => (!m || i.updated_at > m ? i.updated_at : m), null);
  const noun = section === "urun" ? "Ürün" : "Malzeme";

  const actions = (
    <>
      {pending > 0 && (
        <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted" role="status">
          <Loader2 size={13} className="animate-spin" aria-hidden /> Kaydediliyor…
        </span>
      )}
      <input ref={fileRef} type="file" accept=".xlsx,.xlsm" className="hidden" onChange={(e) => importFile(e.target.files?.[0])} />
      <Button variant="secondary" onClick={() => fileRef.current?.click()} loading={!!importing}>
        {!importing && <FileSpreadsheet size={15} aria-hidden />} Excel&apos;den aktar
      </Button>
      {items.length > 0 && (
        <a
          href={`${ROOT}/export`}
          className="inline-flex h-9 items-center gap-1.5 rounded-control border border-line bg-surface px-3.5 text-[13.5px] font-medium text-ink shadow-card transition-[background-color,border-color] duration-150 hover:border-line-strong hover:bg-surface-muted pointer-coarse:h-11"
        >
          <Download size={15} aria-hidden /> Excel indir
        </a>
      )}
    </>
  );

  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      <h1 className="sr-only">Upcycle</h1>
      <CollectionTabs active="upcycle" actions={actions} />

      {/* BÖLÜM + ARAMA */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Bölüm" className="inline-flex h-9 max-w-full items-center rounded-control border border-line bg-surface-muted p-0.5 pointer-coarse:h-11">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={section === s.key}
              onClick={() => switchSection(s.key)}
              className={cn(
                "inline-flex h-8 shrink-0 items-center rounded-md px-3 text-[13px] transition-colors duration-150 pointer-coarse:h-10",
                section === s.key
                  ? "bg-surface font-semibold text-ink shadow-card ring-1 ring-line/70"
                  : "font-medium text-muted hover:bg-surface-hover hover:text-ink",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        {sectionItems.length > 1 && (
          <label className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search size={15} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ad, renk, kod ya da durum ara"
              aria-label="Listede ara"
              className={cn(FIELD, "h-9 pl-8 pointer-coarse:h-11")}
            />
          </label>
        )}
        {lastUpdate && (
          <span className="ml-auto text-[12.5px] text-muted tabular-nums">Güncelleme: {formatDateTr(lastUpdate.slice(0, 10))}</span>
        )}
      </div>

      {importing && (
        <p role="status" className="anim-fade-down mb-3 rounded-control border border-line bg-surface px-3 py-2 text-[13.5px] text-muted">
          “{importing}” aktarılıyor — fotoğraflar yükleniyor…
        </p>
      )}
      {notice && (
        <div role="status" className="anim-fade-down mb-3 flex items-center gap-2 rounded-control border border-success/30 bg-success/10 px-3 py-2 text-[13.5px] font-medium text-ink">
          <span className="min-w-0 flex-1">{notice}</span>
          <IconButton size="sm" variant="ghost" aria-label="Bildirimi kapat" onClick={() => setNotice(null)}>
            <X size={14} aria-hidden />
          </IconButton>
        </div>
      )}
      {warnings.length > 0 && (
        <div role="status" className="anim-fade-down mb-3 flex items-start gap-2 rounded-control border border-warning/30 bg-warning/10 px-3 py-2 text-[13.5px] text-ink">
          <ul className="min-w-0 flex-1 list-disc space-y-0.5 pl-4">
            {warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
          <IconButton size="sm" variant="ghost" aria-label="Uyarıyı kapat" onClick={() => setWarnings([])}>
            <X size={14} aria-hidden />
          </IconButton>
        </div>
      )}
      {error && (
        <p role="alert" className="anim-fade-down mb-3 rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[13.5px] font-medium text-danger">
          {error}
        </p>
      )}

      <div className="space-y-4">
        {sectionItems.length === 0 && (
          <EmptyCard section={section} onStart={addItem} busy={adding} />
        )}

        {visible.map(({ it, index }) => {
          const canDelete = isAdmin || it.created_by === userId;
          const del = canDelete ? (
            <IconButton variant="ghost" aria-label="Satırı sil" title="Satırı sil" onClick={() => removeItem(it, index)}>
              <Trash2 size={15} aria-hidden />
            </IconButton>
          ) : null;
          return section === "urun" ? (
            <ProductCard
              key={it.id}
              it={it}
              index={index}
              prefix={prefix}
              deleteButton={del}
              onSave={(patch) => saveItem(it.id, patch)}
              onPhotos={(key, next, removed) => savePhotos(it.id, key, next, removed)}
              onOpen={setLightbox}
              onError={setError}
            />
          ) : (
            <MaterialCard
              key={it.id}
              it={it}
              index={index}
              prefix={prefix}
              deleteButton={del}
              onSave={(patch) => saveItem(it.id, patch)}
              onPhotos={(next, removed) => savePhotos(it.id, "before_photos", next, removed)}
              onOpen={setLightbox}
              onError={setError}
            />
          );
        })}

        {q && visible.length === 0 && sectionItems.length > 0 && (
          <p className="rounded-card border border-dashed border-line-strong px-4 py-6 text-center text-[13.5px] text-muted">
            “{query}” ile eşleşen satır yok.
          </p>
        )}

        {sectionItems.length > 0 && (
          <button
            type="button"
            onClick={addItem}
            disabled={adding}
            className="flex w-full items-center justify-center gap-2 rounded-card border border-dashed border-line-strong bg-surface/60 px-4 py-4 text-[14px] font-semibold text-muted transition-colors duration-150 hover:border-brand hover:bg-brand-soft hover:text-brand-strong disabled:opacity-60"
          >
            {adding ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Plus size={16} aria-hidden />} {noun} ekle
          </button>
        )}
      </div>

      <Overlay open={!!lightbox} onClose={() => setLightbox(null)} size="lg" floatingClose>
        {lightbox && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={lightbox} alt="" className="mx-auto max-h-[78dvh] w-auto rounded-card bg-white object-contain" />
        )}
      </Overlay>
      {dialog}
    </div>
  );
}

// ── KARTLAR ─────────────────────────────────────────────────────────────────

type CardProps = {
  it: UpcycleItem;
  index: number;
  prefix: string;
  deleteButton: React.ReactNode;
  onSave: (_patch: UpcycleItemPatch) => void;
  onOpen: (_url: string) => void;
  onError: (_msg: string) => void;
};

/** Sayı alanı: boş → null, geçersiz → uyarı; 0 boş görünür (yer tutucu "0"). */
function CountInput({
  label, value, onCommit, onError, decimals = 0, className,
}: {
  label: string;
  value: number | null;
  onCommit: (_n: number | null) => void;
  onError: (_msg: string) => void;
  decimals?: number;
  className?: string;
}) {
  return (
    <InlineInput
      label={label}
      inputMode={decimals ? "decimal" : "numeric"}
      value={value ? fmtNumber(value, decimals) : ""}
      placeholder={decimals ? "0,00" : "0"}
      className={cn("tabular-nums", className)}
      onCommit={(v) => {
        const n = parseNumber(v);
        if (n === undefined) { onError(`${label} bir sayı olmalı.`); return; }
        onCommit(n === null ? null : decimals ? n : Math.round(n));
      }}
    />
  );
}

function CardHeader({ index, children, deleteButton }: { index: number; children: React.ReactNode; deleteButton: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-hairline px-3 py-2.5 sm:px-4">
      <span className="grid h-9 min-w-9 place-items-center rounded-control bg-surface-muted px-1.5 text-[13px] font-semibold tabular-nums text-muted pointer-coarse:h-11">
        {rowNo(index)}
      </span>
      {children}
      {deleteButton && <div className="ml-auto shrink-0 sm:ml-0">{deleteButton}</div>}
    </header>
  );
}

/* Telefonda ad ilk satırda tek başına, renk ve kod/tür ikinci satırda yan
   yana; geniş ekranda hepsi tek satır. */
const HEAD_NAME = "min-w-0 flex-1 font-semibold max-sm:basis-[calc(100%-5.75rem)]";
const HEAD_SIDE = "order-last basis-[calc(50%-0.25rem)] sm:order-none sm:basis-auto sm:w-40";

function StatusFields({ it, onSave }: { it: UpcycleItem; onSave: CardProps["onSave"] }) {
  return (
    <>
      <label className="block">
        <FieldLabel>Güncel durum</FieldLabel>
        <AutoText
          label="Güncel durum"
          value={it.status_note}
          minRows={2}
          placeholder="Ör. Onaylandı. Üretim listesine eklenecek."
          onCommit={(v) => onSave({ status_note: v })}
          className="font-medium"
        />
      </label>
      <label className="block">
        <FieldLabel>Açıklama</FieldLabel>
        <AutoText
          label="Açıklama"
          value={it.description}
          minRows={4}
          placeholder="Yapılacak işlem, ölçü, malzeme…"
          onCommit={(v) => onSave({ description: v })}
        />
      </label>
    </>
  );
}

function ProductCard({
  it, index, prefix, deleteButton, onSave, onPhotos, onOpen, onError,
}: CardProps & {
  onPhotos: (_key: "before_photos" | "after_photos", _next: OrderReviewPhoto[], _removed?: OrderReviewPhoto) => Promise<void>;
}) {
  const setSize = (k: UpcycleSize, n: number | null) => onSave({ sizes: { ...it.sizes, [k]: n ?? 0 } });
  return (
    <article
      id={`upcycle-${it.id}`}
      aria-label={`Ürün ${rowNo(index)}${it.name ? ` — ${it.name}` : ""}`}
      className="scroll-mt-20 rounded-card border border-line bg-surface shadow-card"
    >
      <CardHeader index={index} deleteButton={deleteButton}>
        <InlineInput label="Ürün adı" value={it.name} placeholder="Ürün adı — ör. Kaftan" onCommit={(v) => onSave({ name: v })} className={HEAD_NAME} />
        <InlineInput label="Renk" value={it.color} placeholder="Renk" onCommit={(v) => onSave({ color: v })} className={HEAD_SIDE} />
        <InlineInput label="Ürün kodu" value={it.code} placeholder="Ürün kodu" onCommit={(v) => onSave({ code: v })} className={cn(HEAD_SIDE, "sm:w-44")} />
      </CardHeader>

      <div className="grid gap-4 p-3 sm:p-4 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,300px)_minmax(0,1fr)_minmax(0,0.8fr)]">
        <div className="grid grid-cols-2 gap-3 max-md:max-w-sm md:row-span-2 md:self-start xl:row-span-1">
          <PhotoField
            label="Öncesi"
            photos={it.before_photos ?? []}
            bucket={UPCYCLE_BUCKET}
            prefix={prefix}
            onOpen={onOpen}
            onChange={(next, removed) => onPhotos("before_photos", next, removed)}
          />
          <PhotoField
            label="Sonrası"
            photos={it.after_photos ?? []}
            bucket={UPCYCLE_BUCKET}
            prefix={prefix}
            onOpen={onOpen}
            onChange={(next, removed) => onPhotos("after_photos", next, removed)}
          />
        </div>

        <div className="min-w-0 space-y-3">
          <StatusFields it={it} onSave={onSave} />
          <label className="block">
            <FieldLabel>Üretim takibi</FieldLabel>
            <InlineInput label="Üretim takibi" value={it.owners} placeholder="Ör. Selen Hanım / Kısmet Hanım" onCommit={(v) => onSave({ owners: v })} />
          </label>
        </div>

        <section className="min-w-0 rounded-card border border-hairline bg-surface-muted/50 p-3">
          <h3 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-muted">Adetler</h3>
          <div className="grid grid-cols-3 gap-2">
            {SIZES.map((s) => (
              <label key={s.key} className="block min-w-0">
                <span className="mb-1 block text-[11.5px] font-semibold text-muted">{s.label}</span>
                <CountInput label={`${s.label} adedi`} value={it.sizes?.[s.key] ?? null} onCommit={(n) => setSize(s.key, n)} onError={onError} className="text-center" />
              </label>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-hairline pt-2.5 text-[13.5px]">
            <span className="font-semibold text-muted">AFR toplam adet</span>
            <span className="font-semibold tabular-nums text-ink">{sizeTotal(it.sizes)}</span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-1 2xl:grid-cols-2">
            <label className="block min-w-0">
              <FieldLabel>Market 212</FieldLabel>
              <CountInput label="Market 212" value={it.market212} onCommit={(n) => onSave({ market212: n })} onError={onError} />
            </label>
            <label className="block min-w-0">
              <FieldLabel>Perakende fiyat (TL)</FieldLabel>
              <CountInput label="Perakende satış fiyatı" value={it.retail_price} decimals={2} onCommit={(n) => onSave({ retail_price: n })} onError={onError} />
            </label>
          </div>
        </section>
      </div>
    </article>
  );
}

function MaterialCard({
  it, index, prefix, deleteButton, onSave, onPhotos, onOpen, onError,
}: CardProps & {
  onPhotos: (_next: OrderReviewPhoto[], _removed?: OrderReviewPhoto) => Promise<void>;
}) {
  return (
    <article
      id={`upcycle-${it.id}`}
      aria-label={`Malzeme ${rowNo(index)}${it.name ? ` — ${it.name}` : ""}`}
      className="scroll-mt-20 rounded-card border border-line bg-surface shadow-card"
    >
      <CardHeader index={index} deleteButton={deleteButton}>
        <InlineInput label="Ürün adı" value={it.name} placeholder="Ürün adı — ör. Scarf" onCommit={(v) => onSave({ name: v })} className={HEAD_NAME} />
        <InlineInput label="Renk" value={it.color} placeholder="Renk" onCommit={(v) => onSave({ color: v })} className={HEAD_SIDE} />
        <InlineInput label="Ürün türü" value={it.material_type} placeholder="Tür — ör. Nakış" onCommit={(v) => onSave({ material_type: v })} className={HEAD_SIDE} />
      </CardHeader>

      <div className="grid gap-4 p-3 sm:p-4 md:grid-cols-[minmax(0,180px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
        <div className="max-md:max-w-[11rem]">
          <PhotoField
            label="Fotoğraf"
            photos={it.before_photos ?? []}
            bucket={UPCYCLE_BUCKET}
            prefix={prefix}
            onOpen={onOpen}
            onChange={onPhotos}
          />
        </div>
        <div className="min-w-0 space-y-3">
          <StatusFields it={it} onSave={onSave} />
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <label className="block min-w-0">
              <FieldLabel>Üretim takibi</FieldLabel>
              <InlineInput label="Üretim takibi" value={it.owners} placeholder="Ör. Esin Hanım / Gül Hanım" onCommit={(v) => onSave({ owners: v })} />
            </label>
            <label className="block min-w-0">
              <FieldLabel>Ürün adeti</FieldLabel>
              <CountInput label="Ürün adeti" value={it.quantity} onCommit={(n) => onSave({ quantity: n })} onError={onError} />
            </label>
          </div>
        </div>
      </div>
    </article>
  );
}

/** Bölüm boşken kartın boş hâli — formatın sistemde olduğu görünsün. */
function EmptyCard({ section, onStart, busy }: { section: UpcycleSection; onStart: () => void; busy: boolean }) {
  const ghost = "flex h-9 items-center rounded-control border border-line bg-surface px-2.5 text-[13.5px] text-subtle";
  const label = "mb-1 block text-[11.5px] font-semibold uppercase tracking-[0.05em] text-muted";
  return (
    <div className="anim-fade-up">
      <button
        type="button"
        onClick={onStart}
        disabled={busy}
        className="group block w-full rounded-card border border-line bg-surface text-left shadow-card transition-[border-color,box-shadow] duration-150 hover:border-brand hover:shadow-pop disabled:opacity-60"
      >
        <span className="flex flex-wrap items-center gap-2 border-b border-hairline px-3 py-2.5 sm:px-4">
          <span className="grid h-9 min-w-9 place-items-center rounded-control bg-surface-muted px-1.5 text-[13px] font-semibold tabular-nums text-muted">01</span>
          <span className={cn(ghost, "min-w-0 flex-1")}>Ürün adı</span>
          <span className={cn(ghost, HEAD_SIDE)}>Renk</span>
          <span className={cn(ghost, HEAD_SIDE)}>{section === "urun" ? "Ürün kodu" : "Ürün türü"}</span>
        </span>
        <span className="grid gap-4 p-3 sm:p-4 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
          <span className={cn("grid gap-3 max-md:max-w-sm", section === "urun" ? "grid-cols-2" : "grid-cols-1 max-w-[11rem]")}>
            {(section === "urun" ? ["Öncesi", "Sonrası"] : ["Fotoğraf"]).map((l) => (
              <span key={l} className="min-w-0">
                <span className={label}>{l}</span>
                <span className="grid aspect-[3/4] place-items-center rounded-control border border-dashed border-line-strong bg-surface-muted/40 text-subtle">
                  <ImagePlus size={20} aria-hidden />
                </span>
              </span>
            ))}
          </span>
          <span className="min-w-0 space-y-3">
            <span className="block"><span className={label}>Güncel durum</span><span className={cn(ghost, "h-14")} /></span>
            <span className="block"><span className={label}>Açıklama</span><span className={cn(ghost, "h-24")} /></span>
            <span className="block"><span className={label}>{section === "urun" ? "Bedenler · Market 212 · Fiyat" : "Üretim takibi · Ürün adeti"}</span><span className={ghost} /></span>
          </span>
        </span>
        <span className="flex items-center justify-center gap-2 border-t border-hairline px-4 py-3 text-[14px] font-semibold text-brand-strong group-hover:bg-brand-soft">
          {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Plus size={16} aria-hidden />}
          {section === "urun" ? "İlk ürünü yazmaya başlayın" : "İlk malzemeyi yazmaya başlayın"}
        </span>
      </button>
      <p className="mt-3 text-[13.5px] text-muted">
        Elinizde dolu bir Excel varsa yukarıdan “Excel&apos;den aktar” ile fotoğraflarıyla birlikte getirebilirsiniz.
      </p>
    </div>
  );
}
