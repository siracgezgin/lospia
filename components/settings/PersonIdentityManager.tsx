"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { AvatarUploader } from "@/components/settings/AvatarUploader";
import {
  PERSON_TONES,
  assignPersonTones, isHexColor,
  type PersonChoice,
} from "@/lib/design/person-colors";

export type IdentityMember = {
  /** workspace_members.id — yazma buna göre. */
  id: string;
  /** profiles.id — renk/ikon türetiminin tohumu; her ekranda aynı olmalı. */
  userId: string;
  name: string;
  roleLabel: string;
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
 * Seçim yapılmadıkça renk/ikon kişinin id'sinden türetilir — burada da AYNI
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
function HexPicker({
  value, isCustom, disabled, onPick,
}: { value: string; isCustom: boolean; disabled: boolean; onPick: (_hex: string) => void }) {
  /* Kaydedilen renk değişince bileşen `key` ile yeniden bağlanır; taslak da o
     anda sıfırlanır. Effect içinde setState etmek React'te kademeli yeniden
     render tetikliyor (lint kuralı da bunu yakalıyor). */
  const [draft, setDraft] = useState(value);
  const valid = isHexColor(draft);
  return (
    <span className="ml-1 inline-flex items-center gap-1">
      <span
        className={cn(
          "relative grid h-7 w-7 place-items-center overflow-hidden rounded-full",
          isCustom ? "ring-2 ring-ink ring-offset-2" : "ring-1 ring-line",
        )}
        style={{ backgroundColor: valid ? draft : "#ffffff" }}
        title="Serbest renk"
      >
        <input
          type="color"
          value={valid ? draft : "#2563c9"}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { if (isHexColor(draft)) onPick(draft); }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label="Serbest renk seç"
        />
      </span>
      <input
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value.trim())}
        onKeyDown={(e) => { if (e.key === "Enter" && isHexColor(draft)) onPick(draft); }}
        onBlur={() => { if (isHexColor(draft)) onPick(draft); }}
        placeholder="#2563c9"
        spellCheck={false}
        className={cn(
          "w-[78px] rounded-md border bg-surface px-1.5 py-1 font-mono text-[11px] tabular-nums text-ink",
          "focus:outline-none focus:ring-2 focus:ring-brand-ring/40",
          valid ? "border-line" : "border-danger/50",
        )}
      />
    </span>
  );
}

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

/**
 * Bir kişinin renk + fotoğraf seçicisi.
 *
 * Ayrı bir "Kişi Kimliği" listesi olarak DEĞİL, Üyeler satırının içinde yaşar —
 * Aslı Hanım (2026-08-23): "Burayı neden tek başlık altında toplamıyoruz."
 * İki liste aynı sekiz kişiyi iki kez gösteriyordu.
 */
export function PersonIdentityEditor({
  member, tone, usedColors, busy, onSave,
}: {
  member: IdentityMember;
  tone: { hex: string; label: string };
  usedColors: Map<string, string>;
  busy: boolean;
  onSave: (_next: { colorKey?: string | null }) => void;
}) {
  const m = member;
  return (
    <div className="anim-fade-down space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-[52px] shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Renk
        </span>
        {PERSON_TONES.map((t) => {
          const owner = usedColors.get(t.key);
          const takenByOther = !!owner && owner !== m.name;
          const selected = m.colorKey === t.key;
          return (
            <button
              key={t.key}
              onClick={() => onSave({ colorKey: selected ? "" : t.key })}
              disabled={busy || takenByOther}
              title={takenByOther ? `${t.label} — ${owner} kullanıyor` : t.label}
              className={cn(
                "tap-target grid h-7 w-7 place-items-center rounded-full transition-transform duration-150",
                selected ? "ring-2 ring-ink ring-offset-2" : "hover:scale-110",
                takenByOther && "cursor-not-allowed opacity-25",
              )}
              style={{ backgroundColor: t.hex }}
            >
              {selected && <Check size={13} className="text-white" strokeWidth={3} />}
            </button>
          );
        })}
        {/* SERBEST RENK — "Her kişi için renk paleti çıksa, mesela hexadecimal." */}
        <HexPicker
          key={m.colorKey ?? "otomatik"}
          value={isHexColor(m.colorKey) ? m.colorKey! : (tone.hex ?? "#2563c9")}
          isCustom={isHexColor(m.colorKey)}
          disabled={busy}
          onPick={(hex) => onSave({ colorKey: hex })}
        />
      </div>

      {/* FOTOĞRAF — ikon seçicisinin yerine geçti.
          Aslı Hanım (2026-08-24): "İkon kalkıp herkesin resmi gelecek."
          Sembol ikonları (kedi, şemsiye, gitar…) kimseyi tanıtmıyordu.
          Fotoğraf yoksa kişi kendi renginde baş harfleriyle çıkar. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-[52px] shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Fotoğraf
        </span>
        <AvatarUploader
          userId={m.userId}
          name={m.name}
          photoUrl={m.avatarUrl ?? null}
          colorHex={tone.hex}
          disabled={busy}
        />
      </div>
    </div>
  );
}
