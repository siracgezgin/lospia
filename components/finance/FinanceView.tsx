"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { tr } from "date-fns/locale";
import {
  Wallet, Plus, Pencil, Trash2, Loader2, Save, X, CircleDollarSign, Clock3, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
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

const inputCls =
  "w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-brand-ring focus:border-brand-ring";

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

export function FinanceView({ payments }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  const openNew = () => { setError(null); setDraft({ ...EMPTY }); };
  const openEdit = (p: FinancePayment) => {
    setError(null);
    setDraft({
      id: p.id, title: p.title, payee: p.payee ?? "", amount: p.amount != null ? String(p.amount) : "",
      currency: p.currency, status: p.status, due_date: p.due_date ?? "",
      category: p.category ?? "", notes: p.notes ?? "",
    });
  };

  function handleSave() {
    if (!draft) return;
    setError(null);
    const amountNum = draft.amount.trim() === "" ? null : Number(draft.amount.replace(",", "."));
    if (amountNum != null && Number.isNaN(amountNum)) { setError("Tutar sayısal olmalı."); return; }
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

  function handleDelete(p: FinancePayment) {
    if (!confirm(`"${p.title}" kaydını silmek istiyor musunuz?`)) return;
    setBusyId(p.id);
    startSave(async () => {
      const res = await deletePayment(p.id);
      setBusyId(null);
      if ("error" in res) { setError(res.error); return; }
      router.refresh();
    });
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <ModulePageHeader
        title="Finans — Ödeme Takibi"
        description="Kime, ne kadar, ne zaman — ödemelerin tek listesi. Yalnız yöneticiler görür."
        icon={Wallet}
        secondaryBackHref="/modules"
        rightSlot={
          <button
            onClick={openNew}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-brand-strong"
          >
            <Plus size={15} /> Yeni ödeme
          </button>
        }
      />

      {/* Özet kutuları */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-card">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-700"><Clock3 size={17} /></span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Bekleyen</p>
            <p className="text-[15px] font-bold text-ink tabular-nums">{totals.pending}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-card">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><CircleDollarSign size={17} /></span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Ödenen</p>
            <p className="text-[15px] font-bold text-ink tabular-nums">{totals.paid}</p>
          </div>
        </div>
      </div>

      {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{error}</div>}

      {/* Ekle / düzenle paneli */}
      {draft && (
        <div className="mb-4 rounded-2xl border border-line-strong bg-surface p-4 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-ink">{draft.id ? "Ödemeyi düzenle" : "Yeni ödeme"}</h2>
            <button onClick={() => setDraft(null)} className="rounded-md p-1 text-subtle hover:bg-surface-muted hover:text-ink"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block sm:col-span-2 lg:col-span-1">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Başlık *</span>
              <input className={inputCls} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Ruki ödeme / Sri Lanka kumaş…" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Kime</span>
              <input className={inputCls} value={draft.payee} onChange={(e) => setDraft({ ...draft, payee: e.target.value })} placeholder="Kişi / tedarikçi" />
            </label>
            <div className="flex gap-2">
              <label className="block min-w-0 flex-1">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Tutar</span>
                <input className={inputCls} inputMode="decimal" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} placeholder="0,00" />
              </label>
              <label className="block w-20 shrink-0">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Birim</span>
                <select className={inputCls} value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value })}>
                  <option value="TRY">₺ TRY</option>
                  <option value="USD">$ USD</option>
                  <option value="EUR">€ EUR</option>
                </select>
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Vade</span>
              <input type="date" className={inputCls} value={draft.due_date} onChange={(e) => setDraft({ ...draft, due_date: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Etiket</span>
              <input className={inputCls} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} placeholder="üretim / hoca / kumaş…" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Durum</span>
              <select className={inputCls} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Draft["status"] })}>
                <option value="bekliyor">Bekliyor</option>
                <option value="odendi">Ödendi</option>
              </select>
            </label>
            <label className="block sm:col-span-2 lg:col-span-3">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Not</span>
              <input className={inputCls} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Opsiyonel not…" />
            </label>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => setDraft(null)} className="rounded-lg px-3 py-2 text-[13px] font-medium text-muted hover:text-ink">İptal</button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
            >
              {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Kaydet
            </button>
          </div>
        </div>
      )}

      {/* Liste */}
      <div className="overflow-x-auto rounded-2xl border border-line-strong bg-surface shadow-card">
        <table className="w-full min-w-[720px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-line-strong bg-surface-muted text-[11px] font-semibold uppercase tracking-wide text-subtle">
              <th className="px-3 py-2.5">Başlık</th>
              <th className="px-3 py-2.5">Kime</th>
              <th className="px-3 py-2.5 text-right">Tutar</th>
              <th className="px-3 py-2.5">Vade</th>
              <th className="px-3 py-2.5">Durum</th>
              <th className="px-3 py-2.5 text-right">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-[13px] text-subtle">
                  Henüz ödeme kaydı yok. “Yeni ödeme” ile ilk kaydı ekleyin.
                </td>
              </tr>
            )}
            {payments.map((p) => (
              <tr key={p.id} className="border-b border-line last:border-b-0 hover:bg-surface-muted/50">
                <td className="px-3 py-2.5">
                  <span className="font-medium text-ink">{p.title}</span>
                  {p.category && <span className="ml-2 rounded bg-surface-muted px-1.5 py-0.5 text-[10.5px] text-muted">{p.category}</span>}
                  {p.notes && <p className="mt-0.5 text-[11.5px] text-subtle">{p.notes}</p>}
                </td>
                <td className="px-3 py-2.5 text-muted">{p.payee ?? "—"}</td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-ink">{fmtAmount(p.amount, p.currency)}</td>
                <td className="px-3 py-2.5 text-muted">
                  {p.due_date ? format(parseISO(p.due_date), "d MMM yyyy", { locale: tr }) : "—"}
                </td>
                <td className="px-3 py-2.5">
                  <button
                    onClick={() => handleToggle(p)}
                    disabled={isSaving && busyId === p.id}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
                      p.status === "odendi"
                        ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                        : "bg-amber-100 text-amber-800 hover:bg-amber-200",
                    )}
                    title="Durumu değiştir"
                  >
                    {busyId === p.id && isSaving ? <Loader2 size={12} className="animate-spin" /> : p.status === "odendi" ? <CheckCircle2 size={12} /> : <Clock3 size={12} />}
                    {p.status === "odendi"
                      ? `Ödendi${p.paid_at ? ` · ${format(parseISO(p.paid_at), "d MMM", { locale: tr })}` : ""}`
                      : "Bekliyor"}
                  </button>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openEdit(p)} className="rounded-md p-1.5 text-subtle hover:bg-surface-muted hover:text-ink" title="Düzenle"><Pencil size={14} /></button>
                    <button onClick={() => handleDelete(p)} className="rounded-md p-1.5 text-subtle hover:bg-red-50 hover:text-red-600" title="Sil"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
