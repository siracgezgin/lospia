"use client";

import { useState, useTransition } from "react";
import { AlertCircle } from "lucide-react";
import { createCrmContact, updateCrmContact } from "@/lib/actions/crm";
import { CRM_SEGMENTS, CRM_STATUSES, CRM_SOURCE_CHANNELS } from "@/lib/crm/constants";
import { SEEDING_STEPS, SEEDING_TOTAL, seedingStep } from "@/lib/crm/seeding";
import { Overlay } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { Field, FieldGrid, SelectInput, TextArea, TextInput } from "@/components/ui/Field";
import type { WorkspaceContact } from "@/types";

interface Member {
  userId: string;
  name: string;
}

interface Props {
  onClose: () => void;
  onSaved: () => void;
  members: Member[];
  contact?: WorkspaceContact | null;
}

/** Bölüm başlığı — on üç alan tek yığın halinde okunmuyordu. */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-hairline pt-4 first:border-0 first:pt-0">
      <h3 className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle">{title}</h3>
      {children}
    </section>
  );
}

/**
 * CRM KİŞİ FORMU.
 *
 * Sıraç (2026-08-29): "Bu pop-up'lar çok kötü, baştan responsive profesyonelce
 * tasarla."
 *
 * Önceki hali on üç alanı tek sütunda alt alta diziyordu; pencere ekrandan
 * taşıyor, "Ekle" düğmesi görünmüyordu. İki ayrıntı ayrıca bozuktu:
 *
 *  • İki sütunlu ızgaraya üç alan konmuştu ("Tür", "Segment", "Durum"), üstelik
 *    ilkinin altında iki satırlık bir açıklama vardı. Sonuç: "Durum" tek başına
 *    bir satırda kalıp yanında koca bir boşluk bırakıyordu.
 *  • "Tür" alanı bir TUZAKTI: "Ekip" seçilince kayıt, üzerinde durduğunuz CRM
 *    listesinden kayboluyordu. CRM zaten yalnız dış ilişkileri gösterir
 *    (workspace_contacts.kind='external'); ekip kayıtları buradan açılmaz, o
 *    yüzden seçim de kaldırıldı. Mevcut değer olduğu gibi korunur.
 *
 * İsim hatası alanın ALTINDA çıkar (Field error) — formun dibindeki genel kutu
 * yalnız sunucudan dönen hatalar içindir.
 */
