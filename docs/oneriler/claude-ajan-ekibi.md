# Claude ajan ekibi: kim, hangi ajan, hangi veri

Öneri · 19.11.2026 · Karar verecek: Aslı Hanım · Kuracak: Sıraç

## Öneri

Her ekip üyesine, **kendi işini bilen** bir ajan verelim. Ajanlar birbirleriyle sohbet etmez; hepsi aynı yere, **operasyon paneline** bakar ve oraya yazar. Bir ajanın yaptığını öteki panelden görür. Böylece "ajanlar kendi aralarında çalışsın, sahibine rapor versin" isteği, kimin ne söylediği kaybolmadan karşılanır: her şey panelde, tarihli ve kişili durur.

İlk aşamada ajan **hazırlar ve hatırlatır**, karar vermez. Görev kapatmak, stok düşmek, e-posta göndermek insanda kalır.

## Kim, hangi ajan

Roller toplantı notlarına göre yazıldı; Aslı Hanım'la teyit edilmeli.

| Kişi | Ajanın işi | Okuduğu | Yazabildiği |
|---|---|---|---|
| Aslı Hanım | Haftanın özeti: ne bitti, ne gecikti, hangi kararı bekliyor. Toplantıdan önce gündem. | Görevler, takvim, föyler, stok ve satış özeti, bülten planı | Görev notu, toplantı konusu önerisi |
| Nisa Hanım | Operasyon takibi: teslim tarihi yaklaşan föyler, eksik alanlar, üretici bekleyen işler. | Görevler, föyler, üretici notları | Görev notu, hatırlatma |
| Kısmet Hanım | Mağaza ve stok: sayım farkları, azalan ürünler, bülten kontrol listesi. | Stok, satışlar, bülten planı | Stok notu, bülten kontrol notu |
| Gül Hanım | İçerik: story takvimi, haftanın Instagram önerileri, bülten kontrolü. | Bülten planı, sitedeki story ve ürünler, stok özeti | Bülten taslağı notu |
| Sıraç | Site ve ölçüm: bülten sonrası tıklama ve satış özeti, sitede bozulan şeyler. | Hepsi (müşteri listesi dahil) | Görev, not |

## Müşteri listesi

Müşteri listesi yalnız dört kişide olur: Aslı Hanım, Nisa Hanım, Kısmet Hanım, Sıraç. Ajanlar için önerim bir adım daha sıkı:

- **Hiçbir ajan müşteri listesinin kendisini okumasın.** Dört kişinin ajanı yalnız **sayıları** görsün ("A katmanında 1.249 kişi, bu ay 14 yeni kayıt, 3 adres hatalı").
- Tek tek kişilere bakmak panelde, insanın kendi oturumuyla yapılır.

Gerekçe: müşteri verisinin bir yapay zekâ hizmetine gitmesi ayrı bir KVKK değerlendirmesi ister; sayılar aynı işi görür ve bu soruyu hiç açmaz.

## Ajanlar nasıl haberleşir

- Ajanlar birbirine değil **panele** yazar: görev notu, föy notu, bülten notu. Her not kimin ajanından geldiğini taşır.
- Her ajan sahibine **günde bir** kısa özet verir (sabah): bugün senden beklenen üç şey.
- Aslı Hanım'ın ajanı **haftada bir** (toplantıdan önce) herkesin durumunu tek sayfada toplar.
- Bir ajan başka birinin işine karışmaz; yalnız "Nisa Hanım'ın onayını bekliyor" diye not düşer.

## Teknik karşılığı (Sıraç için)

- Panel tarafı: her kişi için ayrı, **yalnız okuma + not yazma** yetkili bir erişim anahtarı ve dar bir uç seti (görev özeti, föy özeti, stok özeti, bülten planı; müşteri için yalnız sayılar). Anahtar kişinin panelde görebildiğinden fazlasını göremez.
- Ajan tarafı: iki yol var, karıştırmamak gerekir.
  1. **Kişinin kendi Claude hesabı + panele bağlayıcı.** Kişi ajanıyla konuşur; ajan panele bağlayıcı üzerinden bakar. Kurması kolay; sabah özetini kişi kendisi ister.
  2. **Zamanlanmış ajanlar (Claude Managed Agents).** Ajanı Anthropic çalıştırır, saatinde kendiliğinden çalışır ve özeti yazar. Beta aşamasında; kullanım kadar ücretlenir (çalışma süresi ve metin miktarı); oturum geçmişi silinene kadar saklanır. Sabah özeti ve haftalık özet için doğru araç bu.
- Önerim: özetler için 2. yol, soru-cevap için 1. yol.
- Hesap paylaşımı: toplantıda konuşulan "tek hesapta beş kişi" kullanımının plan koşullarına uygunluğu ve kullanım sınırı Anthropic'in güncel plan sayfasından doğrulanmalı; buna göre kişi başı hesap gerekebilir.

## Sıra

1. Panelde ajan erişimini kur (anahtar + özet uçları). Müşteri için yalnız sayılar.
2. Tek ajanla başla: **Aslı Hanım'ın haftalık özeti**. İki hafta dene.
3. İşe yararsa Nisa Hanım ve Kısmet Hanım'ın sabah özetleri.
4. En son içerik ajanı (bkz. "Stoktan içeriğe" önerisi); o, doğru stoğu bekliyor.

## Aslı Hanım'dan beklenen karar

- Roller tablosu doğru mu; eklenecek kişi var mı?
- İlk ajan olarak haftalık özetle başlayalım mı?
- Müşteri listesinde ajanlara yalnız sayıları göstermek yeterli mi?
