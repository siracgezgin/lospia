# Tema kaydı — İznik: temiz zemin, canlı renk

**10.09.2026** · Aslı Filinta Operasyon paneli. **İKİNCİ TUR** (birincisi reddedildi).

---

## 0. Birinci tur neden reddedildi

İlk denemede "daha canlı renkler" isteğine **fildişi/bej** bir palet verildi.
Cevap net oldu: *"tema rengi çok kötü, canlı değil, hiç beğenmedim."*

Hata ölçüdeydi. Kanvasın kroması teknik olarak artmıştı (C* 1.2 → 6.1) ve bunu
"daha canlı" diye savundum — ama **bej bir zemin üstündeki her renk söner**.
Sayıya bakıp gözü ihmal ettim.

Doğrusu tersi: **zemin temiz ve açık olur, renk yüzeylerin üstünde parlar.**

## 1. Yeni yön

Kanvas artık kroması 2.9 olan çok açık bir soğuk nötr (`#e8eef2`). Renk kanvasta
değil, markada ve durum çiplerinde yaşıyor.

Marka rengi **İznik çinisinin turkuaz-mavisi** (`#0077a5`). İki kez ölçülerek seçildi:
beyaz metin taşıyabilen (≥4.5) renkler arasında turkuaz koridorunun **en kromatik**
noktası; ve markanın kendi hikâyesi — Anadolu el işçiliğini çağdaş lükse taşımak —
çininin rengiyle konuşuyor.

| marka kroması C* | değer |
|---|---|
| eski teal `#2a6b7a` | 21.3 |
| fildişi petrol `#00617e` (reddedilen) | 26.4 |
| **İznik `#0077a5`** | **34.1** |

Eskiye göre **+%60 doygunluk**. "Canlı" artık ölçülmüş bir iddia.

Metin nötr-soğuk bir siyaha yakın (`#10171c`) — logo saf siyah bir didone, mürekkep
de ona yakın durmalı ki wordmark sayfaya yabancı düşmesin. Gölgeler aynı aileden.

Kimlik pastelleri (`semantics.ts`, `person-colors.ts`) fildişi için sıcaklığa
kaydırılmıştı; kanvas soğuğa döndüğü için **soğuk sürüme geri alındı**.

## 2. Token değişimi

| Token | Eski (teal) | Yeni (İznik) |
|---|---|---|
| `--app-bg` | `#f3f6f7` | `#e8eef2` |
| `--surface-muted` / `-hover` / `-sunken` | `#f7fafa` / `#f0f5f6` / `#edf2f3` | `#f7fafc` / `#f1f6f9` / `#dde6ec` |
| `--hairline` / `--border` / `--border-strong` | `#e7edee` / `#d5dee0` / `#b6c3c7` | `#d9e3e9` / `#c6d3db` / `#86949e` |
| `--text` / `-muted` / `-subtle` | `#121a1e` / `#44525a` / `#66767f` | `#10171c` / `#46545f` / `#5b6872` |
| `--brand` / `-strong` / `-soft` / `-ring` | `#2a6b7a` / `#1f5462` / `#e3f1f3` / `#78b1bd` | `#0077a5` / `#00537a` / `#d8eff9` / `#0b84ae` |
| `--danger` / `-strong` | `#c94a35` / `#ae3a27` | `#c81e3c` / `#9d0028` |
| `--warning` / `--hold` | `#c07a22` / `#b07d12` | `#b05300` / `#7a4a00` |
| `--approval` / `--success` | `#7050bb` / `#21875d` | `#6d2c96` / `#00783a` |
| `--info` / `--overdue` / `--urgent` | `#2d72b0` / `#a83a2c` / `#dc2626` | `#0b6fd0` / `#93002b` / `#e01e37` |
| Gölge | `rgba(14,38,44,x)` | `rgba(16,23,28,x)` |

## 3. Kapanan erişilebilirlik arızaları

Hepsi bağımsız hesapla doğrulandı (WCAG göreli parlaklık, sRGB→lineer D65).
Eski teal temada duran arızalar:

| | eski | yeni |
|---|---|---|
| `border-strong` / beyaz | 1.81 ✗ | **3.11** — her girdi kenarlığı WCAG 1.4.11 ihlaliydi |
| odak halkası / beyaz · kanvas | 2.38 · 2.19 ✗ | **4.26 · 3.64** |
| `warning` çip metni | 3.47 ✗ | **5.14** |
| `hold` çip metni | 3.63 ✗ | **7.48** |
| `success` çip metni | 4.48 ✗ | **5.60** |
| "yaklaşan" çipi | 4.43 ✗ | **5.68** |
| "düşük öncelik" çipi | 3.41 ✗ | **4.74** |
| kimlik rozeti (Altın) | 2.85 ✗ | **6.32** (`inkOnSolid`) |

Ayrıca `surface-hover` eski temada kanvasın **altındaydı** (−0.49 ΔL*) ama
`surface-muted` üstünde (+1.36): 48 `hover:bg-surface-hover` ile 61
`hover:bg-surface-muted` aynı zeminde birbirinin **tersi** yöne gidiyordu.
Şimdi ikisi de üstte (+2.84 / +4.34). Kart ↔ kanvas ayrımı 3.3 → **6.2 ΔL***.

### `inkOnSolid()` — ölçülen mürekkep

