"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { removeSheetNotesPhoto, updateSheetMeetingNotes, type SheetMeetingNotesPatch } from "@/lib/actions/production";
import { DECISIONS } from "@/lib/order-review/model";
import { sheetNotesPrefix } from "@/lib/production/meeting-notes";
import { SelectInput } from "@/components/ui/Field";
import { Overlay } from "@/components/ui/Overlay";
import { AutoText, FieldLabel, MeetingNotes, PhotoField } from "@/components/shared/CardFields";
import type { OrderReviewDecision, OrderReviewNote, OrderReviewPhoto, ProductionSheet } from "@/types";

/**
 * FÖYÜN "TOPLANTI NOTLARI" SEKMESİ.
 *
 * Aslı Hanım (06.11.2026): "Order review'u bu şeyin içine sokacaksın… beyaz
 * t-shirt'ün içine koyacaksın." · "Toplantı notları olarak çevir." Order
 * Review ayrı bir modüldü; ürünün değerlendirmesi artık ürünün kendi
 * föyünde. Satırdan buraya dört şey geldi — karar, kritik, imalatçı numunesi,
 * Aslı Hanım'ın tarihli notları. Kumaş, renk, adet ve fiyat föyün kendi
 * sekmelerinde zaten var; ikinci kez sorulmaz ("tekrar eden şeyler benim
 * istemediğim şey").
 *
 * FÖYÜN "KAYDET"İNDEN BAĞIMSIZ: toplantıda yazılan not alan alan, çıkınca
 * kaydolur (updateSheetMeetingNotes). Föyde kaydedilmemiş başka bir değişikliği
 * beklemez, açık kalmış eski bir sekmenin föy kaydı da notu ezmez.
 */

type Notes = Pick<ProductionSheet, "meeting_notes" | "review_critique" | "review_decision" | "review_sample_photos">;

const BUCKET = "production-sheets";

export function SheetMeetingNotes({
  sheetId, workspaceId, initial, canEdit,
}: {
  sheetId: string | null;
  workspaceId: string | null;
  initial: Notes;
  canEdit: boolean;
}) {
  const [notes, setNotes] = useState<Notes>(initial);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  if (!sheetId || !workspaceId) {
    return (
      <p className="rounded-card border border-dashed border-line-strong px-4 py-6 text-center text-[13.5px] text-muted">
        Föyü bir kez kaydettikten sonra toplantı notu eklenebilir.
      </p>
    );
  }
  const id = sheetId;
  const prefix = sheetNotesPrefix(workspaceId, sheetId);

  async function save(patch: SheetMeetingNotesPatch) {
    setNotes((n) => ({ ...n, ...patch } as Notes));
    setError(null);
    setPending((n) => n + 1);
    try {
      const res = await updateSheetMeetingNotes(id, patch);
      if ("error" in res) { setError(`Kaydedilemedi: ${res.error}`); return; }
      setNotes(res.sheet);
    } catch (e) {
      setError(`Kaydedilemedi: ${e instanceof Error ? e.message : "bağlantı kurulamadı"}`);
    } finally {
      setPending((n) => n - 1);
    }
  }

  const decision = notes.review_decision ?? "degerlendirmede";
  const tone = DECISIONS.find((d) => d.key === decision)?.tone ?? "";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">
          <span className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-muted">Karar</span>
          <SelectInput
            aria-label="Karar / durum"
            value={decision}
            disabled={!canEdit}
            onChange={(e) => save({ review_decision: e.target.value as OrderReviewDecision })}
            className={cn("h-9 w-auto rounded-full border-transparent font-semibold", tone)}
          >
            {DECISIONS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </SelectInput>
        </label>
        {pending > 0 && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[12.5px] text-muted" role="status">
            <Loader2 size={13} className="animate-spin" aria-hidden /> Kaydediliyor…
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[13.5px] font-medium text-danger">
          {error}
        </p>
      )}

      {/* Order Review kartının düzeni: numune solda, kritik ortada, notlar
          sağda; ekran daraldıkça alt alta. */}
      <div className="grid gap-4 md:grid-cols-[minmax(0,200px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,220px)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="max-md:max-w-[12rem] md:row-span-2 md:self-start xl:row-span-1">
          <PhotoField
            label="İmalatçı numunesi"
            photos={notes.review_sample_photos ?? []}
            bucket={BUCKET}
            prefix={prefix}
            disabled={!canEdit}
            onOpen={setLightbox}
            onChange={async (next: OrderReviewPhoto[], removed?: OrderReviewPhoto) => {
              await save({ review_sample_photos: next });
              if (removed) await removeSheetNotesPhoto(id, removed.path);
            }}
          />
        </div>
        <label className="block min-w-0">
          <FieldLabel>Ürün kritikleri / deneme notları</FieldLabel>
          <AutoText
            label="Ürün kritikleri"
            value={notes.review_critique ?? ""}
            minRows={6}
            readOnly={!canEdit}
            onCommit={(v) => save({ review_critique: v })}
          />
        </label>
        <MeetingNotes
          notes={notes.meeting_notes ?? []}
          disabled={!canEdit}
          onChange={(next: OrderReviewNote[]) => save({ meeting_notes: next })}
        />
      </div>

      <Overlay open={!!lightbox} onClose={() => setLightbox(null)} size="lg" floatingClose>
        {lightbox && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={lightbox} alt="" className="mx-auto max-h-[78dvh] w-auto rounded-card bg-white object-contain" />
        )}
      </Overlay>
    </div>
  );
}
