"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronRight, Plus, Trash2, UserPlus, UserMinus, Pencil } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import type { WorkspaceDepartment, DepartmentMember, WorkspaceMember, Profile } from "@/types";
import { Avatar, AvatarGroup } from "@/components/ui/Avatar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button, IconButton } from "@/components/ui/Button";
import { TextInput, SelectInput } from "@/components/ui/Field";
import { getPersonDisplayName } from "@/lib/utils/person-display";
import { resolveDeptColorKey } from "@/lib/utils/departments";
import { getDepartmentBadge } from "@/lib/design/semantics";
import { cn } from "@/lib/utils/cn";
import {
  provisionAfDepartments,
  createDepartment,
  deleteDepartment,
  addDepartmentMember,
  removeDepartmentMember,
  updateDepartment,
} from "@/lib/actions/departments";

type MemberRow = WorkspaceMember & { profiles?: Partial<Profile> | null };

interface Props {
  departments: WorkspaceDepartment[];
  deptMembers: (DepartmentMember & { profiles?: Partial<Profile> | null })[];
  workspaceMembers: MemberRow[];
  canManage: boolean;
}

function memberName(m: MemberRow) {
  return m.profiles?.full_name ?? m.profiles?.email ?? "—";
}

function DeptMemberRow({
  dm,
  canManage,
  onRemove,
}: {
  dm: DepartmentMember & { profiles?: Partial<Profile> | null };
  canManage: boolean;
  onRemove: (_id: string) => void;
}) {
  const name = getPersonDisplayName(dm.profiles ?? dm.member_id.slice(0, 8));
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <div className="flex min-w-0 items-center gap-2 text-[13.5px] text-ink">
        <Avatar name={name} size="sm" />
        <span className="truncate" title={name}>{name}</span>
      </div>
      {canManage && (
        <IconButton
          size="sm"
          onClick={() => onRemove(dm.id)}
          aria-label={`${name} — departmandan çıkar`}
          title="Departmandan çıkar"
          className="hover:bg-danger/10 hover:text-danger"
        >
          <UserMinus size={13} />
        </IconButton>
      )}
    </div>
  );
}

