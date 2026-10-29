"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Download, ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import { prepareImageUpload, SHEET_IMAGE_TYPES, SHEET_IMAGE_ACCEPT } from "@/lib/utils/compress-image";
import {
  addOrderReviewItem, deleteOrderReview, deleteOrderReviewItem, removeOrderReviewPhoto,
  updateOrderReview, updateOrderReviewItem, type OrderReviewItemPatch,
} from "@/lib/actions/order-reviews";
import {
  CURRENCIES, DECISIONS, formatDateTr, ORDER_REVIEW_BUCKET, ORDER_REVIEW_GRID,
  ORDER_REVIEW_HEADERS, photoPrefix, rowNo,
} from "@/lib/order-review/model";
import { Button, IconButton } from "@/components/ui/Button";
import { SelectInput, TextInput } from "@/components/ui/Field";
import { Overlay } from "@/components/ui/Overlay";
import { useConfirm } from "@/components/ui/useConfirm";
import type { OrderReview, OrderReviewItem, OrderReviewNote, OrderReviewPhoto } from "@/types";

/**
 * SİPARİŞ DEĞERLENDİRME — bir değerlendirmenin ürün satırları.
 *
 * Sütunlar Excel şablonuyla AYNI sırada (Nisa Hanım, 29.10.2026: "eksiksiz
 * olmalı"). Her alan yerinde düzenlenir ve alandan çıkınca kaydolur — ayrı
 * bir "Kaydet" düğmesi yok, Excel'deki gibi.
 *
 * Masaüstünde tek satır = tek ürün (yatay kaydırılır, Excel gibi). Telefonda
 * her ürün kendi kartında, alanlar adlarıyla alt alta.
 */

type Season = { id: string; name: string; is_current: boolean };

const GRID = ORDER_REVIEW_GRID;
const HEADERS = ORDER_REVIEW_HEADERS;

const todayIso = () => {
  /* İstanbul günü — sunucu ve tarayıcı farklı saat diliminde olabilir. */
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date());
};

/** "1.250,50" → 1250.5 · boş → null · geçersiz → undefined (kaydetme). */
function parseNumber(text: string): number | null | undefined {
  let s = text.trim().replace(/\s/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}
const fmtNumber = (n: number | null, digits = 0) =>
  n === null || n === undefined
    ? ""
    : new Intl.NumberFormat("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);

/** İçeriğine göre büyüyen metin kutusu — hücre metni kesilmesin. */
function AutoText({
  value, onCommit, placeholder, label, className, minRows = 2,
}: {
  value: string;
  onCommit: (_next: string) => void;
  placeholder?: string;
  label: string;
  className?: string;
  minRows?: number;
}) {
  const [draft, setDraft] = useState(value);
  const [prev, setPrev] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  /* Sunucudan yeni değer geldiyse (başka sekme, kayıt dönüşü) taslak tazelenir. */
  if (value !== prev) { setPrev(value); setDraft(value); }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [draft]);

  return (
    <textarea
      ref={ref}
      aria-label={label}
      value={draft}
      rows={minRows}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== value) onCommit(draft); }}
      className={cn(
        "block w-full resize-none rounded-control border border-transparent bg-transparent px-2 py-1.5 text-[13.5px] leading-relaxed text-ink",
        "placeholder:text-subtle hover:border-line focus:border-brand-ring focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand-ring/40",
        "max-lg:border-line max-lg:bg-surface",
        className,
      )}
    />
  );
}

/** Tek satırlık alan — çıkınca kaydolur. */
function InlineInput({
  value, onCommit, label, placeholder, inputMode, className,
}: {
  value: string;
  onCommit: (_next: string) => void;
  label: string;
  placeholder?: string;
  inputMode?: "decimal" | "numeric" | "text";
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [prev, setPrev] = useState(value);
  if (value !== prev) { setPrev(value); setDraft(value); }
  return (
    <input
      aria-label={label}
      value={draft}
      inputMode={inputMode}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== value) onCommit(draft); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className={cn(
        "h-9 w-full rounded-control border border-transparent bg-transparent px-2 text-[13.5px] text-ink",
        "placeholder:text-subtle hover:border-line focus:border-brand-ring focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand-ring/40",
        "max-lg:border-line max-lg:bg-surface",
        className,
      )}
    />
  );
}

