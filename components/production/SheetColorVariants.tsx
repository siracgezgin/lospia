"use client";

import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
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
 * FİYAT KALKTI (Aslı Hanım, 06.11.2026): "Burada renk belirliyoruz, fiyata
 * gerek yok." Fiyat ve para birimi ekrandan çıktı; eski satırda duruyorsa
 * kayıtta korunur (satır güncellenirken yayılmayla taşınır).
 *
 * İKİ RENK: "Ana renk, yani beden rengi; aksesuar rengi diye yan yana aç."
 * Bir üründe birden çok kumaş/renk olabilir (t-shirt, nakış, aksesuar; bazen
 * beş kumaş) — her biri ayrı satır, "Renk / kumaş ekle" ile.
 */

/** Etiket alanın ÜSTÜNDE, örnek değer içinde DEĞİL. Aslı Hanım (06.11.2026):
 *  "Renk boş kalsın… hata yapmamıza sebep vermesin" — "Renk — Beyaz" yazan
 *  boş alan girilmiş veri sanılıyordu. */
function Labeled({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("block min-w-0", className)}>
      <span className="mb-1 block text-[11.5px] font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}

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
          Bu kalıp birden çok kumaşta ya da renkte üretiliyorsa her birini ekleyin —
          ana renk, aksesuar rengi, kumaş, içerik ve asgari sipariş adedi ayrı ayrı tutulur.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-card border border-line p-2.5">
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_7rem_auto] sm:items-end">
                <Labeled label="Ana renk (beden)">
                  <TextInput
                    value={r.color}
                    disabled={!canEdit}
                    onChange={(e) => patch(r.id, { color: e.target.value })}
                    aria-label="Ana renk (beden rengi)"
                  />
                </Labeled>
                <Labeled label="Aksesuar rengi">
                  <TextInput
                    value={r.accent_color ?? ""}
                    disabled={!canEdit}
                    onChange={(e) => patch(r.id, { accent_color: e.target.value })}
                    aria-label="Aksesuar rengi"
                  />
                </Labeled>
                <Labeled label="Kumaş">
                  <TextInput
                    value={r.fabric ?? ""}
                    disabled={!canEdit}
                    onChange={(e) => patch(r.id, { fabric: e.target.value })}
                    aria-label="Kumaş"
                  />
                </Labeled>
                {/* ASGARİ SİPARİŞ — "kumaşa göre asgari sipariş adedi de
                    değişiyor". Kumaşın yanında durmalı: sipariş kararı o
                    satırda veriliyor. */}
                <Labeled label="Asgari adet">
                  <TextInput
                    value={r.moq ?? ""}
                    disabled={!canEdit}
                    onChange={(e) => patch(r.id, { moq: e.target.value })}
                    placeholder="0"
                    aria-label="Asgari sipariş adedi"
                    inputMode="numeric"
                    className="tabular-nums"
                  />
                </Labeled>
                {canEdit && (
                  <IconButton
                    size="sm"
                    aria-label="Varyantı sil"
                    title="Varyantı sil"
                    onClick={() => onChange(rows.filter((x) => x.id !== r.id))}
                    className="justify-self-end hover:text-danger sm:mb-1.5"
                  >
                    <Trash2 size={13} />
                  </IconButton>
                )}
              </div>
              <Labeled label="İçerik" className="mt-2">
                <TextInput
                  value={r.composition ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => patch(r.id, { composition: e.target.value })}
                  aria-label="İçerik"
                  className="w-full"
                />
              </Labeled>
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
