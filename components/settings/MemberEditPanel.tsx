"use client";

import { useState } from "react";
import { Loader2, RotateCcw, Save, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Input, Select, Field } from "@/components/ui/Input";
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
    <div className="anim-fade-down mt-3 space-y-3 rounded-xl border border-line bg-surface-sunken/60 p-3.5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Ad Soyad">
          <Input
            value={d.fullName}
            onChange={(e) => set("fullName", e.target.value)}
            disabled={busy}
            className="h-8"
          />
        </Field>
        <Field label="Kullanıcı adı">
          <Input
            value={d.username}
            onChange={(e) => set("username", e.target.value.toLowerCase())}
            placeholder="kullanici.adi"
            spellCheck={false}
            disabled={busy}
            className="h-8"
          />
        </Field>
        {/* ÜNVAN — Pano kartında bu yazar. Aslı Hanım (2026-08-28): "Bana da
            tasarımcı yazarsan; ben yönetici olmak istemiyorum çünkü."
            Boş bırakılırsa kart eskisi gibi sistem rolünü yazar. */}
        <Field label="Ünvan">
          <Input
            value={d.jobTitle}
            onChange={(e) => set("jobTitle", e.target.value)}
            placeholder="Tasarımcı, Üretim Sorumlusu…"
            disabled={busy || !canManageIdentity}
            className="h-8"
          />
        </Field>
        <Field label="Bildirim e-postası">
          <Input
            type="email"
            value={d.notificationEmail}
            onChange={(e) => set("notificationEmail", e.target.value)}
            placeholder="ornek@aslifilinta.com"
            disabled={busy}
            className="h-8"
          />
        </Field>
        {canManageRole && (
          <Field label="Rol">
            <Select
              value={d.role}
              onChange={(e) => set("role", e.target.value as MemberDraft["role"])}
              disabled={busy}
              className="h-8"
            >
              {ASSIGNABLE_ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      {canManageIdentity && member && (
        <div className="space-y-2 border-t border-hairline pt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-[52px] shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted">Renk</span>
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
                  title={takenByOther ? `${t.label} — ${owner} kullanıyor` : t.label}
                  className={cn(
                    "tap-target h-7 w-7 rounded-full transition-transform duration-150",
                    selected ? "ring-2 ring-ink ring-offset-2" : "hover:scale-110",
                    takenByOther && "cursor-not-allowed opacity-25",
                  )}
                  style={{ backgroundColor: t.hex }}
                />
              );
            })}
            {/* Serbest renk — hazır palet dışında istenen her ton. */}
            <input
              type="color"
              value={isHexColor(d.colorKey) ? d.colorKey : "#2563c9"}
              disabled={busy}
              onChange={(e) => set("colorKey", e.target.value)}
              className="tap-target h-7 w-7 cursor-pointer rounded-full border border-line bg-surface p-0"
              title="Serbest renk"
              aria-label="Serbest renk"
            />
            <input
              value={d.colorKey}
              onChange={(e) => set("colorKey", e.target.value.trim())}
              placeholder="#2563c9"
              spellCheck={false}
              disabled={busy}
              className="w-[86px] rounded-md border border-line bg-surface px-1.5 py-1 font-mono text-[11px] tabular-nums text-ink focus:outline-none focus:ring-2 focus:ring-brand-ring/40"
            />
          </div>

          {/* FOTOĞRAF — ikon seçicisinin yerine.
              Aslı Hanım (2026-08-24): "İkon kalkıp herkesin resmi gelecek."
              Yönetici ekibin fotoğraflarını buradan girer; kişi kendisininkini
              Profil sayfasından da değiştirebilir. Fotoğraf yoksa kişi kendi
              renginde baş harfleriyle çıkar — renk seçici bu yüzden kalıyor. */}
          {member && (
            <div className="mt-3 border-t border-hairline pt-3">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                Fotoğraf
              </span>
              <AvatarUploader
                userId={member.userId}
                name={member.name}
                photoUrl={member.avatarUrl ?? null}
                colorHex={isHexColor(d.colorKey) ? d.colorKey : null}
                disabled={busy}
              />
            </div>
          )}

        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-hairline pt-3">
        {canManageIdentity && !auto && (
          <button
            type="button"
            onClick={() => { set("colorKey", ""); set("iconKey", ""); onResetIdentity(); }}
            disabled={busy}
            className="mr-auto inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12.5px] font-medium text-muted transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50"
            title="Renk ve ikonu otomatik atamaya bırak"
          >
            <RotateCcw size={12} /> Otomatik renk
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-muted transition-colors hover:text-ink disabled:opacity-50"
        >
          <X size={13} /> Vazgeç
        </button>
        <button
          type="button"
          onClick={() => onSave(d)}
          disabled={busy || !d.fullName.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-medium text-white transition-colors hover:bg-brand-strong disabled:pointer-events-none disabled:opacity-60"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Kaydet
        </button>
      </div>
    </div>
  );
}
