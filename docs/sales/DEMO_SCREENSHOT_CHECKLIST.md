# Lospia — Demo Ekran Görüntüsü ve Kayıt Checklist'i

> Kural 1: Public kullanılacak hiçbir görüntü gerçek AF workspace'inden
> alınmaz — blur bile yeterli değildir. Görüntüler **demo verisiyle dolu ayrı
> bir demo workspace'te** üretilir.
> Kural 2: Her görüntü/video yayınlanmadan önce bu dokümanın "yayın öncesi
> kontrol" bölümünden geçirilir.

## 1. Çekilecek ekranlar

| # | Ekran | Rota | Amaç |
|---|---|---|---|
| 1 | Board (Kanban) | `/board` | Ana hero görseli; sorumlular + tarihler + statüler |
| 2 | Haftalık görünüm | board haftalık filtre | "Sormadan görün" mesajı |
| 3 | Görev detayı | `/tasks/[id]` | Sorumlu, katılımcılar, notlar, tarih |
| 4 | Liste görünümü | `/list` | Excel'den gelen ekipler için tanıdık format |
| 5 | Takvim | `/calendar` | Teslim tarihi görünürlüğü |
| 6 | Onay bekleyenler | board "Onay Bekliyor" kolonu/filtre | Onay akışı mesajı |
| 7 | Dashboard | `/dashboard` | Haftalık/istatistik görünürlük |
| 8 | Kurallar/standartlar alanı | ilgili modül | "Kurallar sistemde yaşasın" |

## 2. Gösterilmeyecekler (kesin liste)

- ❌ E-posta adresleri (gerçek veya AF ekibine ait)
- ❌ Kişisel bilgiler (gerçek ad-soyad, telefon, doğum tarihi/doğum günü bildirimleri)
- ❌ Gerçek/iç görev adları ve not içerikleri
- ❌ Finansal veriler (tutar, bütçe, tedarikçi fiyatı)
- ❌ AF'ye özgü iç detaylar (tedarikçi adları, koleksiyon takvimi, onay hiyerarşisi, Aslı Filinta logosu/wordmark'ı)
- ❌ Bildirim popover'ında gerçek bildirimler
- ❌ Tarayıcı profil adı, sekme başlıkları, adres çubuğunda iç URL/parametreler
- ❌ Workspace ayarları ekranında gerçek üye listesi

## 3. Blur / değiştirme kuralı

- Varsayılan yöntem: **değiştir** (demo veriyle yeniden üret), blur değil.
- Blur yalnızca zorunlu tek istisnada: adres çubuğu domain'i (Lospia domaini
  kesinleşmeden çekim yapılırsa) — tercihen adres çubuğu kadraj dışı bırakılır.
- Kullanıcı avatarları: baş harfli jenerik avatarlar veya demo isimler.

## 4. Demo-safe veri adlandırma standardı

Demo workspace'te kullanılacak isimlendirme (gerçekçi ama hiçbir gerçek
veriye işaret etmeyen):

**Departman/ekip adları:**
- `Marka Ekibi`

**Görev/modül adları:**
- `İçerik Planı`
- `Koleksiyon Hazırlığı`
- `Haftalık Kontrol`
- `Numune Takibi`

**Statü:**
- `Onay Bekliyor`

Ek demo görev örnekleri (aynı ruhta türetilebilir): `Lookbook Çekim Planı`,
`Ürün Görselleri Yükleme`, `Kumaş Tedarik Takibi`, `Kampanya Takvimi`.

**Demo kullanıcılar:** jenerik Türkçe isimler (ör. `Elif K.`, `Mert A.`,
`Zeynep D.`) — AF ekibindeki gerçek isimlerle çakışmadığı kontrol edilir.
Demo e-postalar: `elif@demo.lospia.test` formatında, gerçek domain yok.

**Tarihler:** çekim haftasına göre gerçekçi dağıtılır (birkaç geciken, birkaç
bu hafta, birkaç gelecek hafta) — dashboard ve haftalık görünüm dolu görünsün.

## 5. Önerilen demo ekran sırası (video akışı)

1. Board — genel bakış (hook görseli)
2. Görev detayı — sorumlu + tarih + not
3. Onay Bekliyor — tıkanan işlerin görünürlüğü
4. Haftalık görünüm — yönetici perspektifi
5. Liste/Takvim — kısa geçiş ("aynı veri, farklı görünüm")
6. Kurallar alanı — kapanış öncesi
7. Dashboard — kapanış görseli

## 6. Önerilen altyazı/caption'lar

| Ekran | Caption |
|---|---|
| Board | "Her işin sahibi, tarihi ve durumu tek panelde." |
| Görev detayı | "Sorumlu, teslim tarihi ve notlar — tek kartta." |
| Onay Bekliyor | "Onay bekleyen işler mesajlarda kaybolmaz." |
| Haftalık görünüm | "Haftalık durumu sormadan görün." |
| Liste | "Excel'e alışkın ekipler için tanıdık görünüm." |
| Takvim | "Teslim tarihleri takvimde görünür." |
| Kurallar | "Ekip kuralları mesajlarda değil, sistemde yaşar." |
| Dashboard | "Operasyonun gerçek durumu, tek ekranda." |

## 7. Teknik standartlar

- **Tarayıcı boyutu:** 1440×900 viewport (ekran görüntüsü); video kaydı
  1920×1080. Retina/2x ölçek tercih edilir (keskin görüntü).
- **Tarayıcı:** temiz Chrome/Safari profili; uzantı ikonları, bookmark bar,
  bildirimler kapalı. Sekmede yalnızca demo workspace.
- **Tema:** **Light mode** — marketing stratejisiyle uyumlu (premium,
  moda/marka kitlesi için açık tema; dark yalnızca kontrast bölümlerinde).
- **Dil:** UI Türkçe; TR pazarı için TR ekran, EN sayfa gerekirse ayrı çekim.
- **Zoom:** %100; işletim sistemi imleci büyütülmüş olmasın.

## 8. Yayın öncesi kontrol (her görüntü/video için)

- [ ] Demo workspace'te çekildi; gerçek AF workspace'i değil
- [ ] Görünen tüm isimler/e-postalar demo-safe listeden
- [ ] Bölüm 2'deki "gösterilmeyecekler" listesi tek tek kontrol edildi
- [ ] Adres çubuğu/sekme başlığı temiz
- [ ] Bildirim popover'ı ve toast'lar temiz
- [ ] Görüntü ikinci bir göz tarafından incelendi (kurucu + 1 kişi; tek
  kişiysen ertesi gün tekrar bak)
- [ ] Public kullanım öncesi son onay verildi

> Ekran görüntüleri public kullanılmadan önce mutlaka gözden geçirilmelidir —
> tek istisna yok.
