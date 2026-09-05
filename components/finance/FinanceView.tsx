"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { tr } from "date-fns/locale";
import {
  Wallet, Plus, Pencil, Trash2, Loader2, Clock3, CheckCircle2, AlertCircle, Search,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useConfirm } from "@/components/ui/useConfirm";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { Button, IconButton } from "@/components/ui/Button";
import { SortHeader } from "@/components/ui/SortHeader";
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

type StatusFilter = "" | "bekliyor" | "odendi";
type SortKey = "title" | "payee" | "amount" | "due_date";
type SortState = { key: SortKey; dir: "asc" | "desc" } | null;

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

/* Aramada aksan/Türkçe harf farkı engel olmasın: "sri" → "Şri"yi de bulur.
   CRM'deki `norm` ile aynı kural — iki ekran aynı biçimde arar. */
function norm(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/İ/g, "i");
}

/* BUGÜN YEREL GÜNDÜR, UTC günü değil. `toISOString()` UTC'ye çevirdiği için
   İstanbul'da (UTC+3) gece 00:00–03:00 arasında hâlâ "dün"ü söylüyordu:
   gecikmiş rozeti üç saat geç beliriyordu. */
const todayISO = () => format(new Date(), "yyyy-MM-dd");

/** Bekleyen + vadesi geçmiş = gecikmiş. Ödenmiş kayıt asla "gecikmiş" değildir. */
function isOverdue(p: FinancePayment): boolean {
  return p.status === "bekliyor" && !!p.due_date && p.due_date < todayISO();
}

/**
 * Durum çipi — tıklanır ve durumu ÇEVİRİR. İkon + metin birlikte: renk tek
 * başına anlam taşımaz. Yeşil yalnız "ödendi" için.
 */
function StatusChip({
  p, busy, onToggle,
}: { p: FinancePayment; busy: boolean; onToggle: (p: FinancePayment) => void }) {
  const paid = p.status === "odendi";
  return (
    <button
      type="button"
      onClick={() => onToggle(p)}
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
  );
}

/** Vade — gecikmişse kırmızı. Renk TEK BAŞINA sinyal olmasın diye ekran
 *  okuyucuya da "Gecikti" denir. */
function DueDate({ p, className }: { p: FinancePayment; className?: string }) {
  if (!p.due_date) return <span className={cn("text-subtle", className)}>—</span>;
  const overdue = isOverdue(p);
  return (
    <span
      className={cn("whitespace-nowrap tabular-nums", overdue ? "font-medium text-danger" : "text-muted", className)}
      title={overdue ? "Vadesi geçti" : undefined}
    >
      {overdue && <span className="sr-only">Gecikti: </span>}
      {format(parseISO(p.due_date), "d MMM yyyy", { locale: tr })}
    </span>
  );
}

