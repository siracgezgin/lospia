"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { createManufacturer, type ManufacturerInput } from "@/lib/actions/manufacturers";
import { Button, IconButton } from "@/components/ui/Button";
import { Field, FieldGrid, SelectInput, TextArea, TextInput } from "@/components/ui/Field";
import { Overlay } from "@/components/ui/Overlay";
import type { ManufacturerRole } from "@/types";

/**
 * Fihrist seçicisi — SEÇ ya da ORADA AÇ.
 *
 * Sıraç (23.09.2026): "Nakışçı, üretici nereden nasıl ekleniyor? Onları direkt
 * o sekmede ekle butonuna basıp ekleyebilelim, sonra onlar CRM'e kaydedilsin."
 * Ve (24.09.2026): "Artıya basınca bir popup çıksın, alınması gereken bilgiler
 * alınıp bu hem CRM'e hem product kısmında da kaydedilsin. Tüm bilgileri
 * içeren bir popup olsun, her birine ayrı ayrı tabi. Bilgilerde zorunlu olan
 * isim soyisim olsun, diğer kısımlar isteğe bağlı."
 *
 * Bu yüzden artı satır içinde iki kutu değil, TAM KAYIT penceresi açar: ad,
 * telefon, e-posta, adres, şehir, teslim süresi, asgari adet, not. Yalnız ad
 * zorunlu — geri kalanı sonradan Fihrist'ten tamamlanabilir.
 *
 * TEK KAYIT, İKİ YÜZEY: yazılan satır `workspace_manufacturers`'a gider.
 * Föydeki seçiciler, Ödeme Tablosu, Sourcing ve CRM'in Outsource listesi hepsi
 * aynı satırı okur — ikinci bir kopya oluşmaz, aralarında ayrışma olmaz.
 */
export interface PickerPerson {
  id: string;
  name: string;
  is_active?: boolean | null;
  role?: ManufacturerRole | null;
}

const ROLE_LABEL: Record<ManufacturerRole, string> = {
  uretici: "Üretici",
  kalipci: "Kalıpçı",
  nakisci: "Nakışçı",
  kumasci: "Kumaşçı",
  aksesuarci: "Aksesuarcı",
  diger: "Diğer",
};

function emptyDraft(role: ManufacturerRole): ManufacturerInput {
  return {
    name: "", role, address: "", photo_url: "", city: "", country: "", currency: "TL",
    lead_time_days: "", min_order_qty: "",
    contact_name: "", phone: "", email: "", notes: "", is_active: true,
  };
}

