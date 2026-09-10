/**
 * Kişi kimliği — renk + ikon.
 *
 * Aslı Hanım (2026-08-19): "Mesela Selen'in, herkesin bir rengi olsa da herkes
 * kendi rengini takip etse, bir fikir mi?" ve "İkon tasarımı. Herkese ikon koy.
 * Birer tane. Sevdikleri ikonları da seçtirebilirsin ama sen yap, sonra
 * değiştiririz."
 *
 * ÖNCELİK SIRASI:
 *   1. Yöneticinin Ayarlar'dan seçtiği renk/ikon (workspace_members.color_key /
 *      icon_key, 20240313 migration) — kalıcı ve nettir.
 *   2. Seçim yoksa kişinin id'sinden deterministik türetim — yeni üye eklenince
 *      hemen bir kimliği olur, kimse renksiz kalmaz.
 *
 * PALET NEDEN YENİDEN KURULDU:
 *   Eski palet 12 tondu ama içinde indigo/violet/purple/fuchsia ve
 *   sky/cyan/teal gibi ayırt edilemeyen komşular vardı; üstelik çakışma çözümü
 *   "sıradaki tona kay" olduğu için kişiyi tam da EN BENZER tona taşıyordu.
 *   Sonuç: yedi kişilik ekranda dört mor (Aslı Hanım, 2026-08-23: "renkler çok
 *   benziyor ayırt edilmiyor"). Şimdi ilk DOKUZ ton birbirine hiç benzemiyor ve
 *   otomatik atama ÖNCE onları tüketiyor; son üç ton yalnız dokuzu aşan ekipler
 *   için yedek.
 *
 * Renkler kart aileleriyle (lib/design/semantics.ts FAMILY) aynı hex'leri
 * kullanır: bir kişinin rozeti ile o kişinin görev kartı aynı rengi konuşur.
 *
 * YEŞİL BİLEREK YOK — yeşil yalnızca "tamamlandı" içindir (proje kuralı).
 * Bir kişinin rengi asla "bitti" gibi okunmamalı.
 */

import type { LucideIcon, LucideProps } from "lucide-react";
import {
  Feather, Flame, Gem, Leaf, Compass, Anchor, Crown, Rocket,
  Sparkles, Wand2, Mountain, Waves, Star, Heart, Sun, Moon,
  Bird, Fish, Cat, Bike, Apple, Banana, Cherry, Grape,
  Bell, Bookmark, Box, Brush, Camera, Candy, Cloud, Clover,
  Coffee, Cookie, Diamond, Dog, Droplet, Flower2, Ghost, Guitar,
  Hammer, Headphones, IceCream, Key, Lightbulb, Magnet, Medal, Palette,
  PawPrint, Pencil, Pizza, Plane, Puzzle, Rabbit, Scissors, Shell,
  Ship, Shirt, Snowflake, Squirrel, Swords, Target, Tent, TreePine,
  Trophy, Turtle, Umbrella, Zap,
} from "lucide-react";

export type PersonTone = {
  key: string;
  /** Ayarlar ekranında görünen ad. */
  label: string;
  /** Kart zemini — yumuşak, uzun süre bakılabilir. */
  soft: string;
  /** Dolu rozet / avatar zemini. */
  solid: string;
  /** Kenarlık. */
  border: string;
  /** Metin vurgusu. */
  text: string;
  /** Kart üstündeki 3px kimlik çubuğu (tailwind-merge yutmasın diye ayrı). */
  bar: string;
  /** Odak halkası. */
  ring: string;
  /** Görev kartının sol kenar şeridi (semantics.ts CardStyle.accent ile aynı). */
  accent: string;
  /** Ham hex — grafik/çıktı gibi Tailwind'in ulaşamadığı yerler için. */
  hex: string;
};

/**
 * On iki ton. İlk DOKUZU birbirine hiç benzemez (kırmızı, turuncu, altın,
 * zeytin, turkuaz, mavi, mor, magenta, kurşuni) ve otomatik atama önce onları
 * tüketir; son üçü dokuzu aşan ekipler için yedektir.
 *
 * FİLDİŞİ KALİBRASYONU (2026-09-10): soft/border/text/ring tonları beyaza göre
 * değil kanvasa (#efe9de) göre kuruldu, yani hepsinde kâğıdın sıcaklığı var —
 * soğuk pastel sıcak kâğıt üstünde plastik okunuyordu. hex/solid/bar/accent
 * KİMLİĞİN KENDİSİ olduğu için dokunulmadı. Ayırt edilebilirlik düşmedi, arttı:
 * ilk dokuzun en yakın iki zemini dE 2.73 → 4.33.
 */
