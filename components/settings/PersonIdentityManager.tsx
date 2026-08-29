"use client";

import { useMemo } from "react";
import {
  assignPersonTones,
  type PersonChoice,
} from "@/lib/design/person-colors";

export type IdentityMember = {
  /** workspace_members.id — yazma buna göre. */
  id: string;
  /** profiles.id — renk türetiminin tohumu; her ekranda aynı olmalı. */
  userId: string;
  name: string;
  roleLabel: string;
  /** Ekranda görünen ünvan (20240323). Boşsa roleLabel kullanılır. */
  jobTitle?: string | null;
  colorKey: string | null;
  iconKey: string | null;
  /** profiles.avatar_url — fotoğraf yükleyici için. */
  avatarUrl?: string | null;
};

/**
 * Kişi Kimliği — renk ve ikon seçimi.
 *
 * Aslı Hanım (2026-08-19): "Herkesin bir rengi olsa da herkes kendi rengini
 * takip etse" ve "Herkese ikon koy. Sevdikleri ikonları da seçtirebilirsin."
 *
 * Seçim yapılmadıkça renk kişinin id'sinden türetilir — burada da AYNI
 * türetim gösterilir, böylece "otomatik" satır ekranda ne görünüyorsa panoda
 * da o görünür. Yönetici bir rengi seçince o renk kilitlenir; aynı çalışma
 * alanında iki kişi aynı rengi alamaz (kısmi tekil indeks, 20240313).
 */
/**
 * Serbest renk seçici.
 *
 * Tarayıcının kendi renk çarkı (`input[type=color]`) + elle hex girişi. Değer
 * yalnız GEÇERLİ olduğunda kaydedilir; her tuş vuruşunda sunucuya gitmemek için
 * yazarken beklenir, çarkta ise seçim bitince (change) gönderilir.
 */

/**
 * Ekibin efektif kimliği — ton, ikon, kullanılan renkler ve çakışmalar.
 * Panodaki hesabın AYNISI; Üyeler listesi de bunu kullanır ki aynı kişi iki
 * ekranda iki farklı renk göstermesin.
 */
export function usePersonIdentities(members: IdentityMember[]) {
  return useMemo(() => {
    const seeds = members.map((m) => m.userId);
    const choices: Record<string, PersonChoice> = {};
    for (const m of members) choices[m.userId] = { colorKey: m.colorKey, iconKey: m.iconKey };
    const used = new Map<string, string>(); // colorKey → kişi adı
    for (const m of members) if (m.colorKey) used.set(m.colorKey, m.name);
    const tones = assignPersonTones(seeds, choices);
    // Palet tükendiyse iki kişi aynı tonu paylaşır. Bunu SESSİZCE yapmak
    // "renkler ayırt edilmiyor" şikâyetinin ta kendisi — açıkça söylenir.
    const byTone = new Map<string, string[]>();
    for (const m of members) {
      const k = tones[m.userId]?.key;
      if (!k) continue;
      byTone.set(k, [...(byTone.get(k) ?? []), m.name]);
    }
    return {
      tones,
      usedColors: used,
      clashes: [...byTone.values()].filter((names) => names.length > 1),
    };
  }, [members]);
}