export function ManufacturerPicker({
  value,
  role,
  people,
  canEdit,
  canAdd,
  label,
  onSelect,
  onCreated,
}: {
  value: string | null;
  /** Bu kutunun iş kolu — açılan yeni kayıt bu rolle doğar. */
  role: ManufacturerRole;
  people: PickerPerson[];
  /** Kutudan SEÇEBİLİR mi — föyün kendi alanı, üyeye açık. */
  canEdit: boolean;
  /** Fihriste YENİ KAYIT açabilir mi — ayrı yetki. `workspace_manufacturers`
   *  yazması RLS'te yöneticiye kısıtlı; artıyı üyeye göstermek, basınca
   *  "yetkiniz yok" diyen bir düğme koymak olurdu. */
  canAdd: boolean;
  /** Erişilebilirlik ve pencere başlığı: "Üretici", "Kalıpçı", "Nakışçı". */
  label: string;
  onSelect: (_id: string | null) => void;
  /** Yeni kayıt açıldı — föy listesine eklenmesi için. */
  onCreated: (_p: PickerPerson) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ManufacturerInput>(() => emptyDraft(role));
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  /* Rolü GİRİLMEMİŞ eski kayıtlar her listede görünür: 20240353 öncesinde
     açılmış ustalar bir gecede kaybolmuş gibi olmamalı. */
  const options = people.filter((p) => !p.role || p.role === role || p.role === "diger");

  function openDialog() {
    setDraft(emptyDraft(role));
    setError(null);
    setOpen(true);
  }

  function save() {
    const clean = draft.name.trim();
    if (!clean) { setError("İsim soyisim gerekli."); return; }
    setError(null);
    start(async () => {
      const res = await createManufacturer({ ...draft, name: clean, role });
      if ("error" in res) { setError(res.error); return; }
      onCreated({ id: res.id, name: clean, role, is_active: true });
      onSelect(res.id);
      setOpen(false);
    });
  }

  const set = (patch: Partial<ManufacturerInput>) => setDraft({ ...draft, ...patch });

  return (
    <span className="block">
      <span className="flex items-center gap-1.5">
        <SelectInput
          value={value ?? ""}
          disabled={!canEdit}
          aria-label={label}
          onChange={(e) => onSelect(e.target.value || null)}
          className="min-w-0 flex-1"
        >
          <option value="">Seçiniz…</option>
          {options.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}{p.is_active === false ? " (pasif)" : ""}
            </option>
          ))}
        </SelectInput>
        {canAdd && (
          <IconButton
            size="sm"
            onClick={openDialog}
            aria-label={`${label} ekle`}
            title={`Listede yoksa buradan ekleyin — Fihrist'e ve CRM'e kaydedilir`}
            className="shrink-0 text-brand hover:bg-surface-muted hover:text-brand-strong"
          >
            <Plus size={15} aria-hidden />
          </IconButton>
        )}
      </span>

      <Overlay
        open={open}
        onClose={() => setOpen(false)}
        title={`${label} ekle`}
        hint="Fihrist'e kaydedilir ve CRM › Outsource listesinde görünür. Yalnız isim zorunlu."
        /* Uzun form: boşluğa tıklayınca kapanıp yazılanların uçması
           istenmiyor (uygulamanın veri girilen tüm pencerelerinde aynı kural). */
        dismissOnBackdrop={false}
        size="md"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Vazgeç</Button>
            <Button size="sm" onClick={save} loading={busy} disabled={!draft.name.trim()}>
              Kaydet
            </Button>
          </div>
        }
      >
        {error && (
          <p role="alert" className="anim-fade-down mb-3 rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] font-medium text-danger">
            {error}
          </p>
        )}
        <FieldGrid>
          <Field label="İsim soyisim" required className="sm:col-span-2">
            <TextInput
              autoFocus
              value={draft.name}
              onChange={(e) => set({ name: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }}
              placeholder="Sabri Yılmaz"
            />
          </Field>
          {/* ROL SABİT DEĞİL AMA HAZIR GELİR: artıya hangi kutudan basıldıysa
              o rol seçili açılır. Yanlış kutudan girilen kaydı düzeltmek için
              yine de değiştirilebilir. */}
          <Field label="Rolü">
            <SelectInput
              value={draft.role ?? role}
              onChange={(e) => set({ role: e.target.value as ManufacturerRole })}
            >
              {(Object.keys(ROLE_LABEL) as ManufacturerRole[]).map((k) => (
                <option key={k} value={k}>{ROLE_LABEL[k]}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Telefon">
            <TextInput value={draft.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} placeholder="0532 000 00 00" inputMode="tel" />
          </Field>
          <Field label="E-posta">
            <TextInput value={draft.email ?? ""} onChange={(e) => set({ email: e.target.value })} placeholder="ad@firma.com" inputMode="email" />
          </Field>
          <Field label="İlgili kişi">
            <TextInput value={draft.contact_name ?? ""} onChange={(e) => set({ contact_name: e.target.value })} placeholder="Firma ise yetkilinin adı" />
          </Field>
          <Field label="Adres" className="sm:col-span-2">
            <TextInput value={draft.address ?? ""} onChange={(e) => set({ address: e.target.value })} placeholder="Mahalle, cadde, no" />
          </Field>
          <Field label="Şehir">
            <TextInput value={draft.city ?? ""} onChange={(e) => set({ city: e.target.value })} placeholder="İstanbul" />
          </Field>
          <Field label="Teslim süresi (gün)">
            <TextInput value={String(draft.lead_time_days ?? "")} onChange={(e) => set({ lead_time_days: e.target.value })} placeholder="30" inputMode="numeric" className="tabular-nums" />
          </Field>
          <Field label="Asgari adet">
            <TextInput value={String(draft.min_order_qty ?? "")} onChange={(e) => set({ min_order_qty: e.target.value })} placeholder="50" inputMode="numeric" className="tabular-nums" />
          </Field>
          <Field label="Para birimi">
            <TextInput value={draft.currency ?? "TL"} onChange={(e) => set({ currency: e.target.value })} placeholder="TL" />
          </Field>
          <Field label="Not" className="sm:col-span-2">
            <TextArea rows={2} value={draft.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} placeholder="Çalışma koşulları, ödeme vadesi…" />
          </Field>
        </FieldGrid>
        {/* Kartelalar burada DEĞİL: dosya yükleme penceresi açık bir formda
            yarım kalmış kayıt bırakma riski taşıyor. Kayıt açıldıktan sonra
            Fihrist'ten eklenir. */}
        <p className="mt-3 text-[12px] text-subtle">
          Kartela fotoğrafları kayıt açıldıktan sonra Fihrist&apos;ten eklenir.
        </p>
      </Overlay>
    </span>
  );
}
