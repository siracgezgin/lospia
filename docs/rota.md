# Lospia Rotası — Güncel Durum (5 Temmuz 2026)

## Mevcut durum

- ✅ **AF Operasyon canlıda:** `operasyon.aslifilinta.com` — ilk pilot workspace.
  Production davranışı korunuyor; AF domainde `/` eskisi gibi login/app'e gider,
  marketing sayfaları bu domainde asla servis edilmez (hostname guard:
  `lib/marketing/host.ts` + middleware + `app/(marketing)/layout.tsx`).
- ✅ **İş modeli kilitlendi:** Productized setup + aylık SaaS aboneliği.
  Self-serve / freemium / Stripe checkout yok.
- ✅ **Lospia market-readiness temeli eklendi** (branch: `feat/lospia-market-readiness`):
  - Public marketing sitesi: `/` (localhost + gelecek Lospia domainlerinde),
    hero / problem / çözüm / özellikler / kullanım alanları / pilot / fiyat
    yönü / "kimin için değil" / SSS / final CTA.
  - `/request-access` — lead formu → `request_access_leads` tablosu
    (migration: `20240210000000_request_access_leads.sql`, RLS insert-only).
    Prod'a `supabase db push` ile uygulanacak — henüz uygulanmadı.
  - `/legal/privacy-policy` ve `/legal/terms-of-service` — dürüst erken aşama
    taslaklar (SOC2/ISO/KVKK tam uyum iddiası yok).
  - Satış dokümanları: `docs/sales/` (pilot teklifi, SOW şablonu, onboarding
    checklist, görüşme scriptleri, ilk 100 lead planı).
- ⏳ **TODO:** `hello@lospia.com` placeholder — Lospia domaini + resmi e-posta
  kesinleşince legal sayfalarda güncellenecek. Resend e-posta bildirimi bu
  fazda yok; lead'ler Supabase dashboard'dan izlenir.

### Yeni env değişkenleri (opsiyonel, güvenli varsayılanlar)

- `NEXT_PUBLIC_AF_OPERATIONS_HOST` — varsayılan `operasyon.aslifilinta.com`
- `NEXT_PUBLIC_MARKETING_SITE_ENABLED` — varsayılan açık; `false` → her yerde
  eski (marketing öncesi) davranış

## Sonraki fazlar

1. **AF pilot case study materyalleri** — onaylı, hassas veri içermeyen anlatı
2. **60 saniyelik Loom demo** — board + onay akışı + haftalık görünüm
3. **Production-safe ekran görüntüleri** — gerçek müşteri verisi olmadan
4. **İlk 30 sıcak lead** — network üzerinden mesaj dilini test et
5. **100 manuel seçilmiş outbound lead** — `docs/sales/OUTBOUND_FIRST_100.md`
6. **5 demo görüşmesi**
7. **1-3 ücretli pilot** — 10.000 TL setup + 1.500 TL/ay minimum

---

# Arka plan: strateji tartışmasının özeti

Evet, şimdi tartışmanın özeti şu: **araştırmalar tek bir yöne işaret ediyor.** Lospia’yı şu anda “herkes için SaaS” diye piyasaya sürersen batarsın. Doğru rota: **AF Operasyon pilotunu gerçek vaka çalışmasına çevir → marka/e-ticaret/yaratıcı ekipler için productized setup olarak sat → sonra tekrarlanan parçaları SaaS’a standardize et.**

Yani rota şu olmalı:

## 1. Ana karar: Lospia self-service SaaS olarak başlamamalı

Şu an “Hemen kaydol, aylık ödeme yap, kendin kur” modeli yanlış. Çünkü hedef müşteri Excel, WhatsApp, sözlü takip ve manuel onaylarla çalışıyor. Bu müşteri boş bir panel görünce değer üretmez; kurulmuş sistem görmek ister. Marketing dokümanı da Lospia’yı generic ClickUp/Monday klonu değil, Excel/WhatsApp’tan yapılandırılmış operasyona geçiş köprüsü olarak konumlandırıyor. 

Bu yüzden ilk teklif şu olmalı:

> **“Excel ve WhatsApp’a dağılmış marka operasyonunuzu 7-14 gün içinde Lospia’ya taşıyoruz. Görevler, sorumlular, onaylar ve haftalık takip tek panelde görünür hale geliyor.”**

Bu yazılım satışı değil. **Operasyon kurulumu + yazılım aboneliği.**

---

## 2. İlk niş: geniş KOBİ değil, marka / moda / e-ticaret / yaratıcı ekipler

