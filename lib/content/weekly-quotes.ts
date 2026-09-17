// AF Operasyon — Haftanın Sözü havuzu.
//
// KAYNAK: ./weekly-quotes-source.md (Sıraç, 2026-09-17: "Bunlar olacak,
// öncekileri sil"). Yüz sözün tamamı oradan alındı; sıra, metin ve atıflar
// dosyadaki hâliyle korunuyor. Türkçe karşılıklar kartta doğal okunsun diye
// kaynakta zaten sadeleştirilmiş — BURADA AYRICA KISALTILMAZ.
//
// NEDEN BAŞTAN KURULDU: havuz dört tur boyunca reddedildi ve her turda başka
// bir yanı tutmadı —
//   1. uydurma atölye aforizmaları     "bu ne saçma mantıksız söz"
//   2. doğrulanmış ama bağlamsız gözlem "motive edici değil"
//   3. yarısı atılmış gerçek sözler     "bu kişinin böyle bir sözü yok"
//   4. arkaik Türkçe dizeler            "bu söz ve tasarım motive ne alaka"
// Beşinci turda seçim bize değil kullanıcıya ait: liste elle derlendi, editoryal
// ölçüt (emek, zanaat, sadelik, estetik, yaratıcılık, kültür, dönüşüm,
// sürdürülebilirlik) kaynak dosyanın başında yazılı. Bu yüzden burada söz
// EKLENMEZ, ÇIKARILMAZ ve DÜZENLENMEZ; değişiklik önce o dosyada yapılır.
//
// Kaynak notu editoryal doğrulama içindir, arayüzde gösterilmez (kaynak
// dosyanın kendi kuralı: "Kart kullanım standardı: Alıntı + isim").
//
// Söz seçimi DETERMİNİSTİK: haftalık rotasyon, random değil.

export type WeeklyQuote = {
  id: string;
  quoteTr: string;
  author: string;
  /** Alıntının dayandığı eser ya da bilinen atıf geleneği. Yalnız denetim için. */
  source: string;
};

