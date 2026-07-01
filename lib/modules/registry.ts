/**
 * Operasyon Modülleri — the department hub definition.
 *
 * Single source of truth for the /modules screen and the placeholder module
 * shells. Each department maps to an AF colour family (see lib/design/semantics)
 * and lists the operational areas a user can jump into. Route targets that are
 * not fully built yet ("hazırlık") point at safe placeholder shells, so nothing
 * ever 404s.
 *
 * UI is Turkish; there are no technical enum values here that reach the user.
 */

export type ModuleReadiness = "ready" | "prep";

export interface ModuleLink {
  label: string;
  href: string;
  readiness: ModuleReadiness;
  /** Only surfaced to owner/admin when true (e.g. yönetici görünümü). */
  adminOnly?: boolean;
}

export interface DepartmentModule {
  /** Stable key — also matches the seeded department name for task counts. */
  key: string;
  /** Department name exactly as seeded (used to join live task counts). */
  departmentName: string;
  title: string;
  description: string;
  /** AF design colour family key (see lib/design/semantics FAMILY). */
  colorKey: string;
  links: ModuleLink[];
}

export const DEPARTMENT_MODULES: DepartmentModule[] = [
  {
    key: "pazarlama",
    departmentName: "Pazarlama & İletişim",
    title: "Pazarlama & İletişim",
    description:
      "Marka iletişimi, PR, influencer ilişkileri ve içerik akışı tek yerde.",
    colorKey: "pink",
    links: [
      { label: "CRM / İlişkiler", href: "/crm", readiness: "ready" },
      { label: "PR & Influencerlar", href: "/crm?segment=influencer", readiness: "ready" },
      { label: "İçerik / Kreatif Linkler", href: "/creative", readiness: "ready" },
    ],
  },
  {
    key: "uretim",
    departmentName: "Üretim & Tedarik Zinciri",
    title: "Üretim & Tedarik Zinciri",
    description:
      "Koleksiyon, kumaş/stok görünürlüğü ve tedarikçi takibi.",
    colorKey: "orange",
    links: [
      { label: "Koleksiyon & Üretim", href: "/collection", readiness: "ready" },
      { label: "Stok / Kumaş", href: "/inventory", readiness: "prep" },
      { label: "Tedarikçiler", href: "/crm?segment=tedarikci", readiness: "ready" },
    ],
  },
  {
    key: "tasarim",
    departmentName: "Tasarım & Yaratıcı Yön",
    title: "Tasarım & Yaratıcı Yön",
    description:
      "Kreatif referanslar, Canva/Drive bağlantıları ve lookbook düzeni.",
    colorKey: "purple",
    links: [
      { label: "Kreatif Linkler", href: "/creative", readiness: "ready" },
      { label: "Canva / Drive Bağlantıları", href: "/creative?provider=canva", readiness: "ready" },
      { label: "Lookbook / Katalog", href: "/creative", readiness: "prep" },
    ],
  },
  {
    key: "satis",
    departmentName: "Satış & Ticaret",
    title: "Satış & Ticaret",
    description:
      "Müşteri ilişkileri, satış/konsinye takibi ve satış raporları.",
    colorKey: "blue",
    links: [
      { label: "CRM / Müşteriler", href: "/crm", readiness: "ready" },
      { label: "Satış & Konsinye", href: "/sales", readiness: "prep" },
      { label: "Raporlar", href: "/reports", readiness: "prep" },
    ],
  },
  {
    key: "finans",
    departmentName: "Finans & Operasyon",
    title: "Finans & Operasyon",
    description:
      "Maliyet, fatura hazırlığı ve operasyon raporlarının toplandığı alan.",
    colorKey: "brown",
    links: [
      { label: "Raporlar", href: "/reports", readiness: "prep" },
      { label: "Maliyet / Fatura Hazırlık", href: "/finance", readiness: "prep" },
    ],
  },
  {
    key: "marka",
    departmentName: "Marka Yönetimi / CEO Katmanı",
    title: "Marka Yönetimi / CEO Katmanı",
    description:
      "Yönetici görünümü, kurallar ve markanın genel durum raporları.",
    colorKey: "red",
    links: [
      { label: "Yönetici Görünümü", href: "/admin-board", readiness: "ready", adminOnly: true },
      { label: "Kurallar", href: "/rules", readiness: "ready" },
      { label: "Raporlar", href: "/reports", readiness: "prep" },
    ],
  },
];

// ── Placeholder module shells (Faz 1'de sadece hazırlık) ──────────────────────

export interface ModuleShell {
  slug: string;
  title: string;
  summary: string;
  purpose: string[];
}

export const MODULE_SHELLS: Record<string, ModuleShell> = {
  inventory: {
    slug: "inventory",
    title: "Stok / Kumaş",
    summary: "Kumaş ve stok görünürlüğü bu alanda toplanacak.",
    purpose: [
      "Kumaş, aksesuar ve ürün stoklarının tek yerden görünürlüğü.",
      "Şimdilik veriler Koleksiyon & Üretim ekranında salt okunur gösteriliyor.",
      "Kalıcı stok hareketi bu fazda yazılmıyor; önce sistematik oturuyor.",
    ],
  },
  production: {
    slug: "production",
    title: "Üretim Planlama",
    summary: "Numune, üretim planı ve kalite kontrol akışı için hazırlık.",
    purpose: [
      "Numune onayı, üretim planı ve kalite kontrol adımlarının takibi.",
      "İş takibi bugün Pano ve Liste üzerinden yürüyor.",
      "Detaylı üretim modülü sonraki fazda açılacak.",
    ],
  },
  reports: {
    slug: "reports",
    title: "Raporlar",
    summary: "Departman ve marka geneli raporların toplanacağı alan.",
    purpose: [
      "Satış, üretim ve operasyon özetleri tek ekranda toplanacak.",
      "Şimdilik Gösterge Paneli temel özetleri sağlıyor.",
      "Gelişmiş raporlar kontrollü şekilde eklenecek.",
    ],
  },
  sales: {
    slug: "sales",
    title: "Satış & Konsinye",
    summary: "Toptan, perakende ve konsinye takibi için hazırlık.",
    purpose: [
      "Toptan/perakende satış ve konsinye noktalarının takibi.",
      "Müşteri ilişkileri şimdiden CRM ekranında tutuluyor.",
      "Satış hareketleri sonraki fazda kontrollü açılacak.",
    ],
  },
  finance: {
    slug: "finance",
    title: "Maliyet / Fatura Hazırlık",
    summary: "Maliyetlendirme ve fatura hazırlık alanı için hazırlık.",
    purpose: [
      "Maliyet ve fatura hazırlığı için düzenli bir çalışma alanı.",
      "Hassas finansal alanlar ileride ayrı yetki ile korunacak.",
      "Bu fazda hesaplama/entegrasyon yazılmıyor.",
    ],
  },
};
