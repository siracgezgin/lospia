/**
 * WEB SİTESİ → KOLEKSİYON — aslifilinta.com (WooCommerce) okuyucusu.
 *
 * Aslı Hanım (2026-09-17): "Bunların dekupe imajlarını da web sitesinden
 * çekebilir miyiz? İçindeki bütün bilgilerle beraber… bir daha iki kere iş
 * yapmasak."
 *
 * KAYNAK: WooCommerce "Store API" (`/wp-json/wc/store/v1`). Mağazanın kendi
 * vitrinini besleyen, ANAHTARSIZ ve SALT OKUNUR uç. Sitede zaten herkese açık
 * olan bilgiyi verir — yönetici anahtarı istemez, siteye yazamaz.
 *
 * SİTEYE GERİ YAZMA YOK (henüz). "Buradan Selen girse, oradan web sitesi
 * çekse" yönü WooCommerce REST API anahtarı (consumer key/secret) ister; o
 * anahtar verilmeden yazma yolu kurulamaz. Alanlar ayrı tutulduğu için o gün
 * geldiğinde her bölüm sitedeki kendi akordeonuna geri gider.
 *
 * Bu dosya AĞ İŞİ ve SAF DÖNÜŞÜM içerir; veritabanına dokunmaz.
 */

export const WEBSITE_BASE = "https://www.aslifilinta.com";
const STORE_API = `${WEBSITE_BASE}/wp-json/wc/store/v1`;

export interface WebProduct {
  id: number;
  name: string;
  url: string;
  images: string[];
  designersNote: string;
  sizeFit: string;
  detailsCare: string;
  category: string | null;
  subcategory: string | null;
  /** Sitedeki kategori adları — eşlenemeyen ürünü raporlarken okunur. */
  webCategories: string[];
  /**
   * SİTEDEKİ VİTRİN SIRASI — `menu_order` sıralamasındaki yeri (0'dan başlar).
   *
   * Aslı Hanım (23.09.2026): "Sitedeki gibi sıralansın ürünler." Sıra bir
   * merchandising kararı ve o karar sitede veriliyor; panel kendi sırasını
   * uydurmamalı. Küresel liste `orderby=menu_order&order=asc` ile çekiliyor
   * ve bu sıra her kategorinin kendi sayfasındaki sırayı da koruyor — ürün
   * başına tek bir sayı yetiyor (23.09.2026'da 163 ürünle doğrulandı).
   */
  order: number;
}

/* ── HTML → düz metin ─────────────────────────────────────────────────────
   Açıklama WPBakery kısa kodlarıyla ([vc_tta_section …]) ve kıvrık tırnak
   varlıklarıyla (&#8221;) geliyor. Ekip bu metni Excel'de satır satır
   yazıyor; satır sonları KORUNUR, etiketler atılır. */

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

function htmlToText(html: string): string {
  return decodeEntities(
    html
      /* KAÇIRILMIŞ SATIR SONU. Sitedeki bazı açıklamalarda satır sonu gerçek
         karakter değil, iki harflik "\n" dizisi olarak duruyor — geçmişte
         yüklenen bir CSV'den kalma (17/wordpress/af-guncelleme-TAM.csv:
         182 satırın 182'sinde aynı iz var). Çevrilmezse föye "100% Cotton
         Body \n100% Cotton" diye yazılıyor ve metin bozuk okunuyor. */
      .replace(/\\r?\\n/g, "\n")
      .replace(/\[\/?vc_[^\]]*\]/g, "\n")            // kalan kısa kodlar
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** Akordeon bölümlerini başlığa göre ayırır. Başlık karşılaştırması tırnak
 *  biçiminden bağımsızdır: "Designer’s Note" ile "Designer's Note" aynıdır. */
export function parseSections(descriptionHtml: string | null | undefined): Record<string, string> {
  const src = decodeEntities(descriptionHtml ?? "").replace(/[”″“]/g, '"');
  const out: Record<string, string> = {};
  const re = /\[vc_tta_section\s+title="([^"]+)"[^\]]*\]([\s\S]*?)\[\/vc_tta_section\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const key = decodeEntities(m[1]).replace(/[’‘`]/g, "'").trim().toLowerCase();
    const text = htmlToText(m[2]);
    if (text) out[key] = text;
  }
  return out;
}

