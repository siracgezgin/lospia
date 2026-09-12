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
 *
 * RENK KÖRLÜĞÜ — DÜRÜST NOT (2026-09-12 ölçümü):
 *   Sıcak bant (kırmızı 39° · turuncu 60° · altın 78° · zeytin 97°) kırmızı-yeşil
 *   körlüğünde TEK bir sarı-kahve eksenine düşer. Ölçüldü: bu paletle en yakın
 *   çift döteranopide ΔE 4.4, protanopide 2.5 — "ayırt edilir" eşiği ~12.
 *   Önceki palette 1.9 / 5.0 idi; yani iyileşme var ama SORUN ÇÖZÜLMÜŞ DEĞİL.
 *   Dört sıcak tonu yirmi L* genişliğinde bir aralığa sığdırmanın başka yolu yok:
 *   ayrımı artırmak için altını bronza, zeytini neredeyse siyaha çekmek gerekir
 *   ki o da rengin kendisini öldürür — denendi, ΔE 4.3'te tavan yaptı.
 *
 *   KİMLİĞİ TAŞIYAN ŞEY RENK DEĞİL: her kişinin ayrıca bir İKONU ve baş harfleri
 *   var (aşağıdaki PERSON_ICONS). Renk hızlı tarama içindir; kim olduğu sorusunu
 *   ikon ve ad cevaplar. Yeni bir yüzey eklerken rengi TEK ayırt edici olarak
 *   kullanma — yanına ikonu ya da adı koy.
 */

import type { LucideIcon } from "lucide-react";
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
 */
