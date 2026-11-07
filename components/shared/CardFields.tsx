"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import { prepareImageUpload, SHEET_IMAGE_TYPES, SHEET_IMAGE_ACCEPT } from "@/lib/utils/compress-image";
import { formatDateTr } from "@/lib/order-review/model";
import { useConfirm } from "@/components/ui/useConfirm";
import type { OrderReviewNote, OrderReviewPhoto } from "@/types";

/**
 * KART ALANLARI — Order Review ve föyün "Toplantı notları" sekmesi aynı
 * alanları kullanır (TEK TASARIM DİLİ): her alan yerinde düzenlenir, alandan
 * çıkınca kaydolur; fotoğraf alanında ilk fotoğraf büyük, diğerleri küçük;
 * toplantı notları kendi tarihleriyle.
 */

export const todayIso = () => {
  /* İstanbul günü — sunucu ve tarayıcı farklı saat diliminde olabilir. */
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date());
};

/** "1.250,50" → 1250.5 · boş → null · geçersiz → undefined (kaydetme). */
export function parseNumber(text: string): number | null | undefined {
  let s = text.trim().replace(/\s/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}
export const fmtNumber = (n: number | null, digits = 0) =>
  n === null || n === undefined
    ? ""
    : new Intl.NumberFormat("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);

/* Alanlar HER ZAMAN alan gibi görünür: Excel'deki görünmez kenar "buraya
   yazılır mı?" sorusunu bıraktırıyordu. */
export const FIELD =
  "w-full rounded-control border border-line bg-surface px-2.5 text-[13.5px] text-ink placeholder:text-subtle " +
  "transition-[border-color,box-shadow] duration-150 hover:border-line-strong " +
  "focus:border-brand-ring focus:outline-none focus:ring-2 focus:ring-brand-ring/40";

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-[0.05em] text-muted">{children}</span>;
}

/** İçeriğine göre büyüyen metin kutusu — metin kesilmesin. */
export function AutoText({
  value, onCommit, placeholder, label, className, minRows = 2, readOnly,
}: {
  value: string;
  onCommit: (_next: string) => void;
  placeholder?: string;
  label: string;
  className?: string;
  minRows?: number;
  readOnly?: boolean;
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
      readOnly={readOnly}
      placeholder={readOnly ? undefined : placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== value) onCommit(draft); }}
      className={cn(FIELD, "block resize-none py-2 leading-relaxed", className)}
    />
  );
}

/** Tek satırlık alan — çıkınca ya da Enter'da kaydolur. */
export function InlineInput({
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
      className={cn(FIELD, "h-9 pointer-coarse:h-11", className)}
    />
  );
}

// ── FOTOĞRAF ALANI ──────────────────────────────────────────────────────────

/**
 * İlk fotoğraf büyük durur (toplantıda bakılan o), diğerleri altında küçük.
 * Boşken alanın tamamı "fotoğraf ekle" düğmesidir; dosya sürüklenip
 * bırakılabilir.
 */
