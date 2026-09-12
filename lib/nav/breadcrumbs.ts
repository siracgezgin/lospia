/**
 * KIRINTI YOLU — "neredeyim ve geri gidersem nereye düşerim?" sorusunun
 * TEK kaynağı.
 *
 * Sıraç (2026-09-12):
 *   "Buradaki hiyerarşi mantığı çok karmaşık duruyor, site genelinde tüm
 *    sayfalarda ve hiç anlaşılır değil. Geri gelince nereye geldiğin belli
 *    değil. Bakınca da anlaşılmıyor, tıklayınca da. Bazısında var, bazısında
 *    yok, bazısı eksik, bazısı bozuk."
 *
 * NE VARDI: üç ayrı desen aynı anda yaşıyordu.
 *   1. `BackLink` — yalnız "← Geri" yazıyordu. NEREYE gideceğini söylemiyordu;
 *      kullanıcı tıklamadan önce bilemiyor, tıkladıktan sonra da nereye
 *      düştüğünü anlamıyordu.
 *   2. `ModulePageHeader` — 10 sayfada BackLink'i sarıyordu, gerisinde yoktu.
 *   3. Her ekranın KENDİ zinciri (Drive'ın klasör yolu, Koleksiyon'un
 *      kategorileri). Drive'ınki "AF Teamwork › Excel › 🏠 › Excel Tabloları"
 *      çiziyordu: ev ikonu kutu bağlantısıyla AYNI işi yapıyor ve zincirin
 *      ORTASINDA duruyordu.
 *
 * KURAL ARTIK TEK: her ekran, kök modülünden başlayan tam bir zincir gösterir.
 * Zincirin rota kısmı BURADAN türer; sayfa içi derinlik (klasör, kategori)
 * ekranın kendisi tarafından sonuna eklenir. Böylece tek bir görsel dil ve
 * tek bir "üst" tanımı olur.
 *
 * Rota adları MODULE_DIRECTORY'den okunur — sol menü, /modules hub'ı ve
 * uygulama çubuğu neyse kırıntı yolu da o (tek terminoloji kuralı).
 */

import { MODULE_DIRECTORY } from "@/lib/modules/registry";
import { parentPathOf } from "@/lib/nav/parent-path";

export interface Crumb {
  label: string;
  /** Tıklanabilir hedef. Son halkada (bulunduğun yer) verilmez. */
  href?: string;
}

/**
 * Kayıtta olmayan ama kendi sayfası olan rotaların adları. MODULE_DIRECTORY
 * bir DİZİNDİR: yalnız sol menüden gidilen yüzeyleri listeler. Detay sayfaları
 * (bir tablo, bir föy, bir kişi raporu) orada yoktur ama kırıntı yolunda adı
 * olmalı — yoksa zincirin son halkası boş kalırdı.
 */
const ROUTE_LABELS: { test: (_p: string) => boolean; label: string }[] = [
  { test: (p) => /^\/sheets\/[^/]+$/.test(p), label: "Tablo" },
  { test: (p) => /^\/documents\/[^/]+$/.test(p), label: "Yazı" },
  { test: (p) => /^\/production\/[^/]+\/print$/.test(p), label: "Yazdır" },
  { test: (p) => /^\/production\/[^/]+$/.test(p), label: "Üretim Föyü" },
  { test: (p) => /^\/reports\/[^/]+$/.test(p), label: "Kişi Raporu" },
  { test: (p) => /^\/tasks\/[^/]+$/.test(p), label: "Görev" },
  { test: (p) => p === "/home", label: "Home Page" },
  { test: (p) => p === "/goals", label: "Goals" },
  { test: (p) => p === "/rules", label: "Rules" },
  { test: (p) => p === "/profile", label: "Profile" },
  { test: (p) => p === "/modules", label: "Operation Modules" },
  { test: (p) => p === "/sheets", label: "AF Teamwork" },
];

const BY_HREF = new Map(MODULE_DIRECTORY.map((m) => [m.href, m.title]));

/** Tek bir rotanın görünen adı. Bilinmiyorsa null — zincire eklenmez. */
export function routeLabelOf(pathname: string): string | null {
  const path = normalize(pathname);
  const fromRegistry = BY_HREF.get(path);
  if (fromRegistry) return fromRegistry;
  for (const r of ROUTE_LABELS) if (r.test(path)) return r.label;
  return null;
}

function normalize(pathname: string | null | undefined): string {
  return (pathname ?? "").split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
}

/**
 * Bulunulan yolun KÖKTEN buraya tam zinciri.
 *
 * `/production/abc` → [Collection, Üretim Föyü]
 * `/collection/maliyet` → [Cost]            (kök sayılır, kendi başına durur)
 * `/documents` → [AF Teamwork]
 *
 * Son halka `href` TAŞIMAZ: bulunduğun yere tıklamak bir şey yapmaz, o yüzden
 * bağlantı gibi görünmemeli.
 *
 * Zincir TEK halkaysa çağıran taraf kırıntı yolunu hiç çizmez — uygulama
 * çubuğu zaten o adı yazıyor, tekrar etmenin karşılığı yok.
 */
export function routeCrumbs(pathname: string | null | undefined): Crumb[] {
  const path = normalize(pathname);
  const chain: string[] = [path];

  /* Üst zinciri parentPathOf ile yukarı doğru tırman. `guard`: bozuk bir kural
     döngü kurarsa sonsuza gitmesin. */
  const guard = new Set<string>([path]);
  let cur: string | null = path;
  while ((cur = parentPathOf(cur)) && !guard.has(cur)) {
    guard.add(cur);
    chain.unshift(cur);
  }

  const crumbs: Crumb[] = [];
  chain.forEach((p, i) => {
    const label = routeLabelOf(p);
    if (!label) return;
    const isLast = i === chain.length - 1;
    crumbs.push(isLast ? { label } : { label, href: p });
  });
  return crumbs;
}
