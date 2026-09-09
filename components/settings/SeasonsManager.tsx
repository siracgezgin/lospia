"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil, CalendarClock, Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { createSeason, updateSeason, deleteSeason, type SeasonInput } from "@/lib/actions/seasons";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Field, TextInput } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { useConfirm } from "@/components/ui/useConfirm";
import type { Season } from "@/types";

export type ManagerSeason = Pick<Season, "id" | "name" | "starts_on" | "ends_on" | "is_current">;

interface Props {
  seasons: ManagerSeason[];
  /** Sezon başına föy sayısı. */
  sheetCounts: Record<string, number>;
  canManage: boolean;
}

/** Türkçe duyarsız arama normalizasyonu — uygulamadaki her arama kutusuyla
 *  AYNI kural (ğüşıöç → gusioc). */
function norm(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c").replace(/İ/g, "i");
}

const emptyDraft = (): SeasonInput => ({ name: "", starts_on: "", ends_on: "", is_current: false });
const draftOf = (s: ManagerSeason): SeasonInput => ({
  name: s.name,
  starts_on: s.starts_on ?? "",
  ends_on: s.ends_on ?? "",
  is_current: s.is_current,
});

/**
 * Sezon yönetimi.
 *
 * Zedonk incelemesinden gelen mimari fikir: sistemin çalıştığı bağlam sezondur
 * (`SS 21 - WW` seçicisi her ekranın sağ üstünde). Bizde sezon yalnız föyün
 * içinde serbest metindi, dolayısıyla "bu sezon ne ürettik, kaça mal oldu"
 * sorulamıyordu.
 *
 * AKTİF sezon tektir: üst çubukta ilk seçili gelen ve yeni föyün varsayılanı.
 *
 * Yüzey: satırlar ince çizgiyle ayrılır (kart içinde kart yok); aktif sezon
 * tek rozetle belli. Form Field primitifleri; silme artık onay sorar.
 */
