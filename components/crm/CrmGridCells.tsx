"use client";

import { useEffect, useRef, useState } from "react";
import { CRM_SEGMENTS, CRM_STATUSES, CRM_SOURCE_CHANNELS, type CrmGridColumn } from "@/lib/crm/constants";
import { SEEDING_STEPS } from "@/lib/crm/seeding";
import { cn } from "@/lib/utils/cn";

/**
 * CRM IZGARASININ HÜCRELERİ — Excel mantığı.
 *
 * Sıraç (26.09.2026): "Her yer pop-up olarak açılıp ekletiyor ya, onun yerine
 * sabit bir excel olsun; sırasıyla ekleye ekleye ilerleyebilelim, her biri
 * için. Hiç popup vs gerekmeden." Ve: "CRM listesi dediğim CRM'deki TÜM
 * kısımlarda."
 *
 * Bu yüzden hücre bir DÜĞME değil, doğrudan yazılan alandır. Tasarım kararları:
 *
 *  · KUTU YOK, ÇERÇEVE ODAKTA. On üç sütun × N satır kutu çizilseydi ekran
 *    ızgara değil form yığını olurdu. Hücre sakin durur; üzerine gelince ince
 *    çizgi, odaklanınca marka çerçevesi belirir — tıpkı bir hesap tablosunda.
 *  · TEK SATIR. Hiçbir hücre ikinci satıra kaymaz (genel kural); sığmayan
 *    metin kırpılır ve tamamı `title`'da durur.
 *  · ODAKTAYKEN DIŞARIDAN EZİLMEZ. `router.refresh()` yeni veri getirdiğinde
 *    yazmakta olduğunuz hücre sıfırlanmamalı — odak içerideyken gelen değer
 *    yok sayılır.
 *  · ENTER AŞAĞI İNER. Hesap tablosu alışkanlığı; Tab zaten sağa gider.
 *    Escape yazılanı geri alır.
 *
 * Kaydetme hücre bazlıdır (`updateCrmContactField`): yalnız o sütun yazılır,
 * satırın geri kalanına dokunulmaz.
 */

/* Ortak hücre dili — tüm kontroller aynı yükseklik ve aynı odak çerçevesi.
   (Kontrol eşitliği kuralı: aynı işi yapan şey aynı görünür.) */
const CELL = [
  "h-8 w-full min-w-0 rounded-[4px] border border-transparent bg-transparent px-2",
  "text-[13px] text-ink outline-none",
  "transition-[background-color,border-color,box-shadow] duration-150 ease-standard",
  "hover:border-line",
  "focus:border-brand focus:bg-surface focus:ring-2 focus:ring-brand-ring",
  "disabled:cursor-default disabled:hover:border-transparent",
].join(" ");

const CELL_SAVING = "bg-brand/[0.06]";
const CELL_ERROR = "border-danger/60 bg-danger/[0.06]";

/**
 * Hücreyi kimliğiyle bulup odaklar — Enter ile bir alt satıra inmek için.
 *
 * GÖRÜNEN hücre seçilir: aynı satır hem masaüstü tablosunda hem telefon
 * kartında çiziliyor, yani her kimlik DOM'da iki kez var. İlk eşleşmeyi almak,
 * telefonda `display:none` olan tabloya odaklanmaya çalışmak olurdu — imleç
 * hiçbir yere gitmezdi.
 */
export function focusCell(field: string, row: number) {
  if (typeof document === "undefined") return;
  const all = document.querySelectorAll<HTMLElement>(`[data-cell="${field}:${row}"]`);
  const el = Array.from(all).find((n) => n.offsetParent !== null) ?? all[0];
  el?.focus();
  if (el instanceof HTMLInputElement && el.type === "text") el.select();
}

export interface CellProps {
  column: CrmGridColumn;
  value: string;
  /** Satırın ızgaradaki sırası — Enter'ın nereye ineceğini bilmek için. */
  row: number;
  disabled?: boolean;
  /** Kaydeder; hata metni döner, sorun yoksa null. */
  onCommit: (_next: string) => Promise<string | null>;
  /** Taslak satırda kaydetme yok — değer yukarıda tutulur. */
  onDraftChange?: (_next: string) => void;
  /** Enter'a basıldı — taslak satırda kaydı açar. */
  onEnter?: () => void;
  className?: string;
  placeholder?: string;
}

interface OptionSet {
  options: { key: string; label: string }[];
  /** Boş seçeneğin etiketi. */
  emptyLabel: string;
}

