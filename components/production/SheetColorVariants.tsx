"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/Field";
import type { ColorVariant } from "@/types";

/**
 * RENK / KUMAŞ VARYANTLARI — aynı kalıbın farklı kumaşları.
 *
 * Aslı Hanım (21.09.2026): "Bizim bir elbise kalıbı için çalıştığımız farklı
 * kumaşlarımız oluyor: beyaz, denim, pembe, yeşil gibi. Onların farklı
 * fiyatları, farklı içerikleri oluyor… Hem renk olarak ayrı olması gerekiyor.
 * Renk, fiyat, içerik." Ve: "Kumaşa göre asgari sipariş adedi de değişiyor."
 *
 * FÖYÜN İÇİNDE, AYRI FÖY DEĞİL. Föyde zaten bir "Renk Varyantları" bölümü var
 * ama o her rengi ayrı föy olarak kopyalıyor; kalıbı aynı olan dört kumaş için
 * ölçüyü, talimatı ve beden dağılımını dört kez yazdırırdı. Burada tek föy,
 * içinde kumaş listesi.
 *
 * FİYAT BURADA, MALİYET SEKMESİNDE DEĞİL: maliyet tablosu ürünün kendi
 * maliyetini verir; bu liste "hangi kumaş kaça geliyor" sorusunun cevabıdır ve
 * kumaş seçilirken okunur.
 */

function newId(): string {
  return `cv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function SheetColorVariants({
  rows,
  canEdit,
  onChange,
}: {
  rows: ColorVariant[];
  canEdit: boolean;
  onChange: (_next: ColorVariant[]) => void;
}) {
  const patch = (id: string, p: Partial<ColorVariant>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));

  return (
    <div className="space-y-2">
      {rows.length === 0 ? (
        <p className="text-[12.5px] text-subtle">
          Bu kalıp birden çok kumaşta üretiliyorsa her birini ekleyin — renk, kumaş,
          fiyat, içerik ve asgari sipariş adedi ayrı ayrı tutulur.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-card border border-line p-2">
              <div className="flex flex-wrap items-center gap-2">
                <TextInput
                  value={r.color}
                  disabled={!canEdit}
                  onChange={(e) => patch(r.id, { color: e.target.value })}
                  placeholder="Renk — Beyaz"
                  aria-label="Renk"
                  className="min-w-[110px] flex-1 basis-[110px]"
                />
                <TextInput
                  value={r.fabric ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => patch(r.id, { fabric: e.target.value })}
                  placeholder="Kumaş — poplin"
                  aria-label="Kumaş"
                  className="min-w-[110px] flex-1 basis-[110px]"
                />
                <TextInput
                  value={r.price ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => patch(r.id, { price: e.target.value })}
                  placeholder="Fiyat"
                  aria-label="Kumaş fiyatı"
                  inputMode="decimal"
                  className="min-w-[80px] flex-1 basis-[80px]"
                />
                <TextInput
                  value={r.currency ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => patch(r.id, { currency: e.target.value })}
                  placeholder="TL / $"
                  aria-label="Para birimi"
                  className="w-[74px] shrink-0"
                />
                {/* ASGARİ SİPARİŞ — "kumaşa göre asgari sipariş adedi de
                    değişiyor". Kumaşın yanında durmalı: sipariş kararı o
                    satırda veriliyor. */}
                <TextInput
                  value={r.moq ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => patch(r.id, { moq: e.target.value })}
                  placeholder="Asgari adet"
                  aria-label="Asgari sipariş adedi"
                  inputMode="numeric"
                  className="w-[104px] shrink-0"
                />
                {canEdit && (
                  <IconButton
                    size="sm"
                    aria-label="Varyantı sil"
                    title="Varyantı sil"
                    onClick={() => onChange(rows.filter((x) => x.id !== r.id))}
                    className="shrink-0 hover:text-danger"
                  >
                    <Trash2 size={13} />
                  </IconButton>
                )}
              </div>
              <TextInput
                value={r.composition ?? ""}
                disabled={!canEdit}
                onChange={(e) => patch(r.id, { composition: e.target.value })}
                placeholder="İçerik — %100 pamuk, en 150 cm"
                aria-label="İçerik"
                className="mt-2 w-full"
              />
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange([...rows, { id: newId(), color: "" }])}
          className="-ml-2 text-brand hover:bg-surface-muted hover:text-brand-strong"
        >
          <Plus size={13} aria-hidden /> Renk / kumaş ekle
        </Button>
      )}
    </div>
  );
}