/** Masaüstünde ızgara hücresi, telefonda adı görünen alan. */
function Cell({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("min-w-0 lg:border-r lg:border-hairline lg:p-1.5", className)}>
      <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-[0.05em] text-muted lg:hidden">{label}</span>
      {children}
    </div>
  );
}

// ── FOTOĞRAF HÜCRESİ ────────────────────────────────────────────────────────

function PhotoCell({
  label, photos, prefix, onChange, onOpen,
}: {
  label: string;
  photos: OrderReviewPhoto[];
  prefix: string;
  onChange: (_next: OrderReviewPhoto[], _removed?: OrderReviewPhoto) => Promise<void>;
  onOpen: (_url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const { ask, dialog } = useConfirm();

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setErr(null);
    setBusy(true);
    const added: OrderReviewPhoto[] = [];
    try {
      const supabase = createBrowserSupabase();
      for (const file of Array.from(files)) {
        const prep = await prepareImageUpload(file, { accept: SHEET_IMAGE_TYPES, maxDim: 1600, quality: 0.78 });
        if ("error" in prep) { setErr(prep.error); continue; }
        const ext = prep.file.type === "image/png" ? "png" : prep.file.type === "image/webp" ? "webp" : prep.file.type === "image/gif" ? "gif" : "jpeg";
        const path = `${prefix}${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage
          .from(ORDER_REVIEW_BUCKET)
          .upload(path, prep.file, { contentType: prep.file.type, upsert: false });
        if (error) { setErr(`Fotoğraf yüklenemedi: ${error.message}`); continue; }
        const { data } = supabase.storage.from(ORDER_REVIEW_BUCKET).getPublicUrl(path);
        added.push({ path, url: data.publicUrl });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Fotoğraf yüklenemedi.");
    } finally {
      /* Yüklenen her fotoğraf kayda girer — sonraki biri kopsa da. */
      if (added.length) await onChange([...photos, ...added]);
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(p: OrderReviewPhoto) {
    if (!(await ask({ title: "Fotoğraf kaldırılsın mı?", message: "Fotoğraf bu satırdan ve depodan silinir.", confirmLabel: "Kaldır", tone: "danger" }))) return;
    await onChange(photos.filter((x) => x.path !== p.path), p);
  }

  return (
    <div
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); }}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!busy) upload(e.dataTransfer.files); }}
      className={cn("rounded-control transition-[box-shadow] duration-150", over && "ring-2 ring-brand-ring")}
    >
      <div className="grid grid-cols-2 gap-1.5 max-lg:grid-cols-4">
        {photos.map((p) => (
          <div key={p.path} className="group/photo relative aspect-[3/4] overflow-hidden rounded-control border border-line bg-white">
            <button
              type="button"
              onClick={() => onOpen(p.url)}
              className="block h-full w-full cursor-zoom-in"
              aria-label={`${label} — büyüt`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" loading="lazy" className="h-full w-full object-contain" />
            </button>
            <button
              type="button"
              onClick={() => remove(p)}
              aria-label="Fotoğrafı kaldır"
              title="Kaldır"
              className="absolute right-0.5 top-0.5 grid size-6 place-items-center rounded-full bg-surface/90 text-muted opacity-0 shadow-card transition-opacity duration-150 hover:text-danger group-hover/photo:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
            >
              <X size={13} aria-hidden />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-label={`${label} ekle`}
          title="Fotoğraf ekle (ya da sürükleyip bırakın)"
          className={cn(
            "grid aspect-[3/4] place-items-center rounded-control border border-dashed border-line-strong text-subtle transition-colors duration-150 hover:border-brand hover:bg-brand-soft hover:text-brand-strong",
            photos.length > 0 && "aspect-auto min-h-10",
          )}
        >
          {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <ImagePlus size={16} aria-hidden />}
        </button>
      </div>
      <input ref={inputRef} type="file" accept={SHEET_IMAGE_ACCEPT} multiple className="hidden" onChange={(e) => upload(e.target.files)} />
      {err && <p className="mt-1 text-[12px] leading-snug text-danger">{err}</p>}
      {dialog}
    </div>
  );
}

// ── TOPLANTI NOTLARI ────────────────────────────────────────────────────────

/**
 * Excel'de başlık "Aslı Notlar 27.10 Toplantı" idi; her toplantıda tarih
 * değişiyor, önceki not eziliyordu. Burada her toplantının notu kendi
 * tarihiyle durur, en yenisi en üstte.
 */
function NotesCell({
  notes, onChange,
}: {
  notes: OrderReviewNote[];
  onChange: (_next: OrderReviewNote[]) => Promise<void>;
}) {
  const { ask, dialog } = useConfirm();
  const sorted = [...notes].sort((a, b) => b.date.localeCompare(a.date));

  const add = () =>
    onChange([{ id: crypto.randomUUID(), date: todayIso(), text: "" }, ...notes]);
  const update = (id: string, patch: Partial<OrderReviewNote>) =>
    onChange(notes.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  async function remove(n: OrderReviewNote) {
    if (n.text.trim() && !(await ask({ title: "Not silinsin mi?", message: `${formatDateTr(n.date)} toplantısının notu silinir.`, confirmLabel: "Sil", tone: "danger" }))) return;
    await onChange(notes.filter((x) => x.id !== n.id));
  }

  return (
    <div className="space-y-1.5">
      {sorted.map((n) => (
        <div key={n.id} className="group/note rounded-control border border-hairline bg-surface-muted/40 p-1">
          <div className="flex items-center gap-1">
            <input
              type="date"
              aria-label="Toplantı tarihi"
              value={n.date}
              onChange={(e) => { if (e.target.value) update(n.id, { date: e.target.value }); }}
              className="h-7 rounded-control border border-transparent bg-transparent px-1 text-[12px] font-semibold tabular-nums text-muted hover:border-line focus:border-brand-ring focus:outline-none"
            />
            <button
              type="button"
              onClick={() => remove(n)}
              aria-label="Notu sil"
              title="Notu sil"
              className="ml-auto grid size-6 place-items-center rounded-control text-subtle opacity-0 transition-opacity duration-150 hover:text-danger group-hover/note:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
            >
              <X size={13} aria-hidden />
            </button>
          </div>
          <AutoText
            label={`${formatDateTr(n.date)} toplantı notu`}
            value={n.text}
            placeholder="Toplantıda konuşulan…"
            onCommit={(text) => update(n.id, { text })}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="inline-flex h-7 items-center gap-1 rounded-control px-1.5 text-[12.5px] font-medium text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink"
      >
        <Plus size={13} aria-hidden /> Toplantı notu
      </button>
      {dialog}
    </div>
  );
}

// ── DÜZENLEYİCİ ─────────────────────────────────────────────────────────────

export function OrderReviewEditor({
  review, initialItems, seasons, workspaceId, userId, isAdmin, importWarnings,
}: {
  review: OrderReview;
  initialItems: OrderReviewItem[];
  seasons: Season[];
  workspaceId: string;
  userId: string;
  isAdmin: boolean;
  importWarnings: string[];
}) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const [items, setItems] = useState(initialItems);
  const [meta, setMeta] = useState({ title: review.title, season_id: review.season_id, review_date: review.review_date });
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState(importWarnings);
  const [pending, setPending] = useState(0);
  const [adding, startAdd] = useTransition();
  const [lightbox, setLightbox] = useState<string | null>(null);
  const prefix = photoPrefix(workspaceId, review.id);
  const canDeleteReview = isAdmin || review.created_by === userId;

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

  async function saveMeta(patch: Partial<typeof meta>) {
    setMeta((m) => ({ ...m, ...patch }));
    setError(null);
    try {
      const res = await track(updateOrderReview(review.id, patch));
      if ("error" in res) setError(`Kaydedilemedi: ${res.error}`);
    } catch (e) {
      setError(`Kaydedilemedi: ${e instanceof Error ? e.message : "bağlantı kurulamadı"}`);
    }
  }

  /** Alan kaydı: ekran hemen güncellenir, sunucu cevabı satırı tazeler. */
  async function saveItem(id: string, patch: OrderReviewItemPatch) {
    setItems((list) => list.map((it) => (it.id === id ? ({ ...it, ...patch } as OrderReviewItem) : it)));
    setError(null);
    try {
      const res = await track(updateOrderReviewItem(id, patch));
      if ("error" in res) { setError(`Kaydedilemedi: ${res.error}`); return; }
      setItems((list) => list.map((it) => (it.id === id ? res.item : it)));
    } catch (e) {
      setError(`Kaydedilemedi: ${e instanceof Error ? e.message : "bağlantı kurulamadı"}`);
    }
  }

  function addItem() {
    setError(null);
    startAdd(async () => {
      try {
        const res = await addOrderReviewItem(review.id);
        if ("error" in res) { setError(res.error); return; }
        setItems((list) => [...list, res.item]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Satır eklenemedi.");
      }
    });
  }

  async function removeItem(it: OrderReviewItem, index: number) {
    const name = it.code || it.product_group || `${rowNo(index)}. satır`;
    if (!(await ask({ title: "Ürün satırı silinsin mi?", message: `“${name}” satırı fotoğraflarıyla birlikte silinir.`, confirmLabel: "Sil", tone: "danger" }))) return;
    const res = await track(deleteOrderReviewItem(it.id));
    if ("error" in res) { setError(res.error); return; }
    setItems((list) => list.filter((x) => x.id !== it.id));
  }

  async function removeReview() {
    if (!(await ask({
      title: "Değerlendirme silinsin mi?",
      message: `“${meta.title || "Adsız değerlendirme"}” ve içindeki ${items.length} ürün satırı, fotoğraflarıyla birlikte kalıcı olarak silinir.`,
      confirmLabel: "Sil", tone: "danger",
    }))) return;
    const res = await track(deleteOrderReview(review.id));
    if ("error" in res) { setError(res.error); return; }
    router.push("/collection/siparis");
  }

  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      <h1 className="sr-only">Order Review</h1>

      {/* ÜST BİLGİ — Excel'in 5. satırı: Sezon / Tarih / Sipariş. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link
          href="/collection/siparis"
          className="inline-flex h-9 items-center gap-1.5 rounded-control border border-line bg-surface px-3 text-[13px] font-medium text-ink shadow-card transition-[background-color,border-color] duration-150 hover:border-line-strong hover:bg-surface-muted pointer-coarse:h-11"
        >
          <ChevronLeft size={15} aria-hidden /> Değerlendirmeler
        </Link>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {pending > 0 && (
            <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted" role="status">
              <Loader2 size={13} className="animate-spin" aria-hidden /> Kaydediliyor…
            </span>
          )}
          <a
            href={`/collection/siparis/${review.id}/export`}
            className="inline-flex h-9 items-center gap-1.5 rounded-control border border-line bg-surface px-3.5 text-[13.5px] font-medium text-ink shadow-card transition-[background-color,border-color] duration-150 hover:border-line-strong hover:bg-surface-muted pointer-coarse:h-11"
          >
            <Download size={15} aria-hidden /> Excel indir
          </a>
          {canDeleteReview && (
            <Button variant="ghost" onClick={removeReview} className="text-danger hover:text-danger">
              <Trash2 size={15} aria-hidden /> Sil
            </Button>
          )}
        </div>
      </div>

      <div className="mb-4 grid gap-3 rounded-card border border-line bg-surface p-3 shadow-card sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] sm:p-4">
        <label className="min-w-0">
          <span className="mb-1 block text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">Sipariş / Referans</span>
          <TextInput
            defaultValue={meta.title}
            placeholder="Örn. Resort 2027 — Bayram Bey numuneleri"
            onBlur={(e) => { if (e.target.value.trim() !== meta.title) saveMeta({ title: e.target.value.trim() }); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            className="font-semibold"
          />
        </label>
        <label className="min-w-0">
          <span className="mb-1 block text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">Sezon / Koleksiyon</span>
          <SelectInput
            value={meta.season_id ?? ""}
            onChange={(e) => saveMeta({ season_id: e.target.value || null })}
          >
            <option value="">Sezonsuz</option>
            {seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </SelectInput>
        </label>
        <label className="min-w-0">
          <span className="mb-1 block text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">Tarih</span>
          <TextInput
            type="date"
            value={meta.review_date ?? ""}
            onChange={(e) => saveMeta({ review_date: e.target.value || null })}
          />
        </label>
      </div>

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

      {/* ÜRÜN SATIRLARI */}
      <div className="lg:overflow-x-auto lg:rounded-card lg:border lg:border-line lg:bg-surface lg:shadow-card">
        <div className="lg:min-w-max">
          <div className={cn("hidden border-b border-line-strong bg-surface-muted", GRID)} role="row">
            {HEADERS.map((h, i) => (
              <div key={i} className="border-r border-hairline px-2 py-2.5 text-[11.5px] font-semibold uppercase leading-tight tracking-[0.04em] text-muted last:border-r-0" role="columnheader">
                {h}
              </div>
            ))}
          </div>

          <div className="space-y-3 lg:space-y-0">
            {items.map((it, i) => {
              const canDelete = isAdmin || it.created_by === userId;
              const decisionTone = DECISIONS.find((d) => d.key === it.decision)?.tone ?? "";
              return (
                <div
                  key={it.id}
                  role="row"
                  className={cn(
                    "grid gap-3 rounded-card border border-line bg-surface p-3 shadow-card sm:grid-cols-2",
                    "lg:gap-0 lg:rounded-none lg:border-0 lg:border-b lg:border-hairline lg:p-0 lg:shadow-none",
                    GRID,
                  )}
                >
                  {/* Telefonda kartın başlığı ("Ürün 01" + sil), masaüstünde No sütunu. */}
                  <div className="flex items-center justify-between sm:col-span-2 lg:col-span-1 lg:block lg:border-r lg:border-hairline lg:p-1.5">
                    <span className="block text-[13px] font-semibold tabular-nums text-muted lg:pt-2 lg:text-center">
                      <span className="lg:hidden">Ürün </span>{rowNo(i)}
                    </span>
                    {canDelete && (
                      <IconButton size="sm" variant="ghost" aria-label="Satırı sil" className="lg:hidden" onClick={() => removeItem(it, i)}>
                        <Trash2 size={14} aria-hidden />
                      </IconButton>
                    )}
                  </div>
                  <Cell label="Ürün Fotoğrafı (Orijinal)">
                    <PhotoCell
                      label="Orijinal fotoğraf"
                      photos={it.original_photos ?? []}
                      prefix={prefix}
                      onOpen={setLightbox}
                      onChange={async (next, removed) => {
                        await saveItem(it.id, { original_photos: next });
                        if (removed) await removeOrderReviewPhoto(review.id, removed.path);
                      }}
                    />
                  </Cell>
                  <Cell label="İmalatçı Numunesi">
                    <PhotoCell
                      label="İmalatçı numunesi"
                      photos={it.sample_photos ?? []}
                      prefix={prefix}
                      onOpen={setLightbox}
                      onChange={async (next, removed) => {
                        await saveItem(it.id, { sample_photos: next });
                        if (removed) await removeOrderReviewPhoto(review.id, removed.path);
                      }}
                    />
                  </Cell>
                  <Cell label="Ürün Kodu">
                    <InlineInput label="Ürün kodu" value={it.code} placeholder="V-001" onCommit={(v) => saveItem(it.id, { code: v })} className="font-semibold" />
                  </Cell>
                  <Cell label="Ürün Grubu">
                    <AutoText label="Ürün grubu" value={it.product_group} onCommit={(v) => saveItem(it.id, { product_group: v })} />
                  </Cell>
                  <Cell label="Ürün Kritikleri / Deneme Notları" className="sm:col-span-2 lg:col-span-1">
                    <AutoText label="Ürün kritikleri" value={it.critique} minRows={3} onCommit={(v) => saveItem(it.id, { critique: v })} />
                  </Cell>
                  <Cell label="Aslı Notları (Toplantı)" className="sm:col-span-2 lg:col-span-1">
                    <NotesCell notes={it.meeting_notes ?? []} onChange={(next) => saveItem(it.id, { meeting_notes: next })} />
                  </Cell>
                  <Cell label="Kumaş / İçerik">
                    <AutoText label="Kumaş / içerik" value={it.fabric} onCommit={(v) => saveItem(it.id, { fabric: v })} />
                  </Cell>
                  <Cell label="Önerilen Renkler">
                    <AutoText label="Önerilen renkler" value={it.colors} onCommit={(v) => saveItem(it.id, { colors: v })} />
                  </Cell>
                  <Cell label="Planlanan Adet">
                    <InlineInput
                      label="Planlanan adet"
                      inputMode="numeric"
                      value={fmtNumber(it.planned_qty)}
                      className="text-right tabular-nums max-lg:text-left"
                      onCommit={(v) => {
                        const n = parseNumber(v);
                        if (n === undefined) { setError("Planlanan adet bir sayı olmalı."); return; }
                        saveItem(it.id, { planned_qty: n === null ? null : Math.round(n) });
                      }}
                    />
                  </Cell>
                  <Cell label="Birim Fiyat">
                    <InlineInput
                      label="Birim fiyat"
                      inputMode="decimal"
                      value={fmtNumber(it.unit_price, 2)}
                      className="text-right tabular-nums max-lg:text-left"
                      onCommit={(v) => {
                        const n = parseNumber(v);
                        if (n === undefined) { setError("Birim fiyat bir sayı olmalı."); return; }
                        saveItem(it.id, { unit_price: n });
                      }}
                    />
                  </Cell>
                  <Cell label="Döviz">
                    <SelectInput
                      aria-label="Döviz"
                      value={it.currency}
                      onChange={(e) => saveItem(it.id, { currency: e.target.value as OrderReviewItem["currency"] })}
                      className="lg:border-transparent lg:bg-transparent lg:px-2 lg:shadow-none"
                    >
                      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </SelectInput>
                  </Cell>
                  <Cell label="Karar / Durum">
                    <SelectInput
                      aria-label="Karar / durum"
                      value={it.decision}
                      onChange={(e) => saveItem(it.id, { decision: e.target.value as OrderReviewItem["decision"] })}
                      className={cn("border-transparent font-semibold", decisionTone)}
                    >
                      {DECISIONS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                    </SelectInput>
                  </Cell>
                  <div className="hidden pt-1.5 text-center lg:block">
                    {canDelete && (
                      <IconButton size="sm" variant="ghost" aria-label="Satırı sil" title="Satırı sil" onClick={() => removeItem(it, i)}>
                        <Trash2 size={14} aria-hidden />
                      </IconButton>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 lg:mt-0 lg:p-2">
            <Button variant="secondary" onClick={addItem} loading={adding}>
              {!adding && <Plus size={15} aria-hidden />} Ürün ekle
            </Button>
          </div>
        </div>
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
