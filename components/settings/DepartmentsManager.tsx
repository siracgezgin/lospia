"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, Trash2, UserPlus, UserMinus } from "lucide-react";
import type { WorkspaceDepartment, DepartmentMember, WorkspaceMember, Profile } from "@/types";
import { Avatar, AvatarGroup } from "@/components/ui/Avatar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { getPersonDisplayName } from "@/lib/utils/person-display";
import { resolveDeptColorKey } from "@/lib/utils/departments";
import {
  provisionAfDepartments,
  createDepartment,
  deleteDepartment,
  addDepartmentMember,
  removeDepartmentMember,
} from "@/lib/actions/departments";

type MemberRow = WorkspaceMember & { profiles?: Partial<Profile> | null };

interface Props {
  departments: WorkspaceDepartment[];
  deptMembers: (DepartmentMember & { profiles?: Partial<Profile> | null })[];
  workspaceMembers: MemberRow[];
  canManage: boolean;
}

const COLOR_CLASSES: Record<string, string> = {
  red:    "bg-red-100 text-red-700",
  purple: "bg-purple-100 text-purple-700",
  orange: "bg-orange-100 text-orange-700",
  blue:   "bg-blue-100 text-blue-700",
  pink:   "bg-pink-100 text-pink-700",
  green:  "bg-green-100 text-green-700",
  teal:   "bg-teal-100 text-teal-700",
  amber:  "bg-amber-100 text-amber-700",
  brown:  "bg-amber-100 text-amber-800",
  slate:  "bg-slate-100 text-slate-700",
};

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
  onRemove: (id: string) => void;
}) {
  const name = getPersonDisplayName(dm.profiles ?? dm.member_id.slice(0, 8));
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-1.5 text-sm text-gray-700">
        <Avatar name={name} size="xs" />
        <span title={name}>{name}</span>
      </div>
      {canManage && (
        <button
          onClick={() => onRemove(dm.id)}
          className="p-1 text-gray-400 hover:text-red-500 rounded"
          title="Departmandan çıkar"
        >
          <UserMinus size={13} />
        </button>
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
    return <p className="text-xs text-gray-400 mt-1">Tüm üyeler zaten eklendi.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2 mt-2 items-center">
      <select
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-700"
      >
        <option value="">Üye seç…</option>
        {available.map((m) => (
          <option key={m.id} value={m.id}>{memberName(m)}</option>
        ))}
      </select>
      <button
        onClick={handleAdd}
        disabled={!selectedId || pending}
        className="text-xs bg-blue-600 text-white px-2.5 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {pending ? "Ekleniyor…" : "Ekle"}
      </button>
      <button onClick={onDone} className="text-xs text-gray-500 hover:text-gray-700 px-1">İptal</button>
      {err && <p className="text-xs text-red-600 w-full">{err}</p>}
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
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);
  const [pendingRemove, startTransition] = useTransition();
  const router = useRouter();

  const colorClass = colorKey ? (COLOR_CLASSES[colorKey] ?? "bg-gray-100 text-gray-700") : "bg-gray-100 text-gray-700";
  const myMembers = deptMembers.filter((dm) => dm.department_id === dept.id);
  const existingMemberIds = new Set(myMembers.map((dm) => dm.member_id));

  function requestRemoveMember(dmId: string) {
    const dm = myMembers.find((m) => m.id === dmId);
    setRemoveTarget({ id: dmId, name: getPersonDisplayName(dm?.profiles ?? dmId.slice(0, 8)) });
  }

  function confirmRemoveMember() {
    if (!removeTarget) return;
    const id = removeTarget.id;
    startTransition(async () => {
      await removeDepartmentMember(id);
      setRemoveTarget(null);
      router.refresh();
    });
  }

  const isTopLevel = dept.parent_id === null;

  return (
    <div className={`border rounded-lg ${isTopLevel ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50 ml-4"}`}>
      <div
        className="flex items-center gap-2 px-4 py-3 cursor-pointer"
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronRight
          size={14}
          className={`text-gray-400 transition-transform shrink-0 ${open ? "rotate-90" : ""}`}
        />
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colorClass}`}>
          {dept.name}
        </span>
        {aggregateMembers.length > 0 && (
          <div className="flex items-center gap-1.5 ml-auto">
            <AvatarGroup names={aggregateMembers.map((dm) => getPersonDisplayName(dm.profiles ?? dm.member_id.slice(0, 8)))} max={4} />
            <span className="text-xs text-gray-400">{aggregateMembers.length} kişi</span>
          </div>
        )}
        {canManage && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(dept.id); }}
            className="p-1 text-gray-300 hover:text-red-500 rounded ml-1 shrink-0"
            title="Sil"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {open && (
        <div className="px-4 pb-3 space-y-1 border-t border-gray-100 pt-2">
          {/* Members of this dept */}
          {myMembers.length === 0 && (
            <p className="text-xs text-gray-400">Henüz üye yok.</p>
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
            <button
              onClick={() => setShowAddMember(true)}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 mt-1"
            >
              <UserPlus size={12} /> Üye ekle
            </button>
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
        title="Silmek istediğinize emin misiniz?"
        message={`${removeTarget?.name ?? "Bu kişi"} bu departmandan kaldırılacak.`}
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
    <div className="flex flex-wrap gap-2 items-center">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") onDone(); }}
        placeholder="Departman adı…"
        autoFocus
        className="text-sm border border-gray-300 rounded px-2 py-1 flex-1 min-w-0"
      />
      <button
        onClick={handleCreate}
        disabled={!name.trim() || pending}
        className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {pending ? "Oluşturuluyor…" : "Oluştur"}
      </button>
      <button onClick={onDone} className="text-sm text-gray-500 hover:text-gray-700">İptal</button>
      {err && <p className="text-xs text-red-600 w-full">{err}</p>}
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
    startDelete(async () => {
      await deleteDepartment(id);
      setDeleteTarget(null);
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
      {/* Provision AF departments button */}
      {canManage && departments.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <p className="text-sm text-amber-800">
            AF Operasyon departman ağacı henüz yüklenmemiş.
          </p>
          <button
            onClick={handleProvision}
            disabled={provisioning}
            className="text-sm bg-amber-700 text-white px-4 py-1.5 rounded-lg hover:bg-amber-800 disabled:opacity-50"
          >
            {provisioning ? "Eşitleniyor…" : "AF departman yapısını eşitle"}
          </button>
          {provisionErr && <p className="text-xs text-red-600">{provisionErr}</p>}
          {provisionOk && <p className="text-xs text-green-700">Departman yapısı eşitlendi.</p>}
        </div>
      )}

      {/* Department tree */}
      <div className="space-y-2">
        {topLevel.map((dept) => (
          <div key={dept.id}>
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
                <div className="ml-4 mt-1">
                  {showAddChild === dept.id ? (
                    <AddDeptForm parentId={dept.id} onDone={() => setShowAddChild(null)} />
                  ) : (
                    <button
                      onClick={() => setShowAddChild(dept.id)}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600"
                    >
                      <Plus size={11} /> Alt alan ekle
                    </button>
                  )}
                </div>
              )}
            </DeptCard>
          </div>
        ))}
      </div>

      {/* Add top-level department */}
      {canManage && (
        <div>
          {showAddTop ? (
            <AddDeptForm parentId={null} onDone={() => setShowAddTop(false)} />
          ) : (
            <button
              onClick={() => setShowAddTop(true)}
              className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700"
            >
              <Plus size={14} /> Departman ekle
            </button>
          )}
        </div>
      )}

      {/* Maintenance — tucked away so normal users don't think they must run it */}
      {departments.length > 0 && canManage && (
        <details className="mt-4 border-t border-gray-100 pt-3">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 select-none">
            Bakım / Sistem işlemleri
          </summary>
          <div className="mt-2 space-y-2">
            <p className="text-xs text-gray-500">
              Eksik AF departmanlarını yeniden oluşturur; mevcut görevleri veya üye atamalarını silmez.
            </p>
            <button
              onClick={handleProvision}
              disabled={provisioning}
              className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded hover:bg-gray-200 disabled:opacity-50"
            >
              {provisioning ? "Eşitleniyor…" : "AF departman yapısını eşitle"}
            </button>
            {provisionErr && <p className="text-xs text-red-600">{provisionErr}</p>}
            {provisionOk && <p className="text-xs text-green-700">Departman yapısı eşitlendi.</p>}
          </div>
        </details>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        pending={pendingDelete}
        title="Silmek istediğinize emin misiniz?"
        message={`${deleteTarget?.name ?? "Bu departman"} silinecek. Mevcut görevler korunur.`}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