export function PhotoField({
  label, photos, bucket, prefix, onChange, onOpen, disabled,
}: {
  label: string;
  photos: OrderReviewPhoto[];
  /** Depo kovası — yeni fotoğrafın yolu `prefix` ile başlar. */
  bucket: string;
  prefix: string;
  /** Salt-okur: ekle/kaldır düğmeleri çizilmez. */
  disabled?: boolean;
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
          .from(bucket)
          .upload(path, prep.file, { contentType: prep.file.type, upsert: false });
        if (error) { setErr(`Fotoğraf yüklenemedi: ${error.message}`); continue; }
        const { data } = supabase.storage.from(bucket).getPublicUrl(path);
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
    if (!(await ask({ title: "Fotoğraf kaldırılsın mı?", message: "Fotoğraf bu üründen ve depodan silinir.", confirmLabel: "Kaldır", tone: "danger" }))) return;
    await onChange(photos.filter((x) => x.path !== p.path), p);
  }

  const [main, ...rest] = photos;
  const pick = () => inputRef.current?.click();
  const removeBtn = (p: OrderReviewPhoto, small = false) => disabled ? null : (
    <button
      type="button"
      onClick={() => remove(p)}
      aria-label="Fotoğrafı kaldır"
      title="Kaldır"
      className={cn(
        "absolute right-1 top-1 grid place-items-center rounded-full bg-surface/95 text-muted shadow-card transition-opacity duration-150 hover:text-danger",
        "opacity-0 group-hover/photo:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100",
        small ? "size-5" : "size-7",
      )}
    >
      <X size={small ? 11 : 14} aria-hidden />
    </button>
  );

  return (
    <div
      className="min-w-0"
      onDragOver={(e) => { if (!disabled && e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); }}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!busy && !disabled) upload(e.dataTransfer.files); }}
    >
      <FieldLabel>{label}</FieldLabel>
      <div className={cn("rounded-control transition-[box-shadow] duration-150", over && "ring-2 ring-brand-ring")}>
        {main ? (
          <div className="group/photo relative aspect-[3/4] overflow-hidden rounded-control border border-line bg-white">
            <button type="button" onClick={() => onOpen(main.url)} className="block h-full w-full cursor-zoom-in" aria-label={`${label} — büyüt`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={main.url} alt="" loading="lazy" className="h-full w-full object-contain" />
            </button>
            {removeBtn(main)}
          </div>
        ) : disabled ? (
          <div className="grid aspect-[3/4] w-full place-items-center rounded-control border border-dashed border-line bg-surface-muted/40 text-[12.5px] text-subtle">
            Fotoğraf yok
          </div>
        ) : (
          <button
            type="button"
            onClick={pick}
            disabled={busy}
            className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-1.5 rounded-control border border-dashed border-line-strong bg-surface-muted/40 px-2 text-center text-subtle transition-colors duration-150 hover:border-brand hover:bg-brand-soft hover:text-brand-strong disabled:opacity-60"
          >
            {busy ? <Loader2 size={20} className="animate-spin" aria-hidden /> : <ImagePlus size={20} aria-hidden />}
            <span className="text-[12.5px] font-medium">{busy ? "Yükleniyor…" : "Fotoğraf ekle"}</span>
            {!busy && <span className="text-[11.5px] max-sm:hidden">ya da sürükleyip bırakın</span>}
          </button>
        )}

        {main && (rest.length > 0 || !disabled) && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {rest.map((p) => (
              <div key={p.path} className="group/photo relative size-11 overflow-hidden rounded-control border border-line bg-white">
                <button type="button" onClick={() => onOpen(p.url)} className="block h-full w-full cursor-zoom-in" aria-label={`${label} — büyüt`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="" loading="lazy" className="h-full w-full object-contain" />
                </button>
                {removeBtn(p, true)}
              </div>
            ))}
            {!disabled && <button
              type="button"
              onClick={pick}
              disabled={busy}
              aria-label={`${label} — fotoğraf ekle`}
              title="Fotoğraf ekle"
              className="grid size-11 place-items-center rounded-control border border-dashed border-line-strong text-subtle transition-colors duration-150 hover:border-brand hover:bg-brand-soft hover:text-brand-strong disabled:opacity-60"
            >
              {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Plus size={15} aria-hidden />}
            </button>}
          </div>
        )}
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
export function MeetingNotes({
  notes, onChange, disabled, title = "Toplantı notları",
}: {
  notes: OrderReviewNote[];
  onChange: (_next: OrderReviewNote[]) => Promise<void>;
  /** Salt-okur: not eklenmez, silinmez, düzenlenmez. */
  disabled?: boolean;
  /** Kutunun başlığı. "Aslı Hanım'ın notları" DEĞİL (Sıraç, 07.11.2026). */
  title?: string;
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
    <section className="min-w-0 rounded-card border border-hairline bg-surface-muted/50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-muted">{title}</h3>
        {!disabled && <button
          type="button"
          onClick={add}
          className="inline-flex h-8 items-center gap-1 rounded-control px-2 text-[12.5px] font-semibold text-brand-strong transition-colors duration-150 hover:bg-brand-soft pointer-coarse:h-10"
        >
          <Plus size={14} aria-hidden /> Toplantı notu
        </button>}
      </div>
      {sorted.length === 0 && disabled ? (
        <p className="px-1 py-3 text-[13px] text-subtle">Henüz toplantı notu yok.</p>
      ) : sorted.length === 0 ? (
        <button
          type="button"
          onClick={add}
          className="w-full rounded-control border border-dashed border-line-strong px-3 py-4 text-[13px] text-subtle transition-colors duration-150 hover:border-brand hover:bg-brand-soft hover:text-brand-strong"
        >
          Bu ürün için henüz toplantı notu yok. Eklemek için tıklayın.
        </button>
      ) : (
        <div className="space-y-2">
          {sorted.map((n) => (
            <div key={n.id} className="group/note">
              <div className="mb-1 flex items-center gap-1">
                <input
                  type="date"
                  aria-label="Toplantı tarihi"
                  disabled={disabled}
                  value={n.date}
                  onChange={(e) => { if (e.target.value) update(n.id, { date: e.target.value }); }}
                  className="h-7 rounded-control border border-transparent bg-transparent px-1 text-[12px] font-semibold tabular-nums text-muted hover:border-line focus:border-brand-ring focus:outline-none"
                />
                {!disabled && <button
                  type="button"
                  onClick={() => remove(n)}
                  aria-label="Notu sil"
                  title="Notu sil"
                  className="ml-auto grid size-7 place-items-center rounded-control text-subtle opacity-0 transition-opacity duration-150 hover:text-danger group-hover/note:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                >
                  <X size={14} aria-hidden />
                </button>}
              </div>
              <AutoText
                readOnly={disabled}
                label={`${formatDateTr(n.date)} toplantı notu`}
                value={n.text}
                minRows={3}
                placeholder="Toplantıda konuşulan…"
                onCommit={(text) => update(n.id, { text })}
              />
            </div>
          ))}
        </div>
      )}
      {dialog}
    </section>
  );
}

