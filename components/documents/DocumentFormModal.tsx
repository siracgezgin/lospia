"use client";

import { useState, useTransition } from "react";
import { AlertCircle } from "lucide-react";
import { createOperationDocument, updateOperationDocument } from "@/lib/actions/documents";
import { DOCUMENT_TYPES, OFFICE_STATUSES } from "@/lib/office/constants";
import { Overlay } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { Field, FieldGrid, SelectInput, TextArea, TextInput } from "@/components/ui/Field";
import type { OperationDocument, LinkDocumentType, WorkspaceDepartment } from "@/types";

interface Props {
  onClose: () => void;
  onSaved: () => void;
  departments: Pick<WorkspaceDepartment, "id" | "name">[];
  tasks: { id: string; title: string }[];
  contacts: { id: string; name: string }[];
  document?: OperationDocument | null;
  /** Yeni bağlantının açılacağı klasör (AF Teamwork kırıntı yolundaki yer). */
  folderId?: string | null;
  isAdmin: boolean;
  /** True when the caller may only view this record (approved, not owner). */
  readOnly?: boolean;
}

// Best-effort type guess from the pasted URL host.
function guessType(url: string): LinkDocumentType {
  const u = url.toLowerCase();
  if (u.includes("docs.google.com/spreadsheets")) return "google_sheet";
  if (u.includes("docs.google.com/document")) return "google_doc";
  if (u.includes("drive.google")) return "drive_link";
  if (u.includes("canva.")) return "canva";
  if (u.includes("figma.")) return "figma";
  if (u.endsWith(".pdf") || u.includes(".pdf?")) return "pdf_link";
  if (u.endsWith(".docx") || u.endsWith(".doc")) return "word_link";
  if (u.endsWith(".xlsx") || u.endsWith(".xls")) return "excel_link";
  if (u.startsWith("http")) return "website";
  return "other";
}

/**
 * BAĞLANTI FORMU — Drive, Canva, Figma… ya da dahili not.
 *
 * Alanlar ortak Field primitifleriyle çizilir (Overlay + Field): bu form bir
 * süre kendi input sınıfını taşıyordu ve yükseklik, köşe, odak halkası
 * uygulamanın geri kalanından ayrı düşmüştü. Sıra: önce adres — tür adresten
 * kendiliğinden tahmin edilir; kullanıcı Tür'ü eliyle değiştirirse tahmin
 * bir daha üstüne yazmaz.
 */