export const PERSON_TONES: PersonTone[] = [
  { key: "crimson", label: "Kırmızı",  hex: "#d23320",
    soft: "bg-[#fee7dd]", solid: "bg-[#d23320]", border: "border-[#f1c4bc]", text: "text-[#8f2415]", bar: "bg-[#d23320]", ring: "ring-[#f1c4bc]", accent: "border-l-[#d23320]" },
  { key: "orange",  label: "Turuncu",  hex: "#df7314",
    soft: "bg-[#feebd9]", solid: "bg-[#df7314]", border: "border-[#f8d1b2]", text: "text-[#8c4a0c]", bar: "bg-[#df7314]", ring: "ring-[#f8d1b2]", accent: "border-l-[#df7314]" },
  { key: "gold",    label: "Altın",    hex: "#c98e20",
    soft: "bg-[#fef2dc]", solid: "bg-[#c98e20]", border: "border-[#f3dfbd]", text: "text-[#7d5a12]", bar: "bg-[#c98e20]", ring: "ring-[#f3dfbd]", accent: "border-l-[#c98e20]" },
  { key: "olive",   label: "Zeytin",   hex: "#998a2e",
    soft: "bg-[#f3f1d3]", solid: "bg-[#998a2e]", border: "border-[#d8d8b1]", text: "text-[#575014]", bar: "bg-[#998a2e]", ring: "ring-[#d8d8b1]", accent: "border-l-[#998a2e]" },
  { key: "teal",    label: "Turkuaz",  hex: "#1796a4",
    soft: "bg-[#e5f6f5]", solid: "bg-[#1796a4]", border: "border-[#c3e5ea]", text: "text-[#0d6570]", bar: "bg-[#1796a4]", ring: "ring-[#c3e5ea]", accent: "border-l-[#1796a4]" },
  { key: "blue",    label: "Mavi",     hex: "#2563c9",
    soft: "bg-[#ebf1f8]", solid: "bg-[#2563c9]", border: "border-[#c8d9ef]", text: "text-[#1a4889]", bar: "bg-[#2563c9]", ring: "ring-[#c8d9ef]", accent: "border-l-[#2563c9]" },
  { key: "violet",  label: "Mor",      hex: "#7c3aed",
    soft: "bg-[#f7edf6]", solid: "bg-[#7c3aed]", border: "border-[#d8cbe7]", text: "text-[#5325a3]", bar: "bg-[#7c3aed]", ring: "ring-[#d8cbe7]", accent: "border-l-[#7c3aed]" },
  { key: "magenta", label: "Magenta",  hex: "#cc2e93",
    soft: "bg-[#fee6ed]", solid: "bg-[#cc2e93]", border: "border-[#eec7dd]", text: "text-[#9a216c]", bar: "bg-[#cc2e93]", ring: "ring-[#eec7dd]", accent: "border-l-[#cc2e93]" },
  { key: "slate",   label: "Kurşuni",  hex: "#5b6e8a",
    soft: "bg-[#eeeeec]", solid: "bg-[#5b6e8a]", border: "border-[#dee2e7]", text: "text-[#43526b]", bar: "bg-[#5b6e8a]", ring: "ring-[#dee2e7]", accent: "border-l-[#5b6e8a]" },
  /* Aşağıdaki üçü, ekip dokuz kişiyi aştığında devreye girer. Aynı hue ailesinde
     bir "güçlü" tonla eşleşirler ama AÇIKLIK farkı yeterince büyük: lacivert
     maviden belirgin koyu, erik magentadan koyu, gül kırmızıdan pembe.
     Yan yana ayırt edilirler; yine de ilk dokuz kadar güçlü değiller, o yüzden
     sıranın SONUNDALAR — otomatik atama önce güçlü tonları tüketir. */
  { key: "navy",    label: "Lacivert", hex: "#1e3a8a",
    soft: "bg-[#ebecf4]", solid: "bg-[#1e3a8a]", border: "border-[#c7cfe7]", text: "text-[#152a63]", bar: "bg-[#1e3a8a]", ring: "ring-[#c7cfe7]", accent: "border-l-[#1e3a8a]" },
  { key: "plum",    label: "Erik",     hex: "#86198f",
    soft: "bg-[#f9e9f1]", solid: "bg-[#86198f]", border: "border-[#e0c6e1]", text: "text-[#5e1265]", bar: "bg-[#86198f]", ring: "ring-[#e0c6e1]", accent: "border-l-[#86198f]" },
  { key: "rose",    label: "Gül",      hex: "#e11d48",
    soft: "bg-[#fee5e4]", solid: "bg-[#e11d48]", border: "border-[#f0c4cf]", text: "text-[#9f1239]", bar: "bg-[#e11d48]", ring: "ring-[#f0c4cf]", accent: "border-l-[#e11d48]" },
];

