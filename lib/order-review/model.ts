/**
 * SİPARİŞ DEĞERLENDİRME — ortak tanımlar (ekran, Excel içe/dışa aktarma ve
 * sunucu eylemleri aynı listeleri buradan okur).
 *
 * Kaynak: Asli_Filinta_Siparis_Degerlendirme.xlsx (Nisa Hanım, 29.10.2026).
 */
import type { OrderReviewCurrency, OrderReviewDecision } from "@/types";

/** Excel'deki açılır listenin dört değeri — aynı sıra, aynı yazım. */
export const DECISIONS: { key: OrderReviewDecision; label: string; tone: string }[] = [
  { key: "degerlendirmede", label: "Değerlendirmede", tone: "bg-surface-sunken text-muted" },
  { key: "onaylandi", label: "Onaylandı", tone: "bg-success/12 text-success" },
  { key: "revize", label: "Revize", tone: "bg-warning/15 text-warning" },
  { key: "reddedildi", label: "Reddedildi", tone: "bg-danger/10 text-danger" },
];

export const CURRENCIES: OrderReviewCurrency[] = ["TL", "USD", "EUR", "GBP"];

export function decisionLabel(d: OrderReviewDecision): string {
  return DECISIONS.find((x) => x.key === d)?.label ?? "Değerlendirmede";
}

/** Serbest metni (Excel hücresi) karar anahtarına çevirir; tanınmazsa null. */
export function parseDecision(text: string): OrderReviewDecision | null {
  const t = text.trim().toLocaleLowerCase("tr");
  if (!t) return null;
  if (t.startsWith("onay")) return "onaylandi";
  if (t.startsWith("revize")) return "revize";
  if (t.startsWith("red")) return "reddedildi";
  if (t.startsWith("değer") || t.startsWith("deger")) return "degerlendirmede";
  return null;
}

/** "USD", "$", "dolar" → USD. Tanınmazsa null. */
export function parseCurrency(text: string): OrderReviewCurrency | null {
  const t = text.trim().toLocaleLowerCase("tr");
  if (!t) return null;
  if (t === "$" || t.includes("usd") || t.includes("dolar")) return "USD";
  if (t === "€" || t.includes("eur") || t.includes("avro")) return "EUR";
  if (t === "£" || t.includes("gbp") || t.includes("sterlin")) return "GBP";
  if (t === "₺" || t.includes("tl") || t.includes("try") || t.includes("lira")) return "TL";
  return null;
}

/**
 * Bir sonraki ürün kodu: Excel şablonu V-001, V-002… diye gidiyordu. Son
 * kodun sonundaki sayı bir artırılır, basamak sayısı korunur ("V-009" →
 * "V-010"). Sayıyla bitmeyen koddan sonra boş döner — uydurma kod yazılmaz.
 */
export function nextCode(codes: string[]): string {
  for (let i = codes.length - 1; i >= 0; i--) {
    const m = /^(.*?)(\d+)$/.exec(codes[i].trim());
    if (!m) continue;
    const n = String(Number(m[2]) + 1).padStart(m[2].length, "0");
    return `${m[1]}${n}`;
  }
  return codes.length === 0 ? "V-001" : "";
}

/** Sıra numarası Excel'deki gibi iki basamak: 01, 02 … */
export const rowNo = (index: number) => String(index + 1).padStart(2, "0");

/** "2026-10-27" → "27.10.2026" */
export function formatDateTr(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}.${m}.${y}` : "";
}

/** Kısa tarih — not başlığı: "27.10" */
export function formatDayMonth(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return m && d ? `${d}.${m}` : iso;
}

/** Depo yolu kökü: production-sheets/{ws}/siparis/{reviewId}/… */
export const ORDER_REVIEW_BUCKET = "production-sheets";
export const photoPrefix = (workspaceId: string, reviewId: string) =>
  `${workspaceId}/siparis/${reviewId}/`;
