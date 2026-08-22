"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Plus, Trash2, Loader2, Save, Pencil, Scissors, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  createManufacturer, updateManufacturer, deleteManufacturer,
  type ManufacturerInput,
} from "@/lib/actions/manufacturers";
import { assignPersonTones, assignPersonIcons } from "@/lib/design/person-colors";
import type { Manufacturer } from "@/types";

export type ManagerManufacturer = Pick<
  Manufacturer,
  "id" | "name" | "photo_url" | "city" | "country" | "currency"
  | "lead_time_days" | "min_order_qty" | "contact_name" | "phone" | "email" | "notes" | "is_active"
>;

interface Props {
  manufacturers: ManagerManufacturer[];
  /** Föy sayısı — usta başına, "kaç ürün orada dikiliyor" bilgisi. */
  sheetCounts: Record<string, number>;
  canManage: boolean;
}

const inputCls =
  "w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink placeholder:text-subtle " +
  "transition-[border-color,box-shadow] duration-150 hover:border-line-strong " +
  "focus:outline-none focus:border-brand-ring focus:ring-2 focus:ring-brand-ring/40";

function emptyDraft(): ManufacturerInput {
  return {
    name: "", photo_url: "", city: "", country: "", currency: "TL",
    lead_time_days: "", min_order_qty: "",
    contact_name: "", phone: "", email: "", notes: "", is_active: true,
  };
}

function draftOf(m: ManagerManufacturer): ManufacturerInput {
  return {
    name: m.name,
    photo_url: m.photo_url ?? "",
    city: m.city ?? "",
    country: m.country ?? "",
    currency: m.currency ?? "TL",
    lead_time_days: m.lead_time_days ?? "",
    min_order_qty: m.min_order_qty ?? "",
    contact_name: m.contact_name ?? "",
    phone: m.phone ?? "",
    email: m.email ?? "",
    notes: m.notes ?? "",
    is_active: m.is_active,
  };
}

/**
 * Üretici (Usta) yönetimi.
 *
 * Aslı Hanım (2026-08-19): "Cihan Usta, o ustaları da öyle açacağız. Cihan diye
 * bir fotoğraf, Hakan diye bir olsa, ona gireceksin, bunlar açılacak — hangi
 * ürünler orada dikiliyor."
 *
 * Teslim süresi ve minimum adet alanları Zedonk (rakip PLM) incelemesinden
 * geldi: sipariş verirken sorulan ilk iki soru bunlar.
 */
