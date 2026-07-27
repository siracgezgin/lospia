"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Link2, ExternalLink, Pencil, Archive } from "lucide-react";
import { archiveCreativeAsset } from "@/lib/actions/creative";
import {
  CREATIVE_PROVIDERS,
  CREATIVE_STATUSES,
  providerLabel,
  creativeStatusLabel,
  PROVIDER_TONE,
  CREATIVE_STATUS_TONE,
} from "@/lib/creative/constants";
import { cn } from "@/lib/utils/cn";
import { EmptyState } from "@/components/ui/EmptyState";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { CreativeLinkModal } from "./CreativeLinkModal";
import type { CreativeAsset, WorkspaceDepartment } from "@/types";

interface Props {
  assets: CreativeAsset[];
  departments: Pick<WorkspaceDepartment, "id" | "name">[];
  tasks: { id: string; title: string }[];
  contacts: { id: string; name: string }[];
  currentUserId: string;
  isAdmin: boolean;
  initialProvider: string;
}

function norm(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/İ/g, "i");
}

export function CreativeView({
  assets, departments, tasks, contacts, currentUserId, isAdmin, initialProvider,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState(initialProvider);
  const [status, setStatus] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CreativeAsset | null>(null);
  const [isArchiving, startArchive] = useTransition();

  const deptName = useMemo(
    () => new Map(departments.map((d) => [d.id, d.name])),
    [departments],
  );

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    return assets.filter((a) => {
      if (!showArchived && a.status === "archived") return false;
      if (provider && a.provider !== provider) return false;
      if (status && a.status !== status) return false;
      if (!q) return true;
      return norm([a.title, a.notes, a.url].filter(Boolean).join(" ")).includes(q);
    });
  }, [assets, query, provider, status, showArchived]);

  function canMutate(a: CreativeAsset) {
    return isAdmin || a.created_by === currentUserId;
  }
  function openNew() { setEditing(null); setModalOpen(true); }
  function openEdit(a: CreativeAsset) { setEditing(a); setModalOpen(true); }
  function handleArchive(a: CreativeAsset) {
    if (!confirm(`"${a.title}" bağlantısını arşivlemek istiyor musunuz?`)) return;
    startArchive(async () => {
      await archiveCreativeAsset(a.id);
      router.refresh();
    });
  }

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <ModulePageHeader
        title="Kreatif Linkler"
        description="Canva, Drive ve Figma bağlantıları burada kayıt altında tutulur — dosyalar yüklenmez, yalnızca bağlantı ve onay durumu izlenir."
        icon={Link2}
        secondaryBackHref="/board"
        rightSlot={
          <button
            onClick={openNew}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[13px] font-medium text-white transition-colors duration-150 hover:bg-brand-strong active:scale-[0.98]"
          >
            <Plus size={15} />
            Yeni link ekle
          </button>
        }
      />

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Başlık veya not ara…"
            className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-subtle transition-colors duration-150 hover:border-line-strong focus:outline-none focus:border-brand-ring focus:ring-2 focus:ring-brand-ring/40"
          />
        </div>
        <select value={provider} onChange={(e) => setProvider(e.target.value)} className="h-9 rounded-lg border border-line bg-surface px-3 text-sm text-muted transition-colors duration-150 hover:border-line-strong focus:outline-none focus:border-brand-ring focus:ring-2 focus:ring-brand-ring/40">
          <option value="">Tüm kaynaklar</option>
          {CREATIVE_PROVIDERS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-lg border border-line bg-surface px-3 text-sm text-muted transition-colors duration-150 hover:border-line-strong focus:outline-none focus:border-brand-ring focus:ring-2 focus:ring-brand-ring/40">
          <option value="">Tüm durumlar</option>
          {CREATIVE_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <label className="flex h-9 cursor-pointer select-none items-center gap-1.5 rounded-lg px-2 text-[12.5px] text-muted transition-colors duration-150 hover:text-ink">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="h-3.5 w-3.5 accent-brand" />
          Arşivi göster
        </label>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="anim-fade-up rounded-2xl border border-line bg-surface shadow-card">
          <EmptyState
            icon={assets.length === 0 ? Link2 : Search}
            title={
              assets.length === 0
                ? "Henüz kayıtlı bağlantı yok. İlk bağlantıyı ekleyin."
                : "Filtreye uyan bağlantı bulunamadı."
            }
          />
        </div>
      ) : (
        <div className="stagger-children grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {filtered.map((a) => (
            <div key={a.id} className="group flex flex-col rounded-2xl border border-line bg-surface p-4 shadow-card transition-all duration-200 ease-standard hover:-translate-y-0.5 hover:border-line-strong hover:shadow-card-hover">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={cn("rounded-md px-2 py-0.5 text-[12px] font-medium", PROVIDER_TONE[a.provider])}>
                    {providerLabel(a.provider)}
                  </span>
                  <span className={cn("rounded-md px-2 py-0.5 text-[12px] font-medium", CREATIVE_STATUS_TONE[a.status])}>
                    {creativeStatusLabel(a.status)}
                  </span>
                </div>
                {canMutate(a) && (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button onClick={() => openEdit(a)} className="rounded-md p-1.5 text-subtle transition-colors duration-150 hover:bg-surface-muted hover:text-ink active:scale-95" title="Düzenle">
                      <Pencil size={13} />
                    </button>
                    {a.status !== "archived" && (
                      <button onClick={() => handleArchive(a)} disabled={isArchiving} className="rounded-md p-1.5 text-subtle transition-colors duration-150 hover:bg-surface-muted hover:text-ink active:scale-95 disabled:pointer-events-none disabled:opacity-50" title="Arşivle">
                        <Archive size={13} />
                      </button>
                    )}
                  </div>
                )}
              </div>

              <h3 className="text-sm font-medium leading-snug text-ink">{a.title}</h3>
              {a.department_id && deptName.get(a.department_id) && (
                <p className="mt-0.5 text-[12px] text-subtle">{deptName.get(a.department_id)}</p>
              )}
              {a.notes && <p className="mt-1.5 line-clamp-2 text-[12.5px] text-muted">{a.notes}</p>}

              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 self-start rounded-md text-[13px] font-medium text-brand transition-colors duration-150 hover:text-brand-strong"
              >
                Bağlantıyı aç <ExternalLink size={12} />
              </a>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 px-1 text-[12px] tabular-nums text-subtle">{filtered.length} bağlantı gösteriliyor</p>

      {modalOpen && (
        <CreativeLinkModal
          departments={departments}
          tasks={tasks}
          contacts={contacts}
          asset={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); router.refresh(); }}
        />
      )}
    </div>
  );
}
