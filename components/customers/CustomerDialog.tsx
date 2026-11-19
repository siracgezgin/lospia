"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Overlay } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { Field, FieldGrid, SelectInput, TextArea, TextInput } from "@/components/ui/Field";
import { createCustomer, updateCustomer, type CustomerInput } from "@/lib/actions/customers";
import {
  CONSENT_LABEL, fmtDay, SEND_LABEL, SOURCE_LABEL, STATUS_LABEL, TIERS,
  type Customer, type CustomerSend, type CustomerTier,
} from "@/lib/customers/model";

/**
 * KİŞİ KARTI — düzeltme + bülten geçmişi. Silme yok: hatalı adres ve çıkan
 * kişi "Adres durumu"ndan işaretlenir. A+ yalnız yetkili kişide seçilebilir.
 */
export function CustomerDialog({
  customer, defaultTier, canMarkTop, onClose,
}: {
  customer: Customer | null;
  defaultTier: CustomerTier;
  canMarkTop: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CustomerInput>(() => ({
    full_name: customer?.full_name ?? "",
    email: customer?.email ?? "",
    phone: customer?.phone ?? "",
    city: customer?.city ?? "",
    tier: customer?.tier ?? (defaultTier === "A+" && !canMarkTop ? "A" : defaultTier),
    source: customer?.source ?? "elle",
    last_activity: customer?.last_activity ?? null,
    email_consent: customer?.email_consent ?? "bilinmiyor",
    email_status: customer?.email_status ?? "ok",
    note: customer?.note ?? "",
  }));
  const set = <K extends keyof CustomerInput>(k: K, v: CustomerInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  /* Bülten geçmişi — kart açılınca okunur. */
  const [sends, setSends] = useState<CustomerSend[] | null>(customer ? null : []);
  useEffect(() => {
    if (!customer) return;
    let alive = true;
    fetch(`/api/customers/sends?id=${encodeURIComponent(customer.id)}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ sends: CustomerSend[] }>) : { sends: [] }))
      .then((d) => { if (alive) setSends(d.sends); })
      .catch(() => { if (alive) setSends([]); });
    return () => { alive = false; };
  }, [customer]);

  /* A+ kilidi: yetkisiz kişi A+ veremez, A+ olan kişinin katmanını da değiştiremez. */
  const tierLocked = !canMarkTop && customer?.tier === "A+";

  function submit() {
    setError(null);
    start(async () => {
      const res = customer ? await updateCustomer(customer.id, form) : await createCustomer(form);
      if ("error" in res) { setError(res.error); return; }
      router.refresh();
      onClose();
    });
  }

  return (
    <Overlay
      open
      onClose={onClose}
      title={customer ? customer.full_name || customer.email || "Kişi" : "Yeni kişi"}
      size="lg"
      dismissOnBackdrop={false}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={pending}>Vazgeç</Button>
          <Button onClick={submit} disabled={pending}>{pending ? "Kaydediliyor" : "Kaydet"}</Button>
        </div>
      }
    >
      <div className="space-y-3.5">
        {error && (
          <p role="alert" className="rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[13.5px] font-medium text-danger">{error}</p>
        )}
        <FieldGrid>
          <Field label="Ad Soyad"><TextInput value={form.full_name} onChange={(e) => set("full_name", e.target.value)} autoFocus={!customer} /></Field>
          <Field label="Katman">
            <SelectInput value={form.tier} disabled={tierLocked} onChange={(e) => set("tier", e.target.value as CustomerTier)}>
              {TIERS.filter((t) => t.key !== "A+" || canMarkTop || customer?.tier === "A+").map((t) => (
                <option key={t.key} value={t.key}>{t.key} · {t.label}</option>
              ))}
            </SelectInput>
          </Field>
        </FieldGrid>
        <FieldGrid>
          <Field label="E-posta"><TextInput type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Telefon"><TextInput type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        </FieldGrid>
        <FieldGrid>
          <Field label="Şehir"><TextInput value={form.city} onChange={(e) => set("city", e.target.value)} /></Field>
          <Field label="Son işlem">
            <TextInput type="date" value={form.last_activity ?? ""} onChange={(e) => set("last_activity", e.target.value || null)} />
          </Field>
        </FieldGrid>
        <FieldGrid>
          <Field label="Adres durumu">
            <SelectInput value={form.email_status} onChange={(e) => set("email_status", e.target.value as CustomerInput["email_status"])}>
              {(Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]).map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
            </SelectInput>
          </Field>
          <Field label="E-posta izni">
            <SelectInput value={form.email_consent} onChange={(e) => set("email_consent", e.target.value as CustomerInput["email_consent"])}>
              {(Object.keys(CONSENT_LABEL) as (keyof typeof CONSENT_LABEL)[]).map((k) => (
                <option key={k} value={k}>
                  {CONSENT_LABEL[k]}{k === "var" && customer?.email_consent_at ? ` · ${fmtDay(customer.email_consent_at)}` : ""}
                </option>
              ))}
            </SelectInput>
          </Field>
        </FieldGrid>
        <FieldGrid>
          <Field label="Kaynak">
            <SelectInput value={form.source} onChange={(e) => set("source", e.target.value as CustomerInput["source"])}>
              {(Object.keys(SOURCE_LABEL) as (keyof typeof SOURCE_LABEL)[]).map((k) => <option key={k} value={k}>{SOURCE_LABEL[k]}</option>)}
            </SelectInput>
          </Field>
          {/* Ana listedeki etiket — yalnız okunur; aktarımla gelir. */}
          {customer?.label && <Field label="Etiket"><TextInput value={customer.label} readOnly disabled /></Field>}
        </FieldGrid>
        <Field label="Not"><TextArea rows={3} value={form.note} onChange={(e) => set("note", e.target.value)} /></Field>

        {customer && (
          <div>
            <span className="mb-1 block text-[12.5px] font-medium text-muted">Bülten geçmişi</span>
            {sends === null ? (
              <p className="text-[13px] text-subtle">Yükleniyor</p>
            ) : sends.length === 0 ? (
              <p className="text-[13px] text-subtle">Kayıt yok</p>
            ) : (
              <ul className="divide-y divide-line rounded-control border border-line">
                {sends.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                    <span className="w-24 shrink-0 tabular-nums text-muted">{fmtDay(s.sent_on)}</span>
                    <span className="min-w-0 flex-1 truncate text-ink">{s.subject || "—"}</span>
                    <span className={s.result === "gitti" ? "text-muted" : "font-medium text-danger"}>{SEND_LABEL[s.result]}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Overlay>
  );
}
