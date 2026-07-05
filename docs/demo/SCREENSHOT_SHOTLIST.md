# Lospia — Ekran Görüntüsü Shot Listesi

> Veri kaynağı: **Lospia Demo Operasyon** workspace'i, `DEMO_DATA_SEED_SPEC.md`
> dataseti ile dolu. Teknik standartlar: 1440×900 viewport, retina/2x, light
> mode, UI Türkçe, zoom %100, temiz tarayıcı profili
> (bkz. `DEMO_SCREENSHOT_CHECKLIST.md` §7).
>
> **Her shot için ortak yasaklar:** gerçek AF verisi (isim, e-posta, görev,
> not, finansal veri, tedarikçi, Aslı Filinta logosu/wordmark'ı); adres
> çubuğunda iç URL/parametre (adres çubuğu tercihen kadraj dışı); tarayıcı
> profil adı, sekme başlıkları, uzantı ikonları, bookmark bar; gerçek
> bildirimler. Aşağıdaki "Görünmemesi gerekenler" satırları shot'a özgü
> ekstra kontrollerdir.

## Shot 1 — Board (Kanban) · ana hero görseli

- **Rota:** `/board` (varsayılan "Bu hafta" görünümü yerine "Tüm işler"
  tercih edilebilir: `?view=all` — 20 görevin tamamı dolu board verir)
- **Görünmesi gerekenler:** 4 kolon (Yapılacak / Devam ediyor / Kontrol-Onay /
  Tamamlandı) hepsi dolu; kartlarda sorumlu avatarı, teslim tarihi, öncelik
  ve departman chip'leri; 2 geciken kartın gecikme göstergesi; 3 acil kartın
  öncelik rozeti
- **Caption:** "Her işin sahibi, tarihi ve durumu tek panelde."
- **Görünmemesi gerekenler:** admin-board'a özgü yönetici filtreleri
  (standart board çekilir); boş kolon; sidebar'da AF'ye özgü herhangi bir
  wordmark

## Shot 2 — Haftalık görünüm

- **Rota:** `/board` ("Bu hafta" görünümü — `?view=this-week`, çekim
  haftası seçili)
- **Görünmesi gerekenler:** bu haftaya tarihlenmiş görevler (Pazartesi
  tamamlananlar, Çarşamba/Cuma teslimler), 2 geciken iş, hafta seçici;
  haftalık not feed'i görünüyorsa Elif K.'nin haftalık notu
- **Caption:** "Haftalık durumu sormadan görün."
- **Görünmemesi gerekenler:** tarihi geçmiş/bayat hafta seçimi (hafta,
  çekim haftası olmalı); boş haftalık görünüm

## Shot 3 — Onay bekleyenler

- **Rota:** `/board?view=waiting-approval` (veya board'da "Kontrol / Onay"
  kolonu odaklı kadraj)
- **Görünmesi gerekenler:** 4 onay bekleyen görev; "Numune Revizyon
  Kontrolü" kartında gecikme + acil rozeti (tıkanan iş hikayesi); sorumlu
  avatarları
- **Caption:** "Onay bekleyen işler mesajlarda kaybolmaz."
- **Görünmemesi gerekenler:** gerçek kişiye bağlı onay referansı
  ("X Hanım onayı" yalnızca demo kullanıcı adlarıyla — Elif K. kabul)

## Shot 4 — Görev detayı

- **Rota:** `/tasks/[id]` — "Numune Revizyon Kontrolü" (#13) önerilir:
  sorumlu + katılımcı + approval notu + geciken tarih aynı kartta
- **Görünmesi gerekenler:** başlık, açıklama, statü (Onay Bekliyor),
  sorumlu Zeynep D., katılımcı Elif K., teslim tarihi (2 gün gecikmiş),
  öncelik Acil, not akışında approval_waiting notu
- **Caption:** "Sorumlu, teslim tarihi ve notlar — tek kartta."
- **Görünmemesi gerekenler:** adres çubuğunda task UUID'si (adres çubuğu
  kadraj dışı); aktivite geçmişinde demo dışı kullanıcı adı (seed'i giren
  gerçek hesabın adı görünüyorsa hesap adı demo-safe olmalı)

## Shot 5 — Liste görünümü

- **Rota:** `/list`
- **Görünmesi gerekenler:** 20 görevlik tablo; kolonlar: görev adı, statü,
  sorumlu, teslim tarihi, öncelik, departman; Excel'i andıran yoğun ama
  düzenli görünüm
- **Caption:** "Excel'e alışkın ekipler için tanıdık görünüm."
- **Görünmemesi gerekenler:** boş tablo durumu; kolon filtrelerinde kalmış
  test değerleri

## Shot 6 — Takvim

- **Rota:** `/calendar` (çekim ayı görünümü)
- **Görünmesi gerekenler:** bu hafta + gelecek haftaya dağılmış teslim
  tarihleri; geciken 2 görev geçmiş günlerde; ay makul dolulukta (tarihler
  `DEMO_DATA_SEED_SPEC.md`'ye göre)
- **Caption:** "Teslim tarihleri takvimde görünür."
- **Görünmemesi gerekenler:** tamamen boş haftalar ağırlıklı kadraj (dolu
  bölge merkezde olmalı); doğum günü / kişisel takvim girdileri

## Shot 7 — Kurallar / standartlar

- **Rota:** `/rules`
- **Görünmesi gerekenler:** `DEMO_DATA_SEED_SPEC.md` §8'deki 5 jenerik kural,
  gruplu kart düzeninde
- **Caption:** "Ekip kuralları mesajlarda değil, sistemde yaşar."
- **Görünmemesi gerekenler:** AF'nin gerçek iç kurallarını çağrıştıran
  hiçbir metin; boş kural alanı

## Shot 8 — Dashboard

- **Rota:** `/dashboard`
- **Görünmesi gerekenler:** toplam 20 görev; 4 tamamlanan, 2 geciken,
  4 onay bekleyen; departman ve kişi dağılım grafikleri dolu
  (beklentiler: `DEMO_DATA_SEED_SPEC.md` §10)
- **Caption:** "Operasyonun gerçek durumu, tek ekranda."
- **Görünmemesi gerekenler:** sıfır/boş grafik; gerçek sayı iddiası
  taşıyan bağlamda kullanım (bu grafikler demo veridir — pazarlama metninde
  müşteri metriği gibi sunulamaz, bkz. `AF_PILOT_CASE_STUDY_DRAFT.md` §8)

## Shot 9 — Departman / modül merkezi

- **Rota:** `/modules` (departman merkezi; alternatif kadraj: `/production`
  veya `/collection` gibi tek modül sayfası)
- **Görünmesi gerekenler:** 6 demo departman/modül kartı (İçerik, Koleksiyon,
  Üretim, E-ticaret, Onaylar, Haftalık Kontrol); modül başına görev sayıları
- **Caption:** "Her departman kendi alanında, tek sistemde."
- **Görünmemesi gerekenler:** AF'ye özgü modül adları/özelleştirmeleri;
  CRM/finans gibi bu demonun anlatısına girmeyen modüllerde gerçek veri
  izlenimi veren içerik (boşsa kadraja alınmaz)

## Çekim sonrası

Her görüntü publish edilmeden önce `DEMO_SCREENSHOT_CHECKLIST.md`
"yayın öncesi kontrol" bölümünden (ikinci göz dahil) geçirilir — istisnasız.
Dosya adlandırma: `lospia-demo-{ekran}-{yyyy-mm-dd}-v{n}.png`
(ör. `lospia-demo-board-2026-07-08-v1.png`).
