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

/* TAKVİM ARTIK UYGULAMANIN PALETİNİ KONUŞUYOR (2026-09-12).
   Bu dosya Tailwind'in HAZIR renkleriyle yazılmıştı (amber-50, rose-200,
   emerald-800…) — yani panelin geri kalanıyla hiçbir akrabalığı yoktu. Takvim
   her hafta açılan ekran olduğu için fark en çok burada göze batıyordu:
   "Üretim" hücresi Tailwind sarısı, aynı işin Pano'daki kartı İznik turuncusu.

   Her kategori artık bir DEPARTMAN AİLESİNE bağlı (lib/design/semantics.ts) ve
   aynı merdivenden geçiyor: hücre L*95/C*9, kenarlık L*84.5/C*21, başlık L*34,
   çip L*88.5/C*17, nokta L*48. Dokuz kategorinin de başlık kontrastı 7.09–7.14,
   çip kontrastı 5.97–6.02.

   "Sistem" MARKA hue'sunu (252°) aldı: eskiden emerald'dı, yani ayrılmış
   "tamamlandı" yeşiliyle aynı aileydi. "Diğer" tek nötr olarak kalır — kimliği
   olmayan toplantı renk taşımasın. */
export const PLANNING_CATEGORIES: CategoryMeta[] = [
  { key: "uretim",    label: "Üretim",    cell: "bg-[#ffede2] border-[#f3cbb1]", title: "text-[#7c400e]", chip: "bg-[#f9d8c3] text-[#7c400e]", dot: "bg-[#af5c16]" },
  { key: "ai",        label: "AI",        cell: "bg-[#dcf5f9] border-[#9edee7]", title: "text-[#185860]", chip: "bg-[#b4e7ef] text-[#185860]", dot: "bg-[#237d88]" },
  { key: "marketing", label: "Marketing", cell: "bg-[#ffebf5] border-[#f5c6de]", title: "text-[#921d68]", chip: "bg-[#fad4e7] text-[#921d68]", dot: "bg-[#ce2a93]" },
  { key: "sales",     label: "Sales",     cell: "bg-[#eef0ff] border-[#cbd1f9]", title: "text-[#1a4d9f]", chip: "bg-[#d8dcfd] text-[#1a4d9f]", dot: "bg-[#286ede]" },
  { key: "finance",   label: "Finans",    cell: "bg-[#f6f1df] border-[#ded3ac]", title: "text-[#595110]", chip: "bg-[#e7debe] text-[#595110]", dot: "bg-[#7e7318]" },
  { key: "system",    label: "Sistem",    cell: "bg-[#e3f3ff] border-[#aed8f8]", title: "text-[#175575]", chip: "bg-[#c2e2fc] text-[#175575]", dot: "bg-[#2479a4]" },
  { key: "tasarim",   label: "Tasarım",   cell: "bg-[#f6eefe] border-[#deccf2]", title: "text-[#5b1cd8]", chip: "bg-[#e7d8f7] text-[#5b1cd8]", dot: "bg-[#894def]" },
  { key: "external",  label: "Dış / Diğer", cell: "bg-[#ffecef] border-[#f4c8cf]", title: "text-[#8b2f47]", chip: "bg-[#fad5db] text-[#8b2f47]", dot: "bg-[#d62963]" },
  { key: "other",     label: "Diğer",     cell: "bg-[#edf1f5] border-[#c9d5dc]", title: "text-[#3f535e]", chip: "bg-[#d6e0e6] text-[#3f535e]", dot: "bg-[#5b7686]" },
];

const BY_KEY = new Map(PLANNING_CATEGORIES.map((c) => [c.key, c]));

export function categoryMeta(key: string | null | undefined): CategoryMeta {
  return BY_KEY.get((key as PlanningCategory) ?? "other") ?? PLANNING_CATEGORIES[PLANNING_CATEGORIES.length - 1];
}