export const WEEKLY_QUOTES: WeeklyQuote[] = [
  {
    id: "quote_001",
    quoteTr: "Evinizde, yararlı olduğunu bilmediğiniz ya da güzel olduğuna inanmadığınız hiçbir şey bulundurmayın.",
    author: "William Morris",
    source: "The Beauty of Life / Hopes and Fears for Art",
  },
  {
    id: "quote_002",
    quoteTr: "İnsanların yaptığı, insanların kullandığı bir sanat; yapan için de kullanan için de sevinç olmalı.",
    author: "William Morris",
    source: "Hopes and Fears for Art",
  },
  {
    id: "quote_003",
    quoteTr: "Zevkle yapılamayan hiçbir iş, yapılmaya değmez.",
    author: "William Morris",
    source: "The Life of William Morris’te aktarılan görüş",
  },
  {
    id: "quote_004",
    quoteTr: "Sanat, insanın emeğindeki sevincinin ifadesidir.",
    author: "William Morris",
    source: "William Morris’in sanat ve emek anlayışı",
  },
  {
    id: "quote_005",
    quoteTr: "Güzelliği gündelik hayatın dışına değil, tam ortasına koyun.",
    author: "William Morris",
    source: "Morris’in Arts and Crafts yaklaşımının kısa Türkçe aktarımı",
  },
  {
    id: "quote_006",
    quoteTr: "Sadelik, sanatın yükseldikçe daha da belirginleşen özüdür.",
    author: "William Morris",
    source: "Hopes and Fears for Art",
  },
  {
    id: "quote_007",
    quoteTr: "İyi iş, yalnızca güzel görünmez; doğru ve sağlam yapılır.",
    author: "William Morris",
    source: "Morris’in zanaat anlayışının kısa aktarımı",
  },
  {
    id: "quote_008",
    quoteTr: "Sanatı hayata, hayatı da emeğe yeniden bağlayın.",
    author: "William Morris",
    source: "Morris’in sanat-emek düşüncesinin kısa aktarımı",
  },
  {
    id: "quote_009",
    quoteTr: "Sanat görüneni yeniden üretmez; görünür kılar.",
    author: "Paul Klee",
    source: "Creative Credo, 1920",
  },
  {
    id: "quote_010",
    quoteTr: "Gizli görüleri görünür kılmak, sanatın işlerinden biridir.",
    author: "Paul Klee",
    source: "MoMA’da aktarılan Klee görüşü",
  },
  {
    id: "quote_011",
    quoteTr: "Bir eser hareketten doğar, hareketi kaydeder ve hareketle algılanır.",
    author: "Paul Klee",
    source: "Creative Credo",
  },
  {
    id: "quote_012",
    quoteTr: "Bugün, görünen şeylerin ardındaki gerçekliği açığa çıkarıyoruz.",
    author: "Paul Klee",
    source: "Creative Credo",
  },
  {
    id: "quote_013",
    quoteTr: "Renk, ruhu doğrudan etkileyen bir güçtür.",
    author: "Wassily Kandinsky",
    source: "Concerning the Spiritual in Art",
  },
  {
    id: "quote_014",
    quoteTr: "Renk klavyedir; gözler çekiçler, ruh ise telleri olan piyanodur.",
    author: "Wassily Kandinsky",
    source: "Concerning the Spiritual in Art",
  },
  {
    id: "quote_015",
    quoteTr: "Biçim, içsel anlamın dışa vurumudur.",
    author: "Wassily Kandinsky",
    source: "Kandinsky’nin sanat kuramının kısa Türkçe aktarımı",
  },
  {
    id: "quote_016",
    quoteTr: "Sanat, zamanının çocuğudur.",
    author: "Wassily Kandinsky",
    source: "Concerning the Spiritual in Art",
  },
  {
    id: "quote_017",
    quoteTr: "İlham vardır; ama sizi çalışırken bulmalıdır.",
    author: "Pablo Picasso",
    source: "Picasso’ya güvenilir biçimde atfedilen söz",
  },
  {
    id: "quote_018",
    quoteTr: "Her çocuk bir sanatçıdır; mesele büyüyünce de sanatçı kalabilmektir.",
    author: "Pablo Picasso",
    source: "Picasso’ya yaygın ve belgeli atıf",
  },
  {
    id: "quote_019",
    quoteTr: "Yaptığın şey önemlidir; yalnızca düşündüğün şey değil.",
    author: "Pablo Picasso",
    source: "Picasso’nun çalışma yaklaşımının kısa aktarımı",
  },
  {
    id: "quote_020",
    quoteTr: "Sanat, gündelik hayatın tozunu ruhtan siler.",
    author: "Pablo Picasso",
    source: "Picasso’ya atfedilen, sık belgelenen söz",
  },
  {
    id: "quote_021",
    quoteTr: "Yaratıcılık cesaret ister.",
    author: "Henri Matisse",
    source: "Matisse’e yaygın ve belgeli atıf",
  },
  {
    id: "quote_022",
    quoteTr: "Görmek, başlı başına yaratıcı bir eylemdir.",
    author: "Henri Matisse",
    source: "Matisse’in görme ve resim anlayışının kısa aktarımı",
  },
  {
    id: "quote_023",
    quoteTr: "Bir sanatçı için en önemli şey, bakmayı öğrenmektir.",
    author: "Henri Matisse",
    source: "Matisse’in sanat eğitimi yaklaşımının kısa aktarımı",
  },
  {
    id: "quote_024",
    quoteTr: "İfade, yüzün içinde değil; bütün düzenin içindedir.",
    author: "Henri Matisse",
    source: "Notes of a Painter’dan kısa Türkçe aktarım",
  },
  {
    id: "quote_025",
    quoteTr: "İyi tasarım dürüsttür.",
    author: "Dieter Rams",
    source: "Ten Principles for Good Design",
  },
  {
    id: "quote_026",
    quoteTr: "İyi tasarım uzun ömürlüdür.",
    author: "Dieter Rams",
    source: "Ten Principles for Good Design",
  },
  {
    id: "quote_027",
    quoteTr: "Daha az, ama daha iyi.",
    author: "Dieter Rams",
    source: "Rams’ın tasarım yaklaşımı",
  },
  {
    id: "quote_028",
    quoteTr: "İyi tasarım, son ayrıntıya kadar düşünülmüştür.",
    author: "Dieter Rams",
    source: "Ten Principles for Good Design",
  },
  {
    id: "quote_029",
    quoteTr: "İyi tasarım çevreye karşı sorumludur.",
    author: "Dieter Rams",
    source: "Ten Principles for Good Design",
  },
  {
    id: "quote_030",
    quoteTr: "İşlevsellik, iyi tasarımın merkezinde olmalıdır.",
    author: "Dieter Rams",
    source: "Design by Vitsœ, 1976",
  },
  {
    id: "quote_031",
    quoteTr: "İnsanları anlamadan iyi tasarımı anlayamazsınız.",
    author: "Dieter Rams",
    source: "Design by Vitsœ, 1976",
  },
  {
    id: "quote_032",
    quoteTr: "Gereksiz olanı çıkardığınızda biçim daha sakin ve daha kalıcı olur.",
    author: "Dieter Rams",
    source: "Design by Vitsœ konuşmasının kısa aktarımı",
  },
  {
    id: "quote_033",
    quoteTr: "Moda değişir; stil kalır.",
    author: "Coco Chanel",
    source: "Chanel’e atfedilen klasik söz",
  },
  {
    id: "quote_034",
    quoteTr: "Sadelik, gerçek zarafetin anahtarıdır.",
    author: "Coco Chanel",
    source: "Chanel’e atfedilen klasik söz",
  },
  {
    id: "quote_035",
    quoteTr: "Yerini dolduramayacağınız biri olmak için farklı olmalısınız.",
    author: "Coco Chanel",
    source: "Chanel’e atfedilen klasik söz",
  },
  {
    id: "quote_036",
    quoteTr: "Lüks rahat olmalıdır; aksi hâlde lüks değildir.",
    author: "Coco Chanel",
    source: "Chanel’e atfedilen klasik söz",
  },
  {
    id: "quote_037",
    quoteTr: "Moda geçer; stil sonsuzdur.",
    author: "Yves Saint Laurent",
    source: "Saint Laurent’e atfedilen klasik söz",
  },
  {
    id: "quote_038",
    quoteTr: "Bir kadındaki en güzel şey, kendine olan güvenidir.",
    author: "Yves Saint Laurent",
    source: "Saint Laurent’e atfedilen sözün kısa Türkçe aktarımı",
  },
  {
    id: "quote_039",
    quoteTr: "Yıllar içinde öğrendim ki önemli olan elbise değil, onu giyen kadındır.",
    author: "Yves Saint Laurent",
    source: "Saint Laurent’e atfedilen sözün kısa aktarımı",
  },
  {
    id: "quote_040",
    quoteTr: "Daha az satın al. İyi seç. Uzun süre kullan.",
    author: "Vivienne Westwood",
    source: "Westwood’un sürdürülebilirlik mottosu",
  },
  {
    id: "quote_041",
    quoteTr: "Kaliteyi seç; niceliği değil.",
    author: "Vivienne Westwood",
    source: "Westwood’un sürdürülebilir moda yaklaşımının kısa aktarımı",
  },
  {
    id: "quote_042",
    quoteTr: "Moda, dünyayı daha iyi hâle getirmek için bir araç olabilir.",
    author: "Vivienne Westwood",
    source: "Westwood’un moda ve aktivizm yaklaşımının kısa aktarımı",
  },
  {
    id: "quote_043",
    quoteTr: "Tasarım felsefe için değil, hayat içindir.",
    author: "Issey Miyake",
    source: "Miyake’ye atfedilen söz",
  },
  {
    id: "quote_044",
    quoteTr: "Kıyafet, insan bedeniyle birlikte tamamlanır.",
    author: "Issey Miyake",
    source: "Miyake’nin tasarım yaklaşımının kısa aktarımı",
  },
  {
    id: "quote_045",
    quoteTr: "Yeni olanı ararken malzemenin imkânlarını dinleyin.",
    author: "Issey Miyake",
    source: "Miyake’nin malzeme odaklı yaklaşımının kısa aktarımı",
  },
  {
    id: "quote_046",
    quoteTr: "Göz seyahat etmelidir.",
    author: "Diana Vreeland",
    source: "The Eye Has to Travel",
  },
  {
    id: "quote_047",
    quoteTr: "Stil, paradan bağımsızdır.",
    author: "Diana Vreeland",
    source: "Vreeland’a atfedilen klasik söz",
  },
  {
    id: "quote_048",
    quoteTr: "Biraz kötü zevk, kırmızı biber gibidir; hepimize biraz gerekir.",
    author: "Diana Vreeland",
    source: "Vreeland’a atfedilen sözün kısa Türkçe aktarımı",
  },
  {
    id: "quote_049",
    quoteTr: "Daha fazlası daha fazladır; azı sıkıcı olabilir.",
    author: "Iris Apfel",
    source: "Apfel’in meşhur mottosunun Türkçe aktarımı",
  },
  {
    id: "quote_050",
    quoteTr: "Stil, kim olduğunuzu bilmekle ilgilidir.",
    author: "Iris Apfel",
    source: "Apfel’in stil anlayışının kısa aktarımı",
  },
  {
    id: "quote_051",
    quoteTr: "Kurallar yok; olsaydı onları yine bozardım.",
    author: "Iris Apfel",
    source: "Apfel’e atfedilen sözün kısa aktarımı",
  },
  {
    id: "quote_052",
    quoteTr: "İnanç, şafak hâlâ karanlıkken ışığı hisseden kuştur.",
    author: "Rabindranath Tagore",
    source: "Stray Birds",
  },
  {
    id: "quote_053",
    quoteTr: "Kelebek ayları değil anları sayar; yine de zamanı yeter.",
    author: "Rabindranath Tagore",
    source: "Stray Birds",
  },
  {
    id: "quote_054",
    quoteTr: "Hayatın, yaprağın ucundaki çiy gibi zamanın kıyısında dans etsin.",
    author: "Rabindranath Tagore",
    source: "Stray Birds",
  },
  {
    id: "quote_055",
    quoteTr: "Ağaçlar, yeryüzünün dinleyen göğe bitmeyen konuşmasıdır.",
    author: "Rabindranath Tagore",
    source: "Tagore’un kısa şiirlerinden Türkçe aktarım",
  },
  {
    id: "quote_056",
    quoteTr: "Çalışmak, görünür hâle gelmiş sevgidir.",
    author: "Khalil Gibran",
    source: "The Prophet",
  },
  {
    id: "quote_057",
    quoteTr: "Güzellik, aynada kendine bakan sonsuzluktur.",
    author: "Khalil Gibran",
    source: "The Prophet",
  },
  {
    id: "quote_058",
    quoteTr: "Gündelik hayatınız, tapınağınız ve dininizdir.",
    author: "Khalil Gibran",
    source: "The Prophet",
  },
  {
    id: "quote_059",
    quoteTr: "Emek verirken kendinizden de bir parça verirsiniz.",
    author: "Khalil Gibran",
    source: "The Prophet’in çalışma bölümünden kısa aktarım",
  },
  {
    id: "quote_060",
    quoteTr: "Soruları şimdi yaşayın.",
    author: "Rainer Maria Rilke",
    source: "Letters to a Young Poet",
  },
  {
    id: "quote_061",
    quoteTr: "Her şeyin olmasına izin verin: güzelliğin de korkunun da. Yürümeye devam edin.",
    author: "Rainer Maria Rilke",
    source: "Rilke’nin şiirlerinden kısa Türkçe aktarım",
  },
  {
    id: "quote_062",
    quoteTr: "Sabırlı olun; çözülememiş olanı sevmeye çalışın.",
    author: "Rainer Maria Rilke",
    source: "Letters to a Young Poet",
  },
  {
    id: "quote_063",
    quoteTr: "Belki de bütün ejderhalar, bizi cesur görmek isteyen varlıklardır.",
    author: "Rainer Maria Rilke",
    source: "Letters to a Young Poet’tan kısa aktarım",
  },
  {
    id: "quote_064",
    quoteTr: "Bilmek yetmez; uygulamak gerekir. İstemek yetmez; yapmak gerekir.",
    author: "Johann Wolfgang von Goethe",
    source: "Goethe’ye atfedilen klasik söz",
  },
  {
    id: "quote_065",
    quoteTr: "İnsan yalnızca anladığını görür.",
    author: "Johann Wolfgang von Goethe",
    source: "Goethe’nin görme ve bilgi anlayışının kısa aktarımı",
  },
  {
    id: "quote_066",
    quoteTr: "Güzellik, doğanın gizli yasalarının bir görünüşüdür.",
    author: "Johann Wolfgang von Goethe",
    source: "Goethe’nin estetik anlayışının kısa aktarımı",
  },
  {
    id: "quote_067",
    quoteTr: "Gün, küçük bir ömürdür; onu iyi kullanın.",
    author: "Johann Wolfgang von Goethe",
    source: "Goethe’ye atfedilen yaşam düşüncesinin kısa aktarımı",
  },
  {
    id: "quote_068",
    quoteTr: "Yolun önündeki engel, yolun kendisine dönüşebilir.",
    author: "Marcus Aurelius",
    source: "Meditations",
  },
  {
    id: "quote_069",
    quoteTr: "Yaptığın işi, hayatındaki son işmiş gibi dikkatle yap.",
    author: "Marcus Aurelius",
    source: "Meditations",
  },
  {
    id: "quote_070",
    quoteTr: "Şimdiki ana sınır koy; işini burada yap.",
    author: "Marcus Aurelius",
    source: "Meditations’ın kısa Türkçe aktarımı",
  },
  {
    id: "quote_071",
    quoteTr: "İyi bir insanın nasıl olması gerektiğini tartışmayı bırak; öyle ol.",
    author: "Marcus Aurelius",
    source: "Meditations",
  },
  {
    id: "quote_072",
    quoteTr: "Ruh, düşüncelerinin rengine boyanır.",
    author: "Marcus Aurelius",
    source: "Meditations’ın yaygın Türkçe aktarımı",
  },
  {
    id: "quote_073",
    quoteTr: "Bize verilen zaman az değil; çoğunu biz harcıyoruz.",
    author: "Seneca",
    source: "On the Shortness of Life",
  },
  {
    id: "quote_074",
    quoteTr: "Yaşadığın sürece, yaşamayı öğrenmeye devam et.",
    author: "Seneca",
    source: "Letters to Lucilius",
  },
  {
    id: "quote_075",
    quoteTr: "Zorluklar zihni, emek bedenimizi güçlendirdiği gibi güçlendirir.",
    author: "Seneca",
    source: "Seneca’ya atfedilen klasik söz",
  },
  {
    id: "quote_076",
    quoteTr: "Hiçbir büyük yetenek, bir parça cesur taşkınlık olmadan var olmaz.",
    author: "Seneca",
    source: "On Tranquillity / klasik Seneca düşüncesi",
  },
  {
    id: "quote_077",
    quoteTr: "Önce kim olmak istediğini söyle; sonra yapman gerekeni yap.",
    author: "Epiktetos",
    source: "Discourses",
  },
  {
    id: "quote_078",
    quoteTr: "Bizi şeyler değil, onlar hakkındaki yargılarımız rahatsız eder.",
    author: "Epiktetos",
    source: "Enchiridion",
  },
  {
    id: "quote_079",
    quoteTr: "Elinde olanı iyi kullan; geri kalanı geldiği gibi karşıla.",
    author: "Epiktetos",
    source: "Epiktetos’un öğretisinin kısa aktarımı",
  },
  {
    id: "quote_080",
    quoteTr: "Özgürlük, kendine hâkim olmakla başlar.",
    author: "Epiktetos",
    source: "Epiktetos’un düşüncesinin kısa aktarımı",
  },
  {
    id: "quote_081",
    quoteTr: "Hayallerinizin yönünde güvenle ilerleyin.",
    author: "Henry David Thoreau",
    source: "Walden’dan kısa aktarım",
  },
  {
    id: "quote_082",
    quoteTr: "Hayat ayrıntılar içinde dağılıyor. Sadeleştir, sadeleştir.",
    author: "Henry David Thoreau",
    source: "Walden",
  },
  {
    id: "quote_083",
    quoteTr: "Bir şeyin bedeli, ona karşılık verdiğiniz yaşam miktarıdır.",
    author: "Henry David Thoreau",
    source: "Walden",
  },
  {
    id: "quote_084",
    quoteTr: "Bilinçli yaşamak istedim; hayatın özünü karşılamak için.",
    author: "Henry David Thoreau",
    source: "Walden’dan kısa aktarım",
  },
  {
    id: "quote_085",
    quoteTr: "Coşku olmadan büyük hiçbir şey başarılamaz.",
    author: "Ralph Waldo Emerson",
    source: "Essays",
  },
  {
    id: "quote_086",
    quoteTr: "Doğanın hızını benimseyin; onun sırrı sabırdır.",
    author: "Ralph Waldo Emerson",
    source: "Emerson’a atfedilen klasik söz",
  },
  {
    id: "quote_087",
    quoteTr: "Kendine güven: her yürek o demir tele titreşir.",
    author: "Ralph Waldo Emerson",
    source: "Self-Reliance’dan kısa aktarım",
  },
  {
    id: "quote_088",
    quoteTr: "Güzellik, dünyanın Tanrı’ya bakışıdır.",
    author: "Ralph Waldo Emerson",
    source: "Nature’dan kısa Türkçe aktarım",
  },
  {
    id: "quote_089",
    quoteTr: "Bir kum tanesinde dünyayı, bir kır çiçeğinde göğü görmek.",
    author: "William Blake",
    source: "Auguries of Innocence",
  },
  {
    id: "quote_090",
    quoteTr: "Zıtlıklar olmadan ilerleme olmaz.",
    author: "William Blake",
    source: "The Marriage of Heaven and Hell",
  },
  {
    id: "quote_091",
    quoteTr: "Taşkın canlılık güzelliktir.",
    author: "William Blake",
    source: "The Marriage of Heaven and Hell",
  },
  {
    id: "quote_092",
    quoteTr: "Algının kapıları arınsaydı, her şey olduğu gibi görünürdü: sonsuz.",
    author: "William Blake",
    source: "The Marriage of Heaven and Hell",
  },
  {
    id: "quote_093",
    quoteTr: "İlim ilim bilmektir, ilim kendin bilmektir.",
    author: "Yunus Emre",
    source: "Yunus Emre Divanı",
  },
  {
    id: "quote_094",
    quoteTr: "Gelin tanış olalım, işi kolay kılalım.",
    author: "Yunus Emre",
    source: "Yunus Emre Divanı",
  },
  {
    id: "quote_095",
    quoteTr: "Sevelim, sevilelim; dünya kimseye kalmaz.",
    author: "Yunus Emre",
    source: "Yunus Emre Divanı",
  },
  {
    id: "quote_096",
    quoteTr: "Bir ben vardır bende, benden içeri.",
    author: "Yunus Emre",
    source: "Yunus Emre Divanı",
  },
  {
    id: "quote_097",
    quoteTr: "Dünle beraber gitti cancağızım, ne kadar söz varsa düne ait.",
    author: "Mevlânâ Celâleddîn-i Rûmî",
    source: "Mevlânâ’ya atfedilen ve eser geleneğinde yer alan söz",
  },
  {
    id: "quote_098",
    quoteTr: "Yeni şeyler söylemek lâzım.",
    author: "Mevlânâ Celâleddîn-i Rûmî",
    source: "Mevlânâ’ya atfedilen meşhur sözün kısa aktarımı",
  },
  {
    id: "quote_099",
    quoteTr: "Aynı dili konuşanlar değil, aynı duyguyu paylaşanlar anlaşır.",
    author: "Mevlânâ Celâleddîn-i Rûmî",
    source: "Mevlânâ’ya yaygın biçimde atfedilen söz",
  },
  {
    id: "quote_100",
    quoteTr: "Sabır, sevincin anahtarıdır.",
    author: "Mevlânâ Celâleddîn-i Rûmî",
    source: "Mevlânâ geleneğinde yer alan kısa söz",
  },
];