/** Açılır kutuların seçenekleri — hepsi tek kaynaktan (constants / seeding). */
export function optionsFor(
  column: CrmGridColumn,
  members: { userId: string; name: string }[],
  segmentScope?: readonly string[] | null,
): OptionSet | null {
  switch (column.type) {
    case "segment": {
      /* Kutunun içindeyken YALNIZ o kutunun segmentleri listelenir: "Celebrity"
         içinde "Toptan" seçmek kaydı gözden kaybettirirdi (liste o kutuyu
         süzüyor). Kapsam yoksa hepsi. */
      const all = CRM_SEGMENTS.map((s) => ({ key: s.key, label: s.label }));
      const scoped = segmentScope?.length ? all.filter((s) => segmentScope.includes(s.key)) : all;
      return { options: scoped, emptyLabel: "—" };
    }
    case "status":
      return { options: CRM_STATUSES.map((s) => ({ key: s.key, label: s.label })), emptyLabel: "—" };
    case "source":
      return { options: CRM_SOURCE_CHANNELS.map((s) => ({ key: s.key, label: s.label })), emptyLabel: "—" };
    case "seeding":
      return {
        options: SEEDING_STEPS.map((s) => ({ key: s.key, label: `${s.order}/${SEEDING_STEPS.length} · ${s.label}` })),
        emptyLabel: "—",
      };
    case "owner":
      return { options: members.map((m) => ({ key: m.userId, label: m.name })), emptyLabel: "—" };
    default:
      return null;
  }
}

/**
 * Tek hücre. Yazılan değer yerelde tutulur; kaydetme ODAK ÇIKINCA olur
 * (her tuşta sunucuya gitmek hem ağı hem de `router.refresh()`'i yorardı).
 */
export function CrmCell({
  column, value, row, disabled, onCommit, onDraftChange, onEnter,
  members, segmentScope, className, placeholder,
}: CellProps & {
  members: { userId: string; name: string }[];
  segmentScope?: readonly string[] | null;
}) {
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const focused = useRef(false);

  /* Dışarıdan gelen değer yalnız odak DIŞARIDAYKEN uygulanır — yazarken
     gelen bir yenileme yazdığınızı silmesin. */
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  const isDraftRow = !!onDraftChange;
  const opts = optionsFor(column, members, segmentScope);
  const cellId = `${column.key}:${row}`;

  async function commit(next: string) {
    if (isDraftRow) { onDraftChange?.(next); return; }
    if (next === value) { setErr(null); return; }
    setBusy(true);
    const msg = await onCommit(next);
    setBusy(false);
    if (msg) { setErr(msg); return; }
    setErr(null);
  }

  const shared = {
    "data-cell": cellId,
    disabled,
    title: err ?? (draft || undefined),
    "aria-invalid": err ? true : undefined,
    "aria-label": column.label,
    className: cn(CELL, busy && CELL_SAVING, err && CELL_ERROR, className),
    onFocus: () => { focused.current = true; },
  };

  /* ── Açılır kutu: seçim anında kaydedilir (blur beklemek gereksiz) ── */
  if (opts) {
    return (
      <select
        {...shared}
        value={draft}
        /* Ok işareti globals.css'te tanımlı — tüm select'lerle aynı. */
        onChange={(e) => { setDraft(e.target.value); void commit(e.target.value); }}
        onBlur={() => { focused.current = false; }}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          /* Odak bayrağı ÖNCE düşer: taslak satırda Enter kaydı açar ve
             değerler sıfırlanır — bayrak açık kalsaydı bu hücre eski
             değerini gösterip satırın geri kalanından ayrışırdı. */
          focused.current = false;
          if (onEnter) onEnter();
          else focusCell(column.key, row + 1);
        }}
      >
        <option value="">{opts.emptyLabel}</option>
        {opts.options.map((o) => (
          <option key={o.key} value={o.key}>{o.label}</option>
        ))}
      </select>
    );
  }

  /* ── Metin / tarih / telefon / e-posta ── */
  const inputType = column.type === "date" ? "date" : "text";
  return (
    <input
      {...shared}
      type={inputType}
      inputMode={column.type === "tel" ? "tel" : column.type === "email" ? "email" : undefined}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => {
        setDraft(e.target.value);
        /* Tarih kutusunda "blur" takvimden seçince gelmeyebiliyor —
           taslak satırda değer anında yukarı taşınır. */
        if (isDraftRow) onDraftChange?.(e.target.value);
      }}
      onBlur={() => { focused.current = false; void commit(draft); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          focused.current = false;
          if (onEnter) { onEnter(); return; }
          void commit(draft).then(() => focusCell(column.key, row + 1));
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setDraft(value);
          setErr(null);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