/**
 * Hazır palet kaç kişiye yeter. Bunu aşan ekipte OTOMATİK atama renk tekrarlar;
 * sistem bunu sessizce yapmaz, Ayarlar → Kişi Kimliği'nde açıkça uyarır. Çözüm
 * yöneticide: hex seçiciyle palet dışı bir renk verilebilir, sınır yoktur.
 */
export const PERSON_TONE_CAPACITY = 12;

const TONE_BY_KEY = new Map(PERSON_TONES.map((t) => [t.key, t]));

/* ── Serbest renk (hex) ─────────────────────────────────────────────────────
   Aslı Hanım (2026-08-23): "Her kişi için renk paleti çıksa, mesela
   hexadecimal. Biz seçip eklesek on numara olur."

   Tailwind sınıfları DERLEME anında üretilir; çalışma anında gelen bir hex için
   `bg-[#a1b2c3]` yazmak işe yaramaz (JIT o sınıfı görmez, boş çıkar). Bu yüzden
   serbest renkler SATIR İÇİ STİLE çevrilir. Hazır palet Tailwind sınıflarını
   korur (hızlı yol), serbest renk stil üretir; iki yol da aynı hex'ten besleniyor.
   ────────────────────────────────────────────────────────────────────────── */

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(v: string | null | undefined): boolean {
  return !!v && HEX_RE.test(v);
}

