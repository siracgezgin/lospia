# Lospia — Demo Workspace Planı

> **Faz kuralı:** Bu faz yalnızca docs + local/demo tooling içerir.
> Production Supabase'e dokunulmaz; migration uygulanmaz; `supabase db reset`
> çalıştırılmaz; AF Operasyon workspace'ine ve verisine dokunulmaz.

## 1. Amaç

Tek bir izole demo workspace hazırlamak ve tüm public materyali bu
workspace'ten üretmek:

- Marketing ekran görüntüleri (landing page, use-case sayfaları, OG görseli)
- 60 saniyelik Loom demo (`docs/sales/DEMO_SCRIPT_60_SEC.md` — A/B/C versiyonları)
- Kurucu tarafından yapılan canlı satış demoları
- Cold outreach Loom videoları (kişiselleştirilmiş Versiyon C)

Demo gerçekçi görünmeli (dolu board, gerçekçi Türkçe görev adları, tarih
dağılımı) ama **sıfır gerçek müşteri verisi** içermeli.

## 2. Gerçek AF ekran görüntüleri neden asla kullanılmaz

`DEMO_SCREENSHOT_CHECKLIST.md` Kural 1'in gerekçesi:

1. **Blur yeterli değildir.** Blur geri çözülebilir, eksik uygulanabilir ve
   çevresindeki bağlam (kolon sayıları, avatar baş harfleri, sekme başlığı)
   yine bilgi sızdırır. Varsayılan yöntem her zaman *değiştir* (demo veriyle
   yeniden üret), blur değil.
2. **KVKK / kişisel veri.** AF workspace'i gerçek ad-soyad, e-posta, doğum
   günü bildirimi ve iç not içerir. Bunların public görünmesi hukuki risktir.
3. **Ticari sır.** Gerçek görev adları tedarikçi ilişkilerini, koleksiyon
   takvimini, onay hiyerarşisini ve finansal detayları ifşa eder.