/* ── Kategori eşleme ──────────────────────────────────────────────────────
   Sitenin kategori SLUG'ı → Koleksiyon taksonomisindeki anahtar. Sıra önemli:
   EN ÖZEL eşleşme önce denenir.

   SİTE YAPISI DEĞİŞTİ (18.09.2026). Sıraç kategori adreslerini sadeleştirdi
   (/category/ready-to-wear/shirts/ → /collections/shirts/) ve hiyerarşiyi
   düzleştirdi: artık yirmi kategorinin HEPSİ üst düzey (parent=0). Üç eşleme
   bu yüzden kırılmıştı ve düzeltildi:
     • "trousers"      → slug "trousers-skirts" oldu; eşleşmeyen ürünler
                         "kategorisiz" diye atlanacaktı (23 ürün)
     • "artofanatolia" → kategori SİLİNDİ, 23 ürünü One-of-a-Kind'a taşındı
     • "ready-to-wear" → üst kategori silindi; alt kategoriler kendi başına
                         duruyor ve zaten tek tek eşleniyor
     • "accessory"     → silindi (Headpiece'e katılmış)

   Alt kategori bilgisi bir yerde inceldi: Art of Anatolia gidince o ürünler
   One-of-a-Kind'ın altında alt kategorisiz kalıyor. Koleksiyondaki mevcut
   föylerin kategorisine ÇEKİŞ DOKUNMAZ, yani "Clothing"deki 21 föy yerinde
   duruyor; yalnız bundan sonra gelen yeni ürünler üst kategoriye düşer.

   BİLEREK EŞLENMEYEN: "New In" bir kategori değil vitrin etiketi — ürün zaten
   kendi asıl kategorisinde duruyor. */
const CATEGORY_MAP: [slug: string, category: string, subcategory: string | null][] = [
  // Home
  ["kilims", "kilims", null],
  ["chests", "chests", null],
  // Ready to Wear
  ["shirts", "ready_to_wear", "shirts_tops"],
  ["trousers-skirts", "ready_to_wear", "trousers_skirts"],
  ["coats-jackets-vests", "ready_to_wear", "jackets_vests"],
  ["dresses-jumpsuits", "ready_to_wear", "dresses_jumpsuits"],
  ["sweatshirts", "ready_to_wear", "sweatshirts_tshirts"],
  ["loungewear", "ready_to_wear", "loungewear"],
  // One-of-a-Kind
  ["belts", "one_of_a_kind", "belts"],
  ["headpiece", "one_of_a_kind", "headpiece"],
  // Accessories
  ["bucket-hat", "accessories", "hats"],
  ["eight-cornered-cap", "accessories", "hats"],
  ["hats", "accessories", "hats"],
  ["bags", "accessories", "bags"],
  ["ehram", "accessories", "wraps"],
  ["peshtemal", "accessories", "wraps"],
  // Üst kategoriler — alt kategori bulunamazsa
  ["shoes", "shoes", null],
  ["one-of-a-kind", "one_of_a_kind", null],
  ["accessories", "accessories", null],
];

export function mapCategory(slugs: string[]): { category: string; subcategory: string | null } | null {
  const set = new Set(slugs);
  for (const [slug, category, subcategory] of CATEGORY_MAP) {
    if (set.has(slug)) return { category, subcategory };
  }
  return null;
}

/* ── Okuma ─────────────────────────────────────────────────────────────── */

type StoreProduct = {
  id: number;
  name: string;
  permalink: string;
  description?: string;
  images?: { src: string }[];
  categories?: { slug: string; name: string }[];
};

function pick(sections: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) if (sections[k]) return sections[k];
  return "";
}

/**
 * `memberSlugs`: ürünün kategori SORGULARINDAN bilinen üyelikleri.
 *
 * NEDEN AYRI BİR KAYNAK: Store API ürünün kendi `categories` alanında bütün
 * kategorileri DÖNDÜRMÜYOR. Ölçüldü (2026-09-17): sitede 9 ürün "Dresses &
 * Jumpsuits"te ama hiçbirinin listesinde o kategori yok; 4 ürünün listesi
 * tamamen boş. Yalnız o alana bakan eşleme elbiseleri hiç bulamıyor, 4 ürünü
 * de "kategorisiz" diye atlıyordu.
 *
 * ÖNCELİK ürünün kendi listesinde: site bir ürünü birincil olarak "Shirts"e
 * koymuşsa koleksiyonda da orada durur. Birincil liste bir ALT kategoriye
 * götürmüyorsa sorgu üyelikleriyle tamamlanır.
 */
