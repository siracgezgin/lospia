/**
 * Modül dizini — "ne nerede?" sorusunun TEK kaynağı.
 *
 * KURAL 1: isim-only başlık yok. Her kayıt çalışan bir ekrana gider; hazır
 * olmayan bir alan burada hiç listelenmez.
 * KURAL 2: tek isim — buradaki `title`, sidebar etiketi ve AppHeader
 * PAGE_TITLES ile birebir aynıdır. Aynı rotaya ikinci bir isimle kart açılmaz.
 * KURAL 3: bir rota bu dizinde en fazla BİR kez geçer. Segment/filtre
 * varyantları (?segment=, ?provider=) ayrı kart olmaz; hedef sayfanın kendi
 * filtresi olarak yaşar.
 *
 * Tüketiciler: /home kısayol ızgarası (role göre filtreler) ve /modules
 * yönetici hub'ı (sayaçlı kartlar). UI is Turkish; no technical enum values
 * reach the user.
 */

import type { LucideIcon } from "lucide-react";
import {
  Archive,
  Boxes,
  Calculator,
  CalendarRange,
  Contact,
  FileText,
  FolderOpen,
  HandCoins,
  Kanban,
  LayoutDashboard,
  List,
  Palette,
  ScrollText,
  Settings,
  ShieldCheck,
  Table2,
  Trash2,
  Wallet,
} from "lucide-react";

/** Kim GÖRÜR: "all" = tüm üyeler (düzenleme yetkisi ekran içinde isAdmin ile
 *  daralır — "herkes görsün, yönetici müdahale etsin"), "admin" = yalnız
 *  owner/admin (veri düzeyinde de kapalı: Finans, Arşiv, Çöp…). */
export type ModuleAccess = "all" | "admin";

/** Sidebar ve hub ile aynı bölüm dili. */
export type ModuleGroup = "calisma" | "urun" | "ofis" | "iliskiler" | "yonetim";

export interface ModuleEntry {
  key: string;
  /** Kanonik isim — sidebar + AppHeader PAGE_TITLES ile birebir aynı. */
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  access: ModuleAccess;
  group: ModuleGroup;
}

export const MODULE_GROUP_TITLES: Record<ModuleGroup, string> = {
  calisma: "Çekirdek Operasyon",
  urun: "Ürün",
  ofis: "Ofis Merkezi",
  iliskiler: "İlişkiler",
  yonetim: "Yönetim",
};

