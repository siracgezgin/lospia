"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  createManufacturer, updateManufacturer, deleteManufacturer,
  type ManufacturerInput,
} from "@/lib/actions/manufacturers";
import { assignPersonTones } from "@/lib/design/person-colors";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Field, FieldGrid, TextInput } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { useConfirm } from "@/components/ui/useConfirm";
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
 *
 * Yüzey: bölüm kartının içinde her usta ayrı bir kartken (kenarlık + gölge +
 * renkli kenar) liste "kart içinde kart"tı. Artık ince çizgiyle ayrılmış
 * satırlar; rengi rozet taşır. Form ham input yerine Field primitifleri.
 * Silme onaysız gidiyordu — artık sorulur.
 */
export function ManufacturersManager({ manufacturers, sheetCounts, canManage }: Props) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<ManufacturerInput>(emptyDraft());
  const [error, setError] = useState<string | null>(null);
  const [busy, startWork] = useTransition();

  const tones = assignPersonTones(manufacturers.map((m) => m.id));

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

  async function remove(m: ManagerManufacturer) {
    const ok = await ask({
      title: "Ustayı silmek istiyor musunuz?",
      message: `${m.name} silinecek. Föye bağlıysa silinmez; onun yerine pasif yapın.`,
      confirmLabel: "Sil",
    });
    if (!ok) return;
    run(() => deleteManufacturer(m.id));
  }

  const form = (
    <div className="space-y-4 rounded-card bg-surface-sunken/60 p-4">
      <FieldGrid>
        <Field label="Usta adı" required className="sm:col-span-2">
          <TextInput value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Hakan Günaydın" autoFocus />
        </Field>
        <Field label="Fotoğraf bağlantısı" className="sm:col-span-2">
          <TextInput value={draft.photo_url ?? ""} onChange={(e) => setDraft({ ...draft, photo_url: e.target.value })} placeholder="https://…" />
        </Field>
        <Field label="Şehir">
          <TextInput value={draft.city ?? ""} onChange={(e) => setDraft({ ...draft, city: e.target.value })} placeholder="İstanbul" />
        </Field>
        <Field label="Para birimi">
          <TextInput value={draft.currency ?? "TL"} onChange={(e) => setDraft({ ...draft, currency: e.target.value })} placeholder="TL" />
        </Field>
        <Field label="Teslim süresi (gün)">
          <TextInput value={String(draft.lead_time_days ?? "")} onChange={(e) => setDraft({ ...draft, lead_time_days: e.target.value })} placeholder="30" inputMode="numeric" className="tabular-nums" />
        </Field>
        <Field label="Minimum adet">
          <TextInput value={String(draft.min_order_qty ?? "")} onChange={(e) => setDraft({ ...draft, min_order_qty: e.target.value })} placeholder="50" inputMode="numeric" className="tabular-nums" />
        </Field>
        <Field label="İlgili kişi">
          <TextInput value={draft.contact_name ?? ""} onChange={(e) => setDraft({ ...draft, contact_name: e.target.value })} />
        </Field>
        <Field label="Telefon">
          <TextInput type="tel" value={draft.phone ?? ""} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} className="tabular-nums" />
        </Field>
        <Field label="Not" className="sm:col-span-2">
          <TextInput value={draft.notes ?? ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </Field>
      </FieldGrid>

      <label className="flex items-start gap-2 text-[13.5px] leading-snug text-ink">
        <input
          type="checkbox"
          checked={draft.is_active}
          onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong accent-[var(--brand)]"
        />
        <span>Aktif <span className="text-muted">— pasif usta föy seçiminde “(pasif)” görünür, geçmiş kayıtlar korunur.</span></span>
      </label>

      <div className="flex items-center justify-end gap-2 border-t border-hairline pt-3">
        <Button variant="ghost" size="sm" onClick={close} disabled={busy}>Vazgeç</Button>
        <Button
          size="sm"
          onClick={() =>
            run(
              () => (editingId ? updateManufacturer(editingId, draft) : createManufacturer(draft)),
              close,
            )
          }
          loading={busy}
          disabled={!draft.name.trim()}
        >
          Kaydet
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="anim-fade-down text-[12.5px] text-danger">{error}</p>
      )}

      {adding && form}

      {manufacturers.length === 0 && !adding ? (
        <EmptyState
          title="Henüz usta yok"
          description="Föylerdeki üretici adları kayda dönüşünce burada görünür."
          compact
        />
      ) : (
        <ul className="divide-y divide-hairline border-t border-hairline">
          {manufacturers.map((m) => {
            const tone = tones[m.id]!;
            const count = sheetCounts[m.id] ?? 0;
            if (editingId === m.id) return <li key={m.id} className="py-3">{form}</li>;
            return (
              <li key={m.id} className="flex items-center gap-3 py-3">
                {/* Fotoğraf, yoksa baş harf — sembol ikonlar kaldırıldı
                    (Aslı Hanım, 2026-08-24). Pasif usta renksiz kalır. */}
                <PersonAvatar
                  name={m.name}
                  photoUrl={m.photo_url}
                  colorHex={m.is_active ? tone.hex : null}
                  size="md"
                />

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={cn("truncate text-[14px] font-semibold tracking-tight", m.is_active ? "text-ink" : "text-muted")}>
                      {m.name}
                    </span>
                    {/* Satırdaki tek rozet: durum. */}
                    {!m.is_active && <Badge className="bg-surface-sunken text-subtle">Pasif</Badge>}
                  </span>
                  {/* "N föy" listeyi tarif eder (o ustada kaç ürün dikiliyor). */}
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-muted">
                    <span className="tabular-nums">{count} föy</span>
                    {m.city && <span>{m.city}</span>}
                    {m.lead_time_days != null && <span className="tabular-nums">{m.lead_time_days} gün teslim</span>}
                    {m.min_order_qty != null && <span className="tabular-nums">min {m.min_order_qty} adet</span>}
                    {m.phone && <span className="tabular-nums">{m.phone}</span>}
                  </span>
                </span>

                {canManage && (
                  <span className="flex shrink-0 items-center">
                    <IconButton size="sm" onClick={() => openEdit(m)} aria-label={`${m.name} — düzenle`} title="Düzenle">
                      <Pencil size={14} />
                    </IconButton>
                    <IconButton
                      size="sm"
                      onClick={() => remove(m)}
                      disabled={busy}
                      aria-label={`${m.name} — sil`}
                      title={count > 0 ? "Föye bağlı — silmek yerine pasif yapın" : "Sil"}
                      className="hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canManage && !adding && (
        <Button variant="secondary" size="sm" onClick={openAdd}>
          <Plus size={14} aria-hidden /> Usta ekle
        </Button>
      )}

      {dialog}
    </div>
  );
}