export function SeasonsManager({ seasons, sheetCounts, canManage }: Props) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<SeasonInput>(emptyDraft());
  const [error, setError] = useState<string | null>(null);
  const [busy, startWork] = useTransition();
  /* ARAMA İSTEMCİDE: liste sunucudan tamamı yüklü geliyor, süzmek için tur
     atmaya gerek yok. Sezonlar yıllar geçtikçe birikiyor. */
  const [query, setQuery] = useState("");

  /* Düzenlenen satır aramadan MUAF: kullanıcı formu açıkken kutuya yazınca
     satır elenip yarım doldurulmuş form gözden kayboluyordu. */
  const visible = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return seasons;
    return seasons.filter((s) => s.id === editingId || norm(s.name).includes(q));
  }, [seasons, query, editingId]);

  function run(fn: () => Promise<{ error?: string } | unknown>, after?: () => void) {
    setError(null);
    startWork(async () => {
      const res = (await fn()) as { error?: string };
      if (res && "error" in res && res.error) { setError(res.error); return; }
      after?.();
      router.refresh();
    });
  }

  const close = () => { setAdding(false); setEditingId(null); setError(null); };

  async function remove(s: ManagerSeason) {
    const ok = await ask({
      title: "Sezonu silmek istiyor musunuz?",
      message: `${s.name} silinecek. Föye bağlı sezon silinemez.`,
      confirmLabel: "Sil",
    });
    if (!ok) return;
    run(() => deleteSeason(s.id));
  }

  const form = (
    <div className="space-y-4 rounded-card bg-surface-sunken/60 p-4">
      <div className="grid grid-cols-1 gap-x-3 gap-y-3.5 sm:grid-cols-3">
        <Field label="Sezon adı" required className="sm:col-span-3">
          <TextInput value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="2026 RESORT" autoFocus />
        </Field>
        {/* Başlangıç · bitiş — yan yana durması anlamlı iki alan. */}
        <Field label="Başlangıç">
          <TextInput type="date" value={draft.starts_on ?? ""} onChange={(e) => setDraft({ ...draft, starts_on: e.target.value })} className="tabular-nums" />
        </Field>
        <Field label="Bitiş">
          <TextInput type="date" value={draft.ends_on ?? ""} onChange={(e) => setDraft({ ...draft, ends_on: e.target.value })} className="tabular-nums" />
        </Field>
      </div>
      <label className="flex items-start gap-2 text-[13.5px] leading-snug text-ink">
        <input
          type="checkbox"
          checked={draft.is_current}
          onChange={(e) => setDraft({ ...draft, is_current: e.target.checked })}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong accent-[var(--brand)]"
        />
        <span>Aktif sezon <span className="text-muted">— üst çubukta ilk bu gelir, yeni föy bununla açılır. Tek olabilir.</span></span>
      </label>
      <div className="flex items-center justify-end gap-2 border-t border-hairline pt-3">
        <Button variant="ghost" size="sm" onClick={close} disabled={busy}>Vazgeç</Button>
        <Button
          size="sm"
          onClick={() => run(() => (editingId ? updateSeason(editingId, draft) : createSeason(draft)), close)}
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

      {/* Tek kutu, yeni açılır liste yok — süzülecek olan sezonun ADI. */}
      {seasons.length > 0 && (
        <div className="relative max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-subtle" aria-hidden />
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Sezon ara…"
            aria-label="Sezon ara"
            className="pl-9"
          />
        </div>
      )}

      {seasons.length === 0 && !adding ? (
        <EmptyState
          title="Henüz sezon yok"
          description="Föylerdeki sezon adları kayda dönüşünce burada görünür."
          compact
        />
      ) : query.trim() && visible.length === 0 ? (
        /* Kayıt var ama arama tutmadı — "henüz sezon yok" demek yanıltıcı.
           Koşulda `query` ŞART: form açıkken boş liste bu dala düşmemeli. */
        <EmptyState icon={Search} title="Eşleşen sezon yok" description="Aramayı değiştirin." compact />
      ) : (
        <ul className="divide-y divide-hairline border-t border-hairline">
          {visible.map((s) => {
            const count = sheetCounts[s.id] ?? 0;
            if (editingId === s.id) return <li key={s.id} className="py-3">{form}</li>;
            return (
              <li key={s.id} className="flex items-center gap-3 py-3">
                <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full", s.is_current ? "bg-brand text-white" : "bg-surface-sunken text-muted")}>
                  <CalendarClock size={16} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[14px] font-semibold tracking-tight text-ink">{s.name}</span>
                    {/* Satırdaki tek rozet: aktif sezon. */}
                    {s.is_current && <Badge className="bg-brand-soft text-brand-strong">Aktif</Badge>}
                  </span>
                  {/* "N föy" listeyi tarif eder (sezonda kaç ürün var). */}
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[12.5px] tabular-nums text-muted">
                    <span>{count} föy</span>
                    {s.starts_on && <span>{s.starts_on}{s.ends_on ? ` → ${s.ends_on}` : ""}</span>}
                  </span>
                </span>
                {canManage && (
                  <span className="flex shrink-0 items-center">
                    <IconButton
                      size="sm"
                      onClick={() => { setDraft(draftOf(s)); setEditingId(s.id); setAdding(false); setError(null); }}
                      aria-label={`${s.name} — düzenle`}
                      title="Düzenle"
                    >
                      <Pencil size={14} />
                    </IconButton>
                    <IconButton
                      size="sm"
                      onClick={() => remove(s)}
                      disabled={busy}
                      aria-label={`${s.name} — sil`}
                      title={count > 0 ? "Föye bağlı — silinemez" : "Sil"}
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
        <Button
          variant="secondary"
          size="sm"
          onClick={() => { setDraft(emptyDraft()); setAdding(true); setEditingId(null); setError(null); }}
        >
          <Plus size={14} aria-hidden /> Sezon ekle
        </Button>
      )}

      {dialog}
    </div>
  );
}
