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

import type { LucideIcon } from "lucide-react";
import {
  Feather, Flame, Gem, Leaf, Compass, Anchor, Crown, Rocket,
  Sparkles, Wand2, Mountain, Waves, Star, Heart, Sun, Moon,
  Bird, Fish, Cat, Bike,
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
  { key: "crimson", label: "Kırmızı",  hex: "#d23320",
    soft: "bg-[#fdeae7]", solid: "bg-[#d23320]", border: "border-[#f1c3bb]", text: "text-[#971f12]", bar: "bg-[#d23320]", ring: "ring-[#f1c3bb]", accent: "border-l-[#d23320]" },
  { key: "orange",  label: "Turuncu",  hex: "#df7314",
    soft: "bg-[#fdf0e3]", solid: "bg-[#df7314]", border: "border-[#f6d3b2]", text: "text-[#964b0c]", bar: "bg-[#df7314]", ring: "ring-[#f6d3b2]", accent: "border-l-[#df7314]" },
  { key: "gold",    label: "Altın",    hex: "#c98e20",
    soft: "bg-[#fbf2e2]", solid: "bg-[#c98e20]", border: "border-[#eedfc0]", text: "text-[#8a5e14]", bar: "bg-[#c98e20]", ring: "ring-[#eedfc0]", accent: "border-l-[#c98e20]" },
  { key: "olive",   label: "Zeytin",   hex: "#998a2e",
    soft: "bg-[#f4f1e2]", solid: "bg-[#998a2e]", border: "border-[#ded5b1]", text: "text-[#675c16]", bar: "bg-[#998a2e]", ring: "ring-[#ded5b1]", accent: "border-l-[#998a2e]" },
  { key: "teal",    label: "Turkuaz",  hex: "#1796a4",
    soft: "bg-[#e6f6f7]", solid: "bg-[#1796a4]", border: "border-[#c2e6ea]", text: "text-[#11707a]", bar: "bg-[#1796a4]", ring: "ring-[#c2e6ea]", accent: "border-l-[#1796a4]" },
  { key: "blue",    label: "Mavi",     hex: "#2563c9",
    soft: "bg-[#e8f1fd]", solid: "bg-[#2563c9]", border: "border-[#c4daf6]", text: "text-[#1a4889]", bar: "bg-[#2563c9]", ring: "ring-[#c4daf6]", accent: "border-l-[#2563c9]" },
  { key: "violet",  label: "Mor",      hex: "#7c3aed",
    soft: "bg-[#f1ecfc]", solid: "bg-[#7c3aed]", border: "border-[#d7c8f3]", text: "text-[#5325a3]", bar: "bg-[#7c3aed]", ring: "ring-[#d7c8f3]", accent: "border-l-[#7c3aed]" },
  { key: "magenta", label: "Magenta",  hex: "#cc2e93",
    soft: "bg-[#fce9f3]", solid: "bg-[#cc2e93]", border: "border-[#f3c4e0]", text: "text-[#9a216c]", bar: "bg-[#cc2e93]", ring: "ring-[#f3c4e0]", accent: "border-l-[#cc2e93]" },
  { key: "slate",   label: "Kurşuni",  hex: "#5b6e8a",
    soft: "bg-[#eff2f6]", solid: "bg-[#5b6e8a]", border: "border-[#dee4ec]", text: "text-[#43526b]", bar: "bg-[#5b6e8a]", ring: "ring-[#dee4ec]", accent: "border-l-[#5b6e8a]" },
  /* Aşağıdaki üçü, ekip dokuz kişiyi aştığında devreye girer. Aynı hue ailesinde
     bir "güçlü" tonla eşleşirler ama AÇIKLIK farkı yeterince büyük: lacivert
     maviden belirgin koyu, erik magentadan koyu, gül kırmızıdan pembe.
     Yan yana ayırt edilirler; yine de ilk dokuz kadar güçlü değiller, o yüzden
     sıranın SONUNDALAR — otomatik atama önce güçlü tonları tüketir. */
  { key: "navy",    label: "Lacivert", hex: "#1e3a8a",
    soft: "bg-[#e7ecf8]", solid: "bg-[#1e3a8a]", border: "border-[#c3cfeb]", text: "text-[#152a63]", bar: "bg-[#1e3a8a]", ring: "ring-[#c3cfeb]", accent: "border-l-[#1e3a8a]" },
  { key: "plum",    label: "Erik",     hex: "#86198f",
    soft: "bg-[#f7e8f8]", solid: "bg-[#86198f]", border: "border-[#e5c2e8]", text: "text-[#5e1265]", bar: "bg-[#86198f]", ring: "ring-[#e5c2e8]", accent: "border-l-[#86198f]" },
  { key: "rose",    label: "Gül",      hex: "#e11d48",
    soft: "bg-[#fde8ec]", solid: "bg-[#e11d48]", border: "border-[#f5c2ce]", text: "text-[#9f1239]", bar: "bg-[#e11d48]", ring: "ring-[#f5c2ce]", accent: "border-l-[#e11d48]" },
];

/**
 * Palet kaç kişiye yeter. Bunu aşan ekipte renk TEKRARLAR — sistem sessizce
 * benzer renk vermez, Ayarlar → Kişi Kimliği ekranında açıkça uyarır ve
 * yönetici hangi ikilinin aynı rengi paylaşacağına kendi karar verir.
 */
export const PERSON_TONE_CAPACITY = 12;

const TONE_BY_KEY = new Map(PERSON_TONES.map((t) => [t.key, t]));

/** Kişi ikonları — "herkesin bir Pokemon'u olsun" isteğinin sade karşılığı. */
export const PERSON_ICONS: { key: string; label: string; Icon: LucideIcon }[] = [
  { key: "feather",  label: "Tüy",      Icon: Feather },
  { key: "flame",    label: "Alev",     Icon: Flame },
  { key: "gem",      label: "Mücevher", Icon: Gem },
  { key: "leaf",     label: "Yaprak",   Icon: Leaf },
  { key: "compass",  label: "Pusula",   Icon: Compass },
  { key: "anchor",   label: "Çapa",     Icon: Anchor },
  { key: "crown",    label: "Taç",      Icon: Crown },
  { key: "rocket",   label: "Roket",    Icon: Rocket },
  { key: "sparkles", label: "Işıltı",   Icon: Sparkles },
  { key: "wand",     label: "Değnek",   Icon: Wand2 },
  { key: "mountain", label: "Dağ",      Icon: Mountain },
  { key: "waves",    label: "Dalga",    Icon: Waves },
  { key: "star",     label: "Yıldız",   Icon: Star },
  { key: "heart",    label: "Kalp",     Icon: Heart },
  { key: "sun",      label: "Güneş",    Icon: Sun },
  { key: "moon",     label: "Ay",       Icon: Moon },
  { key: "bird",     label: "Kuş",      Icon: Bird },
  { key: "fish",     label: "Balık",    Icon: Fish },
  { key: "cat",      label: "Kedi",     Icon: Cat },
  { key: "bike",     label: "Bisiklet", Icon: Bike },
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

/** Anahtardan ton — geçersiz/boş anahtar null döner (çağıran otomatiğe düşer). */
export function toneByKey(key: string | null | undefined): PersonTone | null {
  return (key && TONE_BY_KEY.get(key)) || null;
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
