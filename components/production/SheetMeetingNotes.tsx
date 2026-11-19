"use client";

import { useState, useTransition } from "react";
import { Loader2, Send, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { removeSheetNotesPhoto, updateSheetMeetingNotes, type SheetMeetingNotesPatch } from "@/lib/actions/production";
import { sendSheetMeetingNotes } from "@/lib/actions/production-notes-email";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/Field";
import { MemberMultiSelect, type Member } from "@/components/planning/MemberMultiSelect";
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
  sheetId, workspaceId, initial, canEdit, members = [],
}: {
  sheetId: string | null;
  workspaceId: string | null;
  initial: Notes;
  canEdit: boolean;
  /** Çalışma alanı üyeleri — notların e-postayla gönderileceği kişiler. */
  members?: Member[];
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
        {/* Sekmenin adı zaten "Toplantı notları" — kutu ikinci kez demesin. */}
        <MeetingNotes
          title="Notlar"
          notes={notes.meeting_notes ?? []}
          disabled={!canEdit}
          onChange={(next: OrderReviewNote[]) => save({ meeting_notes: next })}
        />
      </div>

      {/* Kayıt sürerken gönderilmez: giden posta DİSKTEKİ notlardır. */}
      <SendNotes sheetId={id} members={members} busy={pending > 0} />

      <Overlay open={!!lightbox} onClose={() => setLightbox(null)} size="lg" floatingClose>
        {lightbox && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={lightbox} alt="" className="mx-auto max-h-[78dvh] w-auto rounded-card bg-white object-contain" />
        )}
      </Overlay>
    </div>
  );
}

/**
 * NOTLARI E-POSTAYLA GÖNDER (8.11.2026 toplantısı).
 *
 * Kişi panelden seçilir (adresi kimlikten çözülür), panelde olmayan biri için
 * adres elle yazılır — AF Teamwork'teki "Paylaş" ile aynı iki kaynak, aynı
 * seçici. Giden posta notların kendisini ve föyün bağlantısını taşır
 * (lib/production/meeting-notes-email.ts). Notların ALTINDA durur: önce yazılır,
 * sonra gönderilir.
 */
function SendNotes({ sheetId, members, busy }: { sheetId: string; members: Member[]; busy: boolean }) {
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [sending, startSend] = useTransition();

  /* Virgül, noktalı virgül, boşluk ve Enter ayırıcıdır — yapıştırılan liste
     tek tek ayıklanmak zorunda kalmasın. */
  const split = (raw: string) => raw.split(/[,;\s]+/).map((p) => p.trim()).filter(Boolean);
  const commitDraft = (raw: string) => {
    const parts = split(raw);
    if (!parts.length) return;
    setEmails((prev) => [...new Set([...prev, ...parts])]);
    setDraft("");
    setError(null);
  };

  function send() {
    /* Kutuda yazılı kalmış adres de gider. */
    const all = [...new Set([...emails, ...split(draft)])];
    if (!all.length && !pickedIds.length) { setError("Kişi seçin ya da e-posta adresi yazın."); return; }
    setError(null);
    setResult(null);
    startSend(async () => {
      const res = await sendSheetMeetingNotes(sheetId, { memberIds: pickedIds, recipients: all })
        .catch(() => ({ error: "Gönderilemedi: bağlantı kurulamadı." }));
      if ("error" in res) { setError(res.error); return; }
      setEmails(all);
      setDraft("");
      const parts: string[] = [];
      if (res.sent.length) parts.push(`Gönderildi: ${res.sent.join(", ")}`);
      if (res.failed.length) parts.push(`Gönderilemedi: ${res.failed.map((f) => `${f.to} (${f.reason})`).join(" · ")}`);
      setResult(parts.join(" — "));
    });
  }

  return (
    <div className="rounded-card border border-line p-3">
      <FieldLabel>E-postayla gönder</FieldLabel>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-56">
          <MemberMultiSelect members={members} selected={pickedIds} onChange={setPickedIds} placeholder="Kişi seç" />
        </div>
        <TextInput
          type="email"
          inputMode="email"
          aria-label="E-posta adresi"
          placeholder="E-posta adresi"
          value={draft}
          disabled={sending}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "," || e.key === ";") { e.preventDefault(); commitDraft(draft); }
          }}
          onBlur={() => commitDraft(draft)}
          className="min-w-0 flex-1 basis-52"
        />
        <Button size="sm" onClick={send} loading={sending} disabled={busy} className="shrink-0">
          {!sending && <Send size={13} aria-hidden />} Gönder
        </Button>
      </div>

      {emails.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {emails.map((e) => (
            <span key={e} className="inline-flex items-center gap-1 rounded-control bg-brand-soft px-2 py-1 text-[12.5px] font-medium text-brand-strong">
              {e}
              <button
                type="button"
                onClick={() => setEmails((prev) => prev.filter((x) => x !== e))}
                disabled={sending}
                aria-label={`${e} adresini çıkar`}
                className="tap-target rounded text-brand-strong/70 transition-colors duration-150 hover:text-brand-strong"
              >
                <X size={12} aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] font-medium text-danger">{error}</p>
      )}
      {result && !error && (
        <p role="status" className="mt-2 break-words text-[13px] font-medium text-ink">{result}</p>
      )}
    </div>
  );
}
