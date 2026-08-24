"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, UserMinus, Pencil, UserPlus } from "lucide-react";
import {
  revokeTeamAccess,
  changeWorkspaceMemberRole,
  removeWorkspaceMemberAccount,
  renameWorkspaceMember,
  setMemberUsername,
  setMemberNotificationEmail,
} from "@/lib/actions/workspace";
import { getDisplayNotificationEmail } from "@/lib/utils/notification-email";
import type {
  WorkspaceMember, Profile, WorkspaceInvite, WorkspaceRole,
  WorkspaceDepartment, DepartmentMember,
} from "@/types";
import { roleLabel } from "@/lib/utils/roles";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Card } from "@/components/ui/Card";
import { buildDeptMeta } from "@/lib/utils/departments";
import { getDepartmentBadge } from "@/lib/design/semantics";
import { cn } from "@/lib/utils/cn";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import { saveMemberIdentity } from "@/lib/actions/member-identity";
import { usePersonIdentities, type IdentityMember } from "@/components/settings/PersonIdentityManager";
import { MemberEditPanel } from "@/components/settings/MemberEditPanel";

interface MemberRow extends WorkspaceMember {
  profiles?: Partial<Profile> | null;
}

interface Props {
  workspaceId: string;
  currentUserId: string;
  userRole: WorkspaceRole;
  initialMembers: MemberRow[];
  /** Allowed e-mails that have not joined yet (team-access grants). */
  pendingGrants: WorkspaceInvite[];
  departments?: WorkspaceDepartment[];
  deptMembers?: DepartmentMember[];
  /** Kişi kimlikleri (renk + fotoğraf). Ayrı bir liste DEĞİL — Aslı Hanım
   *  (2026-08-23): "Burayı neden tek başlık altında toplamıyoruz." */
  identities?: IdentityMember[];
  canManageIdentity?: boolean;
  /** "Kişi ekle" formu — aynı başlık altında, açılır. */
  createPanel?: React.ReactNode;
}