export function ManufacturersManager({ manufacturers, sheetCounts, canManage }: Props) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<ManufacturerInput>(emptyDraft());
  const [error, setError] = useState<string | null>(null);
  const [busy, startWork] = useTransition();

  const tones = assignPersonTones(manufacturers.map((m) => m.id));
  const icons = assignPersonIcons(manufacturers.map((m) => m.id));

  function run(fn: () => Promise<{ error?: string } | unknown>, after?: () => void) {
    setError(null);
    startWork(async () => {
      const res = (await fn()) as { error?: string };
      if (res && "error" in res && res.error) { setError(res.error); return; }
      after?.();
      router.refresh();
    });
  }

  const openAdd = () => { setDraft(emptyDraft()); setAdding(true); setEditingId(null); setError(null); };
  const openEdit = (m: ManagerManufacturer) => { setDraft(draftOf(m)); setEditingId(m.id); setAdding(false); setError(null); };
  const close = () => { setAdding(false); setEditingId(null); setError(null); };

  const form = (
    <div className="space-y-2 rounded-xl border border-brand-ring/50 bg-surface-muted/50 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Usta adı *</span>
          <input className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Hakan Günaydın" autoFocus />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Fotoğraf bağlantısı</span>
          <input className={inputCls} value={draft.photo_url ?? ""} onChange={(e) => setDraft({ ...draft, photo_url: e.target.value })} placeholder="https://…" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Şehir</span>
          <input className={inputCls} value={draft.city ?? ""} onChange={(e) => setDraft({ ...draft, city: e.target.value })} placeholder="İstanbul" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Para birimi</span>
          <input className={inputCls} value={draft.currency ?? "TL"} onChange={(e) => setDraft({ ...draft, currency: e.target.value })} placeholder="TL" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Teslim süresi (gün)</span>
          <input className={inputCls} value={String(draft.lead_time_days ?? "")} onChange={(e) => setDraft({ ...draft, lead_time_days: e.target.value })} placeholder="30" inputMode="numeric" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Minimum adet</span>
          <input className={inputCls} value={String(draft.min_order_qty ?? "")} onChange={(e) => setDraft({ ...draft, min_order_qty: e.target.value })} placeholder="50" inputMode="numeric" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">İlgili kişi</span>
          <input className={inputCls} value={draft.contact_name ?? ""} onChange={(e) => setDraft({ ...draft, contact_name: e.target.value })} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Telefon</span>
          <input className={inputCls} value={draft.phone ?? ""} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Not</span>
          <input className={inputCls} value={draft.notes ?? ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </label>
      </div>

      <label className="flex items-center gap-2 text-[13px] text-ink">
        <input
          type="checkbox"
          checked={draft.is_active}
          onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
          className="h-4 w-4 rounded border-line-strong accent-[var(--brand)]"
        />
        Aktif — pasif ustalar föy seçiminde “(pasif)” olarak görünür, geçmiş kayıtlar korunur.
      </label>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button onClick={close} className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-muted hover:text-ink">İptal</button>
        <button
          onClick={() =>
            run(
              () => (editingId ? updateManufacturer(editingId, draft) : createManufacturer(draft)),
              close,
            )
          }
          disabled={busy || !draft.name.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-brand-strong disabled:pointer-events-none disabled:opacity-60"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Kaydet
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {error && (
        <p className="anim-fade-down rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">
          {error}
        </p>
      )}

      {adding && form}

      {manufacturers.length === 0 && !adding ? (
        <p className="rounded-xl border border-line bg-surface px-3 py-4 text-center text-[13px] text-subtle">
          Henüz usta eklenmedi. Föylerdeki üretici adları kayda dönüşünce burada görünür.
        </p>
      ) : (
        <ul className="space-y-2">
          {manufacturers.map((m) => {
            const tone = tones[m.id]!;
            const Icon = icons[m.id]!;
            const count = sheetCounts[m.id] ?? 0;
            if (editingId === m.id) return <li key={m.id}>{form}</li>;
            return (
              <li
                key={m.id}
                className={cn(
                  "flex items-center gap-3 rounded-xl border bg-surface px-3 py-2.5 shadow-card",
                  m.is_active ? tone.border : "border-line opacity-70",
                )}
              >
                {m.photo_url ? (
                  <Image src={m.photo_url} alt="" width={36} height={36} className="h-9 w-9 shrink-0 rounded-full object-cover" unoptimized />
                ) : (
                  <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full text-white", m.is_active ? tone.solid : "bg-subtle")}>
                    <Icon size={16} strokeWidth={1.9} />
                  </span>
                )}

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[14px] font-semibold tracking-tight text-ink">{m.name}</span>
                    {!m.is_active && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-surface-muted px-1.5 py-px text-[11px] font-medium text-subtle">
                        <EyeOff size={10} /> pasif
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-muted">
                    <span className="inline-flex items-center gap-1"><Scissors size={11} />{count} föy</span>
                    {m.city && <span>{m.city}</span>}
                    {m.lead_time_days != null && <span>{m.lead_time_days} gün</span>}
                    {m.min_order_qty != null && <span>min {m.min_order_qty} adet</span>}
                    {m.phone && <span className="tabular-nums">{m.phone}</span>}
                  </span>
                </span>

                {canManage && (
                  <span className="flex shrink-0 items-center gap-1">
                    <button onClick={() => openEdit(m)} className="rounded-md p-1.5 text-subtle transition-colors hover:bg-surface-muted hover:text-ink" title="Düzenle">
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => run(() => deleteManufacturer(m.id))}
                      disabled={busy}
                      className="rounded-md p-1.5 text-subtle transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                      title={count > 0 ? "Föye bağlı — silmek yerine pasif yapın" : "Sil"}
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canManage && !adding && (
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-muted transition-all duration-150 hover:border-line-strong hover:bg-surface-muted hover:text-ink active:scale-[0.98]"
        >
          <Plus size={14} /> Usta ekle
        </button>
      )}
    </div>
  );
}