export function DocumentFormModal({
  onClose, onSaved, departments, tasks, contacts, document: doc, folderId = null,
  isAdmin, readOnly = false,
}: Props) {
  const isEdit = !!doc;
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  /* Hata hangi ALANA ait? Önceden yalnız hata metni tutuluyor ve "Başlık
     gerekli." dizesiyle karşılaştırılarak alan tahmin ediliyordu; adres
     hatası ise hiç yakalanmıyordu — kullanıcı "Ekle"ye basıyor, sunucudan
     dönen cümleyi formun en altında görüyordu. */
  const [errorField, setErrorField] = useState<"title" | "url" | null>(null);
  const [typeTouched, setTypeTouched] = useState(isEdit);

  const [form, setForm] = useState({
    title: doc?.title ?? "",
    description: doc?.description ?? "",
    document_type: (doc?.document_type ?? "other") as LinkDocumentType,
    url: doc?.url ?? "",
    status: doc?.status ?? "draft",
    department_id: doc?.department_id ?? "",
    related_task_id: doc?.related_task_id ?? "",
    related_contact_id: doc?.related_contact_id ?? "",
    tags: (doc?.tags ?? []).join(", "),
    notes: doc?.notes ?? "",
  });

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function handleUrlChange(v: string) {
    if (errorField === "url") { setErrorField(null); setError(null); }
    setForm((f) => ({
      ...f,
      url: v,
      document_type: typeTouched ? f.document_type : guessType(v),
    }));
  }

  // Members create drafts; only admins may set other statuses. The server
  // enforces the same rule — this just keeps the form honest.
  const statusOptions = isAdmin
    ? OFFICE_STATUSES
    : OFFICE_STATUSES.filter((s) => s.key === "draft" || s.key === "in_review");

  const titleMissing = errorField === "title";

  /** Adres ZORUNLU mu? Yalnız "Dahili not" ve "Diğer" adressiz durabilir —
   *  gerisi bir yere GİTMEK için var. Adressiz bir "Drive klasörü" kaydı
   *  ızgarada tıklanınca hiçbir şey yapmayan bir satır olarak duruyordu. */
  const urlRequired = form.document_type !== "internal_note" && form.document_type !== "other";

  function fail(field: "title" | "url", message: string) {
    setErrorField(field);
    setError(message);
  }

  function handleSave() {
    if (readOnly) return onClose();
    setError(null);
    setErrorField(null);
    if (!form.title.trim()) return fail("title", "Başlık gerekli.");
    const url = form.url.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      return fail("url", "Adres https:// ya da http:// ile başlamalı.");
    }
    if (!url && urlRequired) {
      return fail("url", 'Bu tür için bir adres gerekli. Adressiz bir kayıt için türü "Dahili not" seçin.');
    }
    const payload = {
      title: form.title,
      description: form.description,
      document_type: form.document_type,
      url: form.url,
      status: form.status as "draft" | "in_review" | "approved" | "archived",
      department_id: form.department_id,
      related_task_id: form.related_task_id,
      related_contact_id: form.related_contact_id,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      notes: form.notes,
      // Düzenlemede kayıt kendi klasöründe kalır; yeni kayıt açık klasöre düşer.
      folder_id: isEdit ? (doc?.folder_id ?? null) : (folderId ?? null),
    };
    startTransition(async () => {
      const result = isEdit
        ? await updateOperationDocument(doc!.id, payload)
        : await createOperationDocument(payload);
      if ("error" in result) { setErrorField(null); return setError(result.error); }
      onSaved();
    });
  }

  return (
    <Overlay
      open
      onClose={onClose}
      title={readOnly ? "Bağlantı detayı" : isEdit ? "Bağlantıyı düzenle" : "Bağlantı ekle"}
      size="md"
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isPending}>
            {readOnly ? "Kapat" : "Vazgeç"}
          </Button>
          {!readOnly && (
            <Button size="sm" onClick={handleSave} loading={isPending}>
              {isEdit ? "Kaydet" : "Ekle"}
            </Button>
          )}
        </>
      }
    >
      <form
        className="space-y-3.5"
        onSubmit={(e) => { e.preventDefault(); handleSave(); }}
      >
        <Field label="Başlık" required error={titleMissing ? error : null}>
          <TextInput
            value={form.title}
            onChange={(e) => {
              if (errorField === "title") { setErrorField(null); setError(null); }
              set("title", e.target.value);
            }}
            autoFocus={!readOnly}
            disabled={readOnly}
            invalid={titleMissing}
          />
        </Field>

        <Field
          label="Bağlantı (URL)"
          required={urlRequired}
          hint={urlRequired ? "Türü adresten kendiliğinden tahmin edilir." : "Dahili not için boş bırakılabilir."}
          error={errorField === "url" ? error : null}
        >
          <TextInput
            value={form.url}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder="https://…"
            inputMode="url"
            disabled={readOnly}
            invalid={errorField === "url"}
            className="truncate"
          />
        </Field>

        <FieldGrid>
          <Field label="Tür">
            <SelectInput
              value={form.document_type}
              onChange={(e) => { setTypeTouched(true); set("document_type", e.target.value); }}
              disabled={readOnly}
            >
              {DOCUMENT_TYPES.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Durum">
            <SelectInput value={form.status} onChange={(e) => set("status", e.target.value)} disabled={readOnly}>
              {statusOptions.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </SelectInput>
          </Field>
        </FieldGrid>

        <Field label="Açıklama">
          <TextArea
            rows={2}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            disabled={readOnly}
          />
        </Field>

        <Field label="Departman">
          <SelectInput value={form.department_id} onChange={(e) => set("department_id", e.target.value)} disabled={readOnly}>
            <option value="">Seçiniz</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </SelectInput>
        </Field>

        <FieldGrid>
          <Field label="İlgili görev">
            <SelectInput value={form.related_task_id} onChange={(e) => set("related_task_id", e.target.value)} disabled={readOnly}>
              <option value="">Seçiniz</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="İlgili kişi">
            <SelectInput value={form.related_contact_id} onChange={(e) => set("related_contact_id", e.target.value)} disabled={readOnly}>
              <option value="">Seçiniz</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </SelectInput>
          </Field>
        </FieldGrid>

        <Field label="Etiketler" hint="Virgülle ayırın: fiyat listesi, 2026 koleksiyon">
          <TextInput
            value={form.tags}
            onChange={(e) => set("tags", e.target.value)}
            disabled={readOnly}
          />
        </Field>

        <Field label="Notlar">
          <TextArea
            rows={3}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            disabled={readOnly}
          />
        </Field>

        {error && !errorField && (
          <div role="alert" className="anim-fade-down flex items-start gap-2 rounded-control border border-danger/30 bg-danger/10 px-3 py-2.5 text-[12.5px] leading-relaxed text-danger">
            <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden />
            <span className="min-w-0 break-words">{error}</span>
          </div>
        )}
      </form>
    </Overlay>
  );
}