export function CrmContactModal({ onClose, onSaved, members, contact }: Props) {
  const isEdit = !!contact;
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  /* E-posta hatası ALANIN ALTINDA. Sunucu "Geçersiz e-posta" diyordu ama mesaj
     formun dibindeki genel kutuda çıkıyordu: hangi alanın yanlış olduğu, üç
     bölüm yukarıdaki kutuyu bulana kadar anlaşılmıyordu. */
  const [emailError, setEmailError] = useState<string | null>(null);

  // Ekranda seçimi yok ama kayıtta duruyor — düzenlerken sıfırlanmasın.
  const kind = ((contact as { kind?: string } | null | undefined)?.kind === "team" ? "team" : "external") as
    | "team"
    | "external";

  const [form, setForm] = useState({
    name: contact?.name ?? "",
    organization: contact?.organization ?? "",
    segment: contact?.segment ?? "",
    crm_status: contact?.crm_status ?? "",
    seeding_stage: contact?.seeding_stage ?? "",
    source_channel: contact?.source_channel ?? "",
    email: contact?.email ?? "",
    phone: contact?.phone ?? "",
    role_label: contact?.role_label ?? "",
    owner_id: contact?.owner_id ?? "",
    last_contact_at: contact?.last_contact_at ?? "",
    next_follow_up_at: contact?.next_follow_up_at ?? "",
    notes: contact?.notes ?? "",
  });

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function handleSave() {
    setError(null);
    if (!form.name.trim()) {
      setNameError("İsim gerekli.");
      return;
    }
    setNameError(null);
    const email = form.email.trim();
    // Sunucudaki zod kuralının aynısı, bir tur beklemeden.
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Geçerli bir e-posta yazın (ör. ad@ornek.com).");
      return;
    }
    setEmailError(null);
    startTransition(async () => {
      const payload = { ...form, email, kind };
      const result = isEdit ? await updateCrmContact(contact!.id, payload) : await createCrmContact(payload);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onSaved();
    });
  }

  const step = seedingStep(form.seeding_stage);

  return (
    <Overlay
      open
      onClose={onClose}
      title={isEdit ? "İlişkiyi düzenle" : "Yeni ilişki ekle"}
      size="lg"
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isPending}>
            Vazgeç
          </Button>
          <Button size="sm" onClick={handleSave} loading={isPending}>
            {isEdit ? "Kaydet" : "Ekle"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Group title="Kim">
          <FieldGrid>
            <Field label="İsim" required error={nameError} className="sm:col-span-2">
              <TextInput
                value={form.name}
                onChange={(e) => { set("name", e.target.value); if (nameError) setNameError(null); }}
                autoFocus
              />
            </Field>
            <Field label="Kurum / Marka">
              <TextInput value={form.organization} onChange={(e) => set("organization", e.target.value)} />
            </Field>
            <Field label="Rol / Ünvan">
              <TextInput value={form.role_label} onChange={(e) => set("role_label", e.target.value)} />
            </Field>
            <Field label="Segment">
              <SelectInput value={form.segment} onChange={(e) => set("segment", e.target.value)}>
                <option value="">Seçiniz</option>
                {CRM_SEGMENTS.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Kaynak">
              <SelectInput value={form.source_channel} onChange={(e) => set("source_channel", e.target.value)}>
                <option value="">Seçiniz</option>
                {CRM_SOURCE_CHANNELS.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </SelectInput>
            </Field>
          </FieldGrid>
        </Group>

        <Group title="İletişim">
          <FieldGrid>
            <Field label="E-posta" error={emailError}>
              <TextInput
                type="email"
                value={form.email}
                onChange={(e) => { set("email", e.target.value); if (emailError) setEmailError(null); }}
                placeholder="ad@ornek.com"
              />
            </Field>
            <Field label="Telefon">
              <TextInput type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
          </FieldGrid>
        </Group>

        <Group title="Süreç">
          {/* Tarihler ızgaranın İÇİNDE yan yana: önce iç içe ikinci bir ızgara
              vardı ve iki tarih tek hücreye sıkışıyordu. */}
          <FieldGrid>
            <Field label="Durum">
              <SelectInput value={form.crm_status} onChange={(e) => set("crm_status", e.target.value)}>
                <option value="">Seçiniz</option>
                {CRM_STATUSES.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Sorumlu kişi">
              <SelectInput value={form.owner_id} onChange={(e) => set("owner_id", e.target.value)}>
                <option value="">Seçiniz</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>{m.name}</option>
                ))}
              </SelectInput>
            </Field>
            {/* Seeding — Aslı Hanım'ın yedi adımı (2026-08-28). Yardım satırı
                o adımda yapılacak işi söyler: "4/7 · Ürünlerin üretim bilgisi…" */}
            <Field
              label="Seeding adımı"
              hint={step ? `${step.order}/${SEEDING_TOTAL} · ${step.note}` : undefined}
              className="sm:col-span-2"
            >
              <SelectInput value={form.seeding_stage} onChange={(e) => set("seeding_stage", e.target.value)}>
                <option value="">Süreç başlamadı</option>
                {SEEDING_STEPS.map((st) => (
                  <option key={st.key} value={st.key}>
                    {st.order}. {st.label}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Son temas">
              <TextInput type="date" value={form.last_contact_at} onChange={(e) => set("last_contact_at", e.target.value)} />
            </Field>
            <Field label="Sonraki takip">
              <TextInput type="date" value={form.next_follow_up_at} onChange={(e) => set("next_follow_up_at", e.target.value)} />
            </Field>
          </FieldGrid>
        </Group>

        <Group title="Not">
          <Field label="Not">
            <TextArea
              rows={3}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Tercihler, beden, geçmiş işbirlikleri…"
            />
          </Field>
        </Group>

        {error && (
          <div
            role="alert"
            className="anim-fade-down flex items-start gap-2 rounded-control border border-danger/25 bg-danger/8 px-3 py-2.5 text-[13px] leading-relaxed text-danger"
          >
            <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden />
            <span className="min-w-0 break-words">{error}</span>
          </div>
        )}
      </div>
    </Overlay>
  );
}
