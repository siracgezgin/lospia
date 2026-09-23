"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { quickAddManufacturer } from "@/lib/actions/manufacturers";
import { Button, IconButton } from "@/components/ui/Button";
import { SelectInput, TextInput } from "@/components/ui/Field";
import type { ManufacturerRole } from "@/types";

/**
 * Fihrist seçicisi — SEÇ ya da ORADA AÇ.
 *
 * Sıraç (23.09.2026): "Nakışçı, üretici nereden nasıl ekleniyor? Onları direkt
 * o sekmede ekle butonuna basıp ekleyebilelim, sonra onlar CRM'e kaydedilsin.
 * Aradaki ilişki entegrasyonu iyi kur."
 *
 * Eskiden föyü dolduran kişi listede olmayan ustayı seçemiyordu: Fihrist'e
 * gidip kaydı açmak ve föye dönmek gerekiyordu — arada yazılanlar da
 * kayboluyordu. Artık kutunun yanındaki artı, satırın altında iki alanlık bir
 * kayıt açar (ad + telefon), kaydı fihriste yazar ve seçili hâle getirir.
 *
 * AÇILAN KAYIT TEK YERE DÜŞER: `workspace_manufacturers`. Fihrist sayfası,
 * Ödeme Tablosu, Sourcing ve CRM'in "Fihrist" bölümü hepsi aynı satırı okur —
 * ikinci bir kopya oluşmaz, aralarında ayrışma olmaz.
 */
export interface PickerPerson {
  id: string;
  name: string;
  is_active?: boolean | null;
  role?: ManufacturerRole | null;
}

export function ManufacturerPicker({
  value,
  role,
  people,
  canEdit,
  label,
  onSelect,
  onCreated,
}: {
  value: string | null;
  /** Bu kutunun iş kolu — açılan yeni kayıt bu rolle doğar. */
  role: ManufacturerRole;
  people: PickerPerson[];
  canEdit: boolean;
  /** Erişilebilirlik metni: "Üretici", "Kalıpçı", "Nakışçı". */
  label: string;
  onSelect: (_id: string | null) => void;
  /** Yeni kayıt açıldı — föy listesine eklenmesi için. */
  onCreated: (_p: PickerPerson) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  /* Rolü GİRİLMEMİŞ eski kayıtlar her listede görünür: 20240353 öncesinde
     açılmış ustalar bir gecede kaybolmuş gibi olmamalı. */
  const options = people.filter((p) => !p.role || p.role === role || p.role === "diger");

  function close() {
    setAdding(false);
    setName("");
    setPhone("");
    setError(null);
  }

  function create() {
    const clean = name.trim();
    if (!clean) return;
    setError(null);
    start(async () => {
      const res = await quickAddManufacturer({ name: clean, role, phone: phone.trim() });
      if ("error" in res) { setError(res.error); return; }
      onCreated({ id: res.id, name: res.name, role: res.role, is_active: true });
      onSelect(res.id);
      close();
    });
  }

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
        {canEdit && !adding && (
          <IconButton
            size="sm"
            onClick={() => setAdding(true)}
            aria-label={`${label} ekle`}
            title={`Listede yoksa buradan ekleyin — fihriste kaydedilir`}
            className="shrink-0 text-brand hover:bg-surface-muted hover:text-brand-strong"
          >
            <Plus size={15} aria-hidden />
          </IconButton>
        )}
      </span>

      {adding && (
        <span className="anim-fade-down mt-1.5 block rounded-card border border-line bg-surface-muted/50 p-2">
          <span className="flex flex-wrap items-center gap-1.5">
            <TextInput
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); create(); }
                if (e.key === "Escape") close();
              }}
              placeholder={`${label} adı`}
              aria-label={`Yeni ${label.toLowerCase()} adı`}
              className="h-8 min-w-[130px] flex-1 basis-[130px] text-[13px]"
            />
            {/* TELEFON BURADA: Aslı Hanım'ın fihrist tarifinde ad ile telefon
                yan yana geçiyor ("Emin Bey telefonu, adı"). Adres, e-posta ve
                kartela gibi geri kalanı Fihrist sayfasında doldurulur —
                föyün ortasında tam bir kayıt formu açmak akışı keserdi. */}
            <TextInput
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); create(); }
                if (e.key === "Escape") close();
              }}
              placeholder="Telefon"
              aria-label="Telefon"
              inputMode="tel"
              className="h-8 w-[130px] shrink-0 text-[13px]"
            />
            <Button size="sm" variant="secondary" onClick={create} loading={busy} disabled={!name.trim()}>
              Ekle
            </Button>
            <IconButton size="sm" onClick={close} aria-label="Vazgeç" title="Vazgeç" className="shrink-0">
              <X size={14} aria-hidden />
            </IconButton>
          </span>
          {error ? (
            <span role="alert" className="mt-1 block text-[12px] font-medium text-danger">{error}</span>
          ) : (
            <span className="mt-1 block text-[11.5px] text-subtle">
              Fihriste kaydedilir; adres, e-posta ve kartelalar oradan eklenir.
            </span>
          )}
        </span>
      )}
    </span>
  );
}