function RowActions({
  p, busy, onEdit, onDelete,
}: {
  p: FinancePayment;
  busy: boolean;
  onEdit: (p: FinancePayment) => void;
  onDelete: (p: FinancePayment) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-0.5">
      <IconButton size="sm" aria-label="Düzenle" title="Düzenle" onClick={() => onEdit(p)}>
        <Pencil size={14} />
      </IconButton>
      <IconButton
        size="sm"
        aria-label="Sil"
        title="Sil"
        onClick={() => onDelete(p)}
        disabled={busy}
        className="hover:bg-danger/10 hover:text-danger"
      >
        <Trash2 size={14} />
      </IconButton>
    </div>
  );
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
 * ARAMA · SÜZGEÇ · SIRALAMA (2026-09-05). Defter yalnız sunucu sırasıyla
 * geliyordu: yüz satırdan sonra "Ruki'ye ne kadar borcumuz var" sorusunun
 * cevabı gözle taranıyordu. Artık başlık/kime/etiket/not üzerinde arama, tek
 * bir durum süzgeci ve tıklanır sütun başlıkları var. TOPLAMLAR GÖRÜLEN
 * LİSTEYİ anlatır (süzülünce onlar da süzülür) — bu listeyi TARİF eder,
 * kimseyi puanlamaz.
 *
 * Ekle/düzenle formu ortak Overlay'de (CRM formuyla aynı dil).
 *
 * DAR EKRAN: tablo 720px yatay kaydırma demekti, satır işlemleri (düzenle /
 * sil) telefonda ekranın dışında kalıyordu. Aynı veri artık kart listesi
 * olarak çizilir — kart başına TEK rozet: durum çipi.
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
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [sort, setSort] = useState<SortState>(null);

  // Süzgeç + arama. Sıralamaya dokunulmadıysa sunucu sırası korunur
  // (bekleyen önce, sonra vade).
  const visible = useMemo(() => {
    const q = norm(query.trim());
    const rows = payments.filter((p) => {
      if (statusFilter && p.status !== statusFilter) return false;
      if (!q) return true;
      return norm([p.title, p.payee, p.category, p.notes].filter(Boolean).join(" ")).includes(q);
    });
    if (!sort) return rows;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sort.key === "amount") {
        // Boş tutar her zaman sonda kalsın — yönü ne olursa olsun.
        if (a.amount == null && b.amount == null) return 0;
        if (a.amount == null) return 1;
        if (b.amount == null) return -1;
        return (a.amount - b.amount) * factor;
      }
      if (sort.key === "due_date") {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date) * factor;
      }
      const av = (sort.key === "title" ? a.title : a.payee) ?? "";
      const bv = (sort.key === "title" ? b.title : b.payee) ?? "";
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      return av.localeCompare(bv, "tr") * factor;
    });
  }, [payments, query, statusFilter, sort]);

  // Özet: görülen listenin bekleyen / ödenen toplamları (para birimine göre).
  const totals = useMemo(() => {
    const sum = (status: "bekliyor" | "odendi") => {
      const byCur = new Map<string, number>();
      for (const p of visible) {
        if (p.status !== status || p.amount == null) continue;
        byCur.set(p.currency, (byCur.get(p.currency) ?? 0) + Number(p.amount));
      }
      return [...byCur.entries()].map(([cur, v]) => fmtAmount(v, cur)).join(" + ") || "—";
    };
    return { pending: sum("bekliyor"), paid: sum("odendi") };
  }, [visible]);

  const isFiltered = query.trim() !== "" || statusFilter !== "";

  function toggleSort(key: SortKey) {
    setSort((cur) =>
      cur?.key === key
        ? cur.dir === "asc"
          ? { key, dir: "desc" }
          : null // üçüncü tık: sıralamayı bırak, sunucu sırasına dön
        : { key, dir: "asc" },
    );
  }

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
    /* TUTAR TÜRKÇE BİÇİMDE OKUNUR. Liste tutarı "₺1.250,50" diye gösteriyor,
       yani ekran bu biçimi öğretiyor; alan ise yalnız ilk virgülü noktaya
       çevirdiği için "1.250,50" → "1.250.50" → NaN oluyordu. Kural
       lib/collection/cost.ts'teki parseMoney ile aynı: virgül varsa noktalar
       binliktir. */
    const rawAmount = draft.amount.trim();
    let cleanedAmount = rawAmount.replace(/[^\d.,-]/g, "");
    if (cleanedAmount.includes(",")) {
      cleanedAmount = cleanedAmount.replace(/\./g, "").replace(",", ".");
    }
    const amountNum =
      rawAmount === "" ? null : cleanedAmount === "" ? Number.NaN : Number(cleanedAmount);
    if (amountNum != null && Number.isNaN(amountNum)) { setAmountError("Tutar sayı olmalı (ör. 1250,50)."); return; }
    // Negatif tutar sunucuda zaten reddediliyordu; hatayı alanın altında ve
    // bir tur beklemeden söyle.
    if (amountNum != null && amountNum < 0) { setAmountError("Tutar negatif olamaz."); return; }
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
    setError(null);
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
    setError(null);
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

  const rowBusy = (p: FinancePayment) => isSaving && busyId === p.id;

  const emptyState = (
    <EmptyState
      compact
      icon={payments.length === 0 ? Wallet : Search}
      title={payments.length === 0 ? "Henüz ödeme kaydı yok." : "Aramaya uyan kayıt yok."}
      description={
        payments.length === 0
          ? "İlk kaydı “Yeni ödeme” ile açın."
          : "Aramayı ya da durum süzgecini değiştirin."
      }
    />
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

      {/* Araç çubuğu — arama ve süzgeç aynı yükseklikte (h-9). */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-subtle" aria-hidden />
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Başlık, kişi, etiket ara…"
            aria-label="Ödeme ara"
            className="pl-9"
          />
        </div>
        <SelectInput
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          aria-label="Durum süzgeci"
          className="w-auto min-w-[150px] text-muted"
        >
          <option value="">Tüm durumlar</option>
          <option value="bekliyor">Bekliyor</option>
          <option value="odendi">Ödendi</option>
        </SelectInput>
      </div>

      {/* Toplamlar — tek satır, hizalı rakam. GÖRÜLEN defteri TARİF eder (ne
          kadar bekliyor, ne kadar ödendi); kimseyi puanlamaz. */}
      <dl className="mb-3 flex flex-wrap items-baseline gap-x-6 gap-y-1 px-1 text-[13px]">
        <div className="flex items-baseline gap-2">
          <dt className="text-muted">Bekleyen</dt>
          <dd className="font-semibold tabular-nums text-ink">{totals.pending}</dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="text-muted">Ödenen</dt>
          <dd className="font-semibold tabular-nums text-ink">{totals.paid}</dd>
        </div>
        {isFiltered && <span className="text-[12px] text-subtle">süzülmüş listeye göre</span>}
      </dl>

      {/* Sunucu hatası (durum değiştirme / silme) — form kapalıyken burada. */}
      {!draft && errorBox && <div className="mb-3">{errorBox}</div>}

      {/* Geniş ekran: gerçek tablo — metin sola, para ve tarih sağa. */}
      <div className="hidden overflow-x-auto rounded-card border border-line bg-surface shadow-card lg:block">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="select-none border-b border-line bg-surface-muted text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle">
              <th className="px-4 py-2.5" aria-sort={sort?.key === "title" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                <SortHeader active={sort?.key === "title"} dir={sort?.key === "title" ? sort.dir : "asc"} onSort={() => toggleSort("title")}>
                  Başlık
                </SortHeader>
              </th>
              <th className="px-4 py-2.5" aria-sort={sort?.key === "payee" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                <SortHeader active={sort?.key === "payee"} dir={sort?.key === "payee" ? sort.dir : "asc"} onSort={() => toggleSort("payee")}>
                  Kime
                </SortHeader>
              </th>
              <th className="px-4 py-2.5 text-right" aria-sort={sort?.key === "amount" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                <SortHeader align="right" active={sort?.key === "amount"} dir={sort?.key === "amount" ? sort.dir : "asc"} onSort={() => toggleSort("amount")}>
                  Tutar
                </SortHeader>
              </th>
              <th className="px-4 py-2.5 text-right" aria-sort={sort?.key === "due_date" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                <SortHeader align="right" active={sort?.key === "due_date"} dir={sort?.key === "due_date" ? sort.dir : "asc"} onSort={() => toggleSort("due_date")}>
                  Vade
                </SortHeader>
              </th>
              <th className="px-4 py-2.5 font-semibold">Durum</th>
              <th className="px-4 py-2.5 text-right font-semibold"><span className="sr-only">İşlem</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {visible.length === 0 && (
              <tr>
                <td colSpan={6}>{emptyState}</td>
              </tr>
            )}
            {visible.map((p) => (
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
                <td className="px-4 py-2.5 text-right align-top text-[13px]">
                  <DueDate p={p} />
                </td>
                <td className="px-4 py-2.5 align-top">
                  <StatusChip p={p} busy={rowBusy(p)} onToggle={handleToggle} />
                </td>
                <td className="px-4 py-2.5 align-top">
                  <RowActions p={p} busy={rowBusy(p)} onEdit={openEdit} onDelete={handleDelete} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Dar ekran: kart listesi. Aynı veri, satır yerine kart; düzenle/sil
          yatay kaydırma olmadan parmak altında. */}
      <div className="space-y-2 lg:hidden">
        {visible.length === 0 ? (
          <div className="rounded-card border border-line bg-surface shadow-card">{emptyState}</div>
        ) : (
          visible.map((p) => (
            <div key={p.id} className="rounded-card border border-line bg-surface p-3.5 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-medium text-ink">{p.title}</div>
                  <div className="mt-0.5 truncate text-[12.5px] text-subtle">
                    {[p.payee, p.category].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                <div className="shrink-0 text-right text-[14px] font-semibold tabular-nums text-ink">
                  {fmtAmount(p.amount, p.currency)}
                </div>
              </div>

              {p.notes && <p className="mt-1.5 text-[12.5px] leading-snug text-subtle">{p.notes}</p>}

              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-2">
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <StatusChip p={p} busy={rowBusy(p)} onToggle={handleToggle} />
                  {p.due_date && (
                    <span className="text-[12.5px]">
                      <span className="text-subtle">Vade: </span>
                      <DueDate p={p} className="text-[12.5px]" />
                    </span>
                  )}
                </div>
                <RowActions p={p} busy={rowBusy(p)} onEdit={openEdit} onDelete={handleDelete} />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Kaç kayıt görüldüğünü söyleyen satır — LİSTEYİ TARİF EDER. */}
      {visible.length > 0 && (
        <p className="mt-2 px-1 text-[12px] tabular-nums text-subtle">{visible.length} kayıt gösteriliyor</p>
      )}

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
