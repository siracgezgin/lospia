"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus, Search, Table2, Pencil, Archive, ArrowUpRight, Lock, Trash2,
} from "lucide-react";
import { archiveOperationSpreadsheet, deleteOperationSpreadsheet } from "@/lib/actions/sheets";
import {
  SHEET_TYPES, SHEET_STATUSES, sheetTypeLabel, sheetStatusLabel, SHEET_STATUS_TONE,
} from "@/lib/office/constants";
import { cn } from "@/lib/utils/cn";
import { EmptyState } from "@/components/ui/EmptyState";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { SheetFormModal } from "./SheetFormModal";
import type { OperationSpreadsheet, WorkspaceDepartment } from "@/types";

/** List rows carry meta only — the (potentially large) snapshot never leaves
 *  the detail page. */
export type SheetListItem = Omit<OperationSpreadsheet, "snapshot" | "schema_json">;

interface Props {
  sheets: SheetListItem[];
  departments: Pick<WorkspaceDepartment, "id" | "name">[];
  tasks: { id: string; title: string }[];
  contacts: { id: string; name: string }[];
  memberNames: Record<string, string>;
  currentUserId: string;
  isAdmin: boolean;
}

function norm(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/İ/g, "i");
}

export function SheetsView({
  sheets, departments, tasks, contacts, memberNames, currentUserId, isAdmin,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [status, setStatus] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SheetListItem | null>(null);
  const [isBusy, startWork] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const deptName = useMemo(
    () => new Map(departments.map((d) => [d.id, d.name])),
    [departments],
  );

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    return sheets.filter((s) => {
      if (!showArchived && s.status === "archived") return false;
      if (typeFilter && s.sheet_type !== typeFilter) return false;
      if (status && s.status !== status) return false;
      if (deptFilter && s.department_id !== deptFilter) return false;
      if (!q) return true;
      return norm(
        [s.title, s.description, ...(s.tags ?? [])].filter(Boolean).join(" "),
      ).includes(q);
    });
  }, [sheets, query, typeFilter, status, deptFilter, showArchived]);

  function canMutate(s: SheetListItem) {
    if (isAdmin) return true;
    return s.created_by === currentUserId && (s.status === "draft" || s.status === "active");
  }

  function openNew() { setEditing(null); setModalOpen(true); }
  function openEdit(s: SheetListItem) { setEditing(s); setModalOpen(true); }

  function handleArchive(s: SheetListItem) {
    if (!confirm(`"${s.title}" tablosunu arşivlemek istiyor musunuz?`)) return;
    setError(null);
    startWork(async () => {
      const res = await archiveOperationSpreadsheet(s.id);
      if (res && "error" in res) { setError(res.error); return; }
      router.refresh();
    });
  }

  /* SİLME. Aslı Hanım (2026-08-24): "sil kısmı yok."
     Arşivleme vardı ama silme hiç bağlanmamıştı — server action
     (deleteOperationSpreadsheet) yazılmış, arayüzden çağrılmıyordu.
     Geri alınamaz olduğu için onay metni tablonun adını söyler. */
  function handleDelete(s: SheetListItem) {
    if (!confirm(`"${s.title}" tablosu kalıcı olarak silinsin mi?\n\nBu işlem geri alınamaz. Sadece gözden kaldırmak için "Arşivle"yi kullanın.`)) return;
    setError(null);
    startWork(async () => {
      const res = await deleteOperationSpreadsheet(s.id);
      if (res && "error" in res) { setError(res.error); return; }
      router.refresh();
    });
  }

  const selectCls =
    "h-9 rounded-lg border border-line bg-surface px-3 text-sm text-muted transition-colors duration-150 hover:border-line-strong focus:outline-none focus:border-brand-ring focus:ring-2 focus:ring-brand-ring/40";

  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      <ModulePageHeader
        title="Sheets"
        description="Excel/CSV düzenlerinizi Lospia içinde tablo olarak tutun — hücreleri doğrudan düzenleyin, Excel'den kopyalayıp yapıştırın."
        icon={Table2}
        // Sheets AF Teamwork'ün bir bölümü (2026-08-28) — geri oraya döner.
        rightSlot={
          <button
            onClick={openNew}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[13px] font-medium text-white transition-colors duration-150 hover:bg-brand-strong active:scale-[0.98]"
          >
            <Plus size={15} />
            Yeni tablo
          </button>
        }
      />

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tablo adı veya etiket ara…"
            className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-subtle transition-colors duration-150 hover:border-line-strong focus:outline-none focus:border-brand-ring focus:ring-2 focus:ring-brand-ring/40"
          />
        </div>
        {/* Tür / durum / departman açılır listeleri KALDIRILDI — üç ayrı süzgeç
            bir avuç tablo için fazlaydı ve arama kutusunu bastırıyordu.
            Departman süzgeci ancak birden fazla departmana tablo dağılmışsa
            anlamlı; o zaman da arama yeterli. (Sadelik kuralı.) */}
        <label className="flex h-9 cursor-pointer select-none items-center gap-1.5 rounded-lg px-2 text-[12.5px] text-muted transition-colors duration-150 hover:text-ink">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="h-3.5 w-3.5 accent-brand" />
          Arşivi göster
        </label>
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="anim-fade-up rounded-2xl border border-line bg-surface shadow-card">
          <EmptyState
            icon={sheets.length === 0 ? Table2 : Search}
            title={
              sheets.length === 0
                ? "Henüz tablo eklenmedi. Stok, koleksiyon ve operasyon tablolarınızı buradan takip edebilirsiniz."
                : "Filtreye uyan tablo bulunamadı."
            }
            action={
              sheets.length === 0 ? (
                <button
                  onClick={openNew}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[13px] font-medium text-white transition-colors duration-150 hover:bg-brand-strong active:scale-[0.98]"
                >
                  <Plus size={15} />
                  İlk tabloyu oluştur
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        /* KARTIN TAMAMI TIKLANABİLİR.
           Aslı Hanım (2026-08-24): "bu kısım çok kötü, mesela nereye
           basacağım belli değil, sil kısmı yok."
           Eskiden yalnız BAŞLIK bir bağlantıydı; kartın gövdesine tıklamak
           hiçbir şey yapmıyordu. Şimdi yayılmış bir Link kartın tamamını
           kaplıyor, aksiyon düğmeleri onun ÜSTÜNDE kardeş olarak duruyor.
           (İç içe <a> yasak — proje kuralı, hydration hatası veriyor.)
           Tür/durum çipleri kalktı: her kartta aynı şeyi yazıyorlardı.
           Kilitli/arşiv gibi GERÇEKTEN farklı bir durum varsa tek rozet çıkar. */
        <div className="stagger-children grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((s) => (
            <div
              key={s.id}
              className="group relative flex flex-col rounded-2xl border border-line bg-surface p-4 shadow-card transition-all duration-200 ease-standard hover:-translate-y-0.5 hover:border-line-strong hover:shadow-card-hover"
            >
              <Link
                href={`/sheets/${s.id}`}
                aria-label={s.title}
                className="absolute inset-0 z-[1] rounded-2xl focus-visible:outline-2 focus-visible:outline-brand-ring"
              />

              <div className="mb-2 flex min-h-6 items-start justify-between gap-2">
                {s.status === "locked" || s.status === "archived" ? (
                  <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-medium", SHEET_STATUS_TONE[s.status])}>
                    {s.status === "locked" && <Lock size={10} />}
                    {sheetStatusLabel(s.status)}
                  </span>
                ) : <span />}

                {/* Aksiyonlar — kart bağlantısının üstünde, fare gelince belirir */}
                <div className="z-[2] flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
                  {canMutate(s) && (
                    <button onClick={() => openEdit(s)} className="rounded-md p-1.5 text-subtle transition-colors duration-150 hover:bg-surface-muted hover:text-ink active:scale-95" title="Bilgileri düzenle">
                      <Pencil size={13} />
                    </button>
                  )}
                  {isAdmin && s.status !== "archived" && (
                    <button onClick={() => handleArchive(s)} disabled={isBusy} className="rounded-md p-1.5 text-subtle transition-colors duration-150 hover:bg-surface-muted hover:text-ink active:scale-95 disabled:pointer-events-none disabled:opacity-50" title="Arşivle">
                      <Archive size={13} />
                    </button>
                  )}
                  {canMutate(s) && (
                    <button onClick={() => handleDelete(s)} disabled={isBusy} className="rounded-md p-1.5 text-subtle transition-colors duration-150 hover:bg-[#fbe6e2] hover:text-danger active:scale-95 disabled:pointer-events-none disabled:opacity-50" title="Sil">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>

              <h3 className="flex items-start justify-between gap-2 text-sm font-medium leading-snug text-ink transition-colors duration-150 group-hover:text-brand-strong">
                <span className="min-w-0">{s.title}</span>
                <ArrowUpRight size={14} className="mt-0.5 shrink-0 text-subtle opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
              </h3>
              {s.department_id && deptName.get(s.department_id) && (
                <p className="mt-0.5 text-[12px] text-subtle">{deptName.get(s.department_id)}</p>
              )}
              {s.description && <p className="mt-1 line-clamp-2 text-[12.5px] text-muted">{s.description}</p>}

              <div className="mt-3 flex items-center justify-between border-t border-hairline pt-2.5 text-[12px] text-subtle">
                <span className="truncate">
                  {s.created_by && memberNames[s.created_by] ? memberNames[s.created_by] : "—"}
                </span>
                <span className="shrink-0 tabular-nums">
                  {new Date(s.updated_at).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="anim-fade-down mt-3 rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-[12.5px] text-danger">
          {error}
        </p>
      )}

      {modalOpen && (
        <SheetFormModal
          departments={departments}
          tasks={tasks}
          contacts={contacts}
          sheet={editing}
          isAdmin={isAdmin}
          readOnly={editing ? !canMutate(editing) : false}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); router.refresh(); }}
        />
      )}
    </div>
  );
}
