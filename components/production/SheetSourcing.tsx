"use client";

import { useRef, useState } from "react";
import { Check, ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button, IconButton } from "@/components/ui/Button";
import { TextInput, SelectInput } from "@/components/ui/Field";
import { compressImage } from "@/lib/utils/compress-image";
import { uploadProductionSheetImage } from "@/lib/actions/production";
import type { SourcingEntry, SourcingKind, Supplier } from "@/types";

/**
 * SOURCING — föyün "nereden geliyor" defteri.
 *
 * Aslı Hanım (18.09.2026, sesli): "Selen Hanım kumaşı source olarak seçerse,
 * nakış olarak nakışçıyı seçerse, üretici olarak Sabri Bey'i seçerse biz
 * aşağıda görürüz hangi üretici, nereden kumaş geliyor."
 *
 * ÇÖZDÜĞÜ SOMUT SORUN, kendi cümlesiyle: "Bu kumaş için dört tane ayrı yerden
 * kumaş önerisi geliyor. Ama biz karıştık, çünkü nereden ne geldiğini
 * bilmiyoruz." Bu yüzden bir kaleme BİRDEN ÇOK satır girilir ve içlerinden
 * biri "üretime giden" diye işaretlenir — liste hem önerileri saklar hem
 * kararı gösterir.
 *
 * "Çok da karmaşık yapmadan lütfen bu şekilde ilerletelim burayı": satır
 * başına dört alan (firma, kontak, not, fotoğraf) ve bir seçim işareti. Fiyat
 * burada sorulmaz — maliyet kendi sekmesinde.
 */

const KIND_LABEL: Record<SourcingKind, string> = {
  kumas_numune: "Kumaş — Numune",
  kumas_uretim: "Kumaş — Üretim",
  astar: "Astar",
  dikim: "Dikim",
  nakis: "Nakış",
  el_isciligi: "El İşçiliği",
  dugme: "Düğme",
  aksesuar: "Aksesuar",
  fermuar: "Fermuar",
  etiket: "Etiket",
  diger: "Diğer",
};

/** Ekranda bu sırayla gruplanır — Aslı Hanım'ın saydığı sıra. */
const KIND_ORDER: SourcingKind[] = [
  "kumas_numune", "kumas_uretim", "astar", "dikim", "nakis",
  "el_isciligi", "dugme", "aksesuar", "fermuar", "etiket", "diger",
];

