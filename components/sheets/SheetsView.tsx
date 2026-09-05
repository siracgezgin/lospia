"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Table2, Pencil, Archive, Lock, Trash2 } from "lucide-react";
import { archiveOperationSpreadsheet, deleteOperationSpreadsheet } from "@/lib/actions/sheets";
import { sheetTypeLabel, SHEET_TYPES } from "@/lib/office/constants";
import { KIND_SHEET } from "@/lib/office/file-kind";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button, IconButton } from "@/components/ui/Button";
import { SelectInput, TextInput } from "@/components/ui/Field";
import { Tile, TileGrid } from "@/components/ui/TileGrid";
import { useConfirm } from "@/components/ui/useConfirm";
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

/**
 * NOT (2026-08-29): Bu liste ekranı artık KULLANILMIYOR — /sheets,
 * /documents'a yönlendiriyor; tablolar AF Teamwork klasörlerinde yaşıyor.
 * Silme kararı kullanıcıya ait; o güne kadar aynı UI kurallarına uyar:
 * kutucuk dili AF Teamwork'ün dosya kutusuyla AYNI (components/ui/TileGrid,
 * yatay yerleşim) ve süzgeçler PROJE KURALINDAKİ üçlüdür — başlık · tür ·
 * departman. Daha önce burada tür/departman süzgeçleri için durum tutuluyor
 * ama hiçbir kontrol çizilmiyordu: alan ölüydü, kullanıcı arama kutusundan
 * başka hiçbir şeyle listeyi daraltamıyordu.
 */
