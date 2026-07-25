// Planlama toplantı kategorileri — Aslı'nın takvimindeki renk paterni.
// Renk zihinde tekrar eden patern oluşturur (Üretim hep sarı, 09:00 gibi).
import type { PlanningCategory } from "@/types";

export type CategoryMeta = {
  key: PlanningCategory;
  label: string;
  cell: string;   // hücre arka planı + kenarlık
  title: string;  // başlık metni rengi
  chip: string;   // seçici/legend rozeti
  dot: string;    // küçük renk noktası
};

export const PLANNING_CATEGORIES: CategoryMeta[] = [
  { key: "uretim",    label: "Üretim",    cell: "bg-amber-50 border-amber-200",     title: "text-amber-900",   chip: "bg-amber-100 text-amber-900",     dot: "bg-amber-400" },
  { key: "ai",        label: "AI",        cell: "bg-rose-50 border-rose-200",       title: "text-rose-800",    chip: "bg-rose-100 text-rose-800",       dot: "bg-rose-400" },
  { key: "marketing", label: "Marketing", cell: "bg-sky-50 border-sky-200",         title: "text-sky-800",     chip: "bg-sky-100 text-sky-800",         dot: "bg-sky-400" },
  { key: "sales",     label: "Sales",     cell: "bg-violet-50 border-violet-200",   title: "text-violet-800",  chip: "bg-violet-100 text-violet-800",   dot: "bg-violet-400" },
  { key: "finance",   label: "Finans",    cell: "bg-orange-50 border-orange-200",   title: "text-orange-800",  chip: "bg-orange-100 text-orange-800",   dot: "bg-orange-400" },
  { key: "system",    label: "Sistem",    cell: "bg-emerald-50 border-emerald-200", title: "text-emerald-800", chip: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-400" },
  { key: "external",  label: "Dış / Diğer", cell: "bg-pink-50 border-pink-200",     title: "text-pink-700",    chip: "bg-pink-100 text-pink-700",       dot: "bg-pink-400" },
  { key: "other",     label: "Diğer",     cell: "bg-slate-50 border-slate-200",     title: "text-slate-700",   chip: "bg-slate-100 text-slate-700",     dot: "bg-slate-400" },
];

const BY_KEY = new Map(PLANNING_CATEGORIES.map((c) => [c.key, c]));

export function categoryMeta(key: string | null | undefined): CategoryMeta {
  return BY_KEY.get((key as PlanningCategory) ?? "other") ?? PLANNING_CATEGORIES[PLANNING_CATEGORIES.length - 1];
}
