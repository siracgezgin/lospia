"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { tr } from "date-fns/locale";
import { Wallet, Plus, Pencil, Trash2, Loader2, Clock3, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useConfirm } from "@/components/ui/useConfirm";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { Button, IconButton } from "@/components/ui/Button";
import { Overlay } from "@/components/ui/Overlay";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, FieldGrid, SelectInput, TextArea, TextInput } from "@/components/ui/Field";
import { savePayment, setPaymentStatus, deletePayment, type PaymentInput } from "@/lib/actions/finance";
import type { FinancePayment } from "@/types";

interface Props {
  payments: FinancePayment[];
}

type Draft = {
  id?: string | null;
  title: string;
  payee: string;
  amount: string;      // form alanı — action'a number gider
  currency: string;
  status: "bekliyor" | "odendi";
  due_date: string;    // "yyyy-MM-dd" | ""
  category: string;
  notes: string;
};

const EMPTY: Draft = {
  title: "", payee: "", amount: "", currency: "TRY",
  status: "bekliyor", due_date: "", category: "", notes: "",
};

function fmtAmount(amount: number | null, currency: string) {
  if (amount == null) return "—";
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency", currency: currency || "TRY", maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString("tr-TR")} ${currency}`;
  }
}

/**
 * FINANCE — ödeme takibi (yalnız yönetici).
 *
 * Bir DEFTERDİR, gösterge paneli değil: satır = kime, ne kadar, ne zaman,
 * ödendi mi. Sayılar sağa yaslı ve hizalı; "Bekleyen / Ödenen" toplamları
 * tablonun üstünde TEK SATIRDA yazar — önce iki ikonlu karo idi (amber /
 * yeşil kutular), bankacılık paneli gibi duruyordu ve iki toplam için dört
 * sütunluk bir ızgara açıyordu.
 *
 * Ekle/düzenle formu artık ortak Overlay'de (CRM formuyla aynı dil): önce
 * tablonun üstüne açılan bir panelde sekiz ham input vardı, Kaydet sayfanın
 * ortasında kalıyordu.
 */