function rgbOf(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/**
 * hex'i AÇARKEN saf beyaza değil FİLDİŞİ KÂĞIT beyazına, koyultururken siyaha
 * karıştırır. t ∈ [-1, 1].
 *
 * Beyaza açmak serbest renkleri kanvastan (#efe9de) soğuk tarafta bırakıyordu:
 * aynı hex'in hazır palet karşılığı sıcak, serbest karşılığı buz gibi çıkıyordu.
 * Açık uç kâğıdın beyazı olunca iki yol yeniden aynı yüzeyi konuşuyor.
 */
const PAPER_WHITE: [number, number, number] = [253, 248, 240];

function mix(hex: string, t: number): string {
  const [r, g, b] = rgbOf(hex);
  const k = Math.abs(t);
  const c = (v: number, i: number) =>
    Math.round(v + ((t > 0 ? PAPER_WHITE[i]! : 0) - v) * k);
  return `rgb(${c(r, 0)}, ${c(g, 1)}, ${c(b, 2)})`;
}

/* ──────────────────────────────────────────────────────────────────────────
   DOLU ZEMİN ÜSTÜNDEKİ METİN — beyaz mi mürekkep mi, ÖLÇÜLEREK seçilir.

   Kimlik rozeti (PersonAvatar) kişinin hex'ini zemin yapıp baş harfleri BEYAZ
   yazıyordu. Palet 12 tonluk ve dördü beyaz metin için fazla açık:
     Turuncu #df7314 → 3.18   Altın #c98e20 → 2.85
     Zeytin  #998a2e → 3.48   Turkuaz #1796a4 → 3.54
   Dördü de WCAG AA'nın (4.5) altında; baş harfler 8.5–13px, yani "büyük
   metin" istisnasına da girmiyorlar. Yıllardır okunmuyorlardı.

   ÇÖZÜM KİMLİĞE DOKUNMAZ: hex aynı kalır (şerit, sol kenar, nokta ve kart
   zemini hep o hex'ten türer — kişinin rengi kişinin rengidir). Değişen tek
   şey ÜSTÜNE yazılan mürekkep. Sekiz ton beyaz alır, dördü koyu mürekkep.
   Kural sabit listeyle değil ÖLÇÜMLE işler; yarın palete yeni bir ton ya da
   kullanıcı kendi hex'ini girse de doğru cevabı kendi bulur.
   ────────────────────────────────────────────────────────────────────────── */

/** Mürekkep — globals.css `--text` ile aynı ton. */
const INK = "#1a1612";

function relLuminance(hex: string): number {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgbOf(hex);
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function contrast(a: string, b: string): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * `hex` dolu bir zemin olarak kullanıldığında üstüne hangi metin rengi gelmeli.
 * İkisinden HANGİSİ DAHA OKUNURSA o seçilir — böylece hiçbir ton, listeye
 * eklenmeyi beklemeden doğru cevabı alır.
 */
export function inkOnSolid(hex: string): string {
  return contrast(hex, "#ffffff") >= contrast(hex, INK) ? "#ffffff" : INK;
}

/**
 * Bir kişinin rengi görsel katmanlara açılır. Oranlar hazır paletin ton
 * ilişkisini taklit eder: zemin çok açık, kenarlık orta, metin koyu.
 */
export type PersonStyles = {
  hex: string;
  /** Dolu rozet / avatar. */
  solid: React.CSSProperties;
  /** Kart zemini — uzun süre bakılabilir. */
  soft: React.CSSProperties;
  /** Kart kenarlığı. */
  border: React.CSSProperties;
  /** Sol kimlik şeridi. */
  accent: React.CSSProperties;
  /** Metin vurgusu. */
  text: React.CSSProperties;
};

export function personStyles(hex: string): PersonStyles {
  return {
    hex,
    solid: { backgroundColor: hex, color: inkOnSolid(hex) },
    soft: { backgroundColor: mix(hex, 0.9) },
    border: { borderColor: mix(hex, 0.62) },
    accent: { borderLeftColor: hex },
    text: { color: mix(hex, -0.35) },
  };
}

/**
 * Renk anahtarı → hex. Anahtar hazır palet adı da olabilir, `#rrggbb` de.
 * Tanınmayan değer null döner; çağıran otomatik atamaya düşer.
 */
export function hexOfColorKey(key: string | null | undefined): string | null {
  if (!key) return null;
  if (isHexColor(key)) return key;
  return TONE_BY_KEY.get(key)?.hex ?? null;
}

/**
 * Kişi ikonları — "herkesin bir Pokemon'u olsun" isteğinin sade karşılığı.
 *
 * Aslı Hanım (2026-08-23): "İkonlar için de ortalama 50 tane olsun, kim neyi
 * seçmek istiyorsa." Liste bilerek geniş ve gündelik: kimse listede kendini
 * bulamadığı için mecburen bir şey seçmesin.
 */
export const PERSON_ICONS: { key: string; label: string; Icon: LucideIcon }[] = [
  { key: "feather",   label: "Tüy",       Icon: Feather },
  { key: "flame",     label: "Alev",      Icon: Flame },
  { key: "gem",       label: "Mücevher",  Icon: Gem },
  { key: "leaf",      label: "Yaprak",    Icon: Leaf },
  { key: "compass",   label: "Pusula",    Icon: Compass },
  { key: "anchor",    label: "Çapa",      Icon: Anchor },
  { key: "crown",     label: "Taç",       Icon: Crown },
  { key: "rocket",    label: "Roket",     Icon: Rocket },
  { key: "sparkles",  label: "Işıltı",    Icon: Sparkles },
  { key: "wand",      label: "Değnek",    Icon: Wand2 },
  { key: "mountain",  label: "Dağ",       Icon: Mountain },
  { key: "waves",     label: "Dalga",     Icon: Waves },
  { key: "star",      label: "Yıldız",    Icon: Star },
  { key: "heart",     label: "Kalp",      Icon: Heart },
  { key: "sun",       label: "Güneş",     Icon: Sun },
  { key: "moon",      label: "Ay",        Icon: Moon },
  { key: "bird",      label: "Kuş",       Icon: Bird },
  { key: "fish",      label: "Balık",     Icon: Fish },
  { key: "cat",       label: "Kedi",      Icon: Cat },
  { key: "dog",       label: "Köpek",     Icon: Dog },
  { key: "rabbit",    label: "Tavşan",    Icon: Rabbit },
  { key: "turtle",    label: "Kaplumbağa", Icon: Turtle },
  { key: "squirrel",  label: "Sincap",    Icon: Squirrel },
  { key: "pawprint",  label: "Pati",      Icon: PawPrint },
  { key: "shell",     label: "Deniz kabuğu", Icon: Shell },
  { key: "flower",    label: "Çiçek",     Icon: Flower2 },
  { key: "clover",    label: "Yonca",     Icon: Clover },
  { key: "treepine",  label: "Çam",       Icon: TreePine },
  { key: "snowflake", label: "Kar tanesi", Icon: Snowflake },
  { key: "cloud",     label: "Bulut",     Icon: Cloud },
  { key: "droplet",   label: "Damla",     Icon: Droplet },
  { key: "zap",       label: "Şimşek",    Icon: Zap },
  { key: "bike",      label: "Bisiklet",  Icon: Bike },
  { key: "plane",     label: "Uçak",      Icon: Plane },
  { key: "ship",      label: "Gemi",      Icon: Ship },
  { key: "tent",      label: "Çadır",     Icon: Tent },
  { key: "umbrella",  label: "Şemsiye",   Icon: Umbrella },
  { key: "camera",    label: "Kamera",    Icon: Camera },
  { key: "headphones", label: "Kulaklık", Icon: Headphones },
  { key: "guitar",    label: "Gitar",     Icon: Guitar },
  { key: "palette",   label: "Palet",     Icon: Palette },
  { key: "brush",     label: "Fırça",     Icon: Brush },
  { key: "pencil",    label: "Kalem",     Icon: Pencil },
  { key: "scissors",  label: "Makas",     Icon: Scissors },
  { key: "shirt",     label: "Gömlek",    Icon: Shirt },
  { key: "hammer",    label: "Çekiç",     Icon: Hammer },
  { key: "key",       label: "Anahtar",   Icon: Key },
  { key: "magnet",    label: "Mıknatıs",  Icon: Magnet },
  { key: "lightbulb", label: "Ampul",     Icon: Lightbulb },
  { key: "puzzle",    label: "Yapboz",    Icon: Puzzle },
  { key: "target",    label: "Hedef",     Icon: Target },
  { key: "trophy",    label: "Kupa",      Icon: Trophy },
  { key: "medal",     label: "Madalya",   Icon: Medal },
  { key: "swords",    label: "Kılıçlar",  Icon: Swords },
  { key: "diamond",   label: "Elmas",     Icon: Diamond },
  { key: "bell",      label: "Zil",       Icon: Bell },
  { key: "bookmark",  label: "Yer imi",   Icon: Bookmark },
  { key: "box",       label: "Kutu",      Icon: Box },
  { key: "ghost",     label: "Hayalet",   Icon: Ghost },
  { key: "coffee",    label: "Kahve",     Icon: Coffee },
  { key: "cookie",    label: "Kurabiye",  Icon: Cookie },
  { key: "candy",     label: "Şeker",     Icon: Candy },
  { key: "icecream",  label: "Dondurma",  Icon: IceCream },
  { key: "pizza",     label: "Pizza",     Icon: Pizza },
  { key: "apple",     label: "Elma",      Icon: Apple },
  { key: "banana",    label: "Muz",       Icon: Banana },
  { key: "cherry",    label: "Kiraz",     Icon: Cherry },
  { key: "grape",     label: "Üzüm",      Icon: Grape },
];

const ICON_BY_KEY = new Map(PERSON_ICONS.map((i) => [i.key, i.Icon]));

/** Kararlı, çakışmayı seyrelten karma (FNV-1a benzeri). */
function hashOf(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Anahtardan ton. Hazır palet adı doğrudan eşlenir; SERBEST HEX için Tailwind
 * sınıf alanları BOŞ bırakılır (çalışma anında sınıf üretilemez) ve `hex`
 * doldurulur — çağıran personStyles() ile satır içi stile geçer.
 * Geçersiz/boş anahtar null döner, çağıran otomatiğe düşer.
 */
export function toneByKey(key: string | null | undefined): PersonTone | null {
  if (!key) return null;
  const preset = TONE_BY_KEY.get(key);
  if (preset) return preset;
  if (!isHexColor(key)) return null;
  return {
    key, label: "Özel renk", hex: key,
    soft: "", solid: "", border: "", text: "", bar: "", ring: "", accent: "",
  };
}
export function iconByKey(key: string | null | undefined): LucideIcon | null {
  return (key && ICON_BY_KEY.get(key)) || null;
}

/**
 * Birbirine hiç benzemeyen ilk ton sayısı. Otomatik atama karmayı YALNIZ bu
 * aralığa düşürür; yedek tonlara ancak güçlüler tükendiğinde kayılır.
 */
const STRONG_TONES = 9;

export function personTone(seed: string): PersonTone {
  return PERSON_TONES[hashOf(seed) % STRONG_TONES]!;
}

export function personIcon(seed: string): LucideIcon {
  // Renkten BAĞIMSIZ dağılsın diye tuzlanır — aynı renkteki iki kişi aynı
  // ikonu almasın.
  return PERSON_ICONS[hashOf(`icon:${seed}`) % PERSON_ICONS.length]!.Icon;
}

/** Kişinin kayıtlı seçimi (varsa) — atama fonksiyonlarına verilir. */
export type PersonChoice = { colorKey?: string | null; iconKey?: string | null };

/**
 * Bir ekipte renklerin çakışmasını engelleyen atama.
 *
 * Sıra: (1) yöneticinin seçtiği renk aynen korunur ve o ton REZERVE edilir;
 * (2) seçimi olmayanlara karma ile başlanır, ton doluysa sıradaki boş tona
 * kayılır. Palette benzer ton bulunmadığı için "sıradaki" artık güvenli.
 * Sonuç deterministiktir (aynı kişi listesi → aynı atama).
 */
export function assignPersonTones(
  seeds: string[],
  choices: Record<string, PersonChoice> = {},
): Record<string, PersonTone> {
  const taken = new Set<number>();
  const out: Record<string, PersonTone> = {};

  // 1) Açık seçimler önce — otomatik atama onların üstüne yazmasın.
  for (const seed of seeds) {
    const chosen = toneByKey(choices[seed]?.colorKey);
    if (!chosen) continue;
    out[seed] = chosen;
    taken.add(PERSON_TONES.indexOf(chosen));
  }

  // 2) Kalanlar — sabit sıra: id'ye göre, listenin geliş sırasından bağımsız.
  for (const seed of [...seeds].sort()) {
    if (out[seed]) continue;
    // Başlangıç GÜÇLÜ tonlar arasından; dolu ise tüm palet boyunca ilerlenir
    // (yedek tonlar böylece ancak gerçekten gerekince kullanılır).
    let i = hashOf(seed) % STRONG_TONES;
    for (let step = 0; step < PERSON_TONES.length && taken.has(i); step++) {
      i = (i + 1) % PERSON_TONES.length;
    }
    taken.add(i);
    out[seed] = PERSON_TONES[i]!;
    if (taken.size === PERSON_TONES.length) taken.clear(); // paletten fazla kişi → yeni tur
  }
  return out;
}

/** Aynı mantıkla ikon ataması — ekip içinde ikon tekrarı olmasın. */
export function assignPersonIcons(
  seeds: string[],
  choices: Record<string, PersonChoice> = {},
): Record<string, LucideIcon> {
  const taken = new Set<number>();
  const out: Record<string, LucideIcon> = {};

  for (const seed of seeds) {
    const key = choices[seed]?.iconKey;
    const idx = key ? PERSON_ICONS.findIndex((i) => i.key === key) : -1;
    if (idx < 0) continue;
    out[seed] = PERSON_ICONS[idx]!.Icon;
    taken.add(idx);
  }

  for (const seed of [...seeds].sort()) {
    if (out[seed]) continue;
    let i = hashOf(`icon:${seed}`) % PERSON_ICONS.length;
    for (let step = 0; step < PERSON_ICONS.length && taken.has(i); step++) {
      i = (i + 1) % PERSON_ICONS.length;
    }
    taken.add(i);
    out[seed] = PERSON_ICONS[i]!.Icon;
    if (taken.size === PERSON_ICONS.length) taken.clear();
  }
  return out;
}
