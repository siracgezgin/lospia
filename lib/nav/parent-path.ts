/**
 * "Geri" NEREYE gider? — tek kaynak.
 *
 * Sıraç (2026-08-29):
 *   "AF Teamwork'te geriye basıyorum beni CRM'e atıyor. CRM'de geriye
 *    basıyorum Board'a gidiyor… bozuk çalışıyor."
 *   "/collection'da geri butonu olması gereksiz. Bir yere girmişsem geri
 *    gelmeli ve soldaki başlığa dönmeli."
 *
 * Sorun tarayıcı geçmişiydi: `router.back()` "bir önce BAKTIĞIN sayfa"ya
 * gider, "bir ÜSTTEKİ sayfa"ya değil. Sidebar'dan CRM → AF Teamwork gezindiyse
 * AF Teamwork'te "Geri" CRM'e döner; doğru davranıştır ama kullanıcının
 * beklediği şey değildir.
 *
 * Yeni kural HİYERARŞİK:
 *   • Sol menüde kendi satırı olan sayfa bir KÖKTÜR → "Geri" hiç çizilmez.
 *   • Kökün altındaki her sayfa kendi üstüne döner.
 */

/** Sol menüden doğrudan gidilen sayfalar — bunların üstü yoktur. */
const ROOTS = new Set([
  "/home", "/planning", "/board", "/dashboard", "/list",
  "/collection", "/documents", "/crm",
  "/modules", "/admin-board", "/settings",
  "/activity", "/archive", "/trash", "/rules", "/profile",
  /* Koleksiyon SEKMELERİ de kök sayılır. Dördü aynı ekranın görünümleridir ve
     aralarında gezinme SEKME ÇUBUĞUdur; ayrıca "Geri" koymak hem gereksiz hem
     de düğmeyi sekmeden sekmeye farklı yerde gösteriyordu (2026-08-29: "her
     alt başlığa tıklayınca farklı yerde geliyor geri tuşu"). */
  "/collection/maliyet", "/collection/odeme", "/collection/veri",
]);

/** Kendiliğinden türetilemeyen üst sayfalar. */
const EXPLICIT: { test: (_p: string) => boolean; parent: string }[] = [
  // Üretim föyü Koleksiyon'un altında yaşar; yolu ("/production/…") bunu
  // söylemiyor, o yüzden elle eşleniyor.
  { test: (p) => p.startsWith("/production"), parent: "/collection" },
  // Tablo editörü AF Teamwork'ün içinde açılır.
  { test: (p) => p.startsWith("/sheets"), parent: "/documents" },
  // Kişi raporu Reports'un altında.
  { test: (p) => p.startsWith("/reports"), parent: "/dashboard" },
];

/**
 * Verilen yolun ÜST sayfası. Kök sayfalarda ve türetilemeyen yollarda `null`
 * döner — çağıran yer "Geri"yi hiç çizmez.
 */
export function parentPathOf(pathname: string | null | undefined): string | null {
  const path = (pathname ?? "").split("?")[0].replace(/\/+$/, "") || "/";
  if (ROOTS.has(path)) return null;

  for (const rule of EXPLICIT) {
    if (rule.test(path)) return rule.parent === path ? null : rule.parent;
  }

  // /collection/maliyet → /collection · /documents/<id> → /documents
  const cut = path.lastIndexOf("/");
  if (cut <= 0) return null;
  const parent = path.slice(0, cut);
  return parent === path ? null : parent;
}
