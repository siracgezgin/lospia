/**
 * UYGULAMA GEZİNMESİNİN TEK KAYNAĞI.
 *
 * Sıraç (2026-08-29): "Sol taraf dümdüz yazı gibi duruyor, ayırt edilemiyor…
 * bir yandan operasyon paneli bir yandan ayarlar… birbiriyle entegre olan
 * şeyler aynı yerde olmalı, bazı başlıklar başka yerlerde tekrarlanmamalı."
 *
 * İki ayrı liste vardı — sol menü kendi etiketlerini, mobil alt gezinme kendi
 * etiketlerini yazıyordu — ve ikisi de MODULE_DIRECTORY'den bağımsızdı. Aynı
 * ekran üç yerde üç kez tanımlanınca "tek isim" kuralı elle korunmak zorunda
 * kalıyordu. Artık her satır registry kaydından türer: başlık ve ikon TEK
 * yerden gelir, sol menü ile mobil menü ASLA ayrışamaz.
 *
 * Bölümleme mantığı — kullanıcının işine göre, üç sabit grup:
 *   Core Operations  → günün ritmi: bugün ne yapacağım, ne zaman, nerede duruyor
 *   Product & Office → üzerinde çalışılan şeyler: koleksiyon, dosyalar, kişiler
 *   Admin            → YALNIZ yöneticinin müdahale ettiği yüzeyler (üyede hiç
 *                      çizilmez): yönetici panosu, para, çalışma alanı ayarları
 *
 * "Operation Modules" hiçbir gruba girmez: o bir modül değil, modüllerin
 * DİZİNİ. Grup içinde dururken "Ayarlar'ın yanındaki panel" gibi okunuyordu;
 * artık menünün altında, ayraçla ayrılmış tek bir kapı.
 */

import type { LucideIcon } from "lucide-react";
import { Home, LayoutGrid } from "lucide-react";
import { getModuleEntry, MODULE_GROUP_TITLES } from "@/lib/modules/registry";

export interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
  /** true → yalnız owner/admin görür (veri düzeyinde de kapalı ekranlar). */
  adminOnly: boolean;
}

export interface NavSection {
  title: string;
  items: NavLink[];
}

/** Registry kaydını gezinme satırına çevirir — isim/ikon/erişim TEK kaynaktan. */
function link(key: string): NavLink {
  const m = getModuleEntry(key);
  return { href: m.href, label: m.title, icon: m.icon, adminOnly: m.access === "admin" };
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: MODULE_GROUP_TITLES.calisma,
    items: [
      // Ana Sayfa registry'de yoktur: hub'ın kendisi de oraya bağlı, dizinde
      // ikinci kez kart açmak "her şey her yerde"nin ta kendisi olurdu.
      { href: "/home", label: "Home Page", icon: Home, adminOnly: false },
      link("planning"),
      link("board"),
      link("dashboard"),
    ],
  },
  {
    title: MODULE_GROUP_TITLES.urun,
    items: [link("collection"), link("documents"), link("crm")],
  },
  {
    // Üyede bu bölüm HİÇ çizilmez (aşağıdaki filtre boş bölümü düşürür).
    title: MODULE_GROUP_TITLES.yonetim,
    items: [link("admin-board"), link("finance"), link("settings")],
  },
];

/** Menünün altındaki dizin kapısı — bir modül değil, modüllerin haritası. */
export const NAV_DIRECTORY: NavLink = {
  href: "/modules",
  label: "Operation Modules",
  icon: LayoutGrid,
  adminOnly: false,
};

/** Role göre görünür bölümler; içi boşalan bölüm hiç çizilmez. */
export function navSectionsForRole(isAdmin: boolean): NavSection[] {
  return NAV_SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((i) => !i.adminOnly || isAdmin),
  })).filter((s) => s.items.length > 0);
}

/**
 * Aktif satır = EN UZUN eşleşen href (tek kazanan).
 * /collection/maliyet açıkken hem Collection hem Cost yanmasın diye.
 */
export function activeNavHref(pathname: string): string | null {
  return (
    [...NAV_SECTIONS.flatMap((s) => s.items), NAV_DIRECTORY]
      .map((i) => i.href)
      .filter((h) => pathname === h || pathname.startsWith(h + "/"))
      .sort((a, b) => b.length - a.length)[0] ?? null
  );
}
