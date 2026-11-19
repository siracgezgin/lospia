import { canonicalSize, orderSizes } from "@/lib/collection/cost";
import type { MeasurementRow } from "@/types";

/**
 * ÖLÇÜLERİ OKUMA — TEK YER.
 *
 * Bir ölçünün değeri iki yerde durabilir: eski föylerde tek hücre (`value`),
 * 24.09.2026'dan beri beden başına (`values`: { S: "70", M: "74" }). Föy
 * ekranı ikisini de biliyordu ama ÇIKTILAR bilmiyordu: Excel, tek sayfa çıktı,
 * üretici paneli ve "ölçü girildi mi?" denetimi yalnız `value` okuyor, bedenli
 * girilen ölçü kâğıtta BOŞ çıkıyor, föy de "ölçü eksik" demeye devam ediyordu.
 * Üreticiye giden kâğıtta eksik ölçü, olmayan ölçüden kötüdür.
 *
 * Bu dosya saf okumadır; hiçbir şeyi değiştirmez.
 */

type Row = Pick<MeasurementRow, "label" | "value" | "values"> & { no?: string };

const txt = (v: unknown) => String(v ?? "").trim();

/** Satırın bedenli değerleri — kanonik beden adıyla, boşlar atılmış. */
export function sizedValues(row: Row | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = row?.values;
  if (!raw || typeof raw !== "object") return out;
  for (const [size, v] of Object.entries(raw)) {
    const key = canonicalSize(size);
    if (key && txt(v)) out[key] = txt(v);
  }
  return out;
}

/** Ölçü girilmiş mi? (tek değer ya da herhangi bir bedende) */
export function measurementHasValue(row: Row | null | undefined): boolean {
  return txt(row?.value) !== "" || Object.keys(sizedValues(row)).length > 0;
}

/** Kâğıda yazılmaya değer satır: adı ya da değeri olan. */
export function measurementPrintable(row: Row | null | undefined): boolean {
  return txt(row?.label) !== "" || measurementHasValue(row);
}

export type MeasurementTable = {
  /** Değeri olan bedenler, föydeki beden sırasıyla. */
  sizes: string[];
  /** Bedensiz tek değer taşıyan satır var mı? (eski föy / tek beden) */
  legacy: boolean;
  rows: { no: string; label: string; value: string; bySize: Record<string, string> }[];
};

/** Ölçüleri çıktıya hazır tabloya çevirir — boş satırlar atılır, numara sıradan gelir. */
export function measurementTable(rows: Row[] | null | undefined): MeasurementTable {
  const kept = (Array.isArray(rows) ? rows : []).filter(measurementPrintable);
  const table = kept.map((r, i) => ({
    no: String(i + 1),
    label: txt(r.label),
    value: txt(r.value),
    bySize: sizedValues(r),
  }));
  return {
    sizes: orderSizes(table.flatMap((r) => Object.keys(r.bySize))),
    legacy: table.some((r) => r.value !== ""),
    rows: table,
  };
}

/** Tek satırlık okunur hâl: "70" ya da "S 70 · M 74 · L 78". */
export function measurementLine(row: Row | null | undefined): string {
  const by = sizedValues(row);
  const sized = orderSizes(Object.keys(by)).map((s) => `${s} ${by[s]}`).join(" · ");
  return [txt(row?.value), sized].filter(Boolean).join(" · ");
}
