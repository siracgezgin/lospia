"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Palette, Plus, Loader2, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { createSheetVariant } from "@/lib/actions/production";

export type SiblingSheet = {
  id: string;
  title: string;
  colorway: string | null;
};

interface Props {
  sheetId: string | null;
  /** Bu föyün rengi. */
  colorway: string | null;
  /** Aynı modelin diğer renkleri (bu föy hariç). */
  siblings: SiblingSheet[];
  canEdit: boolean;
}

/**
 * Renk varyantları.
 *
 * Zedonk'ta ürün kimliği "Knot dress | Organic Cotton | Blue" — model × kumaş ×
 * renk. Bizde her renk ayrı föydü; aynı modelin 3 rengi için ölçüler,
 * talimatlar, beden dağılımı ve reçete üç kez elden geçiyordu.
 *
 * "Renk ekle" tüm bunları kopyalar; yalnız renge özgü görseller düşer (teknik
 * çizim modele ait olduğu için korunur). Föyler sonrasında bağımsızdır —
 * renkler arası küçük ölçü farkları olağandır.
 */
export function SheetVariants({ sheetId, colorway, siblings, canEdit }: Props) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startWork] = useTransition();

  if (!sheetId) {
    return (
      <p className="rounded-lg border border-line bg-surface-muted px-3 py-2 text-[12.5px] text-muted">
        Renk varyantı, föy kaydedildikten sonra eklenebilir.
      </p>
    );
  }

  function create() {
    const v = name.trim();
    if (!v || !sheetId) return;
    setError(null);
    startWork(async () => {
      const res = await createSheetVariant(sheetId, v);
      if ("error" in res) { setError(res.error); return; }
      setName("");
      setAdding(false);
      router.push(`/production/${res.id}`);
    });
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="anim-fade-down rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-brand-ring bg-brand-soft px-2.5 py-1.5 text-[13px] font-semibold text-brand-strong">
          <Palette size={13} />
          {colorway?.trim() || "Renk girilmedi"}
        </span>

        {siblings.map((s) => (
          <Link
            key={s.id}
            href={`/production/${s.id}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] font-medium text-muted transition-all duration-150 hover:border-line-strong hover:bg-surface-muted hover:text-ink active:scale-[0.98]"
            title={s.title}
          >
            {s.colorway?.trim() || "renksiz"}
            <ArrowUpRight size={12} className="shrink-0" />
          </Link>
        ))}

        {canEdit && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line-strong bg-surface px-2.5 py-1.5 text-[13px] font-medium text-muted transition-all duration-150 hover:border-brand hover:text-brand active:scale-[0.98]"
          >
            <Plus size={13} /> Renk ekle
          </button>
        )}

        {adding && (
          <span className="inline-flex items-center gap-1.5">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") create();
                if (e.key === "Escape") { setName(""); setAdding(false); }
              }}
              placeholder="Mavi"
              className="h-9 w-32 rounded-lg border border-brand-ring bg-surface px-2.5 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-brand-ring/40"
            />
            <button
              onClick={create}
              disabled={busy || !name.trim()}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-[13px] font-medium text-white transition-colors",
                "hover:bg-brand-strong disabled:pointer-events-none disabled:opacity-60",
              )}
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Oluştur
            </button>
            <button
              onClick={() => { setName(""); setAdding(false); }}
              className="h-9 rounded-lg px-2 text-[13px] font-medium text-muted hover:text-ink"
            >
              İptal
            </button>
          </span>
        )}
      </div>

      <p className="text-[12px] text-subtle">
        Yeni renk bu föyün ölçülerini, talimatlarını, beden dağılımını ve reçetesini kopyalar.
        Teknik çizim korunur; kumaş ve detay fotoğrafları renge özgü olduğu için kopyalanmaz.
      </p>
    </div>
  );
}
