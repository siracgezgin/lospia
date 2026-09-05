"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, UserMinus, Pencil, UserPlus, Check } from "lucide-react";
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
import { Button, IconButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { buildDeptMeta } from "@/lib/utils/departments";
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
  /* "Kaydedildi" geri bildirimi. Panel kapanınca ekranda hiçbir iz kalmıyordu;
     kullanıcı kaydın gidip gitmediğini anlamıyordu. */
  const [notice, setNotice] = useState<string | null>(null);

  /* KİMLİK (renk + fotoğraf) — ayrı bölüm değil, üyenin kendi satırında.
     Önce iki ayrı kart aynı sekiz kişiyi iki kez listeliyordu. */
  const { tones, usedColors, clashes } = usePersonIdentities(identities);
  const identityOf = new Map(identities.map((i) => [i.id, i]));
  const [addOpen, setAddOpen] = useState(false);

  function saveIdentity(
    m: IdentityMember,
    next: { colorKey?: string | null; iconKey?: string | null; jobTitle?: string | null },
  ) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await saveMemberIdentity(m.id, {
        colorKey: next.colorKey !== undefined ? next.colorKey : m.colorKey,
        iconKey: next.iconKey !== undefined ? next.iconKey : m.iconKey,
        jobTitle: next.jobTitle !== undefined ? next.jobTitle : (m.jobTitle ?? null),
      });
      if ("error" in res) { setError(res.error); return; }
      router.refresh();
    });
  }

  /** Açık düzenleme paneli — üye başına TEK. */
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);

  /** Silme/kaldırma onayı — üye satırı ya da bekleyen davet.
   *  Üye silme ÇİFT ONAYLIDIR (`stage`): ilk pencere ne olacağını anlatır,
   *  ikincisi son onayı ister. Bir kişinin hesabını silmek geri alınamaz ve
   *  tek tıkla olmamalı. */
  const [confirm, setConfirm] = useState<
    | { kind: "member"; id: string; label: string; stage: 1 | 2 }
    | { kind: "grant"; id: string; label: string; stage: 1 }
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
      jobTitle: string;
    },
  ) {
    setError(null);
    setNotice(null);
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

      if (
        ident &&
        (next.colorKey !== (ident.colorKey ?? "") ||
          next.iconKey !== (ident.iconKey ?? "") ||
          next.jobTitle.trim() !== (ident.jobTitle ?? ""))
      ) {
        const r = await saveMemberIdentity(m.id, {
          colorKey: next.colorKey, iconKey: next.iconKey, jobTitle: next.jobTitle,
        });
        if ("error" in r) { setError(r.error); return; }
      }

      setEditingMemberId(null);
      setNotice(`${name || "Üye"} kaydedildi.`);
      router.refresh();
    });
  }

  // member_id (workspace_members.id) → departman adları. Renkli çipler
  // kalktı: satırda TEK rozet (rol) kalır; departman ünvanla aynı satırda
  // düz metin olarak yazılır (sadelik kuralı: kart başına en fazla bir rozet).
  const deptMeta = buildDeptMeta(departments);
  const deptsByMember = new Map<string, string[]>();
  for (const dm of deptMembers) {
    const meta = deptMeta[dm.department_id];
    if (!meta) continue;
    deptsByMember.set(dm.member_id, [...(deptsByMember.get(dm.member_id) ?? []), meta.name]);
  }

  function runConfirmedDelete() {
    if (!confirm) return;
    const target = confirm;
    // Üye silmede ilk pencere yalnız ANLATIR; asıl işlem ikinci onaydan sonra.
    if (target.kind === "member" && target.stage === 1) {
      setConfirm({ ...target, stage: 2 });
      return;
    }
    setError(null);
    setNotice(null);
    startTransition(async () => {
      if (target.kind === "grant") {
        const result = await revokeTeamAccess(target.id);
        if ("error" in result) { setError(result.error); setConfirm(null); return; }
        setGrants((prev) => prev.filter((g) => g.id !== target.id));
      } else {
        const result = await removeWorkspaceMemberAccount(target.id);
        if ("error" in result) { setError(result.error); setConfirm(null); return; }
        /* YARIM BAŞARI da söylenir: kişi görev geçmişinde kullanıldıysa hesabı
           tamamen silinemez, yalnız erişimi kalkar. Bu sonuç sessizce
           yutuluyordu ve yönetici "sildim" sanıyordu. */
        setNotice(
          result.hardDeleted
            ? `${target.label || "Kişi"} silindi.`
            : `${target.label || "Kişi"} için giriş erişimi kaldırıldı. Geçmiş kayıtlarda kullanıldığı için hesabı tamamen silinemedi.`,
        );
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
      {/* HATA EN ÜSTTE. Önce listenin ALTINDA duruyordu: sekiz kişilik bir
          listede "rol değiştirilemedi" mesajı ekranın dışında kalıyor, kullanıcı
          hiçbir şey olmadı sanıyordu. */}
      {error && (
        <div
          role="alert"
          className="anim-fade-down flex items-start justify-between gap-3 rounded-control border border-danger/25 bg-danger/8 px-3 py-2 text-[13px] leading-relaxed text-danger"
        >
          <span className="min-w-0 break-words py-1">{error}</span>
          <IconButton
            size="sm"
            aria-label="Kapat"
            title="Kapat"
            onClick={() => setError(null)}
            className="-mr-1 shrink-0 text-danger hover:bg-danger/10 hover:text-danger"
          >
            <X size={14} />
          </IconButton>
        </div>
      )}

      {notice && !error && (
        <p
          role="status"
          className="anim-fade-down inline-flex items-center gap-1.5 rounded-control bg-success/10 px-3 py-1.5 text-[12.5px] font-medium text-success"
        >
          <Check size={14} aria-hidden /> {notice}
        </p>
      )}

      {/* Kişi ekle — ayrı bir "Hesap oluştur" kartı DEĞİL. Aslı Hanım
          (2026-08-23): "Bunların tamamı aynı başlıkta toplanabilir."
          Ekibe kişi eklemek ekip yönetiminin parçası; formu isteyen açar. */}
      {createPanel && (
        <div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAddOpen((v) => !v)}
            aria-expanded={addOpen}
          >
            <UserPlus size={14} aria-hidden /> {addOpen ? "Vazgeç" : "Kişi ekle"}
          </Button>
          {addOpen && <div className="anim-fade-down mt-3">{createPanel}</div>}
        </div>
      )}

      {/* Palet tükendiyse iki kişi aynı rengi paylaşır — sessizce yapılmaz. */}
      {clashes.length > 0 && (
        <p className="rounded-control border border-warning/30 bg-warning/5 px-3 py-2 text-[12.5px] leading-relaxed text-ink">
          Otomatik atama şu kişilere aynı rengi verdi:{" "}
          <strong className="font-semibold">{clashes.map((n) => n.join(" / ")).join(" · ")}</strong>.
          Kişiyi düzenleyip başka bir renk verebilirsiniz.
        </p>
      )}

      {/* Üye listesi — kart değil, ince çizgiyle ayrılmış satırlar (bölüm
          yüzeyi zaten kart; kart içinde kart yok). */}
      <ul className="divide-y divide-hairline border-t border-hairline">
        {members.map((m) => {
          const isSelf = m.user_id === currentUserId;
          const isOwnerRow = m.role === "owner";
          const canManage = isOwner && !isSelf && !isOwnerRow;
          const ident = identityOf.get(m.id) ?? null;
          const tone = ident ? tones[ident.userId] : undefined;
          const display = getDisplayNotificationEmail(m);
          const depts = deptsByMember.get(m.id) ?? [];
          const tertiary = [ident?.jobTitle?.trim() || null, ...depts].filter(Boolean).join(" · ");
          const editing = editingMemberId === m.id;

          return (
            <li key={m.id} className="py-3">
              <div className="flex items-start gap-3">
                {/* Kimlik rozeti — panodaki, rapordaki ve görev kartındakiyle
                    AYNI. Fotoğraf varsa fotoğraf, yoksa kişinin kendi renginde
                    baş harfleri (Aslı Hanım, 2026-08-24). */}
                {ident && tone && (
                  <PersonAvatar
                    name={ident.name}
                    photoUrl={ident.avatarUrl ?? null}
                    colorHex={tone.hex}
                    size="md"
                    className="mt-0.5"
                  />
                )}
                <div className="min-w-0 flex-1">
                  {/* Satır SALT OKUR. Düzenleme tek panelde (MemberEditPanel) —
                      Aslı Hanım (2026-08-24): "Her kısmı böyle düzeltmek yerine
                      daha profesyonel düzenleme kısmı olmalı her üye için." */}
                  <p className="flex items-center gap-1.5 text-[14px] font-medium text-ink">
                    <span className="truncate">{m.profiles?.full_name ?? m.profiles?.email ?? "—"}</span>
                    {isSelf && <span className="shrink-0 text-[12px] font-normal text-subtle">(siz)</span>}
                  </p>
                  {/* İkincil satır: kullanıcı adı · e-posta. E-posta yoksa
                      yöneticinin görmesi gereken bir eksik — sözle söylenir,
                      yalnız renkle değil. */}
                  <p className="truncate text-[12.5px] text-muted">
                    {m.profiles?.username && <span>@{m.profiles.username}</span>}
                    {m.profiles?.username && <span aria-hidden> · </span>}
                    {display.email ? (
                      <span>{display.email}</span>
                    ) : (
                      <span className="text-warning">Bildirim e-postası eklenmedi</span>
                    )}
                  </p>
                  {tertiary && (
                    <p className="truncate text-[12px] text-subtle">{tertiary}</p>
                  )}
                </div>

                {/* Sağ blok: rol (tek rozet) + TEK "Düzenle" + kaldırma. Rol
                    seçici de panele taşındı — satırda beş ayrı etkileşim
                    vardı, artık bir tane. Kaldırma satırın en sonunda, dinlenirken
                    sessiz, üstüne gelince kırmızı: yıkıcı eylem ayrışır. */}
                <div className="flex shrink-0 items-center gap-1">
                  <Badge className="mr-1 bg-surface-sunken text-muted">{roleLabel(m.role)}</Badge>
                  {(canManage || canManageIdentity) && (
                    <IconButton
                      size="sm"
                      onClick={() => setEditingMemberId(editing ? null : m.id)}
                      aria-label={editing ? "Düzenlemeyi kapat" : "Üyeyi düzenle"}
                      title={editing ? "Düzenlemeyi kapat" : "Üyeyi düzenle"}
                      aria-expanded={editing}
                      className={cn(editing && "bg-surface-muted text-ink")}
                    >
                      <Pencil size={14} />
                    </IconButton>
                  )}
                  {canManage && (
                    <IconButton
                      size="sm"
                      onClick={() => setConfirm({
                        kind: "member",
                        id: m.id,
                        label: m.profiles?.full_name ?? m.profiles?.email ?? "",
                        stage: 1,
                      })}
                      disabled={isPending}
                      aria-label="Üyeyi kaldır"
                      title="Üyeyi kaldır"
                      className="hover:bg-danger/10 hover:text-danger"
                    >
                      <UserMinus size={14} />
                    </IconButton>
                  )}
                </div>
              </div>

              {editing && (
                <MemberEditPanel
                  member={ident}
                  memberId={m.id}
                  canResetPassword={canManageIdentity && !isSelf && !isOwnerRow}
                  draft={{
                    fullName: m.profiles?.full_name ?? "",
                    username: m.profiles?.username ?? "",
                    notificationEmail: m.notification_email ?? "",
                    role: (m.role === "owner" ? "admin" : m.role) as "admin" | "member" | "viewer",
                    jobTitle: ident?.jobTitle ?? "",
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
              )}
            </li>
          );
        })}
      </ul>

      {/* Legacy team-access grants. Self-signup is DISABLED — new people are added
          via "Kişi ekle" above. Any leftover pending grants from the old flow
          are shown here so an owner can revoke them; no new ones can be added. */}
      {isOwner && grants.length > 0 && (
        <div className="pt-2">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle">Bekleyen eski erişimler</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
            Bu kayıtlar artık kullanılmıyor; kaldırabilirsiniz.
          </p>
          <ul className="mt-2 divide-y divide-hairline border-t border-hairline">
            {grants.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium text-ink">
                    {g.username ? `@${g.username}` : "—"}
                  </p>
                  <p className="truncate text-[12.5px] text-muted">{g.email} · {roleLabel(g.role)}</p>
                </div>
                <IconButton
                  size="sm"
                  onClick={() => setConfirm({ kind: "grant", id: g.id, label: g.email, stage: 1 })}
                  disabled={isPending}
                  aria-label="Erişimi kaldır"
                  title="Erişimi kaldır"
                  className="hover:bg-danger/10 hover:text-danger"
                >
                  <X size={14} />
                </IconButton>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmDialog
        open={confirm !== null}
        pending={isPending}
        title={
          confirm?.kind !== "member"
            ? "Erişimi kaldırmak istiyor musunuz?"
            : confirm.stage === 1
              ? "Bu kişiyi silmek istiyor musunuz?"
              : `Son onay — ${confirm.label || "bu kişi"}`
        }
        confirmLabel={
          confirm?.kind !== "member" ? "Kaldır" : confirm.stage === 1 ? "Devam et" : "Evet, sil"
        }
        message={
          confirm?.kind === "grant"
            ? `${confirm.label} için ekip erişimi kaldırılacak.`
            : confirm?.kind === "member"
              ? confirm.stage === 1
                ? `${confirm.label || "Bu kişi"} silinecek:\n• Uygulamaya bir daha giriş yapamaz.\n• Hesabı, kullanıcı adı ve fotoğrafı sistemden kaldırılır.\n• Oluşturduğu görevler, notlar ve geçmiş kayıtları KORUNUR.`
                : "Bu işlem geri alınamaz. Kişi yeniden çalışacaksa hesabı yeniden açmanız gerekir."
              : ""
        }
        onConfirm={runConfirmedDelete}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
