"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  PERSON_TONES, PERSON_ICONS, PERSON_TONE_CAPACITY,
  assignPersonTones, assignPersonIcons, type PersonChoice,
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
export function PersonIdentityManager({ members, canManage }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
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
          Şu kişiler aynı rengi paylaşıyor: {clashes.map((n) => n.join(" / ")).join(" · ")}.
          Hangi ikilinin aynı renkte kalacağına siz karar verin — aşağıdan birine
          başka bir renk seçebilirsiniz.
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
                <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full text-white", tone.solid)}>
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

              {canManage && (
                <div className="mt-3 space-y-2">
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
                            t.solid,
                            selected ? "ring-2 ring-ink ring-offset-2" : "hover:scale-110",
                            takenByOther && "cursor-not-allowed opacity-25",
                          )}
                        >
                          {selected && <Check size={13} className="text-white" strokeWidth={3} />}
                        </button>
                      );
                    })}
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
          Bir renk yalnız bir kişide olabilir. Yeşil bilerek yok: yeşil yalnızca tamamlanan işler için.
        </p>
      )}
    </div>
  );
}
