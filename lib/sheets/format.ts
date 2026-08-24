/**
 * Hücre görüntüleme biçimi.
 *
 * Hesaplanan skaler → ekranda görünecek metin. Biçim seçilmemişse ("auto")
 * sayı, ondalığı varsa Türkçe ayraçla; yoksa binlik ayraçsız düz yazılır —
 * "Kod: 2026" gibi alanların 2.026 olmasını istemiyoruz.
 */

import { isError, type Scalar } from "./formula";
import type { CellStyle, NumberFormat } from "./model";

const TR = "tr-TR";

export function formatValue(value: Scalar, style?: CellStyle): string {
  if (value === "" || value === null || value === undefined) return "";
  if (isError(value)) return value;
  if (typeof value === "boolean") return value ? "DOĞRU" : "YANLIŞ";

  const fmt: NumberFormat = style?.n ?? "auto";
  if (fmt === "text") return String(value);

  if (typeof value !== "number") return String(value);

  const d = style?.d;
  switch (fmt) {
    case "money":
      return value.toLocaleString(TR, {
        style: "currency", currency: "TRY",
        minimumFractionDigits: d ?? 2, maximumFractionDigits: d ?? 2,
      });
    case "percent":
      return value.toLocaleString(TR, {
        style: "percent",
        minimumFractionDigits: d ?? 0, maximumFractionDigits: d ?? 2,
      });
    case "number":
      return value.toLocaleString(TR, {
        minimumFractionDigits: d ?? 0, maximumFractionDigits: d ?? 2,
      });
    case "date": {
      // Excel seri numarası (1900 tabanı) → tarih; değilse olduğu gibi.
      if (value > 0 && value < 100000) {
        const ms = (value - 25569) * 86400000;
        const dt = new Date(ms);
        if (!Number.isNaN(dt.getTime())) return dt.toLocaleDateString(TR);
      }
      return String(value);
    }
    default: {
      // auto — ondalıklıysa en fazla 10 basamak, binlik ayraç YOK.
      if (Number.isInteger(value)) return String(value);
      return String(Number(value.toFixed(10))).replace(".", ",");
    }
  }
}

/** Hücre metni sağa mı yaslanmalı? (biçim yoksa: sayı sağa, metin sola) */
export function alignOf(value: Scalar, style?: CellStyle): "left" | "center" | "right" {
  if (style?.a === "l") return "left";
  if (style?.a === "c") return "center";
  if (style?.a === "r") return "right";
  if (isError(value)) return "center";
  return typeof value === "number" ? "right" : "left";
}

export const NUMBER_FORMAT_LABELS: { key: NumberFormat; label: string }[] = [
  { key: "auto",    label: "Genel" },
  { key: "number",  label: "Sayı" },
  { key: "money",   label: "Para (₺)" },
  { key: "percent", label: "Yüzde" },
  { key: "date",    label: "Tarih" },
  { key: "text",    label: "Metin" },
];