function AddMemberForm({
  departmentId,
  existingMemberIds,
  workspaceMembers,
  onDone,
}: {
  departmentId: string;
  existingMemberIds: Set<string>;
  workspaceMembers: MemberRow[];
  onDone: () => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  const available = workspaceMembers.filter((m) => !existingMemberIds.has(m.id));

  function handleAdd() {
    if (!selectedId) return;
    setErr(null);
    startTransition(async () => {
      // Department membership is not a hierarchy — everyone is simply "member".
      const res = await addDepartmentMember(departmentId, selectedId);
      if ("error" in res) { setErr(res.error); return; }
      router.refresh(); // surface the new assignment immediately
      onDone();
    });
  }

  if (available.length === 0) {
    return <p className="mt-1 text-[12.5px] text-subtle">Herkes bu departmanda.</p>;
  }

  return (
    <div className="anim-fade mt-2 flex flex-wrap items-center gap-2">
      <SelectInput
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        aria-label="Eklenecek kişi"
        className="h-8 w-auto min-w-[180px] flex-1 sm:flex-none"
      >
        <option value="">Kişi seç…</option>
        {available.map((m) => (
          <option key={m.id} value={m.id}>{memberName(m)}</option>
        ))}
      </SelectInput>
      <Button size="sm" onClick={handleAdd} disabled={!selectedId} loading={pending}>
        Ekle
      </Button>
      <Button size="sm" variant="ghost" onClick={onDone} disabled={pending}>Vazgeç</Button>
      {err && <p role="alert" className="anim-fade-down w-full text-[12.5px] text-danger">{err}</p>}
    </div>
  );
}

function DeptCard({
  dept,
  children,
  deptMembers,
  aggregateMembers,
  colorKey,
  workspaceMembers,
  canManage,
  onDelete,
}: {
  dept: WorkspaceDepartment;
  children?: React.ReactNode;
  deptMembers: (DepartmentMember & { profiles?: Partial<Profile> | null })[];
  // Deduped members across this department + (for top-level) its children.
  // Drives the collapsed header count/avatars so a parent reflects its sub-teams.
  aggregateMembers: (DepartmentMember & { profiles?: Partial<Profile> | null })[];
  // Effective colour key (canonical AF override / stored / inherited from parent).
  colorKey: string | null;
  workspaceMembers: MemberRow[];
  canManage: boolean;
  onDelete: (_id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  /* YENİDEN ADLANDIRMA — satırda yalnız çöp kutusu vardı; adı düzeltmenin tek
     yolu silip yeniden açmaktı, o da içindeki üyeleri kaybettiriyordu
     (2026-08-29). Çip yerinde inputa dönüşür; sayfanın tepesinde tam genişlik
     bir kutu açmak düzenlenen departmandan metrelerce uzaktı. */
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(dept.name);
  const [savingName, startRename] = useTransition();
  /* Satır içi hata — yeniden adlandırma ve üye çıkarma sessizce başarısız
     oluyordu ("Bu isimde bir departman zaten var" hiç görünmüyordu). */
  const [rowError, setRowError] = useState<string | null>(null);

  function commitRename() {
    const clean = draftName.trim();
    setRenaming(false);
    if (!clean || clean === dept.name) {
      setDraftName(dept.name);
      return;
    }
    setRowError(null);
    startRename(async () => {
      const res = await updateDepartment(dept.id, { name: clean });
      if ("error" in res) {
        setRowError(res.error);
        setDraftName(dept.name);
        return;
      }
      router.refresh();
    });
  }
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);
  const [pendingRemove, startTransition] = useTransition();
  const router = useRouter();

  const badge = getDepartmentBadge(colorKey);
  const myMembers = deptMembers.filter((dm) => dm.department_id === dept.id);
  const existingMemberIds = new Set(myMembers.map((dm) => dm.member_id));

  function requestRemoveMember(dmId: string) {
    const dm = myMembers.find((m) => m.id === dmId);
    setRemoveTarget({ id: dmId, name: getPersonDisplayName(dm?.profiles ?? dmId.slice(0, 8)) });
  }

  function confirmRemoveMember() {
    if (!removeTarget) return;
    const id = removeTarget.id;
    setRowError(null);
    startTransition(async () => {
      const res = await removeDepartmentMember(id);
      setRemoveTarget(null);
      if ("error" in res) { setRowError(res.error); return; }
      router.refresh();
    });
  }

  const isTopLevel = dept.parent_id === null;

  /* Yüzey: kart DEĞİL. Bölüm kartının içinde her departman ayrı bir kutuydu
     (kenarlık + gölge + hover gölgesi), alt departman da onun içinde ikinci bir
     kutu — kart içinde kart. Artık üst düzey satırlar ince çizgiyle ayrılır,
     alt düzey soldaki tek çizgiyle içeri girer. */
  return (
    <div className={cn(!isTopLevel && "ml-3 border-l border-hairline pl-3")}>
      <div className="flex items-center gap-1">
        {/* Aç/kapat satırın kendisi bir DÜĞME (klavye + ekran okuyucu);
            eylemler kardeş olarak yanında durur — düğme içinde düğme yok. */}
        {renaming ? (
          <TextInput
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") { setDraftName(dept.name); setRenaming(false); }
            }}
            aria-label="Departman adı"
            className="my-1 h-8 flex-1 font-medium"
          />
        ) : (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="-ml-1 flex min-w-0 flex-1 items-center gap-2 rounded-control py-2 pl-1 pr-2 text-left transition-colors duration-150 ease-standard hover:bg-surface-hover"
          >
            <ChevronRight
              size={14}
              aria-hidden
              className={cn("shrink-0 text-subtle transition-transform duration-200 ease-standard", open && "rotate-90")}
            />
            {/* Departmanın rengi — satırdaki TEK rozet. */}
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12.5px] font-semibold ring-1", badge.chip, badge.ring, savingName && "opacity-60")}>
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", badge.dot)} aria-hidden />
              {dept.name}
            </span>
          </button>
        )}
        {/* "N kişi" listeyi tarif eder, kimseyi puanlamaz. Düğmenin DIŞINDA:
            AvatarGroup blok öğe, düğme içinde geçersiz olurdu. */}
        {!renaming && aggregateMembers.length > 0 && (
          <span className="flex shrink-0 items-center gap-1.5 pr-1">
            <AvatarGroup names={aggregateMembers.map((dm) => getPersonDisplayName(dm.profiles ?? dm.member_id.slice(0, 8)))} max={4} />
            <span className="whitespace-nowrap text-[12px] tabular-nums text-subtle">{aggregateMembers.length} kişi</span>
          </span>
        )}
        {canManage && !renaming && (
          <div className="flex shrink-0 items-center">
            <IconButton
              size="sm"
              onClick={() => { setDraftName(dept.name); setRenaming(true); }}
              aria-label={`${dept.name} — yeniden adlandır`}
              title="Yeniden adlandır"
            >
              <Pencil size={13} />
            </IconButton>
            <IconButton
              size="sm"
              onClick={() => onDelete(dept.id)}
              aria-label={`${dept.name} — sil`}
              title="Sil"
              className="hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 size={13} />
            </IconButton>
          </div>
        )}
      </div>

      {rowError && (
        <p role="alert" className="anim-fade-down mb-1 ml-6 text-[12.5px] leading-relaxed text-danger">
          {rowError}
        </p>
      )}

      {open && (
        <div className="anim-fade space-y-1 pb-2 pl-6">
          {/* Members of this dept */}
          {myMembers.length === 0 && (
            <p className="py-1 text-[12.5px] text-subtle">Henüz kimse yok.</p>
          )}
          {myMembers.map((dm) => (
            <DeptMemberRow
              key={dm.id}
              dm={dm}
              canManage={canManage}
              onRemove={requestRemoveMember}
            />
          ))}

          {/* Add member toggle */}
          {canManage && !showAddMember && (
            <Button size="sm" variant="ghost" className="-ml-3" onClick={() => setShowAddMember(true)}>
              <UserPlus size={13} aria-hidden /> Kişi ekle
            </Button>
          )}
          {canManage && showAddMember && (
            <AddMemberForm
              departmentId={dept.id}
              existingMemberIds={existingMemberIds}
              workspaceMembers={workspaceMembers}
              onDone={() => setShowAddMember(false)}
            />
          )}

          {/* Child departments */}
          {children && <div className="mt-2 space-y-1">{children}</div>}
        </div>
      )}

      <ConfirmDialog
        open={removeTarget !== null}
        pending={pendingRemove}
        title="Departmandan çıkarmak istiyor musunuz?"
        confirmLabel="Çıkar"
        message={`${removeTarget?.name ?? "Bu kişi"} bu departmandan çıkarılacak.`}
        onConfirm={confirmRemoveMember}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}