export const PERSON_TONES: PersonTone[] = [
  { key: "crimson", label: "Kırmızı",  hex: "#d82717",
    soft: "bg-[#ffede8]", solid: "bg-[#d82717]", border: "border-[#fac7bb]", text: "text-[#9d1c0f]", bar: "bg-[#d82717]", ring: "ring-[#fac7bb]", accent: "border-l-[#d82717]" },
  { key: "orange",  label: "Turuncu",  hex: "#dc751f",
    soft: "bg-[#ffede2]", solid: "bg-[#dc751f]", border: "border-[#f3cbb1]", text: "text-[#7c400e]", bar: "bg-[#dc751f]", ring: "ring-[#f3cbb1]", accent: "border-l-[#dc751f]" },
  { key: "gold",    label: "Altın",    hex: "#c08921",
    soft: "bg-[#fcefe0]", solid: "bg-[#c08921]", border: "border-[#eacfad]", text: "text-[#6a4a0f]", bar: "bg-[#c08921]", ring: "ring-[#eacfad]", accent: "border-l-[#c08921]" },
  { key: "olive",   label: "Zeytin",   hex: "#766b16",
    soft: "bg-[#f6f1df]", solid: "bg-[#766b16]", border: "border-[#ded3ac]", text: "text-[#595110]", bar: "bg-[#766b16]", ring: "ring-[#ded3ac]", accent: "border-l-[#766b16]" },
  { key: "teal",    label: "Turkuaz",  hex: "#2b95a2",
    soft: "bg-[#dcf5f9]", solid: "bg-[#2b95a2]", border: "border-[#9edee7]", text: "text-[#185860]", bar: "bg-[#2b95a2]", ring: "ring-[#9edee7]", accent: "border-l-[#2b95a2]" },
  { key: "blue",    label: "Mavi",     hex: "#1f63cb",
    soft: "bg-[#eef0ff]", solid: "bg-[#1f63cb]", border: "border-[#cbd1f9]", text: "text-[#1a4d9f]", bar: "bg-[#1f63cb]", ring: "ring-[#cbd1f9]", accent: "border-l-[#1f63cb]" },
  { key: "violet",  label: "Mor",      hex: "#7a3bed",
    soft: "bg-[#f6eefe]", solid: "bg-[#7a3bed]", border: "border-[#deccf2]", text: "text-[#5b1cd8]", bar: "bg-[#7a3bed]", ring: "ring-[#deccf2]", accent: "border-l-[#7a3bed]" },
  { key: "magenta", label: "Magenta",  hex: "#ce2a93",
    soft: "bg-[#ffebf5]", solid: "bg-[#ce2a93]", border: "border-[#f5c6de]", text: "text-[#921d68]", bar: "bg-[#ce2a93]", ring: "ring-[#f5c6de]", accent: "border-l-[#ce2a93]" },
  { key: "slate",   label: "Kurşuni",  hex: "#5a6e8b",
    soft: "bg-[#edf1f8]", solid: "bg-[#5a6e8b]", border: "border-[#cad4e3]", text: "text-[#415167]", bar: "bg-[#5a6e8b]", ring: "ring-[#cad4e3]", accent: "border-l-[#5a6e8b]" },
  /* Aşağıdaki üçü, ekip dokuz kişiyi aştığında devreye girer. Aynı hue ailesinde
     bir "güçlü" tonla eşleşirler ama AÇIKLIK farkı yeterince büyük: lacivert
     maviden belirgin koyu, erik magentadan koyu, gül kırmızıdan pembe.
     Yan yana ayırt edilirler; yine de ilk dokuz kadar güçlü değiller, o yüzden
     sıranın SONUNDALAR — otomatik atama önce güçlü tonları tüketir. */
  { key: "navy",    label: "Lacivert", hex: "#143990",
    soft: "bg-[#f0efff]", solid: "bg-[#143990]", border: "border-[#d1cff7]", text: "text-[#1d48af]", bar: "bg-[#143990]", ring: "ring-[#d1cff7]", accent: "border-l-[#143990]" },
  { key: "plum",    label: "Erik",     hex: "#851a90",
    soft: "bg-[#fbecfb]", solid: "bg-[#851a90]", border: "border-[#eac9ea]", text: "text-[#861e90]", bar: "bg-[#851a90]", ring: "ring-[#eac9ea]", accent: "border-l-[#851a90]" },
  { key: "rose",    label: "Gül",      hex: "#cc4469",
    soft: "bg-[#ffecef]", solid: "bg-[#cc4469]", border: "border-[#f4c8cf]", text: "text-[#8e2c47]", bar: "bg-[#cc4469]", ring: "ring-[#f4c8cf]", accent: "border-l-[#cc4469]" },
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

/** hex'i beyaza (t>0) ya da siyaha (t<0) doğru karıştırır. t ∈ [-1, 1]. */
function mix(hex: string, t: number): string {
  const [r, g, b] = rgbOf(hex);
  const to = t > 0 ? 255 : 0;
  const k = Math.abs(t);
  const c = (v: number) => Math.round(v + (to - v) * k);
  return `rgb(${c(r)}, ${c(g)}, ${c(b)})`;
}

/* ──────────────────────────────────────────────────────────────────────────
   DOLU ZEMİN ÜSTÜNDEKİ METİN — beyaz mı mürekkep mi, ÖLÇÜLEREK seçilir.

   Kimlik rozeti (PersonAvatar) kişinin hex'ini zemin yapıp baş harfleri BEYAZ
   yazıyordu. Paletin üç tonu beyaz metin için fazla açık:
     Turuncu #dc751f → 3.18   Altın #c08921 → 3.07   Turkuaz #2b95a2 → 3.55
   Üçü de WCAG AA'nın (4.5) altında ve baş harfler 8.5–13px, yani "büyük
   metin" istisnasına da girmiyorlar. Okunmuyorlardı.
   (Zeytin 2026-09-12'de koyulaştığı için artık beyazı 5.41 ile taşıyor;
   liste ÖLÇÜMLE değil örnekle verilmiştir, kural aşağıda.)

   ÇÖZÜM KİMLİĞE DOKUNMAZ: hex aynı kalır — şerit, sol kenar, nokta ve kart
   zemini hep ondan türer; kişinin rengi kişinin rengidir. Değişen tek şey
   ÜSTÜNE yazılan mürekkep. Dokuz ton beyaz alır, üçü koyu mürekkep.
   Kural sabit listeyle değil ÖLÇÜMLE işler; palete yeni bir ton eklense ya da
   kullanıcı kendi hex'ini girse de doğru cevabı kendi bulur.
   ────────────────────────────────────────────────────────────────────────── */

/** Mürekkep — globals.css `--text` ile aynı ton. */
const INK = "#10171c";

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
 * İkisinden HANGİSİ DAHA OKUNURSA o seçilir.
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
