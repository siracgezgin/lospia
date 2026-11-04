"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import { prepareImageUpload, SHEET_IMAGE_TYPES, SHEET_IMAGE_ACCEPT } from "@/lib/utils/compress-image";
import { useConfirm } from "@/components/ui/useConfirm";
import type { OrderReviewPhoto } from "@/types";

/**
 * KART ALANLARI — Order Review ve Upcycle aynı alanları kullanır (TEK
 * TASARIM DİLİ): her alan yerinde düzenlenir, alandan çıkınca kaydolur;
 * fotoğraf alanında ilk fotoğraf büyük, diğerleri küçük.
 */

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
  label, photos, bucket, prefix, onChange, onOpen,
}: {
  label: string;
  photos: OrderReviewPhoto[];
  /** Depo kovası — yol `prefix` ile başlar. */
  bucket: string;
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
  const removeBtn = (p: OrderReviewPhoto, small = false) => (
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
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); }}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!busy) upload(e.dataTransfer.files); }}
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

        {main && (
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
            <button
              type="button"
              onClick={pick}
              disabled={busy}
              aria-label={`${label} — fotoğraf ekle`}
              title="Fotoğraf ekle"
              className="grid size-11 place-items-center rounded-control border border-dashed border-line-strong text-subtle transition-colors duration-150 hover:border-brand hover:bg-brand-soft hover:text-brand-strong disabled:opacity-60"
            >
              {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Plus size={15} aria-hidden />}
            </button>
          </div>
        )}
      </div>
      <input ref={inputRef} type="file" accept={SHEET_IMAGE_ACCEPT} multiple className="hidden" onChange={(e) => upload(e.target.files)} />
      {err && <p className="mt-1 text-[12px] leading-snug text-danger">{err}</p>}
      {dialog}
    </div>
  );
}