function newId(): string {
  return `src_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function SheetSourcing({
  sheetId,
  rows,
  suppliers,
  canEdit,
  onChange,
}: {
  sheetId: string;
  rows: SourcingEntry[];
  /* Liste iki kaynaktan geliyor: fihrist (kumaşçı · aksesuarcı · nakışçı,
     20240355) ve eski `workspace_suppliers` kayıtları. Ortak alanlar kadarı
     isteniyor; iletişim bilgisi seçilince "İletişim" kutusunu doldurur. */
  suppliers: (Pick<Supplier, "id" | "name">
    & Partial<Pick<Supplier, "contact_name" | "phone" | "email">>)[];
  canEdit: boolean;
  onChange: (_next: SourcingEntry[]) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileFor = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const patch = (id: string, p: Partial<SourcingEntry>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));

  const add = (kind: SourcingKind) =>
    onChange([...rows, { id: newId(), kind, supplier_name: "" }]);

  const remove = (id: string) => onChange(rows.filter((r) => r.id !== id));

  /** Seçim KALEM İÇİNDE tektir: yeni seçilen, aynı türdeki ötekini bırakır. */
  const choose = (row: SourcingEntry) =>
    onChange(rows.map((r) =>
      r.kind !== row.kind ? r : { ...r, chosen: r.id === row.id ? !row.chosen : false },
    ));

  async function handleFile(file: File | undefined) {
    const id = fileFor.current;
    if (!file || !id) return;
    setError(null);
    setBusyId(id);
    try {
      let toUpload: File = file;
      try {
        toUpload = await compressImage(file, { maxDim: 1600, quality: 0.72 });
      } catch { /* sıkıştırma başarısızsa orijinali gönder */ }
      const fd = new FormData();
      fd.append("file", toUpload);
      const up = await uploadProductionSheetImage(sheetId, fd);
      if ("error" in up) { setError(up.error); return; }
      patch(id, { photo: { url: up.url, path: up.path } });
    } catch {
      setError("Görsel yüklenemedi. Tekrar deneyin.");
    } finally {
      setBusyId(null);
      fileFor.current = null;
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  /* Boş kalemler de BAŞLIK olarak çizilir: föyü açan neyin sorulduğunu
     listeden okur, "acaba nakış da mı girilecekti?" diye düşünmez. */
  const used = new Set(rows.map((r) => r.kind));
  const visible = KIND_ORDER.filter((k) => used.has(k) || k !== "diger");

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">
          {error}
        </p>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />

      {visible.map((kind) => {
        const mine = rows.filter((r) => r.kind === kind);
        return (
          <section key={kind} className="rounded-card border border-line">
            <header className="flex items-center justify-between gap-2 border-b border-hairline bg-surface-muted/60 px-3 py-1.5">
              <span className="text-[12.5px] font-semibold text-ink">{KIND_LABEL[kind]}</span>
              {canEdit && (
                <Button variant="ghost" size="sm" onClick={() => add(kind)} className="-mr-2 text-brand hover:text-brand-strong">
                  <Plus size={13} aria-hidden /> Kaynak ekle
                </Button>
              )}
            </header>

            {mine.length === 0 ? (
              <p className="px-3 py-2 text-[12px] text-subtle">Henüz kaynak girilmedi.</p>
            ) : (
              <ul className="divide-y divide-hairline">
                {mine.map((r) => (
                  <li key={r.id} className={cn("px-3 py-2", r.chosen && "bg-success/8")}>
                    <div className="flex flex-wrap items-start gap-2">
                      {/* ÜRETİME GİDEN. "Numuneye beş ayrı kaynaktan kumaş
                          gelebilir ama üretime bir tanesiyle gitmemiz
                          gerekiyor." */}
                      <IconButton
                        size="sm"
                        aria-label={r.chosen ? "Seçimi kaldır" : "Üretime bununla gidilecek"}
                        aria-pressed={!!r.chosen}
                        title={r.chosen ? "Üretime bununla gidiliyor" : "Üretime bununla gidilecek"}
                        onClick={() => canEdit && choose(r)}
                        disabled={!canEdit}
                        className={cn("mt-1 shrink-0", r.chosen ? "text-success" : "hover:text-success")}
                      >
                        <Check size={15} />
                      </IconButton>

                      <span className="flex min-w-0 flex-1 flex-wrap gap-2">
                        {/* Kayıtlı firma varsa listeden, yoksa elle yazılır. */}
                        {suppliers.length > 0 && (
                          <SelectInput
                            value={r.supplier_id ?? ""}
                            disabled={!canEdit}
                            aria-label="Kayıtlı firma"
                            className="min-w-[150px] flex-1 basis-[150px]"
                            onChange={(e) => {
                              const id = e.target.value || null;
                              const sup = suppliers.find((x) => x.id === id);
                              patch(r.id, {
                                supplier_id: id,
                                supplier_name: sup?.name ?? r.supplier_name,
                                contact: sup
                                  ? [sup.contact_name, sup.phone, sup.email].filter(Boolean).join(" · ")
                                  : r.contact,
                              });
                            }}
                          >
                            <option value="">Kayıtlı firma seç…</option>
                            {suppliers.map((sup) => (
                              <option key={sup.id} value={sup.id}>{sup.name}</option>
                            ))}
                          </SelectInput>
                        )}
                        <TextInput
                          value={r.supplier_name}
                          disabled={!canEdit}
                          onChange={(e) => patch(r.id, { supplier_name: e.target.value })}
                          placeholder="Firma adı"
                          aria-label="Firma adı"
                          className="min-w-[130px] flex-1 basis-[130px]"
                        />
                        <TextInput
                          value={r.contact ?? ""}
                          disabled={!canEdit}
                          onChange={(e) => patch(r.id, { contact: e.target.value })}
                          placeholder="Kontak — kişi, telefon"
                          aria-label="Kontak bilgisi"
                          className="min-w-[150px] flex-1 basis-[150px]"
                        />
                        <TextInput
                          value={r.note ?? ""}
                          disabled={!canEdit}
                          onChange={(e) => patch(r.id, { note: e.target.value })}
                          placeholder="Kartela ölçüsü, kompozisyon, not"
                          aria-label="Not"
                          className="min-w-0 flex-1 basis-full"
                        />
                      </span>

                      <span className="flex shrink-0 items-center gap-1">
                        {/* KARTELA FOTOĞRAFI. "Kartelasını girecek, mesela
                            fotoğrafını girecek, kartelanın ölçüleri girecek." */}
                        {r.photo ? (
                          <span className="relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={r.photo.url} alt="" className="size-12 rounded-control border border-line object-cover" />
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => patch(r.id, { photo: null })}
                                aria-label="Fotoğrafı kaldır"
                                className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border border-line bg-surface text-subtle shadow-card hover:text-danger"
                              >
                                <X size={11} aria-hidden />
                              </button>
                            )}
                          </span>
                        ) : canEdit ? (
                          <button
                            type="button"
                            onClick={() => { fileFor.current = r.id; fileInput.current?.click(); }}
                            disabled={busyId === r.id}
                            title="Kartela fotoğrafı ekle"
                            aria-label="Kartela fotoğrafı ekle"
                            className="grid size-12 place-items-center rounded-control border-2 border-dashed border-line text-subtle transition-colors duration-150 hover:border-line-strong hover:text-muted disabled:pointer-events-none"
                          >
                            {busyId === r.id ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
                          </button>
                        ) : null}
                        {canEdit && (
                          <IconButton size="sm" aria-label="Kaynağı sil" title="Kaynağı sil" onClick={() => remove(r.id)} className="hover:text-danger">
                            <Trash2 size={13} />
                          </IconButton>
                        )}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
