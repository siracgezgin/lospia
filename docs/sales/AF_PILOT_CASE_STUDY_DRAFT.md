# AF Pilot — Case Study Taslağı (Dahili)

> **Case study status: Internal draft — requires customer approval before public use.**
>
> Bu doküman dahilidir. İçindeki hiçbir bölüm, "Onay checklist" tamamlanmadan
> ve müşteri (Aslı Filinta) yazılı onay vermeden public kullanılamaz.
> Public kullanımda müşteri adı geçen her cümle **"requires approval"** işaretlidir.
> Onay yoksa jenerik dil kullanılır: **"gerçek bir marka operasyonu üzerinde
> şekillendirildi"** — asla "Aslı Filinta şu görevleri şöyle yönetiyor" değil.

---

## 1. Public-safe başlık seçenekleri

Onaysız (jenerik) versiyonlar — bugün kullanılabilir:

1. "Excel ve WhatsApp'tan tek panele: bir moda markasının operasyon dönüşümü"
2. "Gerçek bir marka operasyonu üzerinde şekillenen kurulum modeli"
3. "Dağınık takipten haftalık görünürlüğe: ilk Lospia pilotu"

Onaylı versiyonlar — **requires approval**:

1. "Aslı Filinta operasyonları Lospia'ya nasıl taşındı" *(requires approval)*
2. "İlk pilot: Aslı Filinta — Excel'den operasyon paneline" *(requires approval)*

## 2. Problem çerçevesi (public-safe)

Pilot öncesi tablo, hedef ICP'nin tamamında aynı olan jenerik problemlerle
anlatılır — müşteriye özgü detay verilmez:

- **Excel/WhatsApp'a dağılmış operasyon:** görevler tablolarda, onaylar mesaj
  geçmişlerinde, güncel durum kimsenin önünde değil.
- **Belirsiz sahiplik:** bir işin kimde olduğu ve ne zamana yetişeceği
  görünür değil; "bu kimdeydi?" sorusu gün içinde tekrar tekrar soruluyor.
- **Kaçan onaylar:** tasarım/satın alma/üretim onayları kayıt altına
  alınmadığı için işler sessizce tıkanıyor.
- **Haftalık görünürlük problemi:** yönetici ilerlemeyi görmek için tek tek
  sormak zorunda; haftalık durum toplantı ve hafızaya bağlı.

## 3. Before Lospia (public-safe anlatı)

> Ekip, günlük işleri Excel tabloları ve WhatsApp mesajlarıyla yürütüyordu.
> Görevlerin sahibi, teslim tarihi ve onay durumu tek bir yerde görünmüyordu.
> Haftalık ilerleme, yöneticinin tek tek sormasına ve ekibin hafızasına
> bağlıydı.

Not: Bu bölümde gerçek görev adı, kişi adı, tarih, tutar veya iç yazışma
alıntısı **kullanılmaz**.

## 4. After Lospia (public-safe anlatı)

> Operasyon tek panele taşındı. Her görevin bir sorumlusu, teslim tarihi,
> statüsü ve kategorisi var. Onay bekleyen işler görünür. Yönetici haftalık
> durumu sormadan görüyor; ekip ne yapacağını panelden biliyor.

## 5. Lospia'nın yapılandırdıkları

Kurulumda müşteri için yapılandırılan yapı (özellik listesi değil, kurulum
hizmetinin kanıtı olarak anlatılır):

- **Workspace** — markanın kendi adıyla, izole çalışma alanı
- **Departmanlar** — operasyonun gerçek bölümlerine göre departman/modül yapısı
- **Görevler** — dağınık listelerin görev kartlarına dönüştürülmesi
- **Teslim tarihleri** — tarih bazlı takip ve haftalık görünüm
- **Sorumlular** — her görevde net sorumlu + katılımcılar
- **Kurallar/standartlar** — mesajlarda yaşayan kuralların sisteme taşınması
- **Haftalık görünürlük** — yönetici için sormadan görme; haftalık not/ilerleme akışı

## 6. Private kalması gerekenler (asla public değil)

- Gerçek görev adları, açıklamaları, not içerikleri
- Ekip üyelerinin adları, e-postaları, rolleri, kişisel bilgileri, doğum günleri
- Finansal veriler (tutarlar, tedarikçi fiyatları, bütçeler)
- Tedarikçi/üretici adları ve ilişki detayları
- İç onay hiyerarşisi ve kişiye bağlı onay detayları ("X Hanım onayı" gibi
  gerçek kişi referansları)
- Koleksiyon/lansman takvimi gibi ticari sır niteliğindeki planlar
- Workspace içi ekran görüntülerinin sanitize edilmemiş halleri
- Ekip içi hassas notlar, tartışmalar, performans yorumları

## 7. Sanitize sonrası kullanılabilecek ekran görüntüleri