Araştırmalar birkaç niş öneriyor ama senin mevcut avantajın Aslı Filinta pilotu. Bu yüzden teorik olarak ajanslar yüksek skor alsa bile ilk güven hikâyen **marka operasyonu** üzerinden geliyor. Marketing dokümanı Lospia’nın bir “premium operations panel for brand teams” olduğunu, moda, e-ticaret, yaratıcı stüdyo ve operasyon ekiplerine odaklanması gerektiğini açık yazıyor. 

Benim net önerim:

**Birincil ICP:**
Moda, tasarım, premium e-ticaret, butik üretim ve yaratıcı marka ekipleri.

**İkincil ICP:**
Kreatif ajanslar ve sosyal medya/içerik ajansları.

**Şimdilik dışarıda bırak:**
Hukuk bürosu, kooperatif, klinik, ağır üretim, ERP isteyen KOBİ, depo/lojistik yoğun işletme.

Sebep basit: Bunların her biri ayrı ürün ister. Sen tek başına bütün sektörlere ürün yapmaya kalkarsan Lospia değil, yamalı bohça çıkar.

---

## 3. Fiyat stratejisi: düşük aylık SaaS fiyatıyla başlama

Finansal raporun en önemli sonucu bu: **19-29 dolar gibi düşük abonelik fiyatı kurucuyu öldürür.** Kurulum ücreti alınmazsa müşteri de ciddiye almaz, senin onboarding emeğin de finanse edilmez. Rapor açık şekilde “Kurulum Ücreti + Aylık Abonelik” modelini öneriyor. 

Benim ilk 3 müşteri için önerdiğim Türkiye fiyatı:

**Pilot Kurulum Paketi**

* Kurulum: **10.000 - 20.000 TL**
* Aylık abonelik: **1.500 - 3.500 TL**
* Kapsam: 1 workspace, 5-15 kullanıcı, temel görev sistemi, haftalık takip, departmanlar, basit CRM/operasyon alanı, 1 canlı eğitim, 14 gün destek.
* İndirim olabilir ama ücretsiz pilot yok.

Daha premium müşteri için:

**Marka Operasyon Paketi**

* Kurulum: **25.000 - 50.000 TL**
* Aylık: **5.000 - 12.000 TL**
* Daha fazla kullanıcı, daha fazla veri taşıma, daha fazla eğitim, özel şablon.

Global için erken fiyat:

* Setup: **$250 - $500**
* Monthly: **$99 - $149**
* Daha büyük paket: **$999 setup + $199/month**

Ucuz başlama hatası yaparsan müşteri sayın artar ama para kazanmazsın. Daha kötüsü, her müşteri senden “şunu da ekler misin?” ister ve sen ürün geliştirmek yerine düşük ücretli destek elemanına dönüşürsün.

---

## 4. Teknik rota: mevcut stack devam, ama SaaS disiplini şart

Teknik araştırma doğru noktaya gelmiş: **tek app + tek database + multi-tenant pool mimarisi**. Her müşteriye ayrı Supabase, ayrı deployment, ayrı database şu an gereksiz yük. RLS ile tenant izolasyonu korunmalı; her operasyonel tabloda workspace/organization bağlantısı net olmalı. 

Buradaki kritik uyarı:
**Satış başlamadan önce tenant izolasyonu, rol sistemi ve workspace creation akışı güvenilir olmalı.**

Şu an teknik öncelik ürün büyütmek değil:

1. Production Supabase kurulumu.
2. Vercel deploy.
3. Fake seed kullanıcılarını prod’a taşımamak.
4. Gerçek pilot kullanıcıları açmak.
5. AF Operasyon workspace’ini gerçek veriyle kurmak.
6. Owner/admin/member/viewer sınırlarını netleştirmek.
7. Upload, Slack, AI, realtime gibi feature flag’leri kapalı tutmak.
8. Public landing page’i protected app’ten ayırmak.

Deployment checklist zaten prod’a geçmeden yapılması gerekenleri net yazmış: yeni Supabase project, migration push, seed çalıştırmama, gerçek pilot kullanıcıları oluşturma, Vercel env ayarları, feature flag’leri kapalı tutma gibi adımlar var. 

---

## 5. Marka mimarisi: AF Operasyon ≠ Lospia

Bunu karıştırırsan ürün kimliği bozulur. Dokümana göre **Lospia platformun adı**, **AF Operasyon ilk pilot workspace**. Şu an kodda toplu “AF Operasyon → Lospia” rename yapılmamalı. AF pilot kendi workspace markasıyla kalmalı; Lospia ise üst platform olarak konumlanmalı. 

Doğru yapı:

