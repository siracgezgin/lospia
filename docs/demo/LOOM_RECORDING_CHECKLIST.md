# Lospia — Loom Kayıt Checklist'i (60 sn demo)

> Script kaynağı: `docs/sales/DEMO_SCRIPT_60_SEC.md` (Versiyon A: kurucu
> videosu · B: LinkedIn/web · C: cold outreach Loom). Veri kaynağı:
> **Lospia Demo Operasyon** workspace'i (`DEMO_DATA_SEED_SPEC.md`).

## 1. Kayıt öncesi — ortam

- [ ] **Yalnızca demo workspace.** Kayıt tarayıcısında açık tek uygulama
      sekmesi Lospia Demo Operasyon. **AF workspace'i kayıt sırasında hiçbir
      sekmede/pencerede açık değil; AF hesabında oturum açık değil.**
- [ ] Local Supabase'e bağlı olunduğu doğrulandı (production değil)
- [ ] Demo verisi güncel: tarihler çekim haftasına göre yeniden dağıtıldı
      (gecikenler gerçekten geçmişte, "bu hafta" gerçekten bu hafta)
- [ ] `DEMO_WORKSPACE_PLAN.md` §11 "kayıt öncesi doğrulama" tamamlandı

## 2. Tarayıcı kurulumu

- [ ] **Temiz tarayıcı profili** (Chrome "yeni profil" / Safari ayrı
      kullanıcı) — kişisel profil asla
- [ ] Bookmark bar kapalı, uzantı ikonu yok
- [ ] Sekmede yalnızca demo workspace; sekme başlığı temiz
- [ ] Adres çubuğu: localhost görünüyorsa kadraj/kayıt alanı dışında
      bırakılır veya tam ekran (⌘⇧F) kullanılır
- [ ] Light mode, UI Türkçe, tarayıcı zoom %100

## 3. Ekran ve sistem

- [ ] Kayıt çözünürlüğü **1920×1080** (ekran görüntüleri için ayrıca
      1440×900 viewport)
- [ ] **macOS bildirimleri kapalı:** Odak/Rahatsız Etmeyin açık (mesaj,
      takvim, e-posta bildirimi kayda giremez)
- [ ] Loom/Slack/WhatsApp masaüstü uygulamaları kapalı
- [ ] Menü çubuğunda hassas bilgi yok (tam ekran tercih)
- [ ] İmleç boyutu normal (OS imleç büyütmesi kapalı)
- [ ] Mikrofon testi yapıldı; sessiz ortam

## 4. 60 saniye zamanlama checklist'i

`DEMO_SCRIPT_60_SEC.md` ortak iskeleti:

| Saniye | Bölüm | Ekran | Kontrol |
|---|---|---|---|
| 0-5 | Hook | Kamera (A/C) veya ekran metni (B) | Tek cümle, soruyla açılış |
| 5-15 | Problem | Kamera / ekran metni | Excel+WhatsApp kaosu dili |
| 15-40 | Ekran gezintisi | Board → Onay bekleyenler → Haftalık görünüm → Kurallar | Aşağıdaki checkpoints |
| 40-50 | 3 fayda | Kamera / ekran metni | "Sahip net · onay kaybolmaz · sormadan görün" |
| 50-55 | Kurulum destekli model | Kamera | "Boş araç vermiyoruz; kurulumu biz yapıyoruz" |
| 55-60 | CTA | Kamera / ekran metni | "15 dakikalık kurulum görüşmesi planlayalım." |

## 5. Ekran gezintisi checkpoints (15-40 sn)

- [ ] **Board** (`/board?view=all`): dolu 4 kolon; imleçle 1 kartın
      sorumlu+tarih+statüsü gösterilir
- [ ] **Onay bekleyenler** (`?view=waiting-approval`): 4 kart; geciken+acil
      "Numune Revizyon Kontrolü" kartı vurgulanır
- [ ] **Haftalık görünüm** (`?view=this-week`): bu hafta kritik / geciken /
      tamamlanan tek bakışta
- [ ] **Kurallar** (`/rules`): kurallar kartlarına kısa pan (Versiyon A'da
      var; B'de liste+takvim geçişi de eklenir)
- [ ] Geçişler sekme değiştirme değil, uygulama içi navigasyon
- [ ] Her ekranda 3-6 saniye — acele pan yok

## 6. Konuşma

- [ ] Ton: doğrudan, premium, sakin — startup-hype yok
- [ ] Yasak kelimeler kullanılmadı: "ücretsiz başla", "AI destekli", "ERP",
      "sınırsız", "devrim", "oyun değiştirici"
- [ ] 60 saniyeye sığmıyorsa **metin kısaltılır, konuşma hızlandırılmaz**
- [ ] Versiyon C ise: {{first_name}} / {{company_name}} doğru kişiye ait,
      {{pain_hypothesis}} gerçekçi, uydurma kişiselleştirme yok

## 7. Retake (yeniden çekim) kriterleri

Aşağıdakilerden biri varsa yayınlanmaz, yeniden çekilir:

- Ekranda demo dışı herhangi bir veri/bildirim/sekme göründü → **kayıt
  silinir**, ortam düzeltilir, baştan çekilir (kesip yayınlamak yok)
- Süre 70 saniyeyi aştı veya CTA 60. saniyeden belirgin sonra geldi
- Ekran gezintisinde yanlış görünüm açıldı / boş ekran bekletildi
- Ses kalitesi düşük (uğultu, kesik kelime, seviye dengesizliği)
- Yasak kelime ağızdan kaçtı
- Konuşma hızı sığdırmak için hızlandı
- Kayıtta bildirim/toast belirdi (demo bildirimi bile plansızsa retake)

Küçük dil sürçmesi tek başına retake sebebi değildir — doğallık premium
tonun parçası; mesaj ve veri güvenliği bozulmadıysa kabul.

## 8. Yayın öncesi

- [ ] Video baştan sona **tam ekran ve yavaşlatılarak** izlendi; her karede
      yalnızca demo verisi olduğu doğrulandı
- [ ] `DEMO_SCREENSHOT_CHECKLIST.md` "yayın öncesi kontrol" bölümü videoya
      da uygulandı (ikinci göz; tek kişiysen ertesi gün tekrar bak)
- [ ] Loom paylaşım ayarı doğru (public link yalnızca yayın kararından sonra)
- [ ] CTA linki çalışıyor ({{demo_link}} / request-access)

## 9. Export / adlandırma standardı

```
lospia-demo-60s-{versiyon}-{dil}-{yyyy-mm-dd}-v{n}.mp4
```

Örnekler:

- `lospia-demo-60s-a-tr-2026-07-08-v1.mp4` (Versiyon A, Türkçe, 1. çekim)
- `lospia-demo-60s-b-tr-2026-07-08-v2.mp4`
- Cold outreach (C) kişiye özel: `lospia-loom-c-{firma-slug}-{yyyy-mm-dd}.mp4`
  — firma adı yalnızca dosya adında, video arşivi private tutulur

Kaynak kayıt (ham) + yayınlanan kesim birlikte arşivlenir; yayından
kaldırma talebi gelirse ikisi de silinebilir olmalı.