`lib/design/person-colors.ts`. Bir kişinin hex'i dolu zemin olduğunda üstündeki
metin rengi **sabit değil, ölçülerek** seçilir: beyaz mı mürekkep mi, hangisi daha
okunursa. Sekiz ton beyaz alır, dördü koyu mürekkep (Turuncu 3.18, Altın 2.85,
Zeytin 3.48, Turkuaz 3.54 — dördü de beyaz baş harfle AA altındaydı ve baş harfler
8.5–13px, "büyük metin" istisnasına girmiyorlar). **Kimliğe dokunmaz** — hex aynı
kalır. Sabit liste değil ölçüm olduğu için kullanıcının kendi hex'i de doğru
cevabı alır. Kullanıldığı yerler: `PersonAvatar`, `Avatar`, `TileGrid` kişi
kutucuğu, `MemberEditPanel` / `CreateAccountPanel` seçim tiki.

## 4. Hover sözleşmesi

| # | Yüzey | Kural |
|---|---|---|
| 1 | **Satır** (kanvasın doğrudan üstünde) | Kâğıda YÜKSELİR: şeffaf → `bg-surface` + `shadow-card`, 180ms. Dolgu hover'ı burada zayıf (+1.72 ΔL*), yükselti 7.5 ΔL* veriyor. |
| 2 | **Tablo satırı** (beyaz kart içinde) | Tek kanal, yalnız zemin: `hover:bg-surface-hover`, 150ms. Seçili satır hover'da değişmez. |
| 3 | **Menü satırı** | `hover:bg-surface-muted` + `hover:text-ink` + ikon `group-hover:text-brand`. **Hover ASLA `brand-soft` olmaz** — o aktif/seçili öğenin rengi. |
| 4 | **Kart** (Kanban, föy, not) | YALNIZ gölge. `translateY`/`scale` **YASAK** — dnd-kit'in satır içi transform'unu eziyor. |
| 5 | **Kutucuk** (`TileGrid`, `/modules` hub kartı) | `-translate-y-px` + gölge + `border-line-strong` + başlık `text-brand`. Zemin BOYANMAZ — lüks his renkten değil ışıktan gelir. |
| 6–8 | **Düğmeler** | Birincil `hover:bg-brand-strong` — beyaz metnin kontrastı 6.97 → **12.74**, yani hem koyulaşır hem daha okunur olur. İkincil: zemin+kenar+metin, marka rengi girmez. Hayalet: tek kanal, kenarlık asla belirmez. |
| 9 | **Sekme** | Zemin HİÇ boyanmaz — hover aktifliği taklit etmez. Aktif: 2px brand alt çizgi. |
| 10 | **Odak** | `globals.css`'te tek kural; `outline:none` asla (odak yönetimi için `tabIndex=-1` taşıyan kapsayıcılar hariç). |

## 5. Haftanın Sözü — ikinci tur

Birinci tur burada da reddedildi: *"haftanın sözleri rezalet ve alakasız, motive
edici değil"* + ekran görüntüsüyle *"çok uzun olmasın, bak yarıda kesilmiş."*

İki ayrı hata vardı:

1. **Yanlış ton.** Kodda "nasihat/motivasyon cümlesi KÖTÜ" diye bir kural vardı ve
   küratöre "aşınmış klişeleri ele" dedim. Küratör de insanların tam sevdiği sözleri
   attı — YSL'in "moda geçer, stil kalır"ı, McQueen'in "kuralı yıkmak"ı — yerine
   atölye gözlemleri kaldı. Doğrulanmışlardı ama ilham vermiyorlardı.
   **Düzeltme:** o ünlü sözler geri alındı; kaynağı belgeli bir Chanel sözü eklendi
   (Haedrich, *Coco Chanel: Secrète*, 1971 — moda alıntılarının çoğunun aksine
   gerçek bir kaydı var).

2. **Kart kırpıyordu.** Sınır 108 karakterdi ama kart üç satır çiziyor ve 97
   karakterlik söz yarıda kesildi — **kendi kuralımız kırpılmaya izin veriyordu.**
   **Düzeltme:** sınır **72**'ye indi ve 30 çevirinin Türkçesi kısaltıldı (özgün
   metin ve kaynak değişmedi, yalnız kartta okunan cümle sadeleşti).
   Havuz: **41 söz, en uzunu 67 karakter** — kırpılma artık imkânsız.

Kısalık yalnız bir kırpma önlemi değil, editoryal ölçüt oldu: akılda kalan söz kısa
olandır.

## 6. Doğrulama

- `npm run typecheck` ✓ · `npm run lint` ✓ (0 hata) · `npm run build` ✓
- Palet bağımsız hesapla doğrulandı: zorunlu kontrastlar, `text-subtle` beş yüzeyde,
  dokuz durum rengi, yüzey merdiveni, hover yönü — **hepsi geçti**.
- `semantics.ts` + `person-colors.ts`'teki **her çip çifti AA'yı geçiyor**. Soğuk
  sürüme dönerken iki eski kusur da kapandı: "yaklaşan" çipi 4.43 → 5.68, "düşük
  öncelik" çipi 3.41 → 4.74.
- Üretim CSS'i denetlendi: yeni palet var, **iki eski paletten de tek iz yok**.
- **Gözle doğrulanmadı** — oturum açmadan iç ekranlar görülemiyor.

## 7. Bu turla ilgisiz

- ~~`20240343000000_planning_topic_missed.sql` prod'da yok~~ → **10.09.2026'da uygulandı**;
  local ve prod eşit. Konu bazlı "aksadı" işareti artık canlıda çalışıyor.
- Repo kökündeki `'` adlı 182 KB'lık kazara dosya (arama sonucu HTML'i). Takip edilmiyor;
  silmek için onay gerekiyor.