Ayrıntı için: `DEMO_SCREENSHOT_CHECKLIST.md`. Özet:

| Ekran | Koşul |
|---|---|
| Board (Kanban) | Demo-safe görev adları + demo kullanıcılar; gerçek veri yok |
| Haftalık görünüm | Aynı; tarihler jenerik |
| Görev detayı | Demo görev; not/yorum alanı demo içerikle |
| Departman merkezi | Modül adları jenerik ("Üretim", "İçerik") |
| Kurallar alanı | Jenerik örnek kurallar |
| Dashboard | Demo veriden üretilmiş grafikler; gerçek sayı yok |

Kural: gerçek AF workspace'inden alınan hiçbir görüntü blur ile bile
kullanılmaz — görüntüler **demo verisiyle yeniden üretilir**.

## 8. Önümüzdeki 30 günde ölçülecek metrikler

Hiçbir metrik uydurulmaz. Aşağıdakilerin tamamı şu an **"to be measured"**:

| Metrik | Durum |
|---|---|
| Aktif kullanıcı sayısı (haftalık) | to be measured |
| Oluşturulan görev sayısı | to be measured |
| Tamamlanan görev sayısı | to be measured |
| Geciken görev sayısı / oranı | to be measured |
| Haftalık not / aktivite kullanımı | to be measured |
| Kullanılan departman/modül sayısı | to be measured |
| Manuel takipte azalma (ölçülebilirse — ör. "durum sorma" sıklığı öz-beyanı) | to be measured |

Ölçüm yöntemi notu: sayısal veriler Supabase üzerinden (aggregate, kişisel
veri içermeden) alınır; "manuel takipte azalma" gibi öznel metrikler görüşme
sorusuyla toplanır ve alıntı olarak ancak onayla kullanılır.

## 9. Aslı / operasyon ekibiyle görüşme soruları

30. gün görüşmesinde sorulacaklar:

1. Lospia öncesi bir işin durumunu öğrenmek için ne yapıyordunuz? Şimdi ne yapıyorsunuz?
2. Haftada kaç kez "bu iş kimde?" diye sorulduğunu hatırlıyor musunuz? Bu değişti mi?
3. En son bir onay gözden kaçtı mı? Panele geçtikten sonra oldu mu?
4. Panelde en çok hangi ekranı açıyorsunuz? Neden?
5. Ekip için en zor alışma noktası ne oldu?
6. Kuruluma biz destek vermeseydik bu geçiş olur muydu?
7. Bir başka marka sahibine Lospia'yı bir cümleyle nasıl anlatırdınız?
8. Sistemde eksik/zorlayıcı bulduğunuz bir şey var mı?
9. (Onay için) Bu deneyimi adınızla paylaşmamıza sıcak bakar mısınız? Hangi sınırlarla?

## 10. Testimonial (referans) talep mesajı

> Merhaba [isim], Lospia'yı sizin operasyonunuzla birlikte şekillendirdik ve
> bu bizim için çok değerli. İki küçük ricam var:
>
> 1. Deneyiminizi 2-3 cümleyle özetleyen kısa bir görüş — yayınlamadan önce
>    son halini size gösterir, yazılı onayınızı alırız.
> 2. Web sitemizde "İlk pilot" bölümünde marka adınızı anabilmemiz için
>    izniniz — istemezseniz "gerçek bir moda markası" olarak anonim kalır.
>
> Hiçbir görev, kişi ya da iç bilgi paylaşılmayacak; yalnızca onayladığınız
> metin kullanılacak. Uygun olursa 10 dakikada konuşalım mı?

## 11. Public kullanım öncesi onay checklist

- [ ] Müşteri, marka adının kullanımına **yazılı** onay verdi (e-posta yeterli)
- [ ] Yayınlanacak metnin son hali müşteriye gösterildi ve onaylandı
- [ ] Metinde gerçek görev adı / kişi adı / finansal veri / tarih detayı yok
- [ ] Kullanılan tüm ekran görüntüleri demo veriden üretildi ve gözden geçirildi
- [ ] Metrikler ya ölçülmüş gerçek veriler ya da hiç yok — uydurma yok
- [ ] Testimonial alıntısı birebir onaylanan metin
- [ ] SOC2 / ISO27001 / tam KVKK-GDPR uyumu / AI / ERP-PLM iddiası yok
- [ ] Geri çekme hakkı: müşteri isterse içerik kaldırılır (bunu yazılı taahhüt et)

## 12. Public-safe kısa paragraf (bugün kullanılabilir)

> Lospia'nın ilk pilot süreci, gerçek bir marka operasyonu üzerinde
> şekillendirildi. Excel ve WhatsApp'a dağılmış görevler, sorumlular, onaylar
> ve haftalık takip tek panele taşındı; kurulum Lospia ekibi tarafından
> yapıldı. Pilotun sonuçları önümüzdeki dönemde ölçülüyor.