export const MODULE_DIRECTORY: ModuleEntry[] = [
  // ── Çalışma — günlük ritim ve iş takibi ───────────────────────────────────
  {
    key: "planning",
    title: "Calendar",
    description: "Tek takvim — haftalık toplantı ızgarası, ay ve yıl görünümü aynı ekranda.",
    href: "/planning",
    icon: CalendarRange,
    access: "all",
    group: "calisma",
  },
  {
    key: "board",
    title: "Pano",
    description: "Görev panosu — sürükle-bırak durum takibi.",
    href: "/board",
    icon: Kanban,
    access: "all",
    group: "calisma",
  },
  {
    key: "admin-board",
    title: "Yönetici Pano",
    description: "Yönetici görünümü — sorumluya göre kolonlar ve gizli görevler.",
    href: "/admin-board",
    icon: ShieldCheck,
    access: "admin",
    group: "calisma",
  },
  {
    key: "list",
    title: "Liste",
    description: "Tüm görevler tablo halinde — filtrele, sırala, düzenle.",
    href: "/list",
    icon: List,
    access: "all",
    group: "calisma",
  },
  {
    key: "dashboard",
    title: "Raporlar",
    description: "Departman ve durum bazlı özetler, gecikme analizi.",
    href: "/dashboard",
    icon: LayoutDashboard,
    access: "all",
    group: "calisma",
  },

  // ── Ürün — koleksiyon / föy çekirdeği ─────────────────────────────────────
  {
    key: "collection",
    title: "Koleksiyon",
    description: "Üretim föyleri, kategoriler, ölçüler ve fotoğraflar.",
    href: "/collection",
    icon: Boxes,
    access: "all",
    group: "urun",
  },
  {
    key: "maliyet",
    title: "Maliyet",
    description: "Ürün başına birim maliyet, kalem kalem: kumaş, dikim, fermuar, kalıp, genel giderler.",
    href: "/collection/maliyet",
    icon: Calculator,
    access: "all",
    group: "urun",
  },
  {
    key: "odeme",
    title: "Ödeme Tablosu",
    description: "Usta başına ödeme — hangi usta hangi ürünü dikti, ne kadar ödenecek.",
    href: "/collection/odeme",
    icon: HandCoins,
    access: "all",
    group: "urun",
  },

  // ── Ofis Merkezi — Word/Excel işlerinin sistemdeki karşılığı ──────────────
  {
    key: "documents",
    title: "Dokümanlar",
    description: "Operasyon metinleri, format e-postalar ve Drive bağlantıları.",
    href: "/documents",
    icon: FolderOpen,
    access: "all",
    group: "ofis",
  },
  {
    key: "templates",
    title: "Şablonlar",
    description: "Hazır iletişim formatları — kopyala, uyarla, gönder.",
    href: "/templates",
    icon: FileText,
    access: "all",
    group: "ofis",
  },
  {
    key: "sheets",
    title: "Tablolar",
    description: "Excel/CSV düzenleri ve operasyon tabloları.",
    href: "/sheets",
    icon: Table2,
    access: "all",
    group: "ofis",
  },
  {
    key: "creative",
    title: "Kreatif Linkler",
    description: "Canva, Drive, Figma ve lookbook bağlantıları tek listede.",
    href: "/creative",
    icon: Palette,
    access: "all",
    group: "ofis",
  },

  // ── İlişkiler — herkes görür, yönetici düzenler ───────────────────────────
  {
    key: "crm",
    title: "CRM",
    description: "Müşteri, tedarikçi ve influencer ilişkileri tek rehberde.",
    href: "/crm",
    icon: Contact,
    access: "all",
    group: "iliskiler",
  },

  // ── Yönetim — yalnız yönetici (veri düzeyinde de kapalı) ──────────────────
  {
    key: "finance",
    title: "Finans",
    description: "Ödeme takibi — kime, ne kadar, ne zaman.",
    href: "/finance",
    icon: Wallet,
    access: "admin",
    group: "yonetim",
  },
  {
    key: "activity",
    title: "Aktivite Günlüğü",
    description: "Kim, ne zaman, ne yaptı — tüm görev hareketleri.",
    href: "/activity",
    icon: ScrollText,
    access: "admin",
    group: "yonetim",
  },
  {
    key: "archive",
    title: "Arşiv",
    description: "Arşivlenen ve eski tamamlanmış görevler.",
    href: "/archive",
    icon: Archive,
    access: "admin",
    group: "yonetim",
  },
  {
    key: "trash",
    title: "Çöp Kutusu",
    description: "Silinen görevler — geri al ya da kalıcı sil.",
    href: "/trash",
    icon: Trash2,
    access: "admin",
    group: "yonetim",
  },
  {
    key: "settings",
    title: "Ayarlar",
    description: "Üyeler, davetler, departmanlar ve çalışma alanı.",
    href: "/settings",
    icon: Settings,
    access: "admin",
    group: "yonetim",
  },
];

/** Tek kayıt erişimi — hub kartları başlık/ikonu buradan okur (tek isim kuralı). */
export function getModuleEntry(key: string): ModuleEntry {
  const entry = MODULE_DIRECTORY.find((m) => m.key === key);
  if (!entry) throw new Error(`MODULE_DIRECTORY içinde '${key}' yok`);
  return entry;
}

/** Role göre filtrelenmiş dizin — /home kısayol ızgarasının veri kaynağı. */
export function modulesForRole(isAdmin: boolean): ModuleEntry[] {
  return MODULE_DIRECTORY.filter((m) => m.access === "all" || isAdmin);
}

// ---------------------------------------------------------------------------
// ESKİ departman-kart modeli — KULLANIM DIŞI.
// /modules artık DepartmentCard çizmiyor: 18 link yalnızca 8 rotaya gidiyor ve
// aynı ekranlara farklı isimlerle ikinci/üçüncü kapılar açıyordu ("her şey her
// yerde" karmaşasının kaynağı). Tip + veri, components/modules/DepartmentCard
// derlenmeye devam etsin diye duruyor; dosya silme onayıyla birlikte bu blok da
// kaldırılacak.
// ---------------------------------------------------------------------------

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

/** @deprecated /modules artık bu listeyi çizmiyor — bkz. MODULE_DIRECTORY. */
export const DEPARTMENT_MODULES: DepartmentModule[] = [];
