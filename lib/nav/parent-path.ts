import { ROUTE_OWNER } from "@/lib/nav/app-nav";

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
/* KÖK = sol menüde KENDİ SATIRI olan sayfa. Üstü yoktur, kırıntı yolu tek
   halkaya iner ve hiç çizilmez.

   BURADAN ÇIKANLAR (12.09.2026): /rules, /activity, /archive, /trash ve
   Koleksiyon sekmeleri. Hepsinin ROUTE_OWNER'da bir sahibi vardı — yani sol
   menüde başka bir satır yanıyordu — ama burada "kök" sayıldıkları için
   kırıntı yolu boş kalıyordu. Kullanıcı Arşiv'e girip "buraya nereden
   geldim?" diye bakınca hiçbir şey bulamıyordu.

   Eskiden Koleksiyon sekmeleri "Geri düğmesi sekmeden sekmeye farklı yerde
   çıkıyor" diye kök sayılmıştı; o sorun düğmenin kendisindeydi. Kırıntı yolu
   her sekmede AYNI yerde ve aynı biçimde duruyor, üstelik hangi sekmede
   olduğunu da yazıyor. Aynı gerekçeyle /dashboard (Reports) da çıktı: List'in
   son sekmesidir ve menüde List yanar — "List › Reports" bunu yazar. */
const ROOTS = new Set([
  "/home", "/planning", "/board", "/list",
  "/collection", "/documents", "/crm",
  "/modules", "/admin-board", "/settings", "/finance", "/profile",
]);

/**
 * Yol tabanlı iç içelik — aynı modülün DAHA DERİN sayfası.
 * Örn. /production/<id>/print'in üstü /production/<id>'dir; modül köküne
 * atlamak arada bir basamağı yutardı.
 */
const NESTED: { test: (_p: string) => boolean; parent: (_p: string) => string }[] = [
  {
    test: (p) => /^\/production\/[^/]+\/print$/.test(p),
    parent: (p) => p.replace(/\/print$/, ""),
  },
];

/**
 * Verilen yolun ÜST sayfası. Kök sayfalarda ve türetilemeyen yollarda `null`
 * döner — çağıran yer "Geri"yi hiç çizmez.
 */
export function parentPathOf(pathname: string | null | undefined): string | null {
  const path = (pathname ?? "").split("?")[0].replace(/\/+$/, "") || "/";
  if (ROOTS.has(path)) return null;

  // Önce aynı modül içindeki derinlik (föy → yazdırma gibi).
  for (const rule of NESTED) {
    if (rule.test(path)) {
      const parent = rule.parent(path);
      return parent === path ? null : parent;
    }
  }

  /* Sonra MODÜL SAHİBİ. ROUTE_OWNER sol menünün hangi satırı yaktığını
     söyleyen listedir; "üst" tanımının ondan farklı olması, menüde bir şey
     yanarken kırıntı yolunda başka bir şey yazmasına yol açıyordu. Tek liste. */
  const owned = ROUTE_OWNER.find(
    ([prefix]) => path === prefix || path.startsWith(prefix + "/"),
  );
  if (owned) return owned[1] === path ? null : owned[1];

  // /collection/maliyet → /collection · /documents/<id> → /documents
  const cut = path.lastIndexOf("/");
  if (cut <= 0) return null;
  const parent = path.slice(0, cut);
  return parent === path ? null : parent;
}
