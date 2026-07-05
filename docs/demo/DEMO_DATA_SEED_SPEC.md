# Lospia — Demo Veri Seed Spesifikasyonu

> İnsan-okunur demo dataset tanımı. Bu doküman elle veri girişi için rehber,
> ileride yazılacak seed script'i için de kaynak spesifikasyondur
> (bkz. `DEMO_SEED_SCRIPT_PLAN.md`). Yalnızca local Supabase'te uygulanır.
>
> **Tarih kuralı:** Sabit tarih kullanılmaz. Tüm tarihler çekim haftasına
> göre görelidir: "bu hafta Pazartesi", "bu hafta Çarşamba", "bu hafta Cuma",
> "gelecek Pazartesi", "2 gün gecikmiş" vb. Board'un haftalık görünümü
> due_date bazlı olduğundan (tarihsiz görevler haftalık görünümde çıkmaz),
> board'da görünmesi istenen her göreve tarih verilir.

## 1. Workspace

| Alan | Değer |
|---|---|
| Ad | Lospia Demo Operasyon |
| Ekip | Marka Ekibi |
| Ortam | Local Supabase (yalnızca) |

## 2. Departmanlar

1. İçerik
2. Koleksiyon
3. Üretim
4. E-ticaret
5. Onaylar
6. Haftalık Kontrol

## 3. Kullanıcılar / kişiler

| İsim | Ünvan | E-posta | App rolü |
|---|---|---|---|
| Elif K. | Marka Yöneticisi | elif@demo.lospia.test | admin |
| Mert A. | İçerik Sorumlusu | mert@demo.lospia.test | member |
| Zeynep D. | Üretim Koordinatörü | zeynep@demo.lospia.test | member |
| Deniz T. | E-ticaret Sorumlusu | deniz@demo.lospia.test | member |

Avatar: baş harfli jenerik. Telefon, doğum tarihi vb. kişisel alanlar boş
bırakılır (doğum günü bildirimi tetiklenmesin).

## 4. Statü dağılımı hedefi

| Statü | Adet |
|---|---|
| Backlog | 3 |
| Hazır (ready) | 4 |
| Devam Ediyor (in_progress) | 5 |
| Onay Bekliyor (review) | 4 |
| Tamamlandı (done) | 4 |
| **Toplam** | **20** |

