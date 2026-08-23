# Doküman Modülü — Depolama Maliyeti Analizi

**Soru (Aslı Hanım, 2026-08-19):**
> "Dökümanlarda sen ne düşündün? Bizim burada işte Drive, Word, Excel hepsinin
> burada olduğu böyle klasör şeklinde ayırmayı düşündüm de… şimdi bunu
> database'de tutmak maliyeti açısından hesaplamadım henüz. Eğer çok maliyet
> çıkmayacaksa ya da hiç maliyet çıkmayacaksa eğer burayı o şekilde
> kullanabiliriz Drive gibi. Ona bir bak."

**Cevap: maliyet neredeyse sıfır. Aylık ~₺0–3.** Detay aşağıda.

---

## 1. Bugün ne var?

Doküman modülü şu an **dosya saklamıyor.** Migration'ın kendi notu:

> `-- No file storage — documents hold URLs/metadata only, sheets hold a JSONB`

Yani bugün Dokümanlar/Şablonlar/Tablolar zengin metin (`content_json`/`content_html`)
ve dış bağlantı tutuyor. Word/Excel/PDF **yüklenemiyor.**

Zaten çalışan tek dosya deposu `production-sheets` bucket'ı (föy görselleri).
Yani altyapı kurulu; eksik olan doküman tarafına açmak.

---

## 2. Supabase fiyatlandırması (supabase.com/pricing, Ağustos 2026)

| | Free | Pro |
|---|---|---|
| Aylık ücret | $0 | **$25** |
| Dosya depolama (dahil) | 1 GB | **100 GB** |
| Depolama aşımı | — | **$0,0213 / GB / ay** |
| Egress (indirme, dahil) | — | 250 GB + 250 GB önbellekli |
| Egress aşımı | — | $0,09 / GB (önbellekli $0,03) |
| Tek dosya üst sınırı | 50 MB | **500 GB** |

Kritik nokta: **Pro planda 100 GB dosya depolama zaten dahil** ve o $25 hâlihazırda ödeniyor.

---

## 3. AF için gerçekçi hacim

Elimizdeki gerçek dosyalardan ölçekledim (`AF_GUL.pdf` 6,7 MB, `FM_Logo.png` 1,7 MB,
föy görselleri ~0,5–2 MB):

| Tür | Adet/yıl | Ortalama | Yıllık |
|---|---|---|---|
| Word/Excel (sözleşme, liste, rapor) | 400 | 300 KB | 120 MB |
| PDF (fatura, evrak, teklif) | 600 | 800 KB | 480 MB |
| Lookbook / katalog PDF | 8 | 40 MB | 320 MB |
| Föy görselleri (teknik çizim, kumaş) | 1.500 | 1,2 MB | 1,8 GB |
| Ürün/çekim fotoğrafı | 2.000 | 3 MB | 6 GB |
| **TOPLAM** | | | **~8,7 GB / yıl** |

Bu **cömert** bir tahmin — çekim fotoğraflarının tamamının sisteme girdiğini varsayıyor.

---

## 4. Maliyet

### Pro plandaysanız (muhtemel senaryo)

100 GB dahil. 8,7 GB/yıl hızıyla **11 yıl** boyunca dahil kotanın içindesiniz.

**Ek maliyet: ₺0.**

Kotayı aşarsanız (11. yıldan sonra, ~110 GB): 10 GB × $0,0213 = **$0,21/ay ≈ ₺8/ay.**

### Free plandaysanız

1 GB sınırı ve **50 MB tek dosya sınırı** var. Lookbook PDF'i (40 MB) sığar ama
sınıra yakın; 1 GB toplam ise ~2 ayda dolar. Bu senaryoda Pro'ya geçmek gerekir:
**$25/ay ≈ ₺950/ay** — ama bu doküman modülü için değil, sistemin geneli için.

### Egress (indirme trafiği)

9 kişilik ekip, günde ~50 dosya açsa: 50 × 1,5 MB × 22 gün ≈ **1,65 GB/ay.**
Dahil olan 250 GB'ın **%0,7'si.** Ek maliyet ₺0.

---

## 5. Karşılaştırma

| | Yıllık maliyet | Not |
|---|---|---|
| **Supabase Storage (bizim sistem)** | **₺0** | Pro'da dahil; ayrı abonelik yok |
| Google Workspace Business Standard | ~₺5.400/kişi | 9 kişi ≈ ₺48.600/yıl |
| Dropbox Standard | ~₺6.000/kişi | |

Not: Google Workspace zaten e-posta için alınıyorsa Drive maliyeti "ek" değil.
Buradaki asıl kazanç para değil — **dosyanın işin yanında durması.**

---

## 6. Tavsiye

**Yapılmalı.** Maliyet argümanı doküman saklamaya karşı bir gerekçe değil.

Ama parayı değil, şu üçünü tartışmaya değer:

1. **Dosya boyutu disiplini.** Ham çekim fotoğrafları (RAW, 25 MB+) sisteme
   girmemeli — onlar Drive'da/diskte kalsın. Sisteme giren, *işin parçası olan*
   dosya olmalı. Yükleme sınırı koymak (ör. 25 MB) bunu kendiliğinden sağlar.
2. **Yedek.** Supabase Pro günlük yedek alır ama Drive'ın sürüm geçmişi gibi
   "yanlışlıkla sildim, geri al" deneyimi yok. Silinen dosya için çöp kutusu
   davranışı ayrıca kurulmalı (Arşiv/Çöp deseni sistemde zaten var).
3. **Erişim.** Aslı Hanım "dökümanlara herkesin erişimi olmayacak, şu an bir tek
   yönetici görebiliyor" dedi. Klasör bazlı izin bu modülün asıl işi — depolama
   değil.

**Önerilen kapsam (Faz 1):** klasör ağacı + dosya yükleme (25 MB sınır) +
klasör bazlı erişim + çöp kutusu. Sürüm geçmişi ve önizleme sonraya.

---

## 7. Netleştirilmesi gereken tek şey

**Hangi Supabase planındayız?** Rakam buna bağlı:
- **Pro** → doküman modülü **bedava**, hemen yapılır.
- **Free** → önce Pro'ya geçmek gerekir ($25/ay), ama bu zaten sistemin geneli
  için er ya da geç gerekecek (1 GB toplam sınırı föy görselleriyle bile dolar).

Kontrol: supabase.com/dashboard → proje → Settings → Billing.
