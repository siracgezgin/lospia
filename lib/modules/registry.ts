/**
 * Operasyon Modülleri — the department hub definition.
 *
 * Single source of truth for the /modules screen. Each department maps to an
 * AF colour family (see lib/design/semantics) and lists the operational areas
 * a user can jump into.
 *
 * KURAL: isim-only başlık yok. Her link çalışan bir modüle gider; hazır
 * olmayan bir alan burada hiç listelenmez (veri ihtiyacı doğunca gerçek
 * modülüyle birlikte eklenir). UI is Turkish; there are no technical enum
 * values here that reach the user.
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
      "Üretim föyleri, koleksiyon, maliyet ve tedarikçi takibi.",
    colorKey: "orange",
    links: [
      { label: "Koleksiyon & Üretim Föyleri", href: "/collection", readiness: "ready" },
      { label: "Maliyet Tablosu", href: "/collection/maliyet", readiness: "ready" },
      { label: "Tedarikçiler", href: "/crm?segment=tedarikci", readiness: "ready" },
    ],
  },
  {
    key: "tasarim",
    departmentName: "Tasarım & Yaratıcı Yön",
    title: "Tasarım & Yaratıcı Yön",
    description:
      "Kreatif referanslar, Canva/Drive bağlantıları ve koleksiyon görselleri.",
    colorKey: "purple",
    links: [
      { label: "Kreatif Linkler", href: "/creative", readiness: "ready" },
      { label: "Canva / Drive Bağlantıları", href: "/creative?provider=canva", readiness: "ready" },
      { label: "Koleksiyon Görselleri", href: "/collection", readiness: "ready" },
    ],
  },
  {
    key: "satis",
    departmentName: "Satış & Ticaret",
    title: "Satış & Ticaret",
    description:
      "Müşteri ilişkileri ve satış görünümü — hareket verisi Gösterge Paneli'nde.",
    colorKey: "blue",
    links: [
      { label: "CRM / Müşteriler", href: "/crm", readiness: "ready" },
      { label: "Gösterge Paneli", href: "/dashboard", readiness: "ready" },
    ],
  },
  {
    key: "finans",
    departmentName: "Finans & Operasyon",
    title: "Finans & Operasyon",
    description:
      "Ödeme takibi ve maliyet — hassas alanlar yalnız yönetici görür.",
    colorKey: "brown",
    links: [
      { label: "Ödeme Takibi", href: "/finance", readiness: "ready", adminOnly: true },
      { label: "Maliyet Tablosu", href: "/collection/maliyet", readiness: "ready" },
      { label: "Gösterge Paneli", href: "/dashboard", readiness: "ready" },
    ],
  },
  {
    key: "marka",
    departmentName: "Marka Yönetimi / CEO Katmanı",
    title: "Marka Yönetimi / CEO Katmanı",
    description:
      "Haftalık ritim, yönetici görünümü ve markanın genel durum raporları.",
    colorKey: "red",
    links: [
      { label: "Planlama Takvimi", href: "/planning", readiness: "ready" },
      { label: "Yönetici Görünümü", href: "/admin-board", readiness: "ready", adminOnly: true },
      { label: "Kurallar", href: "/rules", readiness: "ready" },
    ],
  },
];
