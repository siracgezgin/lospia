"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { tr } from "date-fns/locale";
import {
  Wallet, Plus, Pencil, Trash2, Loader2, Save, X, CircleDollarSign, Clock3, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useConfirm } from "@/components/ui/useConfirm";
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
  "w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:text-subtle " +
  "transition-[color,background-color,border-color,box-shadow] duration-150 ease-standard hover:border-line-strong " +
  "focus:outline-none focus:border-brand-ring focus:ring-2 focus:ring-brand-ring/40";

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
  const { ask, dialog } = useConfirm();
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

  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      <ModulePageHeader
        title="Finance"
        description="Kime, ne kadar, ne zaman — ödemelerin tek listesi. Yalnız yöneticiler görür."
        icon={Wallet}
        rightSlot={
          <button
            onClick={openNew}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white shadow-xs transition-[background-color,box-shadow,transform] duration-150 ease-standard hover:bg-brand-strong active:scale-[0.98]"
          >
            <Plus size={15} /> Yeni ödeme
          </button>
        }
      />

      {/* Özet kutuları */}
      <div className="stagger-children mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-card">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700"><Clock3 size={18} /></span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Bekleyen</p>
            <p className="truncate text-xl font-bold tracking-tight text-ink tabular-nums">{totals.pending}</p>
          </div>
        </div>
        <div className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-card">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700"><CircleDollarSign size={18} /></span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Ödenen</p>
            <p className="truncate text-xl font-bold tracking-tight text-ink tabular-nums">{totals.paid}</p>
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="anim-fade-down mb-3 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
          {error}
        </div>
      )}

      {/* Ekle / düzenle paneli */}
      {draft && (
        <div className="anim-fade-down mb-4 rounded-2xl border border-line-strong bg-surface p-4 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[14px] font-semibold tracking-tight text-ink">{draft.id ? "Ödemeyi düzenle" : "Yeni ödeme"}</h2>
            <button
              onClick={() => setDraft(null)}
              aria-label="Kapat"
              className="rounded-md p-1.5 text-subtle transition-colors duration-150 hover:bg-surface-muted hover:text-ink active:bg-surface-sunken"
            >
              <X size={16} />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block sm:col-span-2 lg:col-span-1">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Başlık *</span>
              <input className={inputCls} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Ruki ödeme / Sri Lanka kumaş…" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Kime</span>
              <input className={inputCls} value={draft.payee} onChange={(e) => setDraft({ ...draft, payee: e.target.value })} placeholder="Kişi / tedarikçi" />
            </label>
            <div className="flex gap-2">
              <label className="block min-w-0 flex-1">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Tutar</span>
                <input className={inputCls} inputMode="decimal" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} placeholder="0,00" />
              </label>
              <label className="block w-20 shrink-0">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Birim</span>
                <select className={inputCls} value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value })}>
                  <option value="TRY">₺ TRY</option>
                  <option value="USD">$ USD</option>
                  <option value="EUR">€ EUR</option>
                </select>
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Vade</span>
              <input type="date" className={inputCls} value={draft.due_date} onChange={(e) => setDraft({ ...draft, due_date: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Etiket</span>
              <input className={inputCls} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} placeholder="üretim / hoca / kumaş…" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Durum</span>
              <select className={inputCls} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Draft["status"] })}>
                <option value="bekliyor">Bekliyor</option>
                <option value="odendi">Ödendi</option>
              </select>
            </label>
            <label className="block sm:col-span-2 lg:col-span-3">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Not</span>
              <input className={inputCls} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Opsiyonel not…" />
            </label>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => setDraft(null)}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink active:bg-surface-sunken"
            >
              İptal
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-xs transition-[background-color,box-shadow,transform] duration-150 ease-standard hover:bg-brand-strong active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
            >
              {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Kaydet
            </button>
          </div>
        </div>
      )}

      {/* Liste */}
      <div className="overflow-x-auto rounded-2xl border border-line-strong bg-surface shadow-card">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-line-strong bg-surface-muted text-xs font-semibold uppercase tracking-wider text-muted">
              <th className="px-4 py-3">Başlık</th>
              <th className="px-4 py-3">Kime</th>
              <th className="px-4 py-3 text-right">Tutar</th>
              <th className="px-4 py-3">Vade</th>
              <th className="px-4 py-3">Durum</th>
              <th className="px-4 py-3 text-right">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center">
                  <div className="anim-fade mx-auto flex max-w-xs flex-col items-center gap-2.5">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-surface-sunken text-subtle">
                      <Wallet size={18} />
                    </span>
                    <p className="text-sm leading-relaxed text-muted">
                      Henüz ödeme kaydı yok. “Yeni ödeme” ile ilk kaydı ekleyin.
                    </p>
                  </div>
                </td>
              </tr>
            )}
            {payments.map((p) => (
              <tr key={p.id} className="border-b border-line last:border-b-0 transition-colors duration-150 hover:bg-surface-hover">
                <td className="px-4 py-3">
                  <span className="font-medium text-ink">{p.title}</span>
                  {p.category && <span className="ml-2 rounded bg-surface-muted px-1.5 py-0.5 text-xs text-muted">{p.category}</span>}
                  {p.notes && <p className="mt-0.5 text-xs text-subtle">{p.notes}</p>}
                </td>
                <td className="px-4 py-3 text-muted">{p.payee ?? "—"}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-ink">{fmtAmount(p.amount, p.currency)}</td>
                <td className="px-4 py-3 text-muted tabular-nums">
                  {p.due_date ? format(parseISO(p.due_date), "d MMM yyyy", { locale: tr }) : "—"}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleToggle(p)}
                    disabled={isSaving && busyId === p.id}
                    className={cn(
                      "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ring-1 ring-inset",
                      "transition-[background-color,color,box-shadow,transform] duration-150 ease-standard active:scale-[0.97]",
                      "disabled:pointer-events-none disabled:opacity-60",
                      p.status === "odendi"
                        ? "bg-emerald-100 text-emerald-800 ring-emerald-600/20 hover:bg-emerald-200"
                        : "bg-amber-100 text-amber-800 ring-amber-600/20 hover:bg-amber-200",
                    )}
                    title="Durumu değiştir"
                  >
                    {busyId === p.id && isSaving ? <Loader2 size={12} className="animate-spin" /> : p.status === "odendi" ? <CheckCircle2 size={12} /> : <Clock3 size={12} />}
                    {p.status === "odendi"
                      ? `Ödendi${p.paid_at ? ` · ${format(parseISO(p.paid_at), "d MMM", { locale: tr })}` : ""}`
                      : "Bekliyor"}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => openEdit(p)}
                      aria-label="Düzenle"
                      title="Düzenle"
                      className="rounded-md p-1.5 text-subtle transition-colors duration-150 hover:bg-surface-muted hover:text-ink active:bg-surface-sunken"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(p)}
                      aria-label="Sil"
                      title="Sil"
                      className="rounded-md p-1.5 text-subtle transition-colors duration-150 hover:bg-danger/10 hover:text-danger active:bg-danger/15"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dialog}
    </div>
  );
}
