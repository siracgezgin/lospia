# Tema kaydı — Fildişi Kâğıt + Encre

**10.09.2026** · Aslı Filinta Operasyon paneli tema değişimi. **Tamamlandı.**

Talep (Sıraç): *"Temamız sofistike ve daha canlı renkler olsun, hoverlar filan daha
profesyonel, kurumsal, vizyonlu — fashion designer markasına, Aslı Filinta markasına
uygun olsun. İyileştirme ve geliştirme yap tamamında."*

---

## 1. Neden bu yön

`aslıfilinta` wordmarkı **saf siyah, kalın-ince geçişli bir didone**. Moda evi dili budur:
kâğıt, mürekkep, keskin tipografi, tek kararlı aksan. Eski palet soğuk teal-griydi; o zemin
üstünde siyah wordmark sayfaya *yapıştırılmış* duruyordu. Artık kanvas fildişi kâğıt, metin
sıcak espresso mürekkebi — wordmark sayfanın *içinde*.

**"Daha canlı" aksana değil EKRANA yazıldı.** Asıl işi kanvas yapıyor: kroma C* 1.2 → 6.1.
Ekranın en büyük yüzeyi artık "seçilmemiş bir gri" değil, boyanmış kâğıt. Nötrlerin
hiçbirinde R=G=B yok.

**Yöntem:** 5 bağımsız palet önerisi → 3 jüri (marka · erişilebilirlik · uygulanabilirlik) →
sentez. Marka jürisiyle erişim jürisi ters düştü (editoryal monokrom 8/6, couture mücevher
5/9); sentez monokrom yapıyı temel alıp mücevher durum renklerini ve kontrast disiplinini
aşıladı.

**Marka hue'su neden petrol (`#00617e`):** kimlik paleti (12 kişi tonu + 11 departman ailesi)
yüksek kromalı hue'ların çoğunu zaten tutuyor. Kırmızı birincil↔yıkıcı testinde çöker; yeşil
"tamamlandı"ya ayrılmış; kehribar warning+hold; mor approval; royal mavi `FAMILY.blue`
("Satış & Ticaret") ile dE 3 — birincil düğme bir DEPARTMANIN kimlik rengine düşerdi.
Mürekkep siyahı da olmaz: `text-brand` satır içi bağlantı olarak da kullanılıyor, siyah
olursa gövde metninden ayrılmaz (WCAG 1.4.1). Kalan tek serbest koridorun en derin noktası.

## 2. Token değişimi

| Token | Eski | Yeni |
|---|---|---|
| `--app-bg` | `#f3f6f7` soğuk teal-gri | `#efe9de` fildişi kâğıt |
| `--surface-muted` / `-hover` / `-sunken` | `#f7fafa` / `#f0f5f6` / `#edf2f3` | `#f8f4ed` / `#f3eee5` / `#eae3d6` |
| `--hairline` / `--border` / `--border-strong` | `#e7edee` / `#d5dee0` / `#b6c3c7` | `#e6ded0` / `#d7cfc0` / `#9e9383` |
| `--text` / `-muted` / `-subtle` | `#121a1e` / `#44525a` / `#66767f` | `#1a1612` / `#5a514a` / `#6e645b` |
| `--brand` / `-strong` / `-soft` / `-ring` | `#2a6b7a` / `#1f5462` / `#e3f1f3` / `#78b1bd` | `#00617e` / `#00374b` / `#dfeff9` / `#05779a` |
| `--danger` / `-strong` | `#c94a35` / `#ae3a27` | `#bf223d` / `#99002c` |
| `--warning` / `--hold` | `#c07a22` / `#b07d12` | `#a65500` / `#704b00` |
| `--approval` / `--success` | `#7050bb` / `#21875d` | `#6b2f8a` / `#027538` |
| `--info` / `--overdue` / `--urgent` | `#2d72b0` / `#a83a2c` / `#dc2626` | `#1a71c7` / `#8f002a` / `#d92233` |
| Gölge | `rgba(14,38,44,x)` mavi-siyah | `rgba(44,34,24,x)` sıcak mürekkep |

