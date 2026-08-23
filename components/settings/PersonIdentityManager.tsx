"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  PERSON_TONES, PERSON_ICONS, PERSON_TONE_CAPACITY,
  assignPersonTones, assignPersonIcons, personStyles, isHexColor,
  type PersonChoice,
} from "@/lib/design/person-colors";
import { saveMemberIdentity } from "@/lib/actions/member-identity";

export type IdentityMember = {
  /** workspace_members.id — yazma buna göre. */
  id: string;
  /** profiles.id — renk/ikon türetiminin tohumu; her ekranda aynı olmalı. */
  userId: string;
  name: string;
  roleLabel: string;
  colorKey: string | null;
  iconKey: string | null;
};

interface Props {
  members: IdentityMember[];
  canManage: boolean;
}

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

export function PersonIdentityManager({ members, canManage }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  /* Seçiciler KAPALI başlar. 68 ikon × her kişi aynı anda çizilince Ayarlar
     sayfası tek bölümle ~1000px'e çıkıyor ve sayfanın geri kalanını eziyordu
     (Aslı Hanım, 2026-08-23: "diğer kısımlar da çok kötü ayarlar sayfası").
     Kimlik satırı artık tek satır; değiştirmek isteyen açar. */
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, startWork] = useTransition();

  // Ekranda gösterilen efektif kimlik — panodakiyle birebir aynı hesap.
  const { tones, icons, usedColors, clashes } = useMemo(() => {
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
    const clashes = [...byTone.values()].filter((names) => names.length > 1);
    return {
      tones,
      icons: assignPersonIcons(seeds, choices),
      usedColors: used,
      clashes,
    };
  }, [members]);

  function save(m: IdentityMember, next: { colorKey?: string | null; iconKey?: string | null }) {
    setError(null);
    setSavingId(m.id);
    startWork(async () => {
      const res = await saveMemberIdentity(m.id, {
        colorKey: next.colorKey !== undefined ? next.colorKey : m.colorKey,
        iconKey: next.iconKey !== undefined ? next.iconKey : m.iconKey,
      });
      setSavingId(null);
      if ("error" in res) { setError(res.error); return; }
      router.refresh();
    });
  }

  if (members.length === 0) {
    return (
      <p className="rounded-xl border border-line bg-surface px-3 py-4 text-center text-[13px] text-subtle">
        Henüz ekip üyesi yok.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {clashes.length > 0 && (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[12.5px] leading-relaxed text-ink">
          <strong className="font-semibold">
            {members.length} kişi var, palette {PERSON_TONE_CAPACITY} renk.
          </strong>{" "}
          Otomatik atama şu kişilere aynı rengi verdi: {clashes.map((n) => n.join(" / ")).join(" · ")}.
          Satırın sonundaki renk seçiciden palet dışı bir renk verebilirsiniz — orada sınır yok.
        </p>
      )}

      {error && (
        <p className="anim-fade-down rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">
          {error}
        </p>
      )}

      <ul className="space-y-2">
        {members.map((m) => {
          const tone = tones[m.userId]!;
          const Icon = icons[m.userId]!;
          const saving = busy && savingId === m.id;
          const auto = !m.colorKey && !m.iconKey;

          return (
            <li key={m.id} className="rounded-xl border border-line bg-surface p-3 shadow-card">
              <div className="flex flex-wrap items-center gap-3">
                {/* Önizleme — panodaki rozetin aynısı. */}
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
                  style={personStyles(tone.hex).solid}
                >
                  <Icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold tracking-tight text-ink">{m.name}</span>
                  <span className="text-[12px] text-muted">
                    {m.roleLabel} · {tone.label}
                    {auto && <span className="text-subtle"> (otomatik)</span>}
                  </span>
                </span>
                {saving && <Loader2 size={15} className="animate-spin text-muted" />}
                {canManage && (
                  <button
                    onClick={() => setOpenId(openId === m.id ? null : m.id)}
                    className="tap-target inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[12px] font-medium text-muted transition-colors hover:border-line-strong hover:text-ink"
                    aria-expanded={openId === m.id}
                  >
                    {openId === m.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    {openId === m.id ? "Kapat" : "Değiştir"}
                  </button>
                )}
                {!auto && canManage && (
                  <button
                    onClick={() => save(m, { colorKey: "", iconKey: "" })}
                    disabled={busy}
                    className="tap-target inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[12px] font-medium text-muted transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50"
                    title="Otomatik atamaya dön"
                  >
                    <RotateCcw size={12} /> Otomatik
                  </button>
                )}
              </div>

              {canManage && openId === m.id && (
                <div className="anim-fade-down mt-3 space-y-2">
                  {/* Renk — dokuz ton, hiçbiri diğerine benzemiyor. */}
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
                          onClick={() => save(m, { colorKey: selected ? "" : t.key })}
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
                    {/* SERBEST RENK — Aslı Hanım (2026-08-23): "Her kişi için
                        renk paleti çıksa, mesela hexadecimal. Biz seçip
                        eklesek." Hazır palet hızlı yol; buradan istenen her
                        renk verilebilir. */}
                    <HexPicker
                      key={m.colorKey ?? "otomatik"}
                      value={isHexColor(m.colorKey) ? m.colorKey! : (tone.hex ?? "#2563c9")}
                      isCustom={isHexColor(m.colorKey)}
                      disabled={busy}
                      onPick={(hex) => save(m, { colorKey: hex })}
                    />
                  </div>

                  {/* İkon */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="w-[52px] shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted">
                      İkon
                    </span>
                    {PERSON_ICONS.map(({ key, label, Icon: Opt }) => {
                      const selected = m.iconKey === key;
                      return (
                        <button
                          key={key}
                          onClick={() => save(m, { iconKey: selected ? "" : key })}
                          disabled={busy}
                          title={label}
                          className={cn(
                            "tap-target grid h-7 w-7 place-items-center rounded-lg border transition-colors duration-150",
                            selected
                              ? "border-ink bg-ink text-white"
                              : "border-line text-muted hover:border-line-strong hover:bg-surface-muted hover:text-ink",
                          )}
                        >
                          <Opt size={14} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {canManage && (
        <p className="text-[12px] leading-relaxed text-subtle">
          Seçilmeyen renk ve ikon kişinin kimliğinden otomatik türetilir — kimse renksiz kalmaz.
          Hazır paletin yanındaki seçiciden istediğiniz rengi verebilirsiniz (hex de yazılabilir).
          Bir renk yalnız bir kişide olabilir. Yeşil bilerek yok: yeşil yalnızca tamamlanan işler için.
        </p>
      )}
    </div>
  );
}
