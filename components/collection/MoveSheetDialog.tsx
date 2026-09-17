"use client";

import { useState, useTransition } from "react";
import { FolderInput, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Overlay } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { moveProductionSheet } from "@/lib/actions/collection-web";
import type { CategoryNode } from "@/lib/collection/taxonomy";

/**
 * ÜRÜNÜ BAŞKA KATEGORİYE GÖNDER.
 *
 * Aslı Hanım (2026-09-17): "Buradan ben bir ürünü alıp Upcycle'a
 * gönderebiliyor olmam lazım — atıyorum sağ tıklayarak veya dosya göndererek.
 * Dosyalar arası iletişim rica ediyoruz."
 *
 * AÇILIR LİSTE DEĞİL, KUTU + ÇİP. Koleksiyonun kendisi kategorileri kutu,
 * alt kategorileri çip olarak gösteriyor; taşıma penceresi başka bir dil
 * konuşursa (select dizisi) "muhasebeci gibi" ekranın geri gelmesi olurdu
 * (Aslı Hanım, 2026-08-24).
 *
 * Yalnız kategori ve alt kategori değişir. Föyün içeriği, görselleri, web
 * bilgisi, maliyeti — hepsi aynen kalır.
 */
export function MoveSheetDialog({
  sheet,
  tree,
  onClose,
  onMoved,
}: {
  sheet: { id: string; title: string; category: string | null; subcategory: string | null };
  tree: CategoryNode[];
  onClose: () => void;
  onMoved: (_label: string) => void;
}) {
  const [cat, setCat] = useState<string | null>(sheet.category);
  const [sub, setSub] = useState<string | null>(sheet.subcategory);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const node = tree.find((c) => c.key === cat) ?? null;
  const subs = node?.subcategories ?? [];
  const unchanged = cat === sheet.category && (sub ?? null) === (sheet.subcategory ?? null);

  function submit() {
    if (!cat) return;
    setError(null);
    start(async () => {
      const res = await moveProductionSheet(sheet.id, cat, sub);
      if ("error" in res) { setError(res.error); return; }
      const subLabel = subs.find((s) => s.key === sub)?.label;
      onMoved([node?.label, subLabel].filter(Boolean).join(" › "));
    });
  }

  return (
    <Overlay
      open
      onClose={onClose}
      title="Başka kategoriye gönder"
      hint={sheet.title}
      size="md"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>Vazgeç</Button>
          <Button size="sm" onClick={submit} disabled={!cat || unchanged || pending}>
            {pending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <FolderInput size={14} aria-hidden />}
            Gönder
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {tree.map((c) => {
            const on = c.key === cat;
            const here = c.key === sheet.category;
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={on}
                onClick={() => { setCat(c.key); setSub(null); }}
                className={cn(
                  "tap-target rounded-card border px-3 py-3 text-left transition-[background-color,border-color,box-shadow] duration-150 ease-standard",
                  on
                    ? "border-brand-ring bg-brand-soft shadow-card"
                    : "border-line bg-surface hover:border-line-strong hover:bg-surface-muted",
                )}
              >
                <span className={cn("block text-[13.5px] font-semibold", on ? "text-brand-strong" : "text-ink")}>
                  {c.label}
                </span>
                {/* Nerede durduğunu söyle — hedefle karışmasın. */}
                {here && <span className="mt-0.5 block text-[11.5px] text-subtle">şu an burada</span>}
              </button>
            );
          })}
        </div>

        {subs.length > 0 && (
          <div>
            <p className="mb-2 text-[12px] font-medium text-muted">Alt kategori (isteğe bağlı)</p>
            <div className="flex flex-wrap gap-1.5">
              <Chip active={!sub} onClick={() => setSub(null)}>Genel</Chip>
              {subs.map((s) => (
                <Chip key={s.key} active={sub === s.key} onClick={() => setSub(s.key)}>{s.label}</Chip>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    </Overlay>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "tap-target h-8 rounded-full px-3 text-[12.5px] font-medium transition-colors duration-150 active:scale-[0.97]",
        active
          ? "bg-brand-soft text-brand-strong ring-1 ring-brand-ring"
          : "bg-surface-muted text-muted hover:bg-surface-hover hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