* `Lospia` = ürün/platform
* `AF Operasyon` = ilk pilot müşteri workspace’i
* Public site = Lospia markası
* App içinde müşteri workspace’i = müşterinin kendi operasyon alanı

Bu white-label potansiyelinin de temeli.

---

## 6. Satıştan önce yapılacak minimum hukuki/operasyonel hazırlık

Burada da romantik davranma. Müşteri verisi, kullanıcı bilgisi, görevler, CRM kayıtları, ödeme bilgisi tutacaksın. Hukuki rapor Lospia’nın hem veri sorumlusu hem veri işleyen pozisyonuna yaklaşabileceğini ve sözleşmesiz/scope’suz satışın scope creep riskini büyüttüğünü söylüyor. 

İlk ücretli müşteriden önce minimum şunlar hazır olmalı:

* Basit hizmet sözleşmesi
* Scope of Work
* Gizlilik Politikası
* KVKK Aydınlatma Metni taslağı
* Destek politikası
* İptal/askıya alma şartı
* Dahil / dahil değil listesi
* Manuel fatura + havale süreci

Özellikle Scope of Work olmazsa müşteri şunu diyecek: “Bir de kargo entegrasyonu ekleyelim, geçmiş 3 yıllık datayı da taşıyalım, WhatsApp bildirimi de gelsin.” Hukuki dokümanda da özel API entegrasyonu, ağır veri taşıma ve sınırsız revizyonun kapsam dışında tutulması gerektiği açıkça belirtilmiş. 

---

## 7. Onboarding modeli: 7 günlük vaat güzel ama 14 günlük standart daha güvenli

Operasyon raporu en doğru modeli **Productized Setup + Nişe Özel Template Kurulumu** olarak seçiyor. Bu, “sıfırdan size özel yazılım yapıyoruz” değil; “kanıtlanmış şablonu sizin operasyona uyarlıyoruz” demek. 

Benim önerim:

**Pazarlama dili:**
“7 günde operasyon paneliniz hazır.”

**Sözleşme dili:**
“Standart kurulum 7-14 iş günü içinde tamamlanır; süre, müşterinin bilgi/form/veri teslim hızına bağlıdır.”

Böylece satış dili güçlü kalır ama kendini köşeye sıkıştırmazsın.

Onboarding akışı:

1. Ödeme + sözleşme.
2. Müşteri bilgi formu.
3. 60 dakikalık operasyon keşfi.
4. Template seçimi.
5. Workspace kurulumu.
6. 20-30 satırlık gerçek veri girişi/import.
7. Kullanıcı davetleri.
8. 45 dakikalık canlı eğitim.
9. 14. gün kontrol.
10. 30. gün başarı ölçümü + case study isteği.

---

## 8. Pazarlama sitesi: önce tek güçlü landing page

Public site hemen yapılmalı ama devasa site değil. Marketing stratejisi açık: site generic SaaS gibi görünmemeli; premium, sakin, net ve dönüşüm odaklı olmalı. Ana dönüşüm “operational chaos → weekly clarity” olmalı. 

İlk landing page hero bence aynen şu olmalı:

**Başlık:**
`Excel ve WhatsApp karmaşasına son verin. Marka operasyonlarınızı tek panelde yönetin.`

**Alt başlık:**
`Lospia; moda, e-ticaret ve yaratıcı ekiplerin görevleri, onayları, teslim tarihlerini ve haftalık ilerlemeyi sade bir operasyon panelinde takip etmesini sağlar.`

**CTA:**
`Kurulum Görüşmesi Planla`

Bu CTA bilinçli olarak “Ücretsiz Başla” olmamalı. Çünkü Lospia şu an self-service ürün değil; kurulum destekli pilot. Marketing dokümanı da self-service CTA’lardan kaçınılmasını öneriyor. 

---

## 9. Outbound: önce küçük, manuel, nitelikli liste

Burada da hataya açıksın. 1000 kişiye mail atma fantezisine kapılma. Önce mesaj çalışıyor mu onu test edeceğiz.

İlk hedef:

* 30 sıcak/yarı sıcak bağlantı
* 100 manuel seçilmiş marka/e-ticaret/stüdyo lead’i
* 20 discovery görüşmesi
* 5 demo
* 1-3 ücretli pilot

Outbound raporu düşük sermayeli kurucu için Google Maps scraping + cold email + manuel LinkedIn outbound kombinasyonunu öne çıkarıyor; ama benim yorumum şu: **AF pilot case study çıkmadan agresif cold email erken.** Önce güven materyali üret. Sonra outbound’a yüklen. 

İlk mesajın dili şu olmalı:

