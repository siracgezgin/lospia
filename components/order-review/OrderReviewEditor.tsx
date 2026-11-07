"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Download, Loader2, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  addOrderReviewItem, deleteOrderReview, deleteOrderReviewItem, removeOrderReviewPhoto,
  updateOrderReview, updateOrderReviewItem, type OrderReviewItemPatch,
} from "@/lib/actions/order-reviews";
import {
  CURRENCIES, DECISIONS, ORDER_REVIEW_BUCKET, photoPrefix, rowNo,
} from "@/lib/order-review/model";
import {
  AutoText, FieldLabel, fmtNumber, InlineInput, MeetingNotes, parseNumber, PhotoField,
} from "@/components/shared/CardFields";
import { Button, IconButton } from "@/components/ui/Button";
import { SelectInput, TextInput } from "@/components/ui/Field";
import { Overlay } from "@/components/ui/Overlay";
import { useConfirm } from "@/components/ui/useConfirm";
import type { OrderReview, OrderReviewDecision, OrderReviewItem } from "@/types";

/**
 * SİPARİŞ DEĞERLENDİRME — bir değerlendirmenin ürünleri.
 *
 * Alanlar Excel şablonunun TAMAMI (Nisa Hanım, 29.10.2026: "eksiksiz
 * olmalı"); her alan yerinde düzenlenir ve alandan çıkınca kaydolur — ayrı
 * bir "Kaydet" düğmesi yok.
 *
 * TEK ÜRÜN = TEK KART. İlk sürüm Excel'i birebir kopyalıyordu: 14 sütun yan
 * yana ~2100 px, normal ekranda sağa kayıyordu (Sıraç, 04.11.2026: "ekran
 * kaymıştı, sağa gidiyordu"). Kartta yatay kaydırma YOK: fotoğraflar solda
 * büyük, kritik + ürün bilgisi ortada, toplantı notları sağda; ekran
 * daraldıkça sütunlar alt alta iner.
 */

type Season = { id: string; name: string; is_current: boolean };

// ── DÜZENLEYİCİ ─────────────────────────────────────────────────────────────