export function toWebProduct(p: StoreProduct, memberSlugs: string[] = [], order = 0): WebProduct {
  const sections = parseSections(p.description);
  const own = (p.categories ?? []).map((c) => c.slug);
  const primary = mapCategory(own);
  const mapped = primary?.subcategory ? primary : (mapCategory([...own, ...memberSlugs]) ?? primary);
  return {
    order,
    id: p.id,
    name: decodeEntities(p.name ?? "").trim(),
    url: p.permalink,
    /* İlk görsel sitenin ana görseli — koleksiyonda dekupe olarak kapak. */
    images: (p.images ?? []).map((i) => i.src).filter(Boolean),
    designersNote: pick(sections, "designer's note", "designers note"),
    sizeFit: pick(sections, "size & fit", "size"),
    detailsCare: pick(sections, "details & care", "details"),
    category: mapped?.category ?? null,
    subcategory: mapped?.subcategory ?? null,
    webCategories: (p.categories ?? []).map((c) => decodeEntities(c.name)),
  };
}

/* ── Ağ ──────────────────────────────────────────────────────────────────
   SİTEYİ ZORLAMA. aslifilinta.com paylaşımlı bir LiteSpeed sunucusunda;
   ilk denemede ~20 kategori sorgusu aynı anda gidince sunucu HTTP 500 döndü
   (2026-09-17). Bu, markanın canlı satış sitesi — bizim çekişimiz müşterinin
   sayfayı açmasını yavaşlatmamalı. İstekler İKİŞERLİ gider, geçici hatada
   (5xx, 429) artan beklemeyle yeniden denenir. */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson<T>(url: string): Promise<T> {
  let last = 0;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (res.ok) return (await res.json()) as T;
    last = res.status;
    if (res.status < 500 && res.status !== 429) break;   // kalıcı hata: tekrar denemenin anlamı yok
    await sleep(800 * (attempt + 1));
  }
  throw new Error(`Web sitesi yanıt vermedi (HTTP ${last}).`);
}

async function paged<T>(url: string): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= 20; page++) {
    const sep = url.includes("?") ? "&" : "?";
    const batch = await getJson<T[]>(`${url}${sep}per_page=100&page=${page}`);
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

/** Sınırlı eşzamanlılıkla sırayla çalıştırır. */
async function inPool<T>(items: T[], size: number, fn: (_item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: size }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await fn(item);
  }));
}

/**
 * Kategori ADI → slug.
 *
 * WooCommerce'in CSV dışa aktarımı kategoriyi SLUG değil AD yazıyor
 * ("One-of-a-Kind > Clothing"). Adı slug'a çevirmek TAHMİN EDİLEMEZ: o ad
 * `artofanatolia` slug'ına, "Trousers & Skirts" ise `trousers`a karşılık
 * geliyor. Tek doğru kaynak sitenin kendi listesi.
 *
 * Yalnız betikler kullanır (sitede gizli duran ürünlerin içe aktarımı);
 * uygulamanın kendi çekişi slug'ları zaten API'den alıyor.
 */
export async function fetchCategorySlugsByName(): Promise<Map<string, string>> {
  const rows = await paged<{ slug: string; name: string }>(`${STORE_API}/products/categories`);
  return new Map(rows.map((c) => [decodeEntities(c.name).trim().toLowerCase(), c.slug]));
}

/** Bütün ürünler. ANA LİSTE alınamazsa hata FIRLATIR — çağıran yarım bir
 *  listeyle karar vermesin. Kategori üyelikleri ise EK bilgidir: biri
 *  alınamazsa o ürünler yalnız kendi (birincil) kategorisiyle eşlenir, çekiş
 *  durmaz — sonuç raporunda sayılır. */
export async function fetchWebsiteProducts(): Promise<{ products: WebProduct[]; membershipFailures: number }> {
  /* SIRA SİTEDEN GELİR. `orderby=menu_order&order=asc` mağazanın kendi
     vitrin sırasıdır; dizideki indeks doğrudan o sıradır. Varsayılan
     (tarih) sırayla çekilseydi panel siteyi hiçbir zaman tutturamazdı. */
  const products = await paged<StoreProduct>(`${STORE_API}/products?orderby=menu_order&order=asc`);
  const categories = await paged<{ id: number; slug: string }>(`${STORE_API}/products/categories`);

  const wanted = new Set(CATEGORY_MAP.map(([slug]) => slug));
  const members = new Map<number, string[]>();
  let membershipFailures = 0;
  await inPool(categories.filter((c) => wanted.has(c.slug)), 2, async (c) => {
    try {
      const rows = await paged<{ id: number }>(`${STORE_API}/products?category=${c.id}`);
      for (const r of rows) {
        const list = members.get(r.id) ?? [];
        list.push(c.slug);
        members.set(r.id, list);
      }
    } catch {
      membershipFailures++;
    }
  });

  return {
    products: products.map((p, i) => toWebProduct(p, members.get(p.id) ?? [], i)),
    membershipFailures,
  };
}
