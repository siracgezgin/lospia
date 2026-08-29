Sen bu projede yalnızca bir frontend geliştirici gibi değil, **Senior Product Designer + Senior UX Designer + Design Systems Lead + Senior Frontend Engineer** gibi çalışacaksın.

Görevin mevcut uygulamayı baştan başka bir ürüne çevirmek DEĞİL.

Görevin mevcut mimariyi, iş kurallarını, route yapısını ve kullanıcı alışkanlıklarını koruyarak ürünün UI/UX kalitesini **2026 seviyesinde premium, profesyonel, çok hızlı, çok anlaşılır ve fashion-industry’ye yakışır** hale getirmek.

## ANA VİZYON

Bu ürünün tasarım yönü:

**EDITORIAL CALM × OPERATIONAL PRECISION**

Ürün bir fashion designer ve onun tasarım / üretim / ofis ekibi tarafından her gün kullanılacak.

Bu nedenle arayüz:

- basic olmalı ama “basic” burada ucuz, eksik veya sıradan anlamına gelmiyor;
- basic = fundamental, obvious, predictable, effortless;
- ilk bakışta anlaşılmalı;
- gereksiz açıklama istememeli;
- görsel olarak rafine ve premium hissettirmeli;
- hızlı çalışmalı;
- bilgi yoğunluğu gerektiği yerde yoğun olmalı;
- fakat hiçbir ekran kalabalık hissettirmemeli;
- kullanıcıya “software kullanıyorum” hissinden çok “işimi yönetiyorum” hissi vermeli.

Kullanıcıların çoğu mühendis değil.

Bir fashion designer, üretim sorumlusu veya ofis çalışanı sistemi açtığında nereye bakacağını düşünmek zorunda kalmamalı.

---

# ÖNCE REPOYU ANLA

Kod değiştirmeden önce repository içindeki:

- CLAUDE.md
- mimari / architecture dokümanları
- app/globals.css
- app/(app)/layout.tsx
- navigation registry
- components/ui/*
- mevcut ortak componentler
- mevcut ekranlar
- mobile navigation
- permission sistemleri
- loading / empty / error state'leri

incele.

Mevcut uygulamanın çalışan business logic'ini ve mimarisini yeniden icat etme.

Özellikle mevcut tek-kaynak bilgi mimarisini, permission modelini, server/client sınırlarını ve performans kararlarını koru.

Sonra UI/UX audit yap ve doğrudan kod üzerinde gerekli iyileştirmeleri uygula.

Bana yalnızca öneri listesi veya mockup verme.

**Gerçek implementasyonu yap.**

Bir noktada küçük bir tasarım kararı gerekiyorsa benden confirmation isteme. Bu dokümandaki prensiplerle en profesyonel kararı kendin ver.

---

# EN ÖNEMLİ ÜRÜN PRENSİBİ

Her ekran şu testi geçmeli:

**“Kullanıcı 3 saniye içinde nerede olduğunu, burada ne olduğunu ve bir sonraki ana aksiyonun ne olduğunu anlayabiliyor mu?”**

Hayırsa ekranı sadeleştir.

Bir UI elemanı eklemeden önce sor:

1. Kullanıcının karar vermesine yardımcı oluyor mu?
2. Kullanıcının yapacağı işi hızlandırıyor mu?
3. Hiyerarşiyi açıklıyor mu?
4. Durumu gerçekten anlatıyor mu?

Dördüne de hayırsa ekleme.

---

# BASIC ≠ BORING

Minimalizm adına her şeyi birbirine benzeyen gri kutulara dönüştürme.

Ama “modern” görünmek için de UI decoration ekleme.

İfade / personality yalnızca işlevi desteklediği noktada kullanılmalı.

Önemli aksiyon:
→ daha belirgin olabilir.

Seçili öğe:
→ net şekilde seçili görünmeli.

Status:
→ anlamlı renkle desteklenebilir.

Fashion image:
→ güçlü şekilde öne çıkabilir.

Normal metadata:
→ bağırmamalı.

Bu sistemin lüks hissi efektlerden değil:

- oranlardan,
- whitespace'ten,
- güçlü tipografik hiyerarşiden,
- hizalamadan,
- kaliteli image treatment'tan,
- kontrollü renk kullanımından,
- tutarlı componentlerden,
- hassas interaction detaylarından

gelmeli.

---

# KESİNLİKLE YAPMA

Generic AI-generated SaaS dashboard görünümü istemiyorum.

Şunları kullanma veya yaygınlaştırma:

- her şeyi card içine koymak
- gereksiz nested card'lar
- gradient background'lar
- neon gradient'ler
- glassmorphism
- gereksiz blur
- Liquid Glass taklidi
- büyük yuvarlak pill kullanımını her yere yaymak
- her metrik için renkli badge
- rainbow status sistemi
- gereksiz bento grid
- dev dashboard KPI kartları
- vanity metrics
- dekoratif chart'lar
- emoji icon sistemi
- anlamsız illustrations
- gereksiz tooltip
- sürekli açıklama metinleri
- giant hero heading'ler
- aşırı rounded componentler
- heavy drop shadows
- hover sırasında gereksiz hareket
- bouncing / playful animations
- gradient CTA
- font çeşitliliği
- modaya uygun görünsün diye okunabilirliği düşürmek
- fashion markası diye cliché beige/pink/gold luxury styling yapmak

Özellikle ürünün mevcut sadelik prensibini bozma.

İnsanları veya işleri puanlayan gereksiz sayıları UI'a sokma.

---

# TASARIM DİLİ

Görsel karakter:

**Quiet confidence.**

Temiz.
Keskin.
Sakin.
Modern.
Editoryal.
Taktik.
Premium.
Human.
Fast.

Bir moda stüdyosundaki iyi düzenlenmiş çalışma masası gibi hissettirsin.

Bir banka dashboard'u gibi değil.
Bir developer tool gibi değil.
Bir Dribbble konsepti gibi değil.
Bir e-commerce storefront gibi değil.

Profesyonel bir fashion studio operating system gibi.

---

# İKİ FARKLI İÇERİK MODU, TEK TASARIM SİSTEMİ

Sistemi iki UX yoğunluğunda düşün.

## 1. VISUAL MODE

Collection, product, production-related visual surfaces, library gibi yerlerde:

- ürün görseli güçlü olmalı;
- görseller eşit oranlı ve sakin bir grid oluşturmalı;
- mümkün olduğunda fashion imagery için doğal, portrait-friendly oranlar kullan;
- ürün adı / style bilgisi görselden sonra okunmalı;
- metadata ikinci seviyede kalmalı;
- görsel + ürün verisi birbirinden kopmamalı;
- hover ile gizli kritik bilgi yaratma;
- görsel olmayan ürünlerde de layout bozulmamalı;
- placeholder sade ve profesyonel olmalı.

Collection görüntüsü bir Excel tablosunun kart haline getirilmiş hali gibi görünmemeli.

Fashion designer koleksiyonun tamamına baktığında:

silhouette,
renk,
ürün ritmi,
ürünlerin birbirleriyle ilişkisi

görsel olarak okunabilmeli.

Ancak yeni bir product model veya feature icat etme. Var olan veriyi daha iyi sun.

## 2. OPERATIONAL MODE

Home,
Board,
Admin Board,
Calendar,
CRM,
Finance,
Reports,
Settings

gibi çalışma ekranlarında:

- yoğunluk daha yüksek olabilir;
- satırlar kompakt olabilir;
- bilgi rahat taranmalı;
- alignment kusursuz olmalı;
- tabular data gerçek tablo gibi davranmalı;
- ana aksiyon çok net olmalı;
- decorative whitespace için ekran alanını harcama.

“Premium” burada daha büyük boşluk anlamına gelmez.

Premium = daha az sürtünme.

---

# APP SHELL

Sidebar + header + content layout bütün sistemin en stabil kısmı olmalı.

Navigation:

- hızlı taranabilir,
- predictable,
- sakin,
- aynı isimleri her yerde kullanan,
- selection state'i çok net,
- gereksiz icon noise olmayan

bir yapı olmalı.

Sidebar navigation'da ikon varsa metni desteklesin, metnin yerine geçmesin.

Aktif sayfa bağırmadan ama tereddütsüz belli olsun.

Header'ın amacı kullanıcının nerede olduğunu söylemek ve gerekiyorsa mevcut bağlamın birincil aksiyonunu sunmak.

Header'ı ikinci bir toolbar'a dönüştürme.

Aynı başlığı sayfa içinde tekrar tekrar verme.

Mevcut hierarchical BackLink davranışını koru.

---

# PAGE HIERARCHY

Her sayfayı mümkün olduğunca şu zihinsel sırayla tasarla:

1. CONTEXT
   Kullanıcı nerede?

2. PRIMARY CONTENT
   Burada baktığı esas şey ne?

3. PRIMARY ACTION
   En olası yaptığı şey ne?

4. SECONDARY CONTROLS
   Filter / sort / view / secondary actions.

5. DETAIL
   Gerektiğinde progressive disclosure ile.

Her şeyi aynı görsel ağırlıkta gösterme.

Bir ekranda mümkün olduğunca tek bir dominant primary action olsun.

Secondary ve tertiary aksiyonlar gerçekten secondary görünmeli.

Destructive action asla primary action gibi görünmemeli.

---

# TYPOGRAPHY

Mevcut typography kararlarını ve minimum ölçüleri dikkate al.

Primary UI text 13.5px altına düşmesin.
Metadata 12px altına düşmesin.

10px–11px gri microcopy üretme.

Thin / Light font weight kullanma.

Regular / Medium / Semibold temel hiyerarşi olsun.

Bold yalnızca gerektiğinde.

Font sayısını artırma.

Tipografi ile hiyerarşi oluştur:

size + weight + contrast + spacing.

Her şeyi bold yaparak hiyerarşi oluşturmaya çalışma.

Fashion hissini operasyon ekranlarında serif font ekleyerek verme.

Sayısal hizalama gereken yerlerde `tabular-nums` kullan.

Uzun metinlerde rahat line-height sağla.

---

# SPACING

Tutarlı spacing rhythm kullan.

Rastgele:
13px,
17px,
23px,
29px

gibi boşluklar üretme.

Var olan spacing scale ile çalış.

İlişkili şeyler birbirine yakın;
ayrı gruplar birbirinden belirgin uzak olmalı.

Card içindeki padding ile page section spacing birbirine karışmamalı.

Desktop'ta ekran alanını boşa harcama.

Mevcut full-width yaklaşımını koru.

Çok geniş ekranlarda içerik gereksiz şekilde ortada küçük bir kolon olarak kalmasın.

---

# SURFACES

Her section card olmak zorunda değil.

Öncelik:

page background
→ surface
→ hairline/divider
→ içerik

olsun.

Card yalnızca gerçekten bir nesne / seçim / bağımsız bilgi grubu olduğunda kullanılsın.

Container'ı container içine container içine koyma.

Shadow yalnızca elevation gerçekten varsa kullanılmalı:

dropdown,
popover,
drawer,
modal,
floating surface.

Normal page section'ları shadow ile yüzdürme.

---

# BORDER RADIUS

Mevcut sistemin:

- card ~10px
- controls ~8px
- modal ~16px

mantığını koru.

Her şeyi 20–30px rounded yapma.

Button'ların tamamını capsule/pill yapma.

Pill yalnızca semantik olarak chip/tag/filter gibi şeylerde kullanılmalı.

---

# COLOR

Mevcut semantic design token sistemini kullan.

Yeni hex değerlerini componentlerin içine rastgele gömme.

Brand color kontrollü accent olsun.

Brand rengini tüm ekranı boyamak için kullanma.

Neutral surface'ler baskın olsun.

Fashion içeriğinin kendi fotoğraf ve ürün renklerinin görünmesine alan bırak.

Status renkleri yalnızca durum ifade etsin.

Renk tek başına anlam taşımasın:
label / icon / shape gibi ikinci sinyal olsun.

Bir ekranda çok fazla saturated color kullanma.

Teal/brand rengini moda hissi vermiyor diye rastgele değiştirme.

Brand asset veya mevcut design direction açıkça gerektirmiyorsa mevcut marka kimliğini koru.

---

# BUTTONS

Button hiyerarşisi net olsun:

Primary
Secondary
Ghost
Destructive

Aynı ekranda gereksiz sayıda primary button oluşturma.

Icon-only button yalnızca icon anlamı gerçekten evrensel olduğunda kullan.

Diğerlerinde text label tercih et.

Mobilde önemli touch target'ları yaklaşık 44×44px seviyesinde rahat kullanılabilir tut.

Desktop'ta gereksiz dev butonlar üretme fakat küçük click target'lar bırakma.

Focus state belirgin olsun.

Disabled state yalnızca opacity düşürülmüş okunamaz bir şey olmasın.

Loading state layout shift yaratmasın.

---

# FORMS

Form kalitesi ürünün profesyonellik seviyesini belirler.

Mevcut `Field`, `TextInput`, `SelectInput`, `TextArea` primitives kullan.

Aynı yükseklik.
Aynı border.
Aynı focus.
Aynı label rhythm.
Aynı error treatment.

Label'ları placeholder ile değiştirme.

Placeholder gerekli bilgiyi taşımasın.

Validation mesajı ilgili alanın yanında ve doğrudan olsun.

Bir form uzunsa mantıksal section'lara ayır.

Tek kolon form mümkünse tercih et.

İki kolon yalnızca alanların semantik olarak yan yana olması gerçekten anlamlıysa kullan.

Save/cancel hierarchy açık olsun.

---

# TABLES

Tablolar data-rich alanlarda card'lardan daha doğruysa tablo kullan.

Profesyonel tablo davranışı:

- temiz column hierarchy
- sticky header gerektiğinde
- numeric column right-aligned
- text left-aligned
- tabular numbers
- yeterli ama kompakt row height
- güçlü selected/hover state
- gereksiz vertical border yok
- zebra striping yalnızca gerçekten readability kazandırıyorsa
- status hücresinde minimum dekorasyon
- column titles açık
- actions column sakin

Horizontal scrolling kaçınılmazsa kontrollü yap.

Mobile'da 12 kolonlu tabloyu sıkıştırarak okunmaz hale getirme; responsive presentation kullan.

Ancak her tabloyu mobile card listesine çevirmek gibi kör bir kural uygulama. İçeriğe göre karar ver.

---

# COLLECTION

Bu ekran fashion designer açısından en güçlü görsel yüzeylerden biri olmalı.

Ürünleri spreadsheet mantığında değil, collection mantığında okut.

Görsel öncelikli olsun.

Product image:
→ dominant.

Style / product name:
→ primary textual information.

Style code / category / season gibi metadata:
→ secondary.

Status gerekiyorsa tek ve sakin bir badge.

Kart başına gereksiz 4–5 badge kullanma.

Kart actions normal durumda görseli boğmasın.

Image crop ve aspect ratio tüm koleksiyon boyunca tutarlı olsun.

Bozuk/missing image state ürün kartını çirkinleştirmesin.

Grid responsive olsun ve büyük monitörlerde alanı gerçekten kullansın.

Koleksiyon bir bütün olarak bakıldığında temiz bir editorial line-up hissi vermeli.

---

# PRODUCTION SHEET

Production ekranı “fashion editorial” görünmeye çalışmamalı.

Burada amaç:

**precision.**

Bir production sheet profesyonel bir teknik doküman kadar net olmalı.

- sections çok net
- specifications taranabilir
- materials kolay bulunabilir
- cost / quantity / numeric bilgiler hizalı
- image/reference alanları güçlü
- edit/view state farkı anlaşılır
- primary save/export/send action'ları predictable
- kritik üretim verisi dekorasyon yüzünden geri plana düşmemeli

Print/XLSX davranışlarını bozma.

---

# BOARD / ADMIN BOARD

Kanban kartlarını gereksiz information dashboard'una çevirme.

Kartın ana sorusu:

**Bu iş ne, kimin, ne zaman?**

Bunun dışında yalnızca gerçekten karar değiştiren bilgi göster.

Mevcut “bir kartta en fazla bir rozet” prensibini koru.

Due date gecikmişse net görülsün ama bütün kart kırmızıya boyanmasın.

Assignee görseli/metni okunabilir ama dominant olmasın.

Drag handle veya drag affordance belirsiz kalmasın.

Dragging dışında aynı işi gerçekleştirecek erişilebilir alternatif davranış varsa koru/sağla.

Column header'ları compact ve güçlü olsun.

Empty column'lar dev boş kartlara dönüşmesin.

---

# HOME

Home bir dashboard showroom değildir.

Amaç:

**“Bugün ne yapacağım?”**

Mevcut zaman bazlı:

- Gecikmiş
- Bugün
- Bu hafta
- Sonrası
- Tarihsiz

mantığını koru.

KPI card ekleme.

“Toplam 24 görev / %73 tamamlandı” gibi kullanıcının işini hızlandırmayan vanity metric'ler ekleme.

Kullanıcının dikkatini bugün yapılacak işe taşı.

Meeting'leri net ama secondary bir biçimde göster.

Admin backup reminder gibi gerçek operasyonel uyarılar gerektiğinde görünür olsun.

---

# CALENDAR

Calendar'da veri ile chrome yarışmamalı.

Takvim grid'i ana yüzey.

Kontroller secondary.

Bugün,
seçili gün,
event,
overdue veya anlamlı status

birbirinden ayrılabilsin.

Renk sistemini carnival'a çevirme.

Drag/drop interaction açık olsun.

Mobile calendar'ı desktop calendar'ın küçültülmüş hali gibi ele alma.

---

# CRM

İnsanları “metric” gibi sunma.

Kişi bilgisi güçlü, aksiyon anlaşılır olsun.

Contact list hızlı scan edilebilsin.

Influencer seeding workflow'unun yedi adımı görsel olarak takip edilebilir olsun fakat büyük progress-decoration sistemi yapma.

Bir kişinin mevcut lifecycle durumu bir bakışta anlaşılmalı.

---

# FINANCE / REPORTS

Bu alanlarda “pretty dashboard” yapma.

Numeric accuracy ve scanability beauty'den önce gelir.

Numbers:
- aligned
- tabular
- proper contrast

Charts yalnızca gerçekten karşılaştırmayı tablo veya metinden daha hızlı anlatıyorsa kullanılmalı.

Aksi halde chart ekleme.

Finance alanında para değerleri, status ve deadline hiyerarşisi net olsun.

---

# SETTINGS

Settings ekranı uygulamadaki en sakin alanlardan biri olmalı.

İlgili ayarları semantic gruplara ayır.

Her section'ın içine onlarca border/card koyma.

Dangerous actions normal ayarlardan açık şekilde ayrılmalı.

Destructive action'lar `useConfirm` sistemini kullanmaya devam etmeli.

---

# MODALS / DRAWERS / POPOVERS

Mevcut `Overlay` primitive kullan.

Yeni custom fixed overlay sistemleri yaratma.

Desktop:
modal/popup gerektiği kadar küçük.

Mobile:
sheet/drawer interaction gerektiğinde doğal davranmalı.

Esc,
focus,
scroll lock,
outside interaction

mevcut erişilebilir davranışları bozmamalı.

Modal içinde modal açmaktan kaçın.

---

# EMPTY STATES

Empty state tasarlamak için illustration ekleme.

İyi empty state:

kısa title
+ gerekirse tek cümle
+ gerçekten gerekli ise tek action.

Örneğin:

“Henüz ürün yok.”
“İlk ürünü ekle”

Bu kadar.

---

# LOADING

Loading UI kullanıcıya uygulamanın bozulduğunu düşündürmemeli.

Skeleton yalnızca gerçek layout'u temsil ediyorsa kullan.

Her yerde shimmer kullanma.

Content hızlı geliyorsa gereksiz loading animation gösterme.

Navigation sırasında shell stabil kalmalı.

Layout shift minimum olmalı.

---

# ERROR / SUCCESS FEEDBACK

Mesajlar insan diliyle yazılmalı.

Teknik database / API error mesajını kullanıcıya gösterme.

Başarı mesajlarında sürekli toast bombardımanı yapma.

Kullanıcının zaten ekranda sonucu gördüğü işlem için ayrıca success toast gerekmeyebilir.

Error:
- ne oldu?
- mümkünse kullanıcı şimdi ne yapmalı?

bunu kısa şekilde söylemeli.

---

# MICROINTERACTIONS

Motion functional olmalı.

Mevcut süre sistemini tercih et:

fast ~120ms
normal ~180ms
slow ~280ms

Hover:
subtle.

Modal:
short.

Drawer:
smooth.

Drag:
responsive.

Button:
instant feedback.

300–600ms boyunca bekleten dekoratif animasyonlar yaratma.

Animation kullanıcının hızını düşürmemeli.

`prefers-reduced-motion` davranışını dikkate al.

Yeni animation library ekleme.

---

# ACCESSIBILITY = PROFESSIONAL QUALITY

Bu accessibility projesi değil; fakat erişilebilirlik profesyonel UI kalitesinin parçasıdır.

Kontrol et:

- keyboard navigation
- visible focus
- contrast
- semantic HTML
- labels
- aria gerektiği yerde
- button/link semantics
- touch target size
- drag-only interactions
- reduced motion
- zoom / responsive text
- disabled state readability

Keyboard focus'u `outline: none` ile görünmez bırakma.

Focus göstergesi net olmalı.

Color-only communication yapma.

---

# RESPONSIVE

Desktop first olabilir çünkü operasyon yoğunluğu yüksek.

Ama mobile hiçbir zaman ikinci sınıf olmamalı.

Mevcut mobile navigation modelini koru:

4 primary destination + Menu üzerinden tam navigation.

Telefonda erişilemeyen feature kalmamalı.

Responsive davranış:
“desktop'u küçült”
mantığıyla yapılmamalı.

Önem sırasına göre yeniden düzenlenmeli.

Mobilde:

- primary action erişilebilir
- touch target rahat
- sticky UI içerik kapatmıyor
- horizontal overflow kontrollü
- drawer/sheet doğal
- title/action kombinasyonları taşmıyor

olmalı.

---

# COPY / MICROCOPY

Mevcut kuralı koru:

PAGE NAMES = ENGLISH
CONTENT = TURKISH

Metinleri kısa tut.

Kurumsal jargon kullanma.

“İşlem başarıyla gerçekleştirilmiştir.”
yerine
“Kaydedildi.”

“Silme işlemini gerçekleştirmek istediğinizden emin misiniz?”
yerine
“Bu ürünü silmek istiyor musunuz?”

Ancak destructive consequence önemliyse net şekilde açıkla.

Button text'leri mümkün olduğunca verb-first ve somut olsun.

---

# DESIGN SYSTEM

Yeni her ekran için yeni çözüm üretme.

Önce mevcut primitive'i geliştir.

Sonra reuse et.

Özellikle ortaklaştır:

- Button
- Field
- Overlay
- TileGrid
- page/module headers
- empty state
- status treatment
- table treatment
- filters
- loading state
- image container
- action menu

Ama “design system” uğruna her 3 satır JSX'i abstraction yapma.

Component yalnızca gerçekten tekrar veya consistency kazandırıyorsa ortaklaştır.

---

# FILTERS

Filter bar'ı dashboard haline getirme.

Mevcut temel filtering zihnini koru.

En sık kullanılan filtreler görünür.

Rare filters progressive disclosure altında olabilir.

Applied filter state açık olsun.

“Clear” yalnızca gerçekten uygulanmış filter varsa görünmeli.

Search gerekiyorsa search icon tek başına bırakılmamalı; alan anlaşılır olmalı.

---

# PERFORMANCE

UI redesign sırasında performansı geriye götürmek kesinlikle yasak.

Bu uygulamanın “fast” hissi visual tasarım kadar önemlidir.

Yeni dependency ekleme.

Yeni animation package ekleme.

Client component sınırlarını gereksiz büyütme.

Server Component olan alanı sırf UI kolaylığı için client component'e dönüştürme.

App shell'e yeni database query ekleme.

Existing data-fetching architecture'ı bozma.

Heavy image/layout/script ekleme.

Gereksiz rerender yaratma.

Large visual effects / blur / backdrop-filter kullanma.

UI her tıklamada anında cevap veriyor hissi vermeli.

---

# TEKNİK SINIRLAR

Mevcut stack'i koru:

- Next.js 16 App Router / RSC
- TypeScript strict
- Tailwind v4
- Supabase
- mevcut component primitives
- mevcut icon library
- mevcut CSS animation sistemi

Ek frontend/design dependency ekleme.

Business logic'i UI refactor adı altında yeniden yazma.

Permissions değiştirme.

RLS mantığına dokunma.

Navigation architecture'ı bozma.

Route isimlerini keyfi değiştirme.

Mutation modelini değiştirme.

Production behavior'ı değiştirme.

---

# DESIGN TOKEN STRATEGY

Önce `app/globals.css` tokenlarını incele.

Color,
surface,
border,
text,
radius,
shadow,
motion

kararlarını mümkün olduğunca token seviyesinde düzelt.

Component içine random value gömmek yerine sistemi iyileştir.

Mevcut:

surface hierarchy
hairline/border
text hierarchy
brand hierarchy
status colors
radius hierarchy
motion durations

korunsun ve gerekiyorsa rafine edilsin.

Ama sırf redesign yaptığını göstermek için token değerlerini değiştirme.

---

# PROFESSIONAL DETAILS

Tüm interactive componentlerde şu state'leri kontrol et:

default
hover
active
focus-visible
disabled
loading
selected
error

Hover-only functionality yaratma.

Cursor davranışlarını doğru kullan.

Clickable card ile içindeki nested interactive elementlerin semantic conflict oluşturmadığını kontrol et.

Alignment'ı gözle değil sistemle çöz.

Icon size ve stroke weight'lerini tutarlı tut.

Icon ile label arasındaki spacing tutarlı olsun.

Text truncation yalnızca gerçekten gerekli olduğunda kullan.

Kritik isimleri anlamsız biçimde ellipsis ile saklama.

Tooltip'ı kötü information architecture'ın çözümü olarak kullanma.

---

# FASHION-SPECIFIC QUALITY BAR

Fashion etkisini UI chrome'dan çok CONTENT PRESENTATION üzerinden kur.

En iyi fashion ürün yazılımlarındaki mantık gibi:

- visual collection overview
- product imagery
- style identity
- color relationships
- season context
- material/product information
- live operational state

birbiriyle bağlantılı hissetsin.

Ama moda sitesi yapmıyoruz.

Bu bir **working tool**.

Fashion identity:
visual rhythm + imagery + typography + restraint.

Operational identity:
speed + precision + hierarchy + consistency.

İkisi birleşmeli.

---

# SON KALİTE TESTİ

Her ekran için sonunda kendine şu soruları sor:

1. İlk bakışta ana içerik belli mi?
2. Primary action 1–2 saniyede bulunuyor mu?
3. Gereksiz bilgi kaldırılabilir mi?
4. Aynı bilgi iki kere gösteriliyor mu?
5. Kullanıcı hangi öğelerin clickable olduğunu anlıyor mu?
6. Selected / active / disabled state net mi?
7. Fashion içeriği yeterince alan buluyor mu?
8. Operasyonel veri yeterince kompakt mı?
9. Mobile gerçekten kullanılabilir mi?
10. Keyboard ile kullanılabilir mi?
11. Loading sırasında layout stabil mi?
12. Bu öğe gerçekten gerekli mi?
13. Bu ekran 2026 profesyonel ürün kalitesinde mi?
14. Yoksa yalnızca “modern-looking dashboard” mı?

Son sorunun cevabı “dashboard” ise tekrar sadeleştir.

---

# UYGULAMA SIRASI

Tüm repo üzerinde audit yap.

Sonra en yüksek leverage sırasıyla ilerle:

1. global design tokens
2. shared UI primitives
3. app shell / navigation / headers
4. common page layouts
5. Home
6. Collection
7. Production
8. Board / Admin Board
9. Calendar
10. AF Teamwork
11. CRM
12. Finance
13. Reports
14. Settings
15. remaining modules
16. responsive/mobile pass
17. accessibility pass
18. interaction/state consistency pass

Ancak mevcut component dependency yapısı başka sıra gerektiriyorsa mantıklı teknik sırayı kullan.

---

# ÇALIŞMA ŞEKLİ

Önce mevcut implementation'ı gerçekten oku.

Var olan iyi UI'ı gereksiz yere değiştirme.

Problem görmediğin şeyi yeniden tasarlama.

Consistency sorunu varsa lokal patch yerine root primitive/token seviyesinde çöz.

Her değişiklikte:
- regression yaratma,
- business logic koru,
- visual hierarchy iyileştir,
- cognitive load azalt,
- interaction sayısını azalt,
- hız hissini koru.

Design decision verirken “daha gösterişli olanı” değil,
**daha açık, daha hızlı ve daha rafine olanı** seç.

---

# VALIDATION

Implementasyon tamamlandıktan sonra mümkün olan mevcut kontrolleri çalıştır:

- typecheck
- lint
- build

Çıkan UI kaynaklı sorunları düzelt.

Ayrıca gözden geçir:

- desktop
- tablet
- mobile
- overflow
- long Turkish text
- empty data
- loading data
- error states
- very long product/user names
- many rows/cards
- no image
- keyboard focus

---

# FINAL OUTPUT

Plan yazıp bırakma.

Kod değişikliklerini gerçekten tamamla.

İş sonunda bana kısa olarak:

1. hangi global tasarım kararlarını değiştirdiğini,
2. hangi ortak componentleri iyileştirdiğini,
3. hangi ekranları değiştirdiğini,
4. UX açısından en büyük 5 iyileştirmeyi,
5. performans/erişilebilirlik açısından yaptıklarını,
6. typecheck/lint/build sonucunu

bildir.

Ancak final açıklamayı kısa tut.

Öncelik dokümantasyon değil, çalışan kaliteli üründür.

Son hedef:

**Bir kullanıcı uygulamayı açtığında “ne kadar tasarlanmış” olduğunu düşünmemeli.  
Sadece her şeyin olması gereken yerde olduğunu hissetmeli.**

Fashion designer açısından ürün:
**beautiful enough to inspire, quiet enough to work in, fast enough to live in every day.**