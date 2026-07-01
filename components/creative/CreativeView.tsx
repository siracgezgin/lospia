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
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
            <Link2 size={18} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-ink">Kreatif Linkler</h1>
            <p className="mt-0.5 text-[13px] text-muted">
              Canva, Drive ve Figma bağlantıları burada kayıt altında tutulur — dosyalar
              yüklenmez, yalnızca bağlantı ve onay durumu izlenir.
            </p>
          </div>
        </div>
        <button
          onClick={openNew}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-brand-strong"
        >
          <Plus size={15} />
          Yeni link ekle
        </button>
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Başlık veya not ara…"
            className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-ring focus:border-brand-ring"
          />
        </div>
        <select value={provider} onChange={(e) => setProvider(e.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-muted focus:outline-none focus:ring-2 focus:ring-brand-ring">
          <option value="">Tüm kaynaklar</option>
          {CREATIVE_PROVIDERS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-muted focus:outline-none focus:ring-2 focus:ring-brand-ring">
          <option value="">Tüm durumlar</option>
          {CREATIVE_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-[12.5px] text-muted">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="accent-brand" />
          Arşivi göster
        </label>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface px-6 py-14 text-center shadow-card">
          <p className="text-[13.5px] text-subtle">
            {assets.length === 0
              ? "Henüz kayıtlı bağlantı yok. İlk bağlantıyı ekleyin."
              : "Filtreye uyan bağlantı bulunamadı."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((a) => (
            <div key={a.id} className="flex flex-col rounded-2xl border border-line bg-surface p-4 shadow-card">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={cn("rounded-md px-2 py-0.5 text-[10.5px] font-medium", PROVIDER_TONE[a.provider])}>
                    {providerLabel(a.provider)}
                  </span>
                  <span className={cn("rounded-md px-2 py-0.5 text-[10.5px] font-medium", CREATIVE_STATUS_TONE[a.status])}>
                    {creativeStatusLabel(a.status)}
                  </span>
                </div>
                {canMutate(a) && (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button onClick={() => openEdit(a)} className="rounded-md p-1 text-subtle transition-colors hover:bg-surface-muted hover:text-ink" title="Düzenle">
                      <Pencil size={13} />
                    </button>
                    {a.status !== "archived" && (
                      <button onClick={() => handleArchive(a)} disabled={isArchiving} className="rounded-md p-1 text-subtle transition-colors hover:bg-surface-muted hover:text-ink" title="Arşivle">
                        <Archive size={13} />
                      </button>
                    )}
                  </div>
                )}
              </div>

              <h3 className="text-[14px] font-medium leading-snug text-ink">{a.title}</h3>
              {a.department_id && deptName.get(a.department_id) && (
                <p className="mt-0.5 text-[11.5px] text-subtle">{deptName.get(a.department_id)}</p>
              )}
              {a.notes && <p className="mt-1.5 line-clamp-2 text-[12px] text-muted">{a.notes}</p>}

              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-brand hover:text-brand-strong"
              >
                Bağlantıyı aç <ExternalLink size={12} />
              </a>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 px-1 text-[12px] text-subtle">{filtered.length} bağlantı gösteriliyor</p>

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