> “Marka operasyonlarını hâlâ Excel ve WhatsApp üzerinden yürüttüğünüzü tahmin ediyorum. Lospia ile bu yapıyı 7-14 gün içinde görevler, sorumlular, onaylar ve haftalık görünürlük olan tek panele taşıyoruz. 15 dakikada sizin iş akışınız için uygun mu bakalım mı?”

---

# Benim önerdiğim gerçek rota

## Faz 0 — Şu an, 3 gün: kararları kilitle

Yapılacak kararlar:

* Lospia self-service başlamayacak.
* İlk niş: marka / moda / e-ticaret / yaratıcı operasyon ekipleri.
* İlk teklif: productized setup + monthly SaaS.
* AF Operasyon ilk pilot olarak kalacak.
* AI, Slack, native mobile, Stripe checkout, ağır entegrasyon yok.
* İlk satışta kurulum ücreti alınacak.

Bu kararları yazılı hale getirmezsen iki gün sonra yine “şunu da ekleyelim mi?” döngüsüne girersin.

---

## Faz 1 — 7 gün: AF pilotu production-ready hale getir

Teknik yapılacaklar:

* Production Supabase oluştur.
* Migrations push.
* Vercel prod deploy.
* Feature flags kapalı.
* Gerçek AF kullanıcıları.
* Workspace role sınırları.
* Invite flow.
* Workspace name editing.
* AF gerçek veri import.
* Login/metadata/branding düzeltmeleri.
* Demo datası ile gerçek datayı ayır.

Satış/pazarlama yapılacaklar:

* 60 saniyelik Loom demo.
* 5 ekran görüntüsü.
* “İlk pilot: Aslı Filinta operasyonları” bölümü.
* Landing page ilk versiyon.
* Request access form.

---

## Faz 2 — 14 gün: satış paketi çıkar

Hazırlanacaklar:

* Pilot teklif PDF’i.
* Scope of Work.
* Dahil / dahil değil listesi.
* 7-14 günlük onboarding checklist.
* Müşteri bilgi formu.
* 15 dakikalık demo script.
* 45 dakikalık eğitim akışı.
* Basit sözleşme/KVKK/Gizlilik taslakları.
* Fiyat tablosu.

Bu olmadan müşteriyle konuşursan amatör görünürsün.

---

## Faz 3 — 30 gün: validasyon satışı

Hedef:

* 100 seçilmiş lead.
* 20 görüşme.
* 5 demo.
* 1-3 ücretli pilot.
* En az 1 case study.

Bu aşamada başarı metrikleri:

* İnsanlar problemi kabul ediyor mu?
* “Excel/WhatsApp kaosu” dili çalışıyor mu?
* Kurulum ücreti itiraz yaratıyor mu?
* Hangi modül demo sırasında en çok ilgi çekiyor?
* Müşteri gerçekten ekip davet ediyor mu?
* 14 gün sonra hâlâ kullanıyorlar mı?

---

## Faz 4 — 60-90 gün: tekrar eden sistemi ürünleştir

Eğer 3 müşteri aynı şeyi istiyorsa ürün özelliği olur.
Eğer 1 müşteri istiyorsa özel geliştirmedir ve ücretlidir.

Bu dönemde yapılacaklar:

* Workspace template sistemi.
* CSV/Excel import iyileştirme.
* Onboarding otomasyonu.
* Request access CRM paneli.
* Basic product analytics.
* Support board.
* Case study landing section.
* 500 lead outbound kampanyası.
* 2. niş olarak kreatif ajans testi.

---

# Şu anda kesinlikle yapılmaması gerekenler

Bunları yaparsan zaman kaybedersin:

* “Her sektöre uygun operasyon sistemi” diye konumlandırmak.
* Stripe checkout eklemek.
* Freemium açmak.
* AI özellikleri eklemek.
* Mobil app yapmak.
* Slack/Gmail/ERP entegrasyonu yapmak.
* Ağır dosya storage açmak.
* Her müşteriye özel modül geliştirmek.
* Public launch yapıp beklemek.
* Büyük reklam bütçesi yakmak.
* AF Operasyon’u Lospia diye topluca rename etmek.

En büyük kör noktan şu: **sen teknik olarak ürünü büyütebilirsin ama bu aşamada ürün büyütmek ilerleme değil, kaçış olabilir.** Şu an yapılması gereken şey daha fazla özellik değil; **satılabilir paket, kontrollü pilot ve gerçek müşteri görüşmesi.**

Net rota: **AF pilotu sağlamlaştır → landing + demo + teklif çıkar → 20 görüşme yap → 1-3 ücretli pilot kapat → tekrar eden ihtiyaçları ürüne dönüştür.**