export function SheetsView({
  sheets, departments, tasks, contacts, memberNames, currentUserId, isAdmin,
}: Props) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<"recent" | "title">("recent");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SheetListItem | null>(null);
  const [isBusy, startWork] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const deptName = useMemo(
    () => new Map(departments.map((d) => [d.id, d.name])),
    [departments],
  );

  /* Süzgeç kutuları yalnız GERÇEKTEN daraltabiliyorsa çizilir: tek türün ya da
     tek departmanın olduğu bir listede açılır kutu hiçbir şeyi değiştirmez,
     yalnız araç çubuğunu şişirir (sadelik kuralı). */
  const typeOptions = useMemo(() => {
    const present = new Set(sheets.map((s) => s.sheet_type as string));
    return SHEET_TYPES.filter((t) => present.has(t.key));
  }, [sheets]);

  const deptOptions = useMemo(() => {
    const present = new Set(
      sheets.map((s) => s.department_id).filter((id): id is string => !!id),
    );
    return departments.filter((d) => present.has(d.id));
  }, [sheets, departments]);

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    const rows = sheets.filter((s) => {
      if (!showArchived && s.status === "archived") return false;
      if (typeFilter && s.sheet_type !== typeFilter) return false;
      if (deptFilter && s.department_id !== deptFilter) return false;
      if (!q) return true;
      return norm(
        [s.title, s.description, ...(s.tags ?? [])].filter(Boolean).join(" "),
      ).includes(q);
    });
    /* SIRALAMA gerçekten çalışır: varsayılan "son çalışılan üstte", alternatif
       alfabetik (Türkçe harf sırasıyla). Sıralama listeyi TARİF eder, kimseyi
       puanlamaz — sadelik kuralına takılmaz. */
    return [...rows].sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title, "tr")
        : Date.parse(b.updated_at) - Date.parse(a.updated_at),
    );
  }, [sheets, query, typeFilter, deptFilter, showArchived, sort]);

  const filtersActive = !!(query.trim() || typeFilter || deptFilter);

  function clearFilters() {
    setQuery("");
    setTypeFilter("");
    setDeptFilter("");
  }

  function canMutate(s: SheetListItem) {
    if (isAdmin) return true;
    return s.created_by === currentUserId && (s.status === "draft" || s.status === "active");
  }

  function openNew() { setEditing(null); setModalOpen(true); }
  function openEdit(s: SheetListItem) { setEditing(s); setModalOpen(true); }

  async function handleArchive(s: SheetListItem) {
    if (!(await ask({ message: `"${s.title}" tablosu arşivlensin mi?`, confirmLabel: "Arşivle" }))) return;
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
  async function handleDelete(s: SheetListItem) {
    if (!(await ask({
      title: "Tablo silinsin mi?",
      message: `"${s.title}" kalıcı olarak silinir; içindeki bütün veriler gider. Yalnız gözden kaldırmak için "Arşivle"yi kullanın.`,
      confirmLabel: "Sil",
      tone: "danger",
    }))) return;
    setError(null);
    startWork(async () => {
      const res = await deleteOperationSpreadsheet(s.id);
      if (res && "error" in res) { setError(res.error); return; }
      router.refresh();
    });
  }

  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      <ModulePageHeader
        title="Sheets"
        backHref="/documents"
        rightSlot={
          <Button size="sm" onClick={openNew}>
            <Plus size={15} aria-hidden />
            Yeni tablo
          </Button>
        }
      />

      {/* Araç çubuğu — süzgeç kuralı: BAŞLIK · TÜR · DEPARTMAN, fazlası satırın
          içinde yazar (CLAUDE.md). Durum süzgeci yok: "arşivi göster" onay
          kutusu zaten tek anlamlı ayrımı yapıyor. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tablo adı veya etiket ara…"
            aria-label="Tablo ara"
            className="pl-9"
          />
        </div>

        {typeOptions.length > 1 && (
          <SelectInput
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Türe göre süz"
            className="h-9 w-auto min-w-[8.5rem]"
          >
            <option value="">Tüm türler</option>
            {typeOptions.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </SelectInput>
        )}

        {deptOptions.length > 1 && (
          <SelectInput
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            aria-label="Departmana göre süz"
            className="h-9 w-auto min-w-[9rem]"
          >
            <option value="">Tüm departmanlar</option>
            {deptOptions.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </SelectInput>
        )}

        <SelectInput
          value={sort}
          onChange={(e) => setSort(e.target.value === "title" ? "title" : "recent")}
          aria-label="Sıralama"
          className="h-9 w-auto min-w-[9.5rem]"
        >
          <option value="recent">Son çalışılan üstte</option>
          <option value="title">Ada göre (A→Z)</option>
        </SelectInput>

        <label className="flex h-10 min-h-10 cursor-pointer select-none items-center gap-1.5 rounded-control px-2 text-[12.5px] text-muted transition-colors duration-150 hover:text-ink sm:h-9">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="h-4 w-4 accent-brand" />
          Arşivi göster
        </label>
      </div>

      {/* Hata, listenin ALTINDA değil ÜSTÜNDE: uzun bir ızgaranın dibinde
          kalan uyarıyı kimse görmüyordu. */}
      {error && (
        <p role="alert" className="anim-fade-down mb-3 rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[12.5px] text-danger">
          {error}
        </p>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={sheets.length === 0 ? Table2 : Search}
          title={sheets.length === 0 ? "Henüz tablo yok." : "Aramaya uyan tablo yok."}
          description={
            sheets.length === 0
              ? "Stok, koleksiyon ve operasyon tablolarını buradan tutabilirsiniz."
              : filtersActive
                ? "Süzgeçleri temizleyip tekrar deneyin."
                : "Arşivlenmiş tabloları görmek için “Arşivi göster”i işaretleyin."
          }
          action={
            sheets.length === 0 ? (
              <Button size="sm" variant="secondary" onClick={openNew}>
                <Plus size={15} aria-hidden />
                Tablo oluştur
              </Button>
            ) : filtersActive ? (
              <Button size="sm" variant="secondary" onClick={clearFilters}>
                Süzgeçleri temizle
              </Button>
            ) : undefined
          }
        />
      ) : (
        /* KUTUCUK DİLİ AF Teamwork ile AYNI: yatay Tile (ikon solda, ad sağda).
           Kartın tamamı tıklanabilir; eylemler kartın KARDEŞİ olarak sağda
           durur — kart bir <a>, içine ikinci bir tıklanabilir öğe konamaz
           (proje kuralı: iç içe <a> yasak). Kart en fazla TEK işaret taşır:
           kilit, ikonun köşesinde. */
        <TileGrid row className="grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
          {filtered.map((s) => {
            const parts = [
              sheetTypeLabel(s.sheet_type),
              s.department_id ? deptName.get(s.department_id) : null,
              s.status === "archived" ? "Arşivlendi" : null,
              s.created_by ? memberNames[s.created_by] : null,
              new Date(s.updated_at).toLocaleDateString("tr-TR", {
                day: "numeric", month: "short", year: "numeric",
              }),
            ].filter(Boolean) as string[];

            return (
              <div key={s.id} className="relative min-w-0 [&>a]:pr-[6.5rem]">
                <Tile
                  layout="row"
                  href={`/sheets/${s.id}`}
                  title={s.title}
                  meta={parts.join(" · ")}
                  icon={KIND_SHEET.icon}
                  colorHex={KIND_SHEET.hex}
                  iconBadge={
                    s.status === "locked" ? (
                      <Lock size={10} strokeWidth={2.4} className="text-warning" aria-label="Kilitli" />
                    ) : undefined
                  }
                />
                {/* Her cihazda görünür — hover'a bağlı işlev telefonda
                    erişilemez olur. */}
                <span className="absolute right-1.5 top-1/2 z-[3] flex -translate-y-1/2 items-center gap-0.5">
                  {canMutate(s) && (
                    <IconButton size="sm" aria-label={`${s.title} — bilgileri düzenle`} title="Bilgileri düzenle" onClick={() => openEdit(s)}>
                      <Pencil size={13} aria-hidden />
                    </IconButton>
                  )}
                  {isAdmin && s.status !== "archived" && (
                    <IconButton size="sm" aria-label={`${s.title} — arşivle`} title="Arşivle" disabled={isBusy} onClick={() => void handleArchive(s)}>
                      <Archive size={13} aria-hidden />
                    </IconButton>
                  )}
                  {canMutate(s) && (
                    <IconButton size="sm" aria-label={`${s.title} — sil`} title="Sil" disabled={isBusy} onClick={() => void handleDelete(s)} className="hover:bg-danger/10 hover:text-danger">
                      <Trash2 size={13} aria-hidden />
                    </IconButton>
                  )}
                </span>
              </div>
            );
          })}
        </TileGrid>
      )}

      {dialog}
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
