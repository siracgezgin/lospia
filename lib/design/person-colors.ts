/**
 * Kişi kimliği — renk + ikon.
 *
 * Aslı Hanım (2026-08-19): "Mesela Selen'in, herkesin bir rengi olsa da herkes
 * kendi rengini takip etse, bir fikir mi?" ve "İkon tasarımı. Herkese ikon koy.
 * Birer tane. Sevdikleri ikonları da seçtirebilirsin ama sen yap, sonra
 * değiştiririz."
 *
 * Bu dosya o iki kararın tek kaynağıdır. Renk ve ikon kişinin id'sinden
 * DETERMİNİSTİK türetilir — aynı kişi her ekranda aynı renkte ve aynı ikonla
 * görünür, veritabanına yeni kolon gerekmeden. Kişi kendi ikonunu seçtiğinde
 * (profiles.avatar_url / ileride icon_key) burası yalnız yedek olur.
 *
 * NOT: departman renkleriyle (lib/utils/departments.ts) karışmaması için
 * bunlar KİŞİ tonlarıdır; kart çerçevesi hâlâ departman rengini taşır.
 */

import type { LucideIcon } from "lucide-react";
import {
  Feather, Flame, Gem, Leaf, Compass, Anchor, Crown, Rocket,
  Sparkles, Wand2, Mountain, Waves,
} from "lucide-react";

export type PersonTone = {
  key: string;
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
};

/**
 * 12 ayrık ton. Yeşil bilerek YOK: yeşil "tamamlandı" için ayrılmıştır
 * (proje kuralı) — bir kişinin rengi asla "bitti" gibi okunmamalı.
 */
export const PERSON_TONES: PersonTone[] = [
  { key: "indigo",  soft: "bg-indigo-50",  solid: "bg-indigo-500",  border: "border-indigo-200",  text: "text-indigo-700",  bar: "bg-indigo-500",  ring: "ring-indigo-300"  },
  { key: "rose",    soft: "bg-rose-50",    solid: "bg-rose-500",    border: "border-rose-200",    text: "text-rose-700",    bar: "bg-rose-500",    ring: "ring-rose-300"    },
  { key: "amber",   soft: "bg-amber-50",   solid: "bg-amber-500",   border: "border-amber-200",   text: "text-amber-700",   bar: "bg-amber-500",   ring: "ring-amber-300"   },
  { key: "sky",     soft: "bg-sky-50",     solid: "bg-sky-500",     border: "border-sky-200",     text: "text-sky-700",     bar: "bg-sky-500",     ring: "ring-sky-300"     },
  { key: "violet",  soft: "bg-violet-50",  solid: "bg-violet-500",  border: "border-violet-200",  text: "text-violet-700",  bar: "bg-violet-500",  ring: "ring-violet-300"  },
  { key: "orange",  soft: "bg-orange-50",  solid: "bg-orange-500",  border: "border-orange-200",  text: "text-orange-700",  bar: "bg-orange-500",  ring: "ring-orange-300"  },
  { key: "teal",    soft: "bg-teal-50",    solid: "bg-teal-500",    border: "border-teal-200",    text: "text-teal-700",    bar: "bg-teal-500",    ring: "ring-teal-300"    },
  { key: "fuchsia", soft: "bg-fuchsia-50", solid: "bg-fuchsia-500", border: "border-fuchsia-200", text: "text-fuchsia-700", bar: "bg-fuchsia-500", ring: "ring-fuchsia-300" },
  { key: "cyan",    soft: "bg-cyan-50",    solid: "bg-cyan-600",    border: "border-cyan-200",    text: "text-cyan-700",    bar: "bg-cyan-600",    ring: "ring-cyan-300"    },
  { key: "red",     soft: "bg-red-50",     solid: "bg-red-500",     border: "border-red-200",     text: "text-red-700",     bar: "bg-red-500",     ring: "ring-red-300"     },
  { key: "blue",    soft: "bg-blue-50",    solid: "bg-blue-600",    border: "border-blue-200",    text: "text-blue-700",    bar: "bg-blue-600",    ring: "ring-blue-300"    },
  { key: "purple",  soft: "bg-purple-50",  solid: "bg-purple-600",  border: "border-purple-200",  text: "text-purple-700",  bar: "bg-purple-600",  ring: "ring-purple-300"  },
];

/** Kişi ikonları — "herkesin bir Pokemon'u olsun" isteğinin sade karşılığı. */
export const PERSON_ICONS: LucideIcon[] = [
  Feather, Flame, Gem, Leaf, Compass, Anchor,
  Crown, Rocket, Sparkles, Wand2, Mountain, Waves,
];

/** Kararlı, çakışmayı seyrelten karma (FNV-1a benzeri). */
function hashOf(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function personTone(seed: string): PersonTone {
  return PERSON_TONES[hashOf(seed) % PERSON_TONES.length]!;
}

export function personIcon(seed: string): LucideIcon {
  // Renkten BAĞIMSIZ dağılsın diye tuzlanır — aynı renkteki iki kişi aynı
  // ikonu almasın.
  return PERSON_ICONS[hashOf(`icon:${seed}`) % PERSON_ICONS.length]!;
}

/**
 * Bir ekipte renklerin çakışmasını engelleyen atama.
 *
 * Karma tek başına 7 kişilik bir ekipte bile aynı tonu iki kez verebilir —
 * "herkes kendi rengini takip etsin" o zaman çalışmaz. Burada karma yalnız
 * BAŞLANGIÇ tercihidir; ton doluysa sıradaki boş tona kayılır. Sonuç yine
 * deterministiktir (aynı kişi listesi → aynı atama).
 */
export function assignPersonTones(seeds: string[]): Record<string, PersonTone> {
  const taken = new Set<number>();
  const out: Record<string, PersonTone> = {};
  // Sabit sıra: id'ye göre — listenin geliş sırası değişse de atama değişmesin.
  for (const seed of [...seeds].sort()) {
    let i = hashOf(seed) % PERSON_TONES.length;
    for (let step = 0; step < PERSON_TONES.length && taken.has(i); step++) {
      i = (i + 1) % PERSON_TONES.length;
    }
    taken.add(i);
    out[seed] = PERSON_TONES[i]!;
    if (taken.size === PERSON_TONES.length) taken.clear(); // 12'den fazla kişi → yeniden tur
  }
  return out;
}

/** Aynı mantıkla ikon ataması — ekip içinde ikon tekrarı olmasın. */
export function assignPersonIcons(seeds: string[]): Record<string, LucideIcon> {
  const taken = new Set<number>();
  const out: Record<string, LucideIcon> = {};
  for (const seed of [...seeds].sort()) {
    let i = hashOf(`icon:${seed}`) % PERSON_ICONS.length;
    for (let step = 0; step < PERSON_ICONS.length && taken.has(i); step++) {
      i = (i + 1) % PERSON_ICONS.length;
    }
    taken.add(i);
    out[seed] = PERSON_ICONS[i]!;
    if (taken.size === PERSON_ICONS.length) taken.clear();
  }
  return out;
}