export function FinanceView({ payments }: Props) {
  const { ask, dialog } = useConfirm();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  // Özet: bekleyen / ödenen toplamları (para birimine göre).
  const totals = useMemo(() => {
    const sum = (status: "bekliyor" | "odendi") => {
      const byCur = new Map<string, number>();
      for (const p of payments) {
        if (p.status !== status || p.amount == null) continue;
        byCur.set(p.currency, (byCur.get(p.currency) ?? 0) + Number(p.amount));
      }
      return [...byCur.entries()].map(([cur, v]) => fmtAmount(v, cur)).join(" + ") || "—";
    };
    return { pending: sum("bekliyor"), paid: sum("odendi") };
  }, [payments]);

  const openNew = () => { setError(null); setTitleError(null); setAmountError(null); setDraft({ ...EMPTY }); };
  const openEdit = (p: FinancePayment) => {
    setError(null); setTitleError(null); setAmountError(null);
    setDraft({
      id: p.id, title: p.title, payee: p.payee ?? "", amount: p.amount != null ? String(p.amount) : "",
      currency: p.currency, status: p.status, due_date: p.due_date ?? "",
      category: p.category ?? "", notes: p.notes ?? "",
    });
  };
  const closeDraft = () => { setDraft(null); setTitleError(null); setAmountError(null); };

  function handleSave() {
    if (!draft) return;
    setError(null);
    // Alan hataları alanın altında — genel kutu yalnız sunucu hatası için.
    if (!draft.title.trim()) { setTitleError("Başlık gerekli."); return; }
    setTitleError(null);
    const amountNum = draft.amount.trim() === "" ? null : Number(draft.amount.replace(",", "."));
    if (amountNum != null && Number.isNaN(amountNum)) { setAmountError("Tutar sayı olmalı (ör. 1250,50)."); return; }
    setAmountError(null);
    const payload: PaymentInput = {
      id: draft.id ?? undefined,
      title: draft.title,
      payee: draft.payee || null,
      amount: amountNum,
      currency: draft.currency || "TRY",
      status: draft.status,
      due_date: draft.due_date || null,
      category: draft.category || null,
      notes: draft.notes || null,
    };
    startSave(async () => {
      const res = await savePayment(payload);
      if ("error" in res) { setError(res.error); return; }
      setDraft(null);
      router.refresh();
    });
  }

  function handleToggle(p: FinancePayment) {
    setBusyId(p.id);
    startSave(async () => {
      const res = await setPaymentStatus(p.id, p.status === "odendi" ? "bekliyor" : "odendi");
      setBusyId(null);
      if ("error" in res) { setError(res.error); return; }
      router.refresh();
    });
  }

  async function handleDelete(p: FinancePayment) {
    if (!(await ask({
      title: "Ödeme kaydı silinsin mi?",
      message: `"${p.title}" kalıcı olarak silinir.`,
    }))) return;
    setBusyId(p.id);
    startSave(async () => {
      const res = await deletePayment(p.id);
      setBusyId(null);
      if ("error" in res) { setError(res.error); return; }
      router.refresh();
    });
  }

  const errorBox = error && (
    <div
      role="alert"
      className="anim-fade-down flex items-start gap-2 rounded-control border border-danger/25 bg-danger/8 px-3 py-2.5 text-[13px] leading-relaxed text-danger"
    >
      <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden />
      <span className="min-w-0 break-words">{error}</span>
    </div>
  );

  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      <ModulePageHeader
        title="Finance"
        rightSlot={
          <Button onClick={openNew}>
            <Plus size={15} aria-hidden /> Yeni ödeme
          </Button>
        }
      />

      {/* Toplamlar — tek satır, hizalı rakam. Defteri TARİF eder (ne kadar
          bekliyor, ne kadar ödendi); kimseyi puanlamaz. */}
      <dl className="mb-3 flex flex-wrap items-baseline gap-x-6 gap-y-1 px-1 text-[13px]">
        <div className="flex items-baseline gap-2">
          <dt className="text-muted">Bekleyen</dt>
          <dd className="font-semibold tabular-nums text-ink">{totals.pending}</dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="text-muted">Ödenen</dt>
          <dd className="font-semibold tabular-nums text-ink">{totals.paid}</dd>
        </div>
      </dl>

      {/* Sunucu hatası (durum değiştirme / silme) — form kapalıyken burada. */}
      {!draft && errorBox && <div className="mb-3">{errorBox}</div>}

      {/* Liste — gerçek tablo: metin sola, para ve tarih sağa. */}
      <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-card">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-muted text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle">
              <th className="px-4 py-2.5 font-semibold">Başlık</th>
              <th className="px-4 py-2.5 font-semibold">Kime</th>
              <th className="px-4 py-2.5 text-right font-semibold">Tutar</th>
              <th className="px-4 py-2.5 text-right font-semibold">Vade</th>
              <th className="px-4 py-2.5 font-semibold">Durum</th>
              <th className="px-4 py-2.5 text-right font-semibold"><span className="sr-only">İşlem</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {payments.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    compact
                    icon={Wallet}
                    title="Henüz ödeme kaydı yok."
                    description="İlk kaydı “Yeni ödeme” ile açın."
                  />
                </td>
              </tr>
            )}
            {payments.map((p) => {
              const busy = isSaving && busyId === p.id;
              const paid = p.status === "odendi";
              return (
                <tr key={p.id} className="transition-colors duration-150 hover:bg-surface-hover">
                  <td className="px-4 py-2.5 align-top">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-[13.5px] font-medium text-ink">{p.title}</span>
                      {p.category && (
                        <span className="rounded-md bg-surface-muted px-1.5 py-0.5 text-[12px] text-muted">{p.category}</span>
                      )}
                    </div>
                    {p.notes && <p className="mt-0.5 text-[12.5px] leading-snug text-subtle">{p.notes}</p>}
                  </td>
                  <td className="px-4 py-2.5 align-top text-[13px] text-muted">{p.payee ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right align-top text-[13.5px] font-semibold tabular-nums text-ink">
                    {fmtAmount(p.amount, p.currency)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right align-top text-[13px] tabular-nums text-muted">
                    {p.due_date ? format(parseISO(p.due_date), "d MMM yyyy", { locale: tr }) : "—"}
                  </td>
                  <td className="px-4 py-2.5 align-top">
                    {/* Durum çipi tıklanır ve durumu ÇEVİRİR. İkon + metin birlikte:
                        renk tek başına anlam taşımaz. Yeşil yalnız "ödendi" için. */}
                    <button
                      type="button"
                      onClick={() => handleToggle(p)}
                      disabled={busy}
                      aria-label={paid ? "Ödendi — bekliyor olarak işaretle" : "Bekliyor — ödendi olarak işaretle"}
                      title={paid ? "Bekliyor olarak işaretle" : "Ödendi olarak işaretle"}
                      className={cn(
                        "inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[12px] font-semibold tabular-nums",
                        "transition-[background-color,color,box-shadow,transform] duration-150 ease-standard active:scale-[0.97]",
                        "disabled:pointer-events-none",
                        paid
                          ? "bg-success/10 text-success hover:bg-success/15"
                          : "bg-warning/10 text-warning hover:bg-warning/15",
                      )}
                    >
                      {busy ? (
                        <Loader2 size={12} className="animate-spin" aria-hidden />
                      ) : paid ? (
                        <CheckCircle2 size={12} aria-hidden />
                      ) : (
                        <Clock3 size={12} aria-hidden />
                      )}
                      {paid
                        ? `Ödendi${p.paid_at ? ` · ${format(parseISO(p.paid_at), "d MMM", { locale: tr })}` : ""}`
                        : "Bekliyor"}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 align-top">
                    <div className="flex items-center justify-end gap-0.5">
                      <IconButton size="sm" aria-label="Düzenle" title="Düzenle" onClick={() => openEdit(p)}>
                        <Pencil size={14} />
                      </IconButton>
                      <IconButton
                        size="sm"
                        aria-label="Sil"
                        title="Sil"
                        onClick={() => handleDelete(p)}
                        disabled={busy}
                        className="hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Ekle / düzenle — ortak Overlay. */}
      {draft && (
        <Overlay
          open
          onClose={closeDraft}
          title={draft.id ? "Ödemeyi düzenle" : "Yeni ödeme"}
          dismissOnBackdrop={false}
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={closeDraft} disabled={isSaving}>
                Vazgeç
              </Button>
              <Button size="sm" onClick={handleSave} loading={isSaving}>
                Kaydet
              </Button>
            </>
          }
        >
          <div className="space-y-3.5">
            <Field label="Başlık" required error={titleError}>
              <TextInput
                value={draft.title}
                onChange={(e) => { setDraft({ ...draft, title: e.target.value }); if (titleError) setTitleError(null); }}
                placeholder="Ruki ödeme / Sri Lanka kumaş…"
                autoFocus
              />
            </Field>
            <Field label="Kime">
              <TextInput value={draft.payee} onChange={(e) => setDraft({ ...draft, payee: e.target.value })} placeholder="Kişi / tedarikçi" />
            </Field>
            {/* Tutar · birim yan yana — anlamlı çift. */}
            <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-x-3">
              <Field label="Tutar" error={amountError}>
                <TextInput
                  inputMode="decimal"
                  value={draft.amount}
                  onChange={(e) => { setDraft({ ...draft, amount: e.target.value }); if (amountError) setAmountError(null); }}
                  placeholder="0,00"
                  className="text-right tabular-nums"
                />
              </Field>
              <Field label="Birim">
                <SelectInput value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value })}>
                  <option value="TRY">₺ TRY</option>
                  <option value="USD">$ USD</option>
                  <option value="EUR">€ EUR</option>
                </SelectInput>
              </Field>
            </div>
            <FieldGrid>
              <Field label="Vade">
                <TextInput type="date" value={draft.due_date} onChange={(e) => setDraft({ ...draft, due_date: e.target.value })} />
              </Field>
              <Field label="Durum">
                <SelectInput value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Draft["status"] })}>
                  <option value="bekliyor">Bekliyor</option>
                  <option value="odendi">Ödendi</option>
                </SelectInput>
              </Field>
            </FieldGrid>
            <Field label="Etiket" hint="üretim, hoca, kumaş…">
              <TextInput value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
            </Field>
            <Field label="Not">
              <TextArea rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </Field>
            {errorBox}
          </div>
        </Overlay>
      )}
      {dialog}
    </div>
  );
}
