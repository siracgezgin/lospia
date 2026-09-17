// AF Operasyon — Haftanın Sözü havuzu.
//
// KAYNAK: ./weekly-quotes-source.md — REVİZE SÜRÜM (Sıraç, 18.09.2026).
// Yüz sözün tamamı oradan alınır; sıra, metin ve atıflar dosyadaki hâliyle
// korunur. Türkçe karşılıklar kartta doğal okunsun diye kaynakta zaten
// sadeleştirilmiş — BURADA AYRICA KISALTILMAZ.
//
// Revizede havuzun %90'ı değişti: "fazla kısaltılmış, serbest aktarılmış veya
// atfı tartışmalı olabilecek" maddeler temizlendi ve ağırlık kaynağı belirli
// klasik eserlere kaydı. Yazar sayısı 24'ten 11'e indi; artık her sözün
// kaynak notu dolu.
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
    quoteTr: "Evinizde yararlı olduğunu bilmediğiniz ya da güzel olduğuna inanmadığınız hiçbir şey bulundurmayın.",
    author: "William Morris",
    source: "Hopes and Fears for Art — “The Beauty of Life”",
  },
  {
    id: "quote_002",
    quoteTr: "Sanatı birkaç kişi için istemiyorum; eğitimi ya da özgürlüğü birkaç kişi için istemediğim gibi.",
    author: "William Morris",
    source: "Hopes and Fears for Art",
  },
  {
    id: "quote_003",
    quoteTr: "Sanat, halk tarafından ve halk için yapılmalı; yapanın da kullananın da mutluluğu olmalı.",
    author: "William Morris",
    source: "Hopes and Fears for Art",
  },
  {
    id: "quote_004",
    quoteTr: "Gerçek sanat, insanın emeğinden duyduğu sevincin ifadesidir.",
    author: "William Morris",
    source: "Hopes and Fears for Art",
  },
  {
    id: "quote_005",
    quoteTr: "Bütün sanat sadelikten başlar; sanat yükseldikçe sadelik daha da büyür.",
    author: "William Morris",
    source: "Hopes and Fears for Art — “The Beauty of Life”",
  },
  {
    id: "quote_006",
    quoteTr: "Dekorasyonun büyük görevlerinden biri, kullanmak zorunda olduğumuz şeylerden bize haz vermesidir.",
    author: "William Morris",
    source: "Hopes and Fears for Art",
  },
  {
    id: "quote_007",
    quoteTr: "Kalbinizde çözülmemiş olan her şeye karşı sabırlı olun.",
    author: "Rainer Maria Rilke",
    source: "Letters to a Young Poet — Mektup 4, 16 Temmuz 1903",
  },
  {
    id: "quote_008",
    quoteTr: "Soruların kendisini sevmeye çalışın.",
    author: "Rainer Maria Rilke",
    source: "Letters to a Young Poet — Mektup 4",
  },
  {
    id: "quote_009",
    quoteTr: "Cevapları şimdi aramayın; her şeyi yaşamak gerekir.",
    author: "Rainer Maria Rilke",
    source: "Letters to a Young Poet — Mektup 4",
  },
  {
    id: "quote_010",
    quoteTr: "Soruları şimdi yaşayın.",
    author: "Rainer Maria Rilke",
    source: "Letters to a Young Poet — Mektup 4",
  },
  {
    id: "quote_011",
    quoteTr: "Kendi içinize dönün; sizi yazmaya çağıran nedeni arayın.",
    author: "Rainer Maria Rilke",
    source: "Letters to a Young Poet — Mektup 1",
  },
  {
    id: "quote_012",
    quoteTr: "Gündelik hayatınız size yoksul görünüyorsa onu suçlamayın; kendinizi sorgulayın.",
    author: "Rainer Maria Rilke",
    source: "Letters to a Young Poet — Mektup 1",
  },
  {
    id: "quote_013",
    quoteTr: "Bir sanat eseri, bir gereksinimden doğduğunda iyidir.",
    author: "Rainer Maria Rilke",
    source: "Letters to a Young Poet — Mektup 1",
  },
  {
    id: "quote_014",
    quoteTr: "Sanat eserleri sonsuz bir yalnızlığa sahiptir; eleştiri onlara en az ulaşabilen şeydir.",
    author: "Rainer Maria Rilke",
    source: "Letters to a Young Poet — Mektup 1",
  },
  {
    id: "quote_015",
    quoteTr: "Sevgi şudur: iki yalnızlığın birbirini koruması, sınırlandırması ve selamlaması.",
    author: "Rainer Maria Rilke",
    source: "Letters to a Young Poet",
  },
  {
    id: "quote_016",
    quoteTr: "Belki de hayatımızdaki bütün ejderhalar, bizi bir kez cesur görmek isteyen varlıklardır.",
    author: "Rainer Maria Rilke",
    source: "Letters to a Young Poet",
  },
  {
    id: "quote_017",
    quoteTr: "Çalışmak, görünür hâle gelmiş sevgidir.",
    author: "Khalil Gibran",
    source: "The Prophet — “On Work”",
  },
  {
    id: "quote_018",
    quoteTr: "Emek yoluyla hayatı sevmek, hayatın en içteki sırrına yaklaşmaktır.",
    author: "Khalil Gibran",
    source: "The Prophet — “On Work”",
  },
  {
    id: "quote_019",
    quoteTr: "Çalışırken, saatlerin fısıltısını müziğe dönüştüren bir flüt olursunuz.",
    author: "Khalil Gibran",
    source: "The Prophet — “On Work”",
  },
  {
    id: "quote_020",
    quoteTr: "Yaptığınız her şeye kendi ruhunuzdan bir nefes katın.",
    author: "Khalil Gibran",
    source: "The Prophet — “On Work”",
  },
  {
    id: "quote_021",
    quoteTr: "Sahip olduklarınızdan verdiğinizde az verirsiniz; gerçekten verdiğiniz, kendinizden verdiğinizdir.",
    author: "Khalil Gibran",
    source: "The Prophet — “On Giving”",
  },
  {
    id: "quote_022",
    quoteTr: "Güzellik, aynada kendine bakan sonsuzluktur.",
    author: "Khalil Gibran",
    source: "The Prophet — “On Beauty”",
  },
  {
    id: "quote_023",
    quoteTr: "Güzellik, hayat kutsal yüzünü açtığında görünen hayattır.",
    author: "Khalil Gibran",
    source: "The Prophet — “On Beauty”",
  },
  {
    id: "quote_024",
    quoteTr: "Gündelik hayatınız, tapınağınız ve dininizdir.",
    author: "Khalil Gibran",
    source: "The Prophet — “On Religion”",
  },
  {
    id: "quote_025",
    quoteTr: "Neşeniz, maskesi düşmüş kederinizdir.",
    author: "Khalil Gibran",
    source: "The Prophet — “On Joy and Sorrow”",
  },
  {
    id: "quote_026",
    quoteTr: "Keder varlığınızda ne kadar derin oyuk açarsa, taşıyabileceğiniz sevinç o kadar büyür.",
    author: "Khalil Gibran",
    source: "The Prophet — “On Joy and Sorrow”",
  },
  {
    id: "quote_027",
    quoteTr: "Acınız, anlayışınızı çevreleyen kabuğun kırılmasıdır.",
    author: "Khalil Gibran",
    source: "The Prophet — “On Pain”",
  },
  {
    id: "quote_028",
    quoteTr: "Yeryüzü çıplak ayaklarınızı hissetmekten, rüzgâr saçlarınızla oynamaktan hoşlanır.",
    author: "Khalil Gibran",
    source: "The Prophet — “On Clothes”",
  },
  {
    id: "quote_029",
    quoteTr: "Dostluk her zaman tatlı bir sorumluluktur; asla bir fırsat değildir.",
    author: "Khalil Gibran",
    source: "Sand and Foam",
  },
  {
    id: "quote_030",
    quoteTr: "Ağaçlar, yeryüzünün gökyüzüne yazdığı şiirlerdir.",
    author: "Khalil Gibran",
    source: "Sand and Foam",
  },
  {
    id: "quote_031",
    quoteTr: "İlerleme, var olanı büyütmekten çok, olacak olana doğru ilerlemektir.",
    author: "Khalil Gibran",
    source: "Gibran’ın deneme ve aforizmalarından",
  },
  {
    id: "quote_032",
    quoteTr: "Zihnin üzerinde gücün var; dış olayların üzerinde değil.",
    author: "Marcus Aurelius",
    source: "Meditations",
  },
  {
    id: "quote_033",
    quoteTr: "Eylemin önündeki engel, eylemi ilerletir. Yolun önündeki şey, yol olur.",
    author: "Marcus Aurelius",
    source: "Meditations 5.20",
  },
  {
    id: "quote_034",
    quoteTr: "İyi bir insanın nasıl olması gerektiğini tartışmayı bırak; öyle biri ol.",
    author: "Marcus Aurelius",
    source: "Meditations 10.16",
  },
  {
    id: "quote_035",
    quoteTr: "Doğru değilse yapma; gerçek değilse söyleme.",
    author: "Marcus Aurelius",
    source: "Meditations 12.17",
  },
  {
    id: "quote_036",
    quoteTr: "Kendini şimdiki anla sınırla.",
    author: "Marcus Aurelius",
    source: "Meditations 7.29",
  },
  {
    id: "quote_037",
    quoteTr: "İçine iyi bak; orada her zaman yeniden doğabilecek bir güç kaynağı vardır.",
    author: "Marcus Aurelius",
    source: "Meditations 7.59",
  },
  {
    id: "quote_038",
    quoteTr: "En iyi intikam, sana kötülük edene benzememektir.",
    author: "Marcus Aurelius",
    source: "Meditations 6.6",
  },
  {
    id: "quote_039",
    quoteTr: "Her işini, hayatındaki son işmiş gibi dikkatle yap.",
    author: "Marcus Aurelius",
    source: "Meditations 2.5",
  },
  {
    id: "quote_040",
    quoteTr: "Doğanın seni taşıyamayacağın bir şeye maruz bırakmadığını hatırla.",
    author: "Marcus Aurelius",
    source: "Meditations",
  },
  {
    id: "quote_041",
    quoteTr: "Karşılaştığın şeyi, sana düşen işin bir parçası olarak kabul et.",
    author: "Marcus Aurelius",
    source: "Meditations",
  },
  {
    id: "quote_042",
    quoteTr: "Hayatının mutluluğu, düşüncelerinin niteliğine bağlıdır.",
    author: "Marcus Aurelius",
    source: "Meditations",
  },
  {
    id: "quote_043",
    quoteTr: "Ruh, alışkanlık hâline gelen düşüncelerinin rengini alır.",
    author: "Marcus Aurelius",
    source: "Meditations",
  },
  {
    id: "quote_044",
    quoteTr: "Sana verilenleri kibirsizce kabul et; senden alınanları bağlılık göstermeden bırak.",
    author: "Marcus Aurelius",
    source: "Meditations 8.33",
  },
  {
    id: "quote_045",
    quoteTr: "Bugünün işini sade, dikkatli ve adil biçimde yap.",
    author: "Marcus Aurelius",
    source: "Meditations’ın çalışma disiplini üzerine bölümlerinden",
  },
  {
    id: "quote_046",
    quoteTr: "İnsan için iyi olan, insan doğasına uygun olandır.",
    author: "Marcus Aurelius",
    source: "Meditations",
  },
  {
    id: "quote_047",
    quoteTr: "Bize verilen zaman az değildir; çoğunu biz boşa harcarız.",
    author: "Seneca",
    source: "On the Shortness of Life",
  },
  {
    id: "quote_048",
    quoteTr: "Yaşadığın sürece, yaşamayı öğrenmeye devam et.",
    author: "Seneca",
    source: "Letters to Lucilius",
  },
  {
    id: "quote_049",
    quoteTr: "Gerçekte olduğundan daha çok, hayalimizde acı çekeriz.",
    author: "Seneca",
    source: "Letters to Lucilius — Mektup 13",
  },
  {
    id: "quote_050",
    quoteTr: "Zorluklar zihni, emeğin bedeni güçlendirdiği gibi güçlendirir.",
    author: "Seneca",
    source: "On Providence",
  },
  {
    id: "quote_051",
    quoteTr: "Hangi limana gittiğini bilmeyen için hiçbir rüzgâr elverişli değildir.",
    author: "Seneca",
    source: "Letters to Lucilius",
  },
  {
    id: "quote_052",
    quoteTr: "Geleceğin bütünü belirsizdir; hemen yaşa.",
    author: "Seneca",
    source: "Letters to Lucilius",
  },
  {
    id: "quote_053",
    quoteTr: "Her yeni günü ayrı bir hayat gibi karşıla.",
    author: "Seneca",
    source: "Letters to Lucilius",
  },
  {
    id: "quote_054",
    quoteTr: "Seni daha iyi birine dönüştürecek insanlarla birlikte ol.",
    author: "Seneca",
    source: "Letters to Lucilius — Mektup 7",
  },
  {
    id: "quote_055",
    quoteTr: "Önemli olan ne kadar çok şeye sahip olduğun değil, sahip olduklarının niteliğidir.",
    author: "Seneca",
    source: "Letters to Lucilius’un ölçülülük anlayışından",
  },
  {
    id: "quote_056",
    quoteTr: "Hayatı beklerken hayat geçip gider.",
    author: "Seneca",
    source: "Letters to Lucilius",
  },
  {
    id: "quote_057",
    quoteTr: "İnsanları rahatsız eden şeyler değil, o şeyler hakkında verdikleri yargılardır.",
    author: "Epiktetos",
    source: "Enchiridion 5",
  },
  {
    id: "quote_058",
    quoteTr: "Önce kim olmak istediğini söyle; sonra yapman gerekeni yap.",
    author: "Epiktetos",
    source: "Discourses",
  },
  {
    id: "quote_059",
    quoteTr: "Bildiğini sandığın şeyi öğrenmek mümkün değildir.",
    author: "Epiktetos",
    source: "Discourses",
  },
  {
    id: "quote_060",
    quoteTr: "Kendine hâkim olmayan hiç kimse özgür değildir.",
    author: "Epiktetos",
    source: "Discourses",
  },
  {
    id: "quote_061",
    quoteTr: "Gücünün içinde olanı en iyi biçimde kullan; geri kalanını geldiği gibi karşıla.",
    author: "Epiktetos",
    source: "Discourses",
  },
  {
    id: "quote_062",
    quoteTr: "Gelişmek istiyorsan, bazı konularda bilgisiz görünmeye razı ol.",
    author: "Epiktetos",
    source: "Enchiridion 13",
  },
  {
    id: "quote_063",
    quoteTr: "Felsefeni açıklamak yerine, onu davranışlarınla göster.",
    author: "Epiktetos",
    source: "Enchiridion 46’nın anlamı",
  },
  {
    id: "quote_064",
    quoteTr: "Sana ait olanı koru: yargılarını, seçimlerini ve niyetini.",
    author: "Epiktetos",
    source: "Enchiridion",
  },
  {
    id: "quote_065",
    quoteTr: "Bir rol sana verildiğinde, onu iyi oynamak senin işindir.",
    author: "Epiktetos",
    source: "Enchiridion 17",
  },
  {
    id: "quote_066",
    quoteTr: "Her durumda önce neyin senin kontrolünde olduğunu ayırt et.",
    author: "Epiktetos",
    source: "Enchiridion’un temel ilkesi",
  },
  {
    id: "quote_067",
    quoteTr: "Hayatımız ayrıntılar içinde dağılıyor. Sadeleştir, sadeleştir.",
    author: "Henry David Thoreau",
    source: "Walden",
  },
  {
    id: "quote_068",
    quoteTr: "Ormana gittim; çünkü bilinçli yaşamak istedim.",
    author: "Henry David Thoreau",
    source: "Walden",
  },
  {
    id: "quote_069",
    quoteTr: "Hayatın özünü karşılamak ve ondan öğrenilecek olanı öğrenmek istedim.",
    author: "Henry David Thoreau",
    source: "Walden",
  },
  {
    id: "quote_070",
    quoteTr: "Bir şeyin bedeli, ona karşılık verdiğin yaşam miktarıdır.",
    author: "Henry David Thoreau",
    source: "Walden",
  },
  {
    id: "quote_071",
    quoteTr: "İnsan hayallerinin yönünde güvenle ilerlerse, beklemediği bir başarıyla karşılaşır.",
    author: "Henry David Thoreau",
    source: "Walden",
  },
  {
    id: "quote_072",
    quoteTr: "İyilik, hiçbir zaman başarısız olmayan tek yatırımdır.",
    author: "Henry David Thoreau",
    source: "Walden",
  },
  {
    id: "quote_073",
    quoteTr: "Yaşamak için ayağa kalkmadıysan, yazmak için oturmak boşunadır.",
    author: "Henry David Thoreau",
    source: "Journal",
  },
  {
    id: "quote_074",
    quoteTr: "Meşgul olmak yetmez; karıncalar da meşguldür. Mesele, neyle meşgul olduğundur.",
    author: "Henry David Thoreau",
    source: "Thoreau’ya ait mektup/aforizma geleneği",
  },
  {
    id: "quote_075",
    quoteTr: "Sabah, günün en uyanık ve en unutulmaz vaktidir.",
    author: "Henry David Thoreau",
    source: "Walden",
  },
  {
    id: "quote_076",
    quoteTr: "Bütün iyi şeyler vahşi ve özgürdür.",
    author: "Henry David Thoreau",
    source: "Walking",
  },
  {
    id: "quote_077",
    quoteTr: "Büyük hiçbir şey coşku olmadan başarılmadı.",
    author: "Ralph Waldo Emerson",
    source: "Essays: First Series — “Circles”",
  },
  {
    id: "quote_078",
    quoteTr: "Kendine güven; her yürek o demir tele titreşir.",
    author: "Ralph Waldo Emerson",
    source: "Self-Reliance",
  },
  {
    id: "quote_079",
    quoteTr: "Kendinde ısrar et; asla taklit etme.",
    author: "Ralph Waldo Emerson",
    source: "Self-Reliance",
  },
  {
    id: "quote_080",
    quoteTr: "İnsan olmak isteyen, uyumsuz olmayı göze almalıdır.",
    author: "Ralph Waldo Emerson",
    source: "Self-Reliance",
  },
  {
    id: "quote_081",
    quoteTr: "Aptalca tutarlılık, küçük zihinlerin korkuluğudur.",
    author: "Ralph Waldo Emerson",
    source: "Self-Reliance",
  },
  {
    id: "quote_082",
    quoteTr: "Doğa her zaman ruhun renklerini taşır.",
    author: "Ralph Waldo Emerson",
    source: "Nature",
  },
  {
    id: "quote_083",
    quoteTr: "İyi yapılmış bir işin ödülü, onu yapmış olmaktır.",
    author: "Ralph Waldo Emerson",
    source: "New England Reformers",
  },
  {
    id: "quote_084",
    quoteTr: "Bir meşe palamudunda bin ormanın ihtimali vardır.",
    author: "Ralph Waldo Emerson",
    source: "Emerson’ın doğa ve potansiyel düşüncesinden",
  },
  {
    id: "quote_085",
    quoteTr: "Kelebek ayları değil anları sayar; yine de zamanı yeter.",
    author: "Rabindranath Tagore",
    source: "Stray Birds",
  },
  {
    id: "quote_086",
    quoteTr: "Hayatın, yaprağın ucundaki çiy gibi zamanın kıyısında hafifçe dans etsin.",
    author: "Rabindranath Tagore",
    source: "Stray Birds",
  },
  {
    id: "quote_087",
    quoteTr: "Çiçeğin yapraklarını kopararak onun güzelliğini toplayamazsın.",
    author: "Rabindranath Tagore",
    source: "Stray Birds",
  },
  {
    id: "quote_088",
    quoteTr: "Tek olan çiçek, çok olan dikenleri kıskanmaz.",
    author: "Rabindranath Tagore",
    source: "Stray Birds",
  },
  {
    id: "quote_089",
    quoteTr: "Dünyayı yanlış okur, sonra da bizi aldattığını söyleriz.",
    author: "Rabindranath Tagore",
    source: "Stray Birds",
  },
  {
    id: "quote_090",
    quoteTr: "Toprağın altındaki kökler, dalları verimli kıldıkları için ödül istemez.",
    author: "Rabindranath Tagore",
    source: "Stray Birds",
  },
  {
    id: "quote_091",
    quoteTr: "Küçük gerçeğin sözcükleri nettir; büyük gerçeğin büyük bir sessizliği vardır.",
    author: "Rabindranath Tagore",
    source: "Stray Birds",
  },
  {
    id: "quote_092",
    quoteTr: "Yaprak sevdiğinde çiçeğe; çiçek adandığında meyveye dönüşür.",
    author: "Rabindranath Tagore",
    source: "Stray Birds",
  },
  {
    id: "quote_093",
    quoteTr: "Bir kum tanesinde dünyayı, bir kır çiçeğinde göğü gör.",
    author: "William Blake",
    source: "Auguries of Innocence",
  },
  {
    id: "quote_094",
    quoteTr: "Karşıtlıklar olmadan ilerleme olmaz.",
    author: "William Blake",
    source: "The Marriage of Heaven and Hell",
  },
  {
    id: "quote_095",
    quoteTr: "Coşkun canlılık güzelliktir.",
    author: "William Blake",
    source: "The Marriage of Heaven and Hell",
  },
  {
    id: "quote_096",
    quoteTr: "Bir başkasına iyilik etmek istiyorsan, bunu küçük ayrıntılarda yap.",
    author: "William Blake",
    source: "Jerusalem",
  },
  {
    id: "quote_097",
    quoteTr: "İlim ilim bilmektir; ilim kendin bilmektir.",
    author: "Yunus Emre",
    source: "Yunus Emre Divanı",
  },
  {
    id: "quote_098",
    quoteTr: "Gelin tanış olalım, işi kolay kılalım.",
    author: "Yunus Emre",
    source: "Yunus Emre Divanı",
  },
  {
    id: "quote_099",
    quoteTr: "Sevelim, sevilelim; dünya kimseye kalmaz.",
    author: "Yunus Emre",
    source: "Yunus Emre Divanı",
  },
  {
    id: "quote_100",
    quoteTr: "Bir ben vardır bende, benden içeri.",
    author: "Yunus Emre",
    source: "Yunus Emre Divanı",
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