export function MembersManager({
  currentUserId,
  userRole,
  initialMembers,
  pendingGrants,
  departments = [],
  deptMembers = [],
  identities = [],
  canManageIdentity = false,
  createPanel,
}: Props) {
  const router = useRouter();
  const [members, setMembers] = useState(initialMembers);
  const [grants, setGrants] = useState(pendingGrants);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  /* KİMLİK (renk + fotoğraf) — ayrı bölüm değil, üyenin kendi satırında.
     Önce iki ayrı kart aynı sekiz kişiyi iki kez listeliyordu. */
  const { tones, usedColors, clashes } = usePersonIdentities(identities);
  const identityOf = new Map(identities.map((i) => [i.id, i]));
  const [addOpen, setAddOpen] = useState(false);

  function saveIdentity(m: IdentityMember, next: { colorKey?: string | null; iconKey?: string | null }) {
    setError(null);
    startTransition(async () => {
      const res = await saveMemberIdentity(m.id, {
        colorKey: next.colorKey !== undefined ? next.colorKey : m.colorKey,
        iconKey: next.iconKey !== undefined ? next.iconKey : m.iconKey,
      });
      if ("error" in res) { setError(res.error); return; }
      router.refresh();
    });
  }

  /** Açık düzenleme paneli — üye başına TEK. */
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);

  /** Silme/kaldırma onayı — üye satırı ya da bekleyen davet. */
  const [confirm, setConfirm] = useState<
    | { kind: "member"; id: string; label: string }
    | { kind: "grant"; id: string; label: string }
    | null
  >(null);

  const isOwner = userRole === "owner";

  /**
   * Tek kaydetme akışı.
   *
   * YALNIZ DEĞİŞEN alan sunucuya gider: isim değişmediyse yeniden yazılmaz,
   * kullanıcı adı değişmediyse tekillik denetimine hiç girilmez. İlk hatada
   * durur ve mesajı gösterir — yarım kaydedilmiş bir üye bırakmaz.
   */
  function handleSaveMember(
    m: MemberRow,
    ident: IdentityMember | null,
    next: {
      fullName: string; username: string; notificationEmail: string;
      role: "admin" | "member" | "viewer"; colorKey: string; iconKey: string;
    },
  ) {
    setError(null);
    startTransition(async () => {
      const name = next.fullName.trim();
      if (name && name !== (m.profiles?.full_name ?? "")) {
        const r = await renameWorkspaceMember(m.id, name);
        if ("error" in r) { setError(r.error); return; }
        setMembers((prev) => prev.map((x) =>
          x.id === m.id ? { ...x, profiles: { ...(x.profiles ?? {}), full_name: name } } : x));
      }

      const username = next.username.trim().toLowerCase();
      if (username && username !== (m.profiles?.username ?? "")) {
        const r = await setMemberUsername(m.id, username);
        if ("error" in r) { setError(r.error); return; }
        setMembers((prev) => prev.map((x) =>
          x.id === m.id ? { ...x, profiles: { ...(x.profiles ?? {}), username } } : x));
      }

      const mail = next.notificationEmail.trim();
      if (mail !== (m.notification_email ?? "")) {
        const r = await setMemberNotificationEmail({
          memberId: m.id,
          notificationEmail: mail === "" ? null : mail,
        });
        if ("error" in r) { setError(r.error); return; }
        setMembers((prev) => prev.map((x) =>
          x.id === m.id ? { ...x, notification_email: r.notificationEmail } : x));
      }

      // Rol yalnız çalışma alanı sahibinde; sahip satırının rolü değişmez.
      if (isOwner && m.role !== "owner" && next.role !== m.role) {
        const r = await changeWorkspaceMemberRole(m.id, next.role);
        if ("error" in r) { setError(r.error); return; }
        setMembers((prev) => prev.map((x) => (x.id === m.id ? { ...x, role: next.role } : x)));
      }

      if (ident && (next.colorKey !== (ident.colorKey ?? "") || next.iconKey !== (ident.iconKey ?? ""))) {
        const r = await saveMemberIdentity(m.id, { colorKey: next.colorKey, iconKey: next.iconKey });
        if ("error" in r) { setError(r.error); return; }
      }

      setEditingMemberId(null);
      router.refresh();
    });
  }

  // member_id (workspace_members.id) → department badges (name + effective colour)
  const deptMeta = buildDeptMeta(departments);
  const deptsByMember = new Map<string, { name: string; color: string | null }[]>();
  for (const dm of deptMembers) {
    const meta = deptMeta[dm.department_id];
    if (!meta) continue;
    const arr = deptsByMember.get(dm.member_id) ?? [];
    arr.push({ name: meta.name, color: meta.color });
    deptsByMember.set(dm.member_id, arr);
  }

  function runConfirmedDelete() {
    if (!confirm) return;
    const target = confirm;
    setError(null);
    startTransition(async () => {
      if (target.kind === "grant") {
        const result = await revokeTeamAccess(target.id);
        if ("error" in result) { setError(result.error); setConfirm(null); return; }
        setGrants((prev) => prev.filter((g) => g.id !== target.id));
      } else {
        const result = await removeWorkspaceMemberAccount(target.id);
        if ("error" in result) { setError(result.error); setConfirm(null); return; }
        setMembers((prev) => prev.filter((m) => m.id !== target.id));
        // Reflect the server-side cleanup (auth user / profile removal) so the
        // list can't show a stale row after a refresh.
        router.refresh();
      }
      setConfirm(null);
    });
  }

  return (
    <div className="space-y-4">
      {/* Kişi ekle — ayrı bir "Hesap oluştur" kartı DEĞİL. Aslı Hanım
          (2026-08-23): "Bunların tamamı aynı başlıkta toplanabilir."
          Ekibe kişi eklemek ekip yönetiminin parçası; formu isteyen açar. */}
      {createPanel && (
        <div>
          <button
            onClick={() => setAddOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-muted transition-all duration-150 hover:border-line-strong hover:bg-surface-muted hover:text-ink active:scale-[0.98]"
            aria-expanded={addOpen}
          >
            <UserPlus size={14} /> {addOpen ? "Vazgeç" : "Kişi ekle"}
          </button>
          {addOpen && <div className="anim-fade-down mt-3">{createPanel}</div>}
        </div>
      )}

      {/* Palet tükendiyse iki kişi aynı rengi paylaşır — sessizce yapılmaz. */}
      {clashes.length > 0 && (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[12.5px] leading-relaxed text-ink">
          Otomatik atama şu kişilere aynı rengi verdi:{" "}
          <strong className="font-semibold">{clashes.map((n) => n.join(" / ")).join(" · ")}</strong>.
          Satırdaki palet düğmesinden birine başka bir renk verebilirsiniz — hex de yazılabilir.
        </p>
      )}

      {/* Current members */}
      <Card className="divide-y divide-hairline">
        {members.map((m) => {
          const isSelf = m.user_id === currentUserId;
          const isOwnerRow = m.role === "owner";
          const canManage = isOwner && !isSelf && !isOwnerRow;

          return (
            <div key={m.id} className="px-4 py-3 transition-colors duration-150 hover:bg-surface-hover sm:px-5">
            <div className="flex items-start justify-between gap-3">
              {/* Kimlik rozeti — panodaki, rapordaki ve görev kartındakiyle
                  AYNI. Fotoğraf varsa fotoğraf, yoksa kişinin kendi renginde
                  baş harfleri (Aslı Hanım, 2026-08-24: "ikon kalkıp herkesin
                  resmi gelecek… resmi olmayan yine aynı şekilde"). */}
              {(() => {
                const ident = identityOf.get(m.id);
                if (!ident) return null;
                const tone = tones[ident.userId];
                if (!tone) return null;
                return (
                  <PersonAvatar
                    name={ident.name}
                    photoUrl={ident.avatarUrl ?? null}
                    colorHex={tone.hex}
                    size="md"
                    className="mt-0.5"
                  />
                );
              })()}
              <div className="flex-1 min-w-0">
                {/* Satır SALT OKUR. Düzenleme tek panelde (MemberEditPanel) —
                    Aslı Hanım (2026-08-24): "Her kısmı böyle düzeltmek yerine
                    daha profesyonel düzenleme kısmı olmalı her üye için."
                    Önce isim, kullanıcı adı ve e-posta üç ayrı kalemdi. */}
                <p className="flex items-center gap-1.5 truncate text-sm font-medium text-ink">
                  <span className="truncate">{m.profiles?.full_name ?? m.profiles?.email ?? "—"}</span>
                  {isSelf && <span className="shrink-0 text-[10px] text-subtle">(siz)</span>}
                </p>
                <p className="truncate text-xs text-muted">
                  {m.profiles?.username ? `@${m.profiles.username}` : "Kullanıcı adı yok"}
                </p>
                {(() => {
                  // notification_email → gerçek profiles.email → "eklenmedi".
                  // @lospia.local giriş yer tutucuları adres olarak gösterilmez.
                  const display = getDisplayNotificationEmail(m);
                  return (
                    <p className={cn("truncate text-xs", display.email ? "text-subtle" : "text-warning")}>
                      {display.email ?? "Bildirim e-postası eklenmedi"}
                    </p>
                  );
                })()}
                {(deptsByMember.get(m.id) ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {(deptsByMember.get(m.id) ?? []).map((d) => {
                      const badge = getDepartmentBadge(d.color);
                      return (
                        <span
                          key={d.name}
                          className={cn(
                            "inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ring-1",
                            badge.chip,
                            badge.ring,
                          )}
                        >
                          <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", badge.dot)} />
                          {d.name}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Sağ blok: rol rozeti (salt okur) + TEK "Düzenle" + kaldırma.
                  Rol seçici de panele taşındı — satırda beş ayrı etkileşim
                  vardı, artık bir tane. */}
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-full bg-surface-sunken px-2.5 py-0.5 text-xs text-muted">
                  {roleLabel(m.role)}
                </span>
                {(canManage || canManageIdentity) && (
                  <button
                    onClick={() => setEditingMemberId(editingMemberId === m.id ? null : m.id)}
                    className="tap-target rounded-md p-1 text-subtle transition-colors duration-150 hover:bg-surface-muted hover:text-ink active:scale-95"
                    aria-label="Üyeyi düzenle"
                    aria-expanded={editingMemberId === m.id}
                    title="Düzenle"
                  >
                    <Pencil size={13} />
                  </button>
                )}
                {canManage && (
                  <button
                    onClick={() => setConfirm({
                      kind: "member",
                      id: m.id,
                      label: m.profiles?.full_name ?? m.profiles?.email ?? "",
                    })}
                    disabled={isPending}
                    className="tap-target rounded-md p-1 text-subtle transition-colors duration-150 hover:bg-danger/10 hover:text-danger active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                    aria-label="Üyeyi kaldır"
                  >
                    <UserMinus size={13} />
                  </button>
                )}
              </div>
            </div>

            {editingMemberId === m.id && (() => {
              const ident = identityOf.get(m.id) ?? null;
              return (
                <MemberEditPanel
                  member={ident}
                  draft={{
                    fullName: m.profiles?.full_name ?? "",
                    username: m.profiles?.username ?? "",
                    notificationEmail: m.notification_email ?? "",
                    role: (m.role === "owner" ? "admin" : m.role) as "admin" | "member" | "viewer",
                    colorKey: ident?.colorKey ?? "",
                    iconKey: ident?.iconKey ?? "",
                  }}
                  canManageRole={canManage}
                  canManageIdentity={canManageIdentity && !!ident}
                  usedColors={usedColors}
                  busy={isPending}
                  onCancel={() => setEditingMemberId(null)}
                  onResetIdentity={() => { if (ident) saveIdentity(ident, { colorKey: "", iconKey: "" }); }}
                  onSave={(next) => handleSaveMember(m, ident, next)}
                />
              );
            })()}
            </div>
          );
        })}
      </Card>

      {/* Legacy team-access grants. Self-signup is DISABLED — new people are added
          via "Hesap oluştur" above. Any leftover pending grants from the old flow
          are shown here so an owner can revoke them; no new ones can be added. */}
      {isOwner && grants.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-subtle">Bekleyen eski erişimler</p>
          <p className="text-xs text-subtle mt-1 mb-2">
            Self-signup kapatıldı. Aşağıdaki eski kayıtlar artık kullanılmıyor; kaldırabilirsiniz.
          </p>
          <Card className="divide-y divide-hairline">
            {grants.map((g) => (
              <div key={g.id} className="flex items-center justify-between px-5 py-3 gap-3 transition-colors duration-150 hover:bg-surface-hover">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink truncate">
                    {g.username ? `@${g.username}` : "—"}
                  </p>
                  <p className="text-xs text-subtle truncate">{g.email}</p>
                  <p className="text-xs text-subtle">{roleLabel(g.role)} · Kullanılmıyor</p>
                </div>
                <button
                  onClick={() => setConfirm({ kind: "grant", id: g.id, label: g.email })}
                  disabled={isPending}
                  className="p-1 rounded-md text-subtle hover:text-danger hover:bg-danger/10 active:scale-95 disabled:pointer-events-none disabled:opacity-50 transition-colors duration-150"
                  aria-label="Erişimi kaldır"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </Card>
        </div>
      )}

      {error && <p role="alert" className="anim-fade-down text-xs text-danger">{error}</p>}

      <ConfirmDialog
        open={confirm !== null}
        pending={isPending}
        title={
          confirm?.kind === "member"
            ? "Bu kullanıcıyı silmek istediğinizden emin misiniz?"
            : "Silmek istediğinize emin misiniz?"
        }
        confirmLabel={confirm?.kind === "member" ? "Evet, sil" : "Sil"}
        message={
          confirm?.kind === "grant"
            ? `${confirm.label} için ekip erişimi kaldırılacak.`
            : confirm?.kind === "member"
              ? `${confirm.label} silinecek. Bu işlem kullanıcının giriş erişimini kaldırır ve hesabını sistemden temizler. Oluşturduğu görev/not kayıtları korunur.`
              : ""
        }
        onConfirm={runConfirmedDelete}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