type Filter = "all" | OrderReviewDecision;

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
  const [filter, setFilter] = useState<Filter>("all");
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

  /** Alan kaydı: ekran hemen güncellenir, sunucu cevabı ürünü tazeler. */
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
    /* Yeni ürün "Değerlendirmede" açılır; süzgeç başka karardaysa görünmezdi. */
    setFilter("all");
    startAdd(async () => {
      try {
        const res = await addOrderReviewItem(review.id);
        if ("error" in res) { setError(res.error); return; }
        setItems((list) => [...list, res.item]);
        requestAnimationFrame(() =>
          document.getElementById(`urun-${res.item.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ürün eklenemedi.");
      }
    });
  }

  async function removeItem(it: OrderReviewItem, index: number) {
    const name = it.code || it.product_group || `${rowNo(index)}. ürün`;
    if (!(await ask({ title: "Ürün silinsin mi?", message: `“${name}” fotoğraflarıyla birlikte silinir.`, confirmLabel: "Sil", tone: "danger" }))) return;
    const res = await track(deleteOrderReviewItem(it.id));
    if ("error" in res) { setError(res.error); return; }
    setItems((list) => list.filter((x) => x.id !== it.id));
  }

  async function removeReview() {
    if (!(await ask({
      title: "Değerlendirme silinsin mi?",
      message: `“${meta.title || "Adsız değerlendirme"}” ve içindeki ${items.length} ürün, fotoğraflarıyla birlikte kalıcı olarak silinir.`,
      confirmLabel: "Sil", tone: "danger",
    }))) return;
    const res = await track(deleteOrderReview(review.id));
    if ("error" in res) { setError(res.error); return; }
    router.push("/collection/siparis");
  }

  const visible = items
    .map((it, index) => ({ it, index }))
    .filter(({ it }) => filter === "all" || it.decision === filter);

  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      <h1 className="sr-only">Order Review</h1>

      {/* ÜST ŞERİT */}
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

      {/* ÜST BİLGİ — Excel'in 5. satırı: Sipariş / Sezon / Tarih. */}
      <div className="mb-4 grid gap-3 rounded-card border border-line bg-surface p-3 shadow-card sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] sm:p-4">
        <label className="min-w-0">
          <FieldLabel>Sipariş / Referans</FieldLabel>
          <TextInput
            defaultValue={meta.title}
            placeholder="Örn. Resort 2027 — Bayram Bey numuneleri"
            onBlur={(e) => { if (e.target.value.trim() !== meta.title) saveMeta({ title: e.target.value.trim() }); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            className="font-semibold"
          />
        </label>
        <label className="min-w-0">
          <FieldLabel>Sezon / Koleksiyon</FieldLabel>
          <SelectInput
            value={meta.season_id ?? ""}
            onChange={(e) => saveMeta({ season_id: e.target.value || null })}
          >
            <option value="">Sezonsuz</option>
            {seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </SelectInput>
        </label>
        <label className="min-w-0">
          <FieldLabel>Tarih</FieldLabel>
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

      {/* KARAR SÜZGECİ — toplantıda "yalnız revizeler" gibi bakmak için.
          Sayı yok: listeyi süzer, kimseyi puanlamaz. */}
      {items.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Karara göre süz" className="inline-flex h-9 max-w-full items-center overflow-x-auto rounded-control border border-line bg-surface-muted p-0.5 no-scrollbar pointer-coarse:h-11">
            {([{ key: "all", label: "Tümü" }, ...DECISIONS] as { key: Filter; label: string }[]).map((d) => (
              <button
                key={d.key}
                type="button"
                aria-pressed={filter === d.key}
                onClick={() => setFilter(d.key)}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center rounded-md px-3 text-[13px] transition-colors duration-150 pointer-coarse:h-10",
                  filter === d.key
                    ? "bg-surface font-semibold text-ink shadow-card ring-1 ring-line/70"
                    : "font-medium text-muted hover:bg-surface-hover hover:text-ink",
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ÜRÜNLER */}
      <div className="space-y-4">
        {visible.map(({ it, index }) => {
          const canDelete = isAdmin || it.created_by === userId;
          const decisionTone = DECISIONS.find((d) => d.key === it.decision)?.tone ?? "";
          return (
            <article
              key={it.id}
              id={`urun-${it.id}`}
              aria-label={`Ürün ${rowNo(index)}${it.code ? ` — ${it.code}` : ""}`}
              className="scroll-mt-20 rounded-card border border-line bg-surface shadow-card"
            >
              {/* Kart başlığı: sıra · kod · grup · karar. Telefonda grup
                  ikinci satıra iner, karar sağ üstte kalır. */}
              <header className="flex flex-wrap items-center gap-2 border-b border-hairline px-3 py-2.5 sm:px-4">
                <span className="grid h-9 min-w-9 place-items-center rounded-control bg-surface-muted px-1.5 text-[13px] font-semibold tabular-nums text-muted pointer-coarse:h-11">
                  {rowNo(index)}
                </span>
                <InlineInput
                  label="Ürün kodu"
                  value={it.code}
                  placeholder="Kod"
                  onCommit={(v) => saveItem(it.id, { code: v })}
                  className="min-w-0 flex-1 font-semibold sm:w-28 sm:flex-none"
                />
                <InlineInput
                  label="Ürün grubu"
                  value={it.product_group}
                  placeholder="Ürün grubu — ör. Bol model elbise"
                  onCommit={(v) => saveItem(it.id, { product_group: v })}
                  className="order-last basis-full sm:order-none sm:w-auto sm:min-w-[12rem] sm:flex-1 sm:basis-auto"
                />
                <div className="ml-auto flex shrink-0 items-center gap-1">
                  <SelectInput
                    aria-label="Karar / durum"
                    value={it.decision}
                    onChange={(e) => saveItem(it.id, { decision: e.target.value as OrderReviewItem["decision"] })}
                    className={cn("h-9 w-auto rounded-full border-transparent font-semibold", decisionTone)}
                  >
                    {DECISIONS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                  </SelectInput>
                  {canDelete && (
                    <IconButton variant="ghost" aria-label="Ürünü sil" title="Ürünü sil" onClick={() => removeItem(it, index)}>
                      <Trash2 size={15} aria-hidden />
                    </IconButton>
                  )}
                </div>
              </header>

              {/* Gövde: telefonda alt alta; tablette fotoğraflar solda;
                  geniş ekranda üç sütun — fotoğraf · bilgi · notlar. */}
              <div className="grid gap-4 p-3 sm:p-4 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,300px)_minmax(0,1fr)_minmax(0,1fr)]">
                <div className="grid grid-cols-2 gap-3 max-md:max-w-sm md:row-span-2 md:self-start xl:row-span-1">
                  <PhotoField
                    label="Orijinal"
                    photos={it.original_photos ?? []}
                    bucket={ORDER_REVIEW_BUCKET}
                    prefix={prefix}
                    onOpen={setLightbox}
                    onChange={async (next, removed) => {
                      await saveItem(it.id, { original_photos: next });
                      if (removed) await removeOrderReviewPhoto(review.id, removed.path);
                    }}
                  />
                  <PhotoField
                    label="Numune"
                    photos={it.sample_photos ?? []}
                    bucket={ORDER_REVIEW_BUCKET}
                    prefix={prefix}
                    onOpen={setLightbox}
                    onChange={async (next, removed) => {
                      await saveItem(it.id, { sample_photos: next });
                      if (removed) await removeOrderReviewPhoto(review.id, removed.path);
                    }}
                  />
                </div>

                <div className="min-w-0 space-y-3">
                  <label className="block">
                    <FieldLabel>Ürün kritikleri / deneme notları</FieldLabel>
                    <AutoText
                      label="Ürün kritikleri"
                      value={it.critique}
                      minRows={4}
                      placeholder="Kalıp, dikiş, kumaş düşüşü…"
                      onCommit={(v) => saveItem(it.id, { critique: v })}
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block min-w-0">
                      <FieldLabel>Kumaş / içerik</FieldLabel>
                      <AutoText label="Kumaş / içerik" value={it.fabric} minRows={1} placeholder="Ör. %100 keten" onCommit={(v) => saveItem(it.id, { fabric: v })} />
                    </label>
                    <label className="block min-w-0">
                      <FieldLabel>Önerilen renkler</FieldLabel>
                      <AutoText label="Önerilen renkler" value={it.colors} minRows={1} placeholder="Ör. Ekru, haki" onCommit={(v) => saveItem(it.id, { colors: v })} />
                    </label>
                    <label className="block min-w-0">
                      <FieldLabel>Planlanan adet</FieldLabel>
                      <InlineInput
                        label="Planlanan adet"
                        inputMode="numeric"
                        value={fmtNumber(it.planned_qty)}
                        placeholder="0"
                        className="tabular-nums"
                        onCommit={(v) => {
                          const n = parseNumber(v);
                          if (n === undefined) { setError("Planlanan adet bir sayı olmalı."); return; }
                          saveItem(it.id, { planned_qty: n === null ? null : Math.round(n) });
                        }}
                      />
                    </label>
                    <div className="min-w-0">
                      <FieldLabel>Birim fiyat</FieldLabel>
                      <div className="flex gap-1.5">
                        <InlineInput
                          label="Birim fiyat"
                          inputMode="decimal"
                          value={fmtNumber(it.unit_price, 2)}
                          placeholder="0,00"
                          className="min-w-0 flex-1 tabular-nums"
                          onCommit={(v) => {
                            const n = parseNumber(v);
                            if (n === undefined) { setError("Birim fiyat bir sayı olmalı."); return; }
                            saveItem(it.id, { unit_price: n });
                          }}
                        />
                        <SelectInput
                          aria-label="Döviz"
                          value={it.currency}
                          onChange={(e) => saveItem(it.id, { currency: e.target.value as OrderReviewItem["currency"] })}
                          className="h-9 w-[5.5rem] shrink-0 pointer-coarse:h-11"
                        >
                          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </SelectInput>
                      </div>
                    </div>
                  </div>
                </div>

                <MeetingNotes notes={it.meeting_notes ?? []} onChange={(next) => saveItem(it.id, { meeting_notes: next })} />
              </div>
            </article>
          );
        })}

        {visible.length === 0 && items.length > 0 && (
          <p className="rounded-card border border-dashed border-line-strong px-4 py-6 text-center text-[13.5px] text-muted">
            Bu kararda ürün yok.
          </p>
        )}

        <button
          type="button"
          onClick={addItem}
          disabled={adding}
          className="flex w-full items-center justify-center gap-2 rounded-card border border-dashed border-line-strong bg-surface/60 px-4 py-4 text-[14px] font-semibold text-muted transition-colors duration-150 hover:border-brand hover:bg-brand-soft hover:text-brand-strong disabled:opacity-60"
        >
          {adding ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Plus size={16} aria-hidden />} Ürün ekle
        </button>
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
