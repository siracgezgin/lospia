"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Palette, Plus, ArrowUpRight } from "lucide-react";
import { createSheetVariant } from "@/lib/actions/production";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/Field";

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
      <p className="rounded-control border border-line bg-surface-muted px-3 py-2 text-[13px] text-muted">
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
        <p role="alert" className="anim-fade-down rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] font-medium text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {/* Bu föyün rengi — seçili çip; diğer renkler bağlantı çipi. Hepsi
            aynı boyda (h-8) ki satır düz dursun. */}
        <span className="inline-flex h-8 items-center gap-1.5 rounded-control border border-brand-ring bg-brand-soft px-2.5 text-[13px] font-semibold text-brand-strong" aria-current="true">
          <Palette size={13} aria-hidden />
          {colorway?.trim() || "Renk girilmedi"}
        </span>

        {siblings.map((s) => (
          <Link
            key={s.id}
            href={`/production/${s.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 text-[13px] font-medium text-muted transition-[background-color,border-color,color] duration-150 hover:border-line-strong hover:bg-surface-muted hover:text-ink"
            title={s.title}
          >
            {s.colorway?.trim() || "renksiz"}
            <ArrowUpRight size={12} className="shrink-0" aria-hidden />
          </Link>
        ))}

        {canEdit && !adding && (
          <Button variant="secondary" size="sm" onClick={() => setAdding(true)} className="border-dashed">
            <Plus size={13} aria-hidden /> Renk ekle
          </Button>
        )}

        {adding && (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <TextInput
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") create();
                if (e.key === "Escape") { setName(""); setAdding(false); }
              }}
              placeholder="Mavi"
              aria-label="Yeni renk adı"
              className="h-8 w-32"
            />
            {/* Satır içi küçük eylem; ekranın tek primary'si üstteki Kaydet. */}
            <Button variant="secondary" size="sm" onClick={create} loading={busy} disabled={!name.trim()}>
              {!busy && <Plus size={13} aria-hidden />} Oluştur
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setName(""); setAdding(false); }}>
              Vazgeç
            </Button>
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