Durum renklerinin ayrımı **hue'ya değil AÇIKLIĞA** yazıldı: dikromat benzetiminde kırmızı,
kehribar ve yeşil tek bir sarı-kahveye düşüyor; ayakta kalan tek eksen açıklık. Merdiven anlam
sırasını izler: `urgent` L*47 > `warning` 45 > `danger` 42 > `hold` 35 > `overdue` 29.

## 3. Bu turda KAPANAN erişilebilirlik arızaları

Hepsi bağımsız hesapla doğrulandı (`scratchpad/check.py`, WCAG göreli parlaklık, sRGB→lineer D65).

1. **`border-strong` 1.81 → 3.02** — her girdi kenarlığı WCAG 1.4.11'i ihlal ediyordu.
2. **Odak halkası 2.38 / 2.19 → 5.11 / 4.23** — hem beyazda hem kanvasta başarısızdı.
3. **`warning` 3.47 → 5.36 · `hold` 3.63 → 7.79 · `success` 4.48 → 5.83** — çip metni AA altındaydı.
4. **`surface-hover` kanvasın ALTINDAYDI** (−0.49 ΔL*), `surface-muted` üstünde (+1.36).
   48 `hover:bg-surface-hover` ile 61 `hover:bg-surface-muted` aynı zeminde birbirinin TERSİ
   yöne gidiyordu. Artık ikisi de üstte (+1.72 / +3.78).
5. **`text-subtle` sunken üstünde 4.17 → 4.53** — 12px meta metin en zor zeminde AA altındaydı.
6. **Kimlik rozetleri** — dört kişi tonu beyaz baş harfle AA'yı geçmiyordu (Turuncu 3.18,
   Altın 2.85, Zeytin 3.48, Turkuaz 3.54) ve baş harfler 8.5–13px, "büyük metin"
   istisnasına girmiyorlar. `inkOnSolid()` çözdü — aşağıya bak.

Ayrıca **beyaz kart ↔ kanvas ayrımı 3.3 → 7.5 ΔL***. "Kartlar zeminde eriyor"un gerçek
çözümü kart kenarlığı değil, kanvasın kendisiymiş.

Nihai doğrulama: `semantics.ts` + `person-colors.ts`'teki **her renk çifti AA'yı geçiyor**,
uygulamada beyaz metinli hiçbir dolu zemin 4.5'in altında değil.

### `inkOnSolid()` — ölçülen mürekkep

`lib/design/person-colors.ts`. Bir kişinin hex'i dolu zemin olduğunda üstündeki metin rengi
**sabit değil, ölçülerek** seçilir: beyaz mı mürekkep mi, hangisi daha okunursa. Sekiz ton
beyaz alır, dördü koyu mürekkep. **Kimliğe dokunmaz** — hex aynı kalır (şerit, sol kenar,
nokta, kart zemini hep ondan türer). Sabit listeyle değil ölçümle çalıştığı için kullanıcı
kendi hex'ini girse de doğru cevabı bulur. Kullanıldığı yerler: `PersonAvatar`, `Avatar`,
`TileGrid` kişi kutucuğu, `MemberEditPanel` / `CreateAccountPanel` seçim tiki.

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

## 5. Doğrulama

- `npm run typecheck` ✓ · `npm run lint` ✓ (82 uyarı, 0 hata — değişiklik öncesiyle aynı) · `npm run build` ✓
- Üretim CSS'i denetlendi: yeni palet var, **eski paletten tek iz yok**.
- Dev sunucuda 11 rota çağrıldı: hepsi cevap verdi, çalışma zamanı hatası yok.
- **Gözle doğrulanmadı** — oturum açmadan iç ekranlar görülemiyor. Canlıda bir kez bakılmalı,
  özellikle: Pano kişi kartları (kurşuni aile kanvasa en yakın, dE 4.6), Raporlar durum
  grafiği (`ready` marka petrolü, `in_progress` moru koyulaştı), sand ailesi kartı
  (chip `#efe4be` ile border `#eee2bc` yakın tonda).

## 6. Bu turla ilgisiz

- ~~`20240343000000_planning_topic_missed.sql` prod'da yok~~ → **10.09.2026'da uygulandı**;
  local ve prod eşit. Konu bazlı "aksadı" işareti artık canlıda çalışıyor.
- Repo kökündeki `'` adlı 182 KB'lık kazara dosya (arama sonucu HTML'i). Takip edilmiyor;
  silmek için onay gerekiyor.
