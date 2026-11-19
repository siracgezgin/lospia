"use client";

import { DndContext, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * TABLO SATIRINI ELLE TAŞIMA.
 *
 * Aslı Hanım (21.09.2026): "Şimdi burada bunların yer değiştirmesine izin ver
 * bize. Elimizle taşıyabilelim yukarı. Her birine." ve "Sıraç, bu satırlar
 * arası bize yer değiştirebiliyor olman lazım."
 *
 * Föydeki sıra keyfi değil: kalemler okunma sırasına göre diziliyor (önce
 * kumaş, sonra dikim…) ve o sıra ürüne göre değişiyor. Elle taşımak, sabit bir
 * listeyi herkese dayatmaktan iyidir.
 *
 * TUTAMAÇ AYRI SÜTUNDA: satırın tamamı tutamaç olsaydı hücreye yazmak için
 * tıklamak sürüklemeyi başlatırdı. Eşikler Pano ve Koleksiyon'la aynı — fare
 * 5 piksel, parmak 220 ms.
 */

export function SortableRows({
  ids,
  onReorder,
  children,
}: {
  ids: string[];
  onReorder: (_from: number, _to: number) => void;
  children: React.ReactNode;
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      /* dnd-kit ekran okuyucu metinlerini bulunduğu yere `<div>` olarak
         basar; burası bir `<table>`ın içi olduğu için geçersiz HTML'di
         ("<div> cannot be a child of <table>"). Gövdeye taşınır. */
      accessibility={{ container: typeof document === "undefined" ? undefined : document.body }}
      onDragEnd={(e: DragEndEvent) => {
        const { active, over } = e;
        if (!over || active.id === over.id) return;
        const from = ids.indexOf(String(active.id));
        const to = ids.indexOf(String(over.id));
        if (from < 0 || to < 0) return;
        onReorder(from, to);
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

/** Sürüklenebilir `<tr>`. İlk hücre tutamaçtır. */
export function SortableTableRow({
  id,
  children,
  className,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <tr
      ref={setNodeRef}
      /* SATIR NEDEN OYNAMIYORDU. Sıraç (24.09.2026): "Kaydırmalar çalışmıyor,
         anlık olmuyor."
         `transform` bir `<tr>`ye ancak eleman KONUMLANDIRILMIŞSA uygulanıyor.
         `relative` yalnız sürüklenen satıra veriliyordu; geri kalan satırlar
         `static` kaldığı için yer açmıyor, liste kıpırdamıyordu — sürüklenen
         kart boşlukta geziyor gibi görünüyordu. Artık her satır konumlu.

         `Translate`, `Transform` değil: ikincisi ölçek de basıyor ve tablo
         satırında hücre kenarlıklarını bulanıklaştırıyor. */
      style={{
        position: "relative",
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
      }}
      className={cn(isDragging && "bg-surface shadow-card", className)}
    >
      <td className="border border-line bg-surface-muted/60 p-0 text-center align-middle">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Satırı taşı"
          title="Sürükleyip bırakarak sırasını değiştir"
          className={cn(
            "grid h-8 w-full touch-none place-items-center text-subtle transition-colors duration-150 hover:text-ink",
            isDragging ? "cursor-grabbing" : "cursor-grab",
          )}
        >
          <GripVertical size={13} aria-hidden />
        </button>
      </td>
      {children}
    </tr>
  );
}

/**
 * Sürüklenebilir `<tr>` — tutamaç AYRI SÜTUN AÇMAZ.
 *
 * Beden + ölçü tablosunda başlık, grup, adet ve toplam satırları da aynı
 * sütunları paylaşıyor; ölçü satırları için en başa bir tutamaç sütunu açmak
 * hepsine boş bir hücre eklemek ve tabloyu sağa itmek demekti. Tutamaç
 * çağırana verilir, o da kendi ilk hücresinin içine (sıra numarasının önüne)
 * koyar.
 */
export function SortableInlineRow({
  id,
  children,
  className,
}: {
  id: string;
  children: (_handle: React.ReactNode) => React.ReactNode;
  className?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const handle = (
    <button
      type="button"
      {...attributes}
      {...listeners}
      aria-label="Satırı taşı"
      title="Sürükleyip bırakarak sırasını değiştir"
      className={cn(
        "grid h-8 w-5 shrink-0 touch-none place-items-center text-subtle transition-colors duration-150 hover:text-ink",
        isDragging ? "cursor-grabbing" : "cursor-grab",
      )}
    >
      <GripVertical size={13} aria-hidden />
    </button>
  );
  return (
    <tr
      ref={setNodeRef}
      style={{
        position: "relative",
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
      }}
      className={cn(isDragging && "bg-surface shadow-card", className)}
    >
      {children(handle)}
    </tr>
  );
}

/** `arrayMove`u dışarı taşır — çağıranlar dnd-kit'i ayrıca içe almasın. */
export { arrayMove };