/**
 * ROTASYON YAZARLARI DÖNÜŞÜMLÜ DAĞITIR.
 *
 * Havuz kaynak dosyadaki sırayı koruyor ve orada sözler yazara göre kümeli
 * duruyor (Morris'in sekizi arka arkaya). Rotasyon o sırayı izleseydi ekip
 * sekiz hafta aynı ismi görürdü — kart "takıldı" sanılır.
 *
 * TUR TUR DAĞITIM: her turda her yazardan BİR söz alınır. Yirmi dört yazar
 * olduğu için ilk yirmi dört hafta yirmi dört ayrı isim çıkar. Önceki
 * yerleştirme (büyük grupları çift indislere koymak) ardışık tekrarı
 * engelliyordu ama çeşitliliği sağlamıyordu: en kalabalık yazar iki haftada
 * bir dönüyor, ilk sekiz haftanın üçünde aynı isim görünüyordu.
 *
 * Havuzun sonunda yalnız çok sözlü yazarlar kalır (Morris ve Rams sekizer);
 * onlar da dönüşümlü çıktığı için iki komşu hafta yine aynı ismi göstermez.
 */
function spreadByAuthor(quotes: WeeklyQuote[]): WeeklyQuote[] {
  const groups = new Map<string, WeeklyQuote[]>();
  for (const q of quotes) {
    const bucket = groups.get(q.author);
    if (bucket) bucket.push(q);
    else groups.set(q.author, [q]);
  }
  // Kalabalık yazar önce; eşitlikte dosyadaki ilk görünme sırası korunur.
  const buckets = [...groups.values()]
    .map((bucket, firstSeen) => ({ bucket, firstSeen }))
    .sort((a, b) => b.bucket.length - a.bucket.length || a.firstSeen - b.firstSeen)
    .map((entry) => entry.bucket);

  const out: WeeklyQuote[] = [];
  const deepest = Math.max(...buckets.map((b) => b.length));
  for (let round = 0; round < deepest; round++) {
    for (const bucket of buckets) {
      const quote = bucket[round];
      if (quote) out.push(quote);
    }
  }
  return out;
}

/** Haftalık rotasyon sırası. Yüz sözün TAMAMI gösterilir — kaynak listesi
 *  zaten editoryal olarak seçilmiş, burada ikinci bir eleme yapılmaz. */
export const APPROVED_WEEKLY_QUOTES: WeeklyQuote[] = spreadByAuthor(WEEKLY_QUOTES);

/**
 * Deterministik haftalık söz seçimi.
 *
 * Sabit bir referans haftasından itibaren geçen tam hafta sayısına göre modulo
 * ile seçer. Böylece aynı hafta boyunca herkes aynı sözü görür, sayfa
 * yenilenince söz değişmez, havuz bitince başa döner (yüz söz ≈ iki yıl).
 */
export function getWeeklyQuote(now: Date = new Date()): WeeklyQuote {
  const approved = APPROVED_WEEKLY_QUOTES;
  // Referans: 6 Temmuz 2026 Pazartesi (UTC gün başı).
  const epochStart = Date.UTC(2026, 6, 6);
  const current = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const msInWeek = 7 * 24 * 60 * 60 * 1000;
  const weeksPassed = Math.floor((current - epochStart) / msInWeek);
  const index = ((weeksPassed % approved.length) + approved.length) % approved.length;
  return approved[index];
}