4. **Müşteri güveni.** AF ilk pilot müşteridir; yazılı onayı olmadan hiçbir
   AF içeriği public kullanılamaz (bkz. `AF_PILOT_CASE_STUDY_DRAFT.md` onay
   checklist'i). Onay olsa bile ekranlar demo veriden yeniden üretilir.
5. **Kaza riski.** Gerçek workspace açıkken çekim yapmak, tek yanlış
   sekme/bildirimle sızıntı üretir. Demo workspace bu riski yapısal olarak
   ortadan kaldırır.

## 3. Demo workspace kimliği

| Alan | Değer |
|---|---|
| Workspace adı | **Lospia Demo Operasyon** |
| Ekip adı | **Marka Ekibi** |
| Ortam | **Yalnızca local Supabase** (bu fazda) — production'a asla |
| E-posta formatı | `ad@demo.lospia.test` (gerçek domain yok, mail gitmez) |

## 4. Demo departmanlar

- İçerik
- Koleksiyon
- Üretim
- E-ticaret
- Onaylar
- Haftalık Kontrol

## 5. Demo statüler

Demo anlatı statüleri ve uygulamadaki karşılıkları
(`lib/utils/task-constants.ts`):

| Demo statü | Internal status | UI etiketi / kolon |
|---|---|---|
| Backlog | `backlog` | "Yapılacak" kolonu |
| Hazır | `ready` | "Yapılacak" kolonu |
| Devam Ediyor | `in_progress` | "Devam ediyor" |
| Onay Bekliyor | `review` | "Kontrol / Onay" |
| Tamamlandı | `done` | "Tamamlandı" |

> Not: Board görsel olarak 4 kolondur; `backlog` ve `ready` aynı "Yapılacak"
> kolonunda görünür. Onay mesajı için kritik olan "Kontrol / Onay" kolonu ve
> "Onay bekleyenler" saved view'ıdır (`?view=waiting-approval`).

## 6. Demo kullanıcılar

| İsim | Rol/Ünvan | E-posta | App rolü |
|---|---|---|---|
| Elif K. | Marka Yöneticisi | `elif@demo.lospia.test` | admin |
| Mert A. | İçerik Sorumlusu | `mert@demo.lospia.test` | member |
| Zeynep D. | Üretim Koordinatörü | `zeynep@demo.lospia.test` | member |
| Deniz T. | E-ticaret Sorumlusu | `deniz@demo.lospia.test` | member |

Çekim öncesi kontrol: bu isimlerin gerçek AF ekip üyeleriyle çakışmadığı
doğrulanır (`DEMO_SCREENSHOT_CHECKLIST.md` §4). Avatarlar baş harfli jenerik
avatarlardır; gerçek fotoğraf kullanılmaz.

## 7. Demo görev örnekleri (çekirdek 10)

1. Lookbook Çekim Planı
2. Ürün Görselleri Yükleme
3. Kumaş Tedarik Takibi
4. Kampanya Takvimi
5. Numune Revizyon Kontrolü
6. Instagram İçerik Planı
7. Koleksiyon Lansman Hazırlığı
8. Haftalık Operasyon Kontrolü
9. Ürün Açıklamaları Revizyonu
10. Onay Bekleyen Kreatifler

Tam 20 görevlik dağılım (statü, tarih, öncelik, sorumlu, katılımcı, not)
için: `DEMO_DATA_SEED_SPEC.md`. Ek görevler aynı ruhta türetilir — gerçekçi,
marka operasyonu dilinde, ama hiçbir gerçek AF görevine/tedarikçisine işaret
etmeyen adlar.

## 8. Çekilecek ekran görüntüleri

`DEMO_SCREENSHOT_CHECKLIST.md` §1 ile uyumlu; kesin kadraj ve
"görünmeyecekler" listesi için `SCREENSHOT_SHOTLIST.md`:

1. Board (Kanban) — ana hero görseli
2. Haftalık görünüm ("Bu hafta" view'ı)
3. Görev detayı (sorumlu + katılımcılar + notlar)
4. Liste görünümü
5. Takvim
6. Onay bekleyenler (view/kolon)
7. Dashboard
8. Kurallar / standartlar alanı
9. Departman / modül merkezi

## 9. Çekim sırası

Video akışıyla aynı sıra kullanılır (tek oturumda hem screenshot hem video
malzemesi çıkar):

1. **Board** — genel bakış, hook görseli
2. **Görev detayı** — sorumlu + tarih + not (board'dan karta tıklanarak)
3. **Onay bekleyenler** — tıkanan işlerin görünürlüğü
4. **Haftalık görünüm** — yönetici perspektifi
5. **Liste** ve **Takvim** — "aynı veri, farklı görünüm" geçişi
6. **Kurallar alanı**
7. **Dashboard** — kapanış görseli
8. **Departman merkezi** — (screenshot seti için; videoda opsiyonel)

## 10. Caption'lar

| Ekran | Caption |
|---|---|
| Board | "Her işin sahibi, tarihi ve durumu tek panelde." |
| Görev detayı | "Sorumlu, teslim tarihi ve notlar — tek kartta." |
| Onay bekleyenler | "Onay bekleyen işler mesajlarda kaybolmaz." |
| Haftalık görünüm | "Haftalık durumu sormadan görün." |
| Liste | "Excel'e alışkın ekipler için tanıdık görünüm." |
| Takvim | "Teslim tarihleri takvimde görünür." |
| Kurallar | "Ekip kuralları mesajlarda değil, sistemde yaşar." |
| Dashboard | "Operasyonun gerçek durumu, tek ekranda." |
| Departman merkezi | "Her departman kendi alanında, tek sistemde." |

## 11. Kayıt öncesi doğrulama

Her çekim oturumundan önce:

- [ ] **Ortam:** local Supabase'e bağlı olunduğu doğrulandı
      (`.env.local` → `http://127.0.0.1:54321`); production URL'i değil
- [ ] **Workspace:** açık olan workspace "Lospia Demo Operasyon"; AF
      Operasyon hesabında hiçbir sekmede oturum açık değil
- [ ] **Veri:** board `DEMO_DATA_SEED_SPEC.md`'deki dağılımla dolu
      (3 Backlog / 4 Hazır / 5 Devam / 4 Onay / 4 Tamamlandı; 2 geciken,
      3 acil)
- [ ] **Tarihler:** çekim haftasına göre güncel — gecikenler gerçekten
      geçmişte, "bu hafta" görevleri gerçekten bu hafta (tarihler eskidiyse
      seed yenilenir)
- [ ] **İsimler:** görünen tüm isim/e-postalar §6'daki demo listeden
- [ ] **Bildirimler:** bildirim popover'ı ve toast'lar temiz (demo
      bildirimleri kabul; gerçek bildirim asla)
- [ ] **Tarayıcı:** temiz profil, bookmark bar kapalı, uzantı yok, OS
      bildirimleri kapalı (ayrıntı: `LOOM_RECORDING_CHECKLIST.md`)
- [ ] **Tema/dil:** light mode, UI Türkçe, zoom %100
- [ ] **Yayın öncesi:** her görüntü `DEMO_SCREENSHOT_CHECKLIST.md`
      "yayın öncesi kontrol" bölümünden geçirilir — istisnasız