Kesişen özellikler: **2 gecikmiş** (2 gün geciken), **3 acil (urgent)**
öncelikli görev. Gecikenler Devam Ediyor / Onay Bekliyor statüsünde olmalı
(tamamlanmış "geciken" dashboard'da geciken sayılmaz).

## 5. Görev listesi (20 görev)

Sütunlar: Departman · Sorumlu · Katılımcılar · Öncelik · Teslim tarihi (göreli)

### Backlog (3)

| # | Görev | Departman | Sorumlu | Katılımcı | Öncelik | Teslim |
|---|---|---|---|---|---|---|
| 1 | Kampanya Takvimi | E-ticaret | Deniz T. | Elif K. | Orta | gelecek Pazartesi |
| 2 | Sezon Sonu Stok Analizi | E-ticaret | Deniz T. | — | Düşük | gelecek Cuma |
| 3 | Influencer İş Birliği Brief'i | İçerik | Mert A. | Elif K. | Orta | gelecek Çarşamba |

### Hazır (4)

| # | Görev | Departman | Sorumlu | Katılımcı | Öncelik | Teslim |
|---|---|---|---|---|---|---|
| 4 | Instagram İçerik Planı | İçerik | Mert A. | — | Yüksek | bu hafta Çarşamba |
| 5 | Ürün Açıklamaları Revizyonu | E-ticaret | Deniz T. | Mert A. | Orta | bu hafta Cuma |
| 6 | Beden Tablosu Güncellemesi | E-ticaret | Deniz T. | — | Düşük | gelecek Pazartesi |
| 7 | Paketleme Malzemesi Siparişi | Üretim | Zeynep D. | — | Orta | bu hafta Cuma |

### Devam Ediyor (5)

| # | Görev | Departman | Sorumlu | Katılımcı | Öncelik | Teslim |
|---|---|---|---|---|---|---|
| 8 | Lookbook Çekim Planı | Koleksiyon | Elif K. | Mert A., Zeynep D. | **Acil** | bu hafta Çarşamba |
| 9 | Kumaş Tedarik Takibi | Üretim | Zeynep D. | — | Yüksek | **2 gün gecikmiş** |
| 10 | Ürün Görselleri Yükleme | E-ticaret | Deniz T. | Mert A. | Yüksek | bu hafta Cuma |
| 11 | Koleksiyon Lansman Hazırlığı | Koleksiyon | Elif K. | Mert A., Zeynep D., Deniz T. | **Acil** | gelecek Pazartesi |
| 12 | Web Sitesi Banner Güncellemesi | E-ticaret | Deniz T. | — | Orta | bu hafta Çarşamba |

### Onay Bekliyor (4)

| # | Görev | Departman | Sorumlu | Katılımcı | Öncelik | Teslim |
|---|---|---|---|---|---|---|
| 13 | Numune Revizyon Kontrolü | Üretim | Zeynep D. | Elif K. | **Acil** | **2 gün gecikmiş** |
| 14 | Onay Bekleyen Kreatifler | Onaylar | Mert A. | Elif K. | Yüksek | bu hafta Çarşamba |
| 15 | Tedarikçi Numune Değerlendirmesi | Üretim | Zeynep D. | — | Orta | bu hafta Cuma |
| 16 | E-posta Bülteni Taslağı | İçerik | Mert A. | Deniz T. | Orta | bu hafta Cuma |

### Tamamlandı (4)

| # | Görev | Departman | Sorumlu | Katılımcı | Öncelik | Teslim |
|---|---|---|---|---|---|---|
| 17 | Haftalık Operasyon Kontrolü | Haftalık Kontrol | Elif K. | tüm ekip | Yüksek | bu hafta Pazartesi |
| 18 | Ürün Fotoğraf Rötuşları | İçerik | Mert A. | — | Orta | bu hafta Pazartesi |
| 19 | Kargo Süreç Kontrol Listesi | E-ticaret | Deniz T. | — | Düşük | bu hafta Pazartesi |
| 20 | Yeni Sezon Moodboard Hazırlığı | Koleksiyon | Elif K. | Mert A. | Orta | geçen Cuma |

Doğrulama: gecikenler = #9, #13 (2 adet ✓); acil = #8, #11, #13 (3 adet ✓).

## 6. Görev açıklamaları (örnek dil)

Açıklamalar 1-2 cümle, jenerik ve marka-nötr yazılır. Örnekler:

- **Lookbook Çekim Planı:** "Yeni sezon lookbook çekimi için mekan, ekip ve
  ürün listesi netleştirilecek. Çekim gününe kadar tüm ürünler hazır olmalı."
- **Kumaş Tedarik Takibi:** "Onaylanan kumaşların teslim tarihleri tedarikçiyle
  teyit edilecek; geciken kalemler bu karta not düşülecek."
- **Numune Revizyon Kontrolü:** "İkinci numune revizyonu kontrol edilecek;
  onay verilirse üretim planına geçilecek."

Yasak: gerçek tedarikçi/kişi adı, tutar, gerçek koleksiyon kodu (ör. "SS26"
gibi sezon kodu kullanılabilir; AF'nin gerçek takvimine işaret eden detay
kullanılamaz).

## 7. Yorumlar / notlar

Not tipleri uygulamadaki tiplerle eşleşir: `info`, `action_required`,
`handoff`, `approval_waiting`. Örnek dağılım (5-6 not yeterli — görev detayı
ve haftalık feed ekranlarını doldurmak için):

| Görev | Yazan | Tip | İçerik |
|---|---|---|---|
| Numune Revizyon Kontrolü (#13) | Zeynep D. | approval_waiting | "İkinci revizyon hazır — Elif Hanım'ın onayı bekleniyor." |
| Lookbook Çekim Planı (#8) | Mert A. | info | "Mekan alternatifleri karta eklendi, Çarşamba netleşiyor." |
| Kumaş Tedarik Takibi (#9) | Zeynep D. | action_required | "Tedarikçi teslimi 2 gün kaydırdı — plan güncellenecek." |
| Ürün Görselleri Yükleme (#10) | Deniz T. | handoff | "İlk 20 ürün yüklendi; rötuşlu görseller Mert'ten gelecek." |
| Onay Bekleyen Kreatifler (#14) | Mert A. | approval_waiting | "3 kreatif onaya hazır; kampanya öncesi dönüş gerekli." |
| Haftalık Operasyon Kontrolü (#17) | Elif K. | info | "Bu hafta 2 geciken iş var; ikisi de üretim tarafında, takipteyiz." |

## 8. Kurallar / standartlar

Kurallar alanına girilecek jenerik örnekler:

1. "Her görevin bir sorumlusu ve teslim tarihi olmak zorundadır."
2. "Onay gerektiren işler 'Onay Bekliyor' statüsüne alınır ve karta
   approval notu düşülür."
3. "Ürün görselleri yüklenmeden ürün yayına alınmaz."
4. "Geciken görevler haftalık kontrol toplantısında ilk sırada konuşulur."
5. "Numune revizyonları en fazla 2 tur yapılır; üçüncü tur yönetici onayı ister."

## 9. Haftalık not örnekleri

Haftalık feed'de görünecek 2-3 not (Elif K. tarafından):

- "Bu hafta odak: lansman hazırlığı ve geciken üretim kalemleri.
  Cuma'ya kadar numune onayı kapanmalı."
- "Kampanya görselleri tamamlandı; e-ticaret yüklemeleri Cuma bitiyor."

## 10. Dashboard beklentileri

Bu dataset ile dashboard'da görünmesi gerekenler:

- **Toplam görev:** 20 (arşiv hariç)
- **Tamamlanan:** 4 — dolu ama abartısız bir "tamamlandı" dilimi
- **Geciken:** 2 — kırmızı/uyarı göstergesi dolu görünür ama panik vermez
- **Onay bekleyen:** 4 — onay akışı mesajını taşıyan belirgin dilim
- **Acil:** 3 — öncelik dağılımında görünür
- **Departman dağılımı:** 6 departmanın en az 5'i dolu (E-ticaret en yoğun,
  Haftalık Kontrol en az 1)
- **Kişi dağılımı:** 4 kullanıcının hepsi en az 3 görevde sorumlu —
  hiçbir kullanıcı boş görünmez
- **Bu hafta:** Pazartesi(3 tamamlanan) + Çarşamba(4) + Cuma(5) + 2 geciken →
  haftalık görünüm dolu

Çekim öncesi dashboard bu beklentilerle karşılaştırılır; boş/eksik grafik
varsa seed gözden geçirilir.
