"use client";

import { useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Field, FieldGrid, TextInput, SelectInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { ASSIGNABLE_ROLE_OPTIONS } from "@/lib/utils/roles";
import { PERSON_TONES, isHexColor } from "@/lib/design/person-colors";
import type { IdentityMember } from "@/components/settings/PersonIdentityManager";
import { AvatarUploader } from "@/components/settings/AvatarUploader";

export type MemberDraft = {
  fullName: string;
  username: string;
  notificationEmail: string;
  /** Kartta görünen ünvan — boşsa sistem rolü yazılır (20240323). */
  jobTitle: string;
  role: "admin" | "member" | "viewer";
  colorKey: string;
  iconKey: string;
};

/**
 * Üye düzenleme — TEK panel.
 *
 * Aslı Hanım (2026-08-24): "Ayarlarda her kısmı böyle düzeltmek yerine daha
 * profesyonel düzenleme kısmı olmalı her üye için."
 *
 * Önce her alanın yanında ayrı bir kalem vardı: isim, kullanıcı adı ve e-posta
 * üç ayrı satır içi düzenleme; renk/ikon dördüncü bir açılır kutu; rol ise
 * apayrı bir açılır liste. Beş ayrı etkileşim, beş ayrı kaydetme. Artık tek
 * "Düzenle" bir form açıyor, tek "Kaydet" ile bitiyor.
 *
 * Kaydetme YALNIZ DEĞİŞENİ gönderir — dokunulmayan alan için sunucuya istek
 * gitmez (isim değişmeden kullanıcı adı kaydetmek gereksiz yazma ve gereksiz
 * çakışma riski).
 *
 * Yüzey: bölüm kartının içinde İKİNCİ bir kart değil, yumuşak bir dolgu
 * (kenarlık ve gölge yok) — "düzenleniyor" hissini verir, katman eklemez.
 */
export function MemberEditPanel({
  member, draft: initial, canManageRole, canManageIdentity, usedColors, busy, onCancel, onSave, onResetIdentity,
}: {
  member: IdentityMember | null;
  draft: MemberDraft;
  canManageRole: boolean;
  canManageIdentity: boolean;
  /** colorKey → o rengi kullanan kişinin adı. */
  usedColors: Map<string, string>;
  busy: boolean;
  onCancel: () => void;
  onSave: (_next: MemberDraft) => void;
  onResetIdentity: () => void;
}) {
  const [d, setD] = useState<MemberDraft>(initial);
  const set = <K extends keyof MemberDraft>(k: K, v: MemberDraft[K]) => setD((p) => ({ ...p, [k]: v }));
  const auto = !d.colorKey && !d.iconKey;

  return (
    <div className="anim-fade-down mt-3 space-y-4 rounded-card bg-surface-sunken/60 p-4">
      <FieldGrid>
        <Field label="Ad Soyad" required>
          <TextInput
            value={d.fullName}
            onChange={(e) => set("fullName", e.target.value)}
            disabled={busy}
          />
        </Field>
        <Field label="Kullanıcı adı">
          <TextInput
            value={d.username}
            onChange={(e) => set("username", e.target.value.toLowerCase())}
            placeholder="kullanici.adi"
            spellCheck={false}
            disabled={busy}
          />
        </Field>
        {/* ÜNVAN — Pano kartında bu yazar. Aslı Hanım (2026-08-28): "Bana da
            tasarımcı yazarsan; ben yönetici olmak istemiyorum çünkü."
            Boş bırakılırsa kart eskisi gibi sistem rolünü yazar. */}
        <Field label="Ünvan" hint="Boşsa kartta rol yazar.">
          <TextInput
            value={d.jobTitle}
            onChange={(e) => set("jobTitle", e.target.value)}
            placeholder="Tasarımcı, Üretim Sorumlusu…"
            disabled={busy || !canManageIdentity}
          />
        </Field>
        <Field label="Bildirim e-postası">
          <TextInput
            type="email"
            value={d.notificationEmail}
            onChange={(e) => set("notificationEmail", e.target.value)}
            placeholder="ornek@aslifilinta.com"
            disabled={busy}
          />
        </Field>
        {canManageRole && (
          <Field label="Rol">
            <SelectInput
              value={d.role}
              onChange={(e) => set("role", e.target.value as MemberDraft["role"])}
              disabled={busy}
            >
              {ASSIGNABLE_ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </SelectInput>
          </Field>
        )}
      </FieldGrid>

      {canManageIdentity && member && (
        <div className="space-y-4 border-t border-hairline pt-4">
          {/* RENK — eşit kutucuklar, seçili olan halkayla ve tikle belli;
              klavyeyle gezilir (düğme + aria-pressed). Hover'da büyüme yok. */}
          <div>
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle">Renk</p>
            <div role="group" aria-label="Kişi rengi" className="flex flex-wrap items-center gap-2">
              {PERSON_TONES.map((t) => {
                const owner = usedColors.get(t.key);
                const takenByOther = !!owner && owner !== member.name;
                const selected = d.colorKey === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => set("colorKey", selected ? "" : t.key)}
                    disabled={busy || takenByOther}
                    aria-pressed={selected}
                    aria-label={takenByOther ? `${t.label} — ${owner} kullanıyor` : t.label}
                    title={takenByOther ? `${t.label} — ${owner} kullanıyor` : t.label}
                    className={cn(
                      "tap-target grid size-8 place-items-center rounded-full transition-[box-shadow] duration-150 ease-standard",
                      "ring-offset-2 ring-offset-surface-sunken",
                      selected ? "ring-2 ring-ink" : "hover:ring-2 hover:ring-line-strong",
                      takenByOther && "cursor-not-allowed opacity-25",
                    )}
                    style={{ backgroundColor: t.hex }}
                  >
                    {selected && <Check size={14} className="text-white" strokeWidth={3} aria-hidden />}
                  </button>
                );
              })}
              {/* Serbest renk — hazır palet dışında istenen her ton. */}
              <input
                type="color"
                value={isHexColor(d.colorKey) ? d.colorKey : "#2563c9"}
                disabled={busy}
                onChange={(e) => set("colorKey", e.target.value)}
                className="tap-target size-8 cursor-pointer rounded-full border border-line bg-surface p-0"
                title="Serbest renk"
                aria-label="Serbest renk"
              />
              <TextInput
                value={d.colorKey}
                onChange={(e) => set("colorKey", e.target.value.trim())}
                placeholder="#2563c9"
                spellCheck={false}
                disabled={busy}
                aria-label="Renk kodu (hex)"
                className="h-8 w-[104px] font-mono text-[12.5px] tabular-nums"
              />
            </div>
          </div>

          {/* FOTOĞRAF — ikon seçicisinin yerine.
              Aslı Hanım (2026-08-24): "İkon kalkıp herkesin resmi gelecek."
              Yönetici ekibin fotoğraflarını buradan girer; kişi kendisininkini
              Profil sayfasından da değiştirebilir. Fotoğraf yoksa kişi kendi
              renginde baş harfleriyle çıkar — renk seçici bu yüzden kalıyor. */}
          <div>
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle">Fotoğraf</p>
            <AvatarUploader
              userId={member.userId}
              name={member.name}
              photoUrl={member.avatarUrl ?? null}
              colorHex={isHexColor(d.colorKey) ? d.colorKey : null}
              disabled={busy}
            />
          </div>
        </div>
      )}

      {/* Kaydet sağda primary, Vazgeç solunda ghost; "Otomatik renk" en solda
          ikincil — üçü aynı ağırlıkta durmuyor. */}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-hairline pt-3">
        {canManageIdentity && !auto && (
          <Button
            variant="secondary"
            size="sm"
            className="mr-auto"
            onClick={() => { set("colorKey", ""); set("iconKey", ""); onResetIdentity(); }}
            disabled={busy}
            title="Rengi otomatik atamaya bırak"
          >
            <RotateCcw size={13} aria-hidden /> Otomatik renk
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Vazgeç
        </Button>
        <Button
          size="sm"
          onClick={() => onSave(d)}
          loading={busy}
          disabled={!d.fullName.trim()}
        >
          Kaydet
        </Button>
      </div>
    </div>
  );
}
