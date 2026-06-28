"use client";

import { useState, useTransition } from "react";
import { ChevronRight, Plus, Trash2, UserPlus, UserMinus, Crown } from "lucide-react";
import type { WorkspaceDepartment, DepartmentMember, WorkspaceMember, Profile } from "@/types";
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
  purple: "bg-purple-100 text-purple-700",
  orange: "bg-orange-100 text-orange-700",
  blue:   "bg-blue-100 text-blue-700",
  pink:   "bg-pink-100 text-pink-700",
  green:  "bg-green-100 text-green-700",
  amber:  "bg-amber-100 text-amber-700",
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
  const name = dm.profiles?.full_name ?? dm.profiles?.email ?? dm.member_id.slice(0, 8);
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-1.5 text-sm text-gray-700">
        {dm.role === "lead" && <Crown size={12} className="text-amber-500 shrink-0" />}
        <span>{name}</span>
        {dm.role === "lead" && <span className="text-xs text-amber-600">(sorumlu)</span>}
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
  const [role, setRole] = useState<"lead" | "member">("member");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const available = workspaceMembers.filter((m) => !existingMemberIds.has(m.id));

  function handleAdd() {
    if (!selectedId) return;
    setErr(null);
    startTransition(async () => {
      const res = await addDepartmentMember(departmentId, selectedId, role);
      if ("error" in res) setErr(res.error);
      else onDone();
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
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as "lead" | "member")}
        className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-700"
      >
        <option value="member">Üye</option>
        <option value="lead">Sorumlu</option>
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
  workspaceMembers,
  canManage,
  onDelete,
}: {
  dept: WorkspaceDepartment;
  children?: React.ReactNode;
  deptMembers: (DepartmentMember & { profiles?: Partial<Profile> | null })[];
  workspaceMembers: MemberRow[];
  canManage: boolean;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [, startTransition] = useTransition();

  const colorClass = dept.color_key ? (COLOR_CLASSES[dept.color_key] ?? "bg-gray-100 text-gray-700") : "bg-gray-100 text-gray-700";
  const myMembers = deptMembers.filter((dm) => dm.department_id === dept.id);
  const existingMemberIds = new Set(myMembers.map((dm) => dm.member_id));

  function handleRemoveMember(dmId: string) {
    startTransition(async () => {
      await removeDepartmentMember(dmId);
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
        {myMembers.length > 0 && (
          <span className="text-xs text-gray-400 ml-auto">
            {myMembers.length} kişi
          </span>
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
              onRemove={handleRemoveMember}
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
  const [, startDelete] = useTransition();
  const [provisionErr, setProvisionErr] = useState<string | null>(null);

  const topLevel = departments.filter((d) => d.parent_id === null).sort((a, b) => a.position - b.position);
  const children = (parentId: string) =>
    departments.filter((d) => d.parent_id === parentId).sort((a, b) => a.position - b.position);

  function handleDelete(id: string) {
    if (!confirm("Bu departmanı silmek istediğinizden emin misiniz?")) return;
    startDelete(async () => {
      await deleteDepartment(id);
    });
  }

  function handleProvision() {
    setProvisionErr(null);
    startProvisioning(async () => {
      const res = await provisionAfDepartments();
      if ("error" in res) setProvisionErr(res.error);
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
            {provisioning ? "Yükleniyor…" : "AF departmanlarını yükle"}
          </button>
          {provisionErr && <p className="text-xs text-red-600">{provisionErr}</p>}
        </div>
      )}

      {/* Department tree */}
      <div className="space-y-2">
        {topLevel.map((dept) => (
          <div key={dept.id}>
            <DeptCard
              dept={dept}
              deptMembers={deptMembers}
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

      {departments.length > 0 && canManage && (
        <button
          onClick={handleProvision}
          disabled={provisioning}
          className="text-xs text-gray-400 hover:text-gray-600 underline"
        >
          {provisioning ? "Güncelleniyor…" : "AF departmanlarını yeniden yükle (idempotent)"}
        </button>
      )}
      {provisionErr && <p className="text-xs text-red-600">{provisionErr}</p>}
    </div>
  );
}