function AddDeptForm({
  parentId,
  onDone,
}: {
  parentId?: string | null;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function handleCreate() {
    if (!name.trim()) return;
    setErr(null);
    startTransition(async () => {
      const res = await createDepartment({ name: name.trim(), parentId: parentId ?? null });
      if ("error" in res) setErr(res.error);
      else onDone();
    });
  }

  return (
    <div className="anim-fade flex flex-wrap items-center gap-2">
      <TextInput
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") onDone(); }}
        placeholder={parentId ? "Alt alan adı" : "Departman adı"}
        aria-label={parentId ? "Alt alan adı" : "Departman adı"}
        autoFocus
        className="h-8 min-w-0 flex-1"
      />
      <Button size="sm" onClick={handleCreate} disabled={!name.trim()} loading={pending}>
        Oluştur
      </Button>
      <Button size="sm" variant="ghost" onClick={onDone} disabled={pending}>Vazgeç</Button>
      {err && <p role="alert" className="anim-fade-down w-full text-[12.5px] text-danger">{err}</p>}
    </div>
  );
}

export function DepartmentsManager({ departments, deptMembers, workspaceMembers, canManage }: Props) {
  const [showAddTop, setShowAddTop] = useState(false);
  const [showAddChild, setShowAddChild] = useState<string | null>(null);
  const [provisioning, startProvisioning] = useTransition();
  const [pendingDelete, startDelete] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [provisionErr, setProvisionErr] = useState<string | null>(null);
  const [provisionOk, setProvisionOk] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  const topLevel = departments.filter((d) => d.parent_id === null).sort((a, b) => a.position - b.position);
  const children = (parentId: string) =>
    departments.filter((d) => d.parent_id === parentId).sort((a, b) => a.position - b.position);

  // Deduped member rows for a department's collapsed header. A top-level
  // department aggregates its own members plus everyone in its child
  // departments, de-duplicated by member_id; a child shows its direct members.
  const aggregateFor = (deptId: string) => {
    const childIds = new Set(children(deptId).map((c) => c.id));
    const byMember = new Map<string, (DepartmentMember & { profiles?: Partial<Profile> | null })>();
    for (const dm of deptMembers) {
      if (dm.department_id === deptId || childIds.has(dm.department_id)) {
        if (!byMember.has(dm.member_id)) byMember.set(dm.member_id, dm);
      }
    }
    return [...byMember.values()];
  };
  // Resolve a department's effective colour: canonical/stored, else inherit parent.
  const colorFor = (dept: WorkspaceDepartment) => {
    const own = resolveDeptColorKey(dept.name, dept.color_key ?? null);
    if (own) return own;
    if (dept.parent_id) {
      const parent = departments.find((d) => d.id === dept.parent_id);
      if (parent) return resolveDeptColorKey(parent.name, parent.color_key ?? null);
    }
    return null;
  };

  function handleDelete(id: string) {
    const dept = departments.find((d) => d.id === id);
    setDeleteTarget({ id, name: dept?.name ?? "Bu departman" });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteErr(null);
    startDelete(async () => {
      const res = await deleteDepartment(id);
      setDeleteTarget(null);
      // Silme sessizce başarısız oluyordu: pencere kapanıyor, departman
      // listede kalıyor, kullanıcı sebebini hiç öğrenmiyordu.
      if ("error" in res) setDeleteErr(res.error);
    });
  }

  function handleProvision() {
    setProvisionErr(null);
    setProvisionOk(false);
    startProvisioning(async () => {
      const res = await provisionAfDepartments();
      if ("error" in res) setProvisionErr(res.error);
      else setProvisionOk(true);
    });
  }

  return (
    <div className="space-y-4">
      {deleteErr && (
        <p
          role="alert"
          className="anim-fade-down rounded-control border border-danger/25 bg-danger/8 px-3 py-2 text-[12.5px] leading-relaxed text-danger"
        >
          {deleteErr}
        </p>
      )}

      {/* AF departman ağacı hiç yüklenmemişse: sakin bir uyarı + tek eylem.
          Ham amber kutu ve amber düğme token'lı warning yüzeyine döndü. */}
      {canManage && departments.length === 0 && (
        <div className="anim-fade-up space-y-3 rounded-card border border-warning/30 bg-warning/5 px-4 py-3.5">
          <p className="text-[13.5px] text-ink">
            AF Operasyon departman ağacı henüz yüklenmemiş.
          </p>
          <Button variant="secondary" size="sm" onClick={handleProvision} loading={provisioning}>
            Departman yapısını yükle
          </Button>
          {provisionErr && <p role="alert" className="anim-fade-down text-[12.5px] text-danger">{provisionErr}</p>}
          {provisionOk && <p className="anim-fade-down text-[12.5px] text-success">Departman yapısı yüklendi.</p>}
        </div>
      )}

      {/* Empty state — nothing to render and nothing to provision (non-managers,
          or a manager after the provision banner above). Visual only. */}
      {topLevel.length === 0 && !(canManage && departments.length === 0) && (
        <EmptyState
          icon={Building2}
          title="Henüz departman yok"
          description="Departmanlar görevleri ekiplere göre gruplar."
          compact
        />
      )}

      {/* Department tree — ince çizgiyle ayrılmış satırlar. */}
      {topLevel.length > 0 && (
        <div className="stagger-children divide-y divide-hairline border-t border-hairline">
          {topLevel.map((dept) => (
            <div key={dept.id} className="py-1">
              <DeptCard
                dept={dept}
                deptMembers={deptMembers}
                aggregateMembers={aggregateFor(dept.id)}
                colorKey={colorFor(dept)}
                workspaceMembers={workspaceMembers}
                canManage={canManage}
                onDelete={handleDelete}
              >
                {/* Sub-departments */}
                {children(dept.id).map((child) => (
                  <DeptCard
                    key={child.id}
                    dept={child}
                    deptMembers={deptMembers}
                    aggregateMembers={aggregateFor(child.id)}
                    colorKey={colorFor(child)}
                    workspaceMembers={workspaceMembers}
                    canManage={canManage}
                    onDelete={handleDelete}
                  />
                ))}

                {/* Add sub-department */}
                {canManage && (
                  <div className="ml-3 pl-3">
                    {showAddChild === dept.id ? (
                      <AddDeptForm parentId={dept.id} onDone={() => setShowAddChild(null)} />
                    ) : (
                      <Button size="sm" variant="ghost" className="-ml-3" onClick={() => setShowAddChild(dept.id)}>
                        <Plus size={13} aria-hidden /> Alt alan ekle
                      </Button>
                    )}
                  </div>
                )}
              </DeptCard>
            </div>
          ))}
        </div>
      )}

      {/* Add top-level department */}
      {canManage && (
        <div>
          {showAddTop ? (
            <AddDeptForm parentId={null} onDone={() => setShowAddTop(false)} />
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setShowAddTop(true)}>
              <Plus size={14} aria-hidden /> Departman ekle
            </Button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        pending={pendingDelete}
        title="Departmanı silmek istiyor musunuz?"
        message={`${deleteTarget?.name ?? "Bu departman"} silinecek. Mevcut görevler korunur.`}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
