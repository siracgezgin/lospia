# Sitedeki abonelik kayıtlarını panele okuma ucu

Tasarım · 19.11.2026 · Siteye kodu koyacak: afcom-seo oturumu · Panel tarafı: bu repo

## Amaç

Mağazada iPad'den ve sitedeki formdan alınan e-posta kayıtları WordPress'teki abonelik tablosunda (snippet 45) duruyor. Panelin müşteri CRM'i bu kayıtları **okur**; siteye hiçbir şey yazmaz. İznin tek kaynağı site olarak kalır.

## Uç

```
GET https://www.aslifilinta.com/wp-json/af/v1/aboneler?since=<ISO-8601>&limit=500&cursor=<opak>
```

- `since`: yalnız bu andan sonra **eklenen ya da durumu değişen** kayıtlar (ilk çağrıda verilmez → hepsi).
- `limit`: en çok 500. `cursor`: bir önceki yanıttaki `next_cursor`; yoksa liste bitti.
- Sıra: değişme zamanına göre artan (aynı anda değişenler `id` ile).

Yanıt:

```json
{
  "kayitlar": [
    {
      "id": 1234,
      "eposta": "ornek@ornek.test",
      "ad": "Ad", "soyad": "Soyad",
      "dil": "tr",
      "kaynak": "store-ipad",
      "onay_surumu": "2026-11",
      "onay_zamani": "2026-11-12T14:03:22Z",
      "durum": "aktif",
      "degisti": "2026-11-12T14:03:22Z"
    }
  ],
  "next_cursor": null
}
```

- `kaynak`: tablodaki değer aynen (`newsletter-page` · `store-ipad` · üyelik · ödeme).
- `durum`: `aktif` · `cikti` · `hatali`.
- **IP adresi dönmez.** Panelin ona ihtiyacı yok; taşınmayan veri sızmaz.

## Kimlik doğrulama

Kolektif başvuru ucundaki düzenin aynısı, yön ters:

- Ortak sır: sitede `AF_PANEL_SIRRI`, panelde `SITE_ABONELIK_SECRET` (aynı değer; repoya girmez).
- İstek başlıkları: `x-af-zaman: <unix saniye>` ve `x-af-imza: hex(HMAC-SHA256(sır, "<zaman>\n<yol ve sorgu>"))`.
- Site, zamanı ±5 dakika dışındaysa ya da imza tutmuyorsa `401` döner. Sır tanımlı değilse uç **yokmuş gibi** davranır (`404`).
- Yalnız `GET`; önbelleğe alınmaz (`Cache-Control: no-store`, LiteSpeed hariç tutma kuralı).

## Panel ne yapar

- Çağıran: `scripts/customers-import.ts`'e eklenecek `--site` adımı (Sıraç çalıştırır) ve ileride Customers ekranında yalnız izinli dört kişinin gördüğü "Siteden güncelle".
- Eşleme: `eposta` anahtar. Kişi yoksa açılır (katman **C**, kaynak `store-ipad` → mağaza, diğerleri → site). Varsa yalnız şunlar güncellenir: e-posta izni `var` + `onay_zamani`, `durum` (`cikti` → abonelikten çıktı, `hatali` → adres hatalı).
- Panelde elle düzeltilmiş alan ezilmez; kimse silinmez.
- Son başarılı okumanın zamanı saklanır; sonraki çağrı `since` ile yalnız değişenleri ister.

## Açık sorular (afcom-seo için)

- Tabloda "değişme zamanı" sütunu var mı? Yoksa `since` için eklenmesi gerekir (durum değişince güncellenen bir zaman damgası).
- Abonelikten çıkan kayıt tablodan siliniyor mu, yoksa durumu mu değişiyor? Siliniyorsa panel çıkışı göremez.

## Uygulanan sözleşme (20.11.2026 — afcom-seo snippet 75)

Yukarıdaki tasarımdan farkları; panel tarafı bunlara göre yazıldı:

- Tablo `wp_af_abone`; değişme zamanı sütunu `guncelleme` (UTC). Çıkan kayıt **silinmez**, durumu değişir.
- Durumlar: `aktif` · `cikti` · `beklemede`. **`hatali` sitede yoktur** — adres hatası gönderim kayıtlarından gelir (`customers-import.ts`'in ana adımı).
  - `beklemede` = çift onay bağlantısına basılmamış → panelde e-posta izni **yok**.
- `since` eşitliği dahil eder (aynı kayıt iki kez gelebilir; panel e-postaya göre tekilleştirir). `cursor` verilirse `since` yok sayılır.
- İmza: `x-af-zaman` (unix saniye) + `x-af-imza` = hex(HMAC-SHA256(sır, "<zaman>\n<yol ve sorgu>")); yol ve sorgu **gönderilen dizginin aynısı** (ham REQUEST_URI). Pencere ±300 sn. Sır en az 32 karakter.
- Hatalar: 401 imza/zaman · 400 bozuk `since`/`cursor` · 503 tablo yok · 404 sır tanımlı değil.

Panel tarafı: `npx tsx scripts/customers-import.ts --site --prod` (rapor) → `--uygula`. Sır `.env.prod` içinde `SITE_ABONELIK_SECRET`. Yerelde yalnız sahte uçla denenir; gerçek siteden okuma `--prod` ister. Site canlıda doğrulanmadan gerçek veriye karşı çalıştırılmaz.
