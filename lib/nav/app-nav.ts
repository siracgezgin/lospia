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
      /* LIST — Reports'un yerine.
         Sıraç (2026-08-29): "Reports / size atanan işler ve teslim tarihleri
         yerine List gelecek." Üyeye Reports'un anlattığı şey (bana atanan
         işler + teslim tarihleri) zaten List'in tablosuydu; menüde iki kapı
         aynı soruyu cevaplıyordu. Raporlar artık List'in şeridindeki son
         sekmedir (bkz. components/shared/SurfaceTabs) — kendi rotasında
         yaşamaya devam eder, menüde ikinci bir başlık açmaz. */
      link("list"),
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
 * MENÜDE SATIRI OLMAYAN ROTALARIN SAHİBİ.
 *
 * Bazı ekranlar kendi rotasında yaşar ama menüde kendi satırı YOKTUR — çünkü
 * bir başka yüzeyin sekmesi ya da alt sayfasıdır (tek rota = tek isim kuralı,
 * ikinci kapı açmıyoruz). Eşleme olmadan o sayfalarda menüde hiçbir satır
 * yanmıyor, kullanıcı "neredeyim?" sorusunu kaybediyordu.
 *
 * Anahtar bir ÖNEK'tir: "/x" hem "/x" hem "/x/…" ile eşleşir. Değer, menüde
 * yanacak satırın href'idir ve NAV_SECTIONS içinde GERÇEKTEN bulunmalıdır.
 */
const ROUTE_OWNER: ReadonlyArray<readonly [prefix: string, owner: string]> = [
  // Raporlar List yüzeyinin son sekmesidir (bkz. components/shared/SurfaceTabs).
  ["/dashboard", "/list"],
  // Kişi bazlı tek sayfa rapor — Raporlar'ın alt sayfası, yani yine List.
  ["/reports", "/list"],
  // Sheets sol bardan kalktı; AF Teamwork'ün kutucuğudur.
  // (Library henüz bir rota olarak açılmadı — açıldığında buraya "/library"
  //  satırı eklenir; olmayan rota için burada ölü satır tutmuyoruz.)
  ["/sheets", "/documents"],
  // Üretim Föyü editörü Koleksiyon'dan açılır; kendi menü satırı yoktur.
  ["/production", "/collection"],
  // Pano kuralları — Pano'nun kurallar panelinden açılan alt sayfa.
  ["/rules", "/board"],
  // Görev detayı tam sayfa açılabilir; işlerin listelendiği yüzey List'tir.
  ["/tasks", "/list"],
  /* Hareket kaydı · Arşiv · Çöp: /modules hub'ından ve profil menüsünden
     açılan YÖNETİCİ yüzeyleri. Menüde kendi satırları yok (Admin bölümü üç
     satırla sınırlı) — hepsi Ayarlar'ın yanında yaşar, o yüzden orada yanar.
     Eşleme olmadan masaüstünde hiçbir satır, telefonda ise "Menu" sekmesi de
     yanmıyordu (menuActive activeHref'e bağlı). */
  ["/activity", "/settings"],
  ["/archive", "/settings"],
  ["/trash", "/settings"],
];

/**
 * Aktif satır = EN UZUN eşleşen href (tek kazanan).
 * /collection/maliyet açıkken hem Collection hem Cost yanmasın diye.
 */
export function activeNavHref(pathname: string): string | null {
  const owned = ROUTE_OWNER.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(prefix + "/"),
  );
  if (owned) return owned[1];

  return (
    [...NAV_SECTIONS.flatMap((s) => s.items), NAV_DIRECTORY]
      .map((i) => i.href)
      .filter((h) => pathname === h || pathname.startsWith(h + "/"))
      .sort((a, b) => b.length - a.length)[0] ?? null
  );
}
