import { createClient, getAuthUser } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { redirectToSignIn } from "@/lib/auth/session-redirect";
import { WorkspaceNameEditor } from "@/components/settings/WorkspaceNameEditor";
import { MembersManager } from "@/components/settings/MembersManager";
import { CreateAccountPanel } from "@/components/settings/CreateAccountPanel";
import { DepartmentsManager } from "@/components/settings/DepartmentsManager";
import type { IdentityMember } from "@/components/settings/PersonIdentityManager";
import { SettingsTabs, SettingsTab } from "@/components/settings/SettingsTabs";
import { SettingsSection, CountChip } from "@/components/settings/SettingsSection";
import { BackupPanel, type LastBackup } from "@/components/settings/BackupPanel";
import { assignPersonTones } from "@/lib/design/person-colors";
import { canManageSettings, canRenameWorkspace, canManageWorkspace } from "@/lib/auth/permissions";
import { roleLabel } from "@/lib/utils/roles";
import { pickDisplayEmail } from "@/lib/utils/display-identity";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import { ArrowRight } from "lucide-react";
import type {
  Workspace, WorkspaceMember, Profile,
  WorkspaceRole, WorkspaceInvite,
  WorkspaceDepartment, DepartmentMember,
} from "@/types";

export default async function SettingsPage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirectToSignIn();

  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, id, notification_email")
    .eq("user_id", user.id)
    .limit(1);
  const workspaceId = memberRows?.[0]?.workspace_id;
  const userRole = (memberRows?.[0]?.role ?? "member") as WorkspaceRole;
  if (!workspaceId) return <div className="p-8 text-muted">Çalışma alanı bulunamadı.</div>;

  if (!canManageSettings(userRole)) {
    /* Yetkisiz üye: başlık uygulama çubuğunda zaten yazıyor; burada sakin bir
       uyarı + kişinin kendi işine giden tek bağlantı (Profil). Ham amber kutu
       token'lı warning yüzeyine döndü. */
    return (
      <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
        <h1 className="sr-only">Settings</h1>
        <div className="max-w-lg rounded-card border border-warning/30 bg-warning/5 px-4 py-3.5">
          <p className="text-[13.5px] font-medium text-ink">Bu sayfayı yalnız yöneticiler düzenleyebilir.</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            Adınızı, ünvanınızı ve fotoğrafınızı{" "}
            <Link href="/profile" className="font-medium text-brand hover:text-brand-strong">Profil</Link>
            {" "}sayfasından değiştirebilirsiniz.
          </p>
        </div>
      </div>
    );
  }

  const isOwner = canRenameWorkspace(userRole);
  const canManageDepts = canManageWorkspace(userRole);   // owner + admin (departments)

  const [wsResult, membersResult, profileResult, invitesResult,
         deptsResult, deptMembersResult, backupResult] =
    await Promise.all([
      supabase.from("workspaces").select("*").eq("id", workspaceId).single(),
      supabase
        .from("workspace_members")
        .select("*, profiles(id, full_name, username, email, avatar_url)")
        .eq("workspace_id", workspaceId),
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      isOwner
        ? supabase
            .from("workspace_invites")
            .select("*")
            .eq("workspace_id", workspaceId)
            .is("accepted_at", null)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as WorkspaceInvite[] }),
      supabase
        .from("workspace_departments")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("position"),
      supabase
        .from("department_members")
        .select("*, workspace_members(profiles(id, full_name, email))")
        .eq("workspace_id", workspaceId),
      /* Son yedek — Yedekleme sekmesindeki durum şeridini besler. Tek satır.
         Migration henüz canlıya uygulanmadıysa sorgu hata döner; hata YUTULUR
         ve panel "henüz yedek alınmadı" der (indirme yine de çalışır). */
      supabase
        .from("workspace_backups")
        .select("created_at, kind, profiles:created_by(full_name)")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(1),
      // NOT: sezon / usta / hammadde sorguları BURADAN KALKTI — üçü de
      // Koleksiyon > Product Data sayfasına taşındı (2026-08-29). Bunlar bir
      // ayar değil ürün verisi; Ayarlar her açılışta yedi sorgu fazla atıyordu.
    ]);

  /* Şimdi — bir kez okunur ve hesaplarda o kullanılır (render sırasında
     Date.now() çağırmak saf değildir; ayrıca aynı sayfada iki farklı "an"
     olmasın). */
  const now = new Date();

  /* Son yedek satırı — gömülü profil adı dizi ya da nesne gelebilir. */
  type BackupRow = {
    created_at: string;
    kind: string;
    profiles?: { full_name: string | null } | { full_name: string | null }[] | null;
  };
  const backupRow = (backupResult?.data?.[0] ?? null) as BackupRow | null;
  const lastBackup: LastBackup | null = backupRow
    ? {
        // Tarih ve "kaç gün önce" SUNUCUDA hesaplanır: istemcide hesaplanınca
        // render saf olmuyor ve saat dilimi farkı hydration uyuşmazlığı veriyor.
        formattedAt: new Date(backupRow.created_at).toLocaleString("tr-TR", {
          timeZone: "Europe/Istanbul",
        }),
        ageDays: Math.max(
          0,
          Math.floor((now.getTime() - new Date(backupRow.created_at).getTime()) / 86_400_000),
        ),
        kind: backupRow.kind === "full" ? "full" : "data",
        personName:
          (Array.isArray(backupRow.profiles) ? backupRow.profiles[0] : backupRow.profiles)
            ?.full_name ?? null,
      }
    : null;

  const workspace: Workspace | null = wsResult.data;
  const profile: Profile | null = profileResult.data;
  const invites: WorkspaceInvite[] = (invitesResult.data ?? []) as WorkspaceInvite[];
  const departments: WorkspaceDepartment[] = (deptsResult.data ?? []) as WorkspaceDepartment[];
  // department_members.member_id → workspace_members → profiles. Flatten the
  // embed so each row carries a `profiles` shape the manager already expects.
  type DeptMemberRowRaw = DepartmentMember & {
    workspace_members?:
      | { profiles?: Partial<Profile> | Partial<Profile>[] | null }
      | { profiles?: Partial<Profile> | Partial<Profile>[] | null }[]
      | null;
  };
  const deptMembers = ((deptMembersResult.data ?? []) as unknown as DeptMemberRowRaw[]).map((r) => {
    const wm = Array.isArray(r.workspace_members) ? r.workspace_members[0] : r.workspace_members;
    const prof = wm && (Array.isArray(wm.profiles) ? wm.profiles[0] : wm.profiles);
    return { ...r, profiles: prof ?? null } as DepartmentMember & { profiles?: Partial<Profile> | null };
  });

  // Canonical display e-mail — the SAME helper the AppHeader profile menu uses,
  // so the top-right menu and this card can never disagree. @lospia.local login
  // placeholders are never shown as the person's address.
  const displayEmail = pickDisplayEmail({
    profileEmail: profile?.email ?? null,
    authEmail: user.email,
    notificationEmail: memberRows?.[0]?.notification_email ?? null,
  });
  const memberCount = (membersResult.data ?? []).length;

  // Kişi Kimliği listesi. Tohum profiles.id (userId) — pano, liste ve raporlar
  // da onu kullanıyor; workspace_members.id kullanılırsa renkler ekranlar
  // arasında TUTMAZ.
  const identityMembers: IdentityMember[] = (
    (membersResult.data ?? []) as (WorkspaceMember & { profiles?: Partial<Profile> | null })[]
  ).map((m) => ({
    id: m.id,
    userId: m.user_id,
    name: m.profiles?.full_name || m.profiles?.username || m.profiles?.email || "—",
    roleLabel: roleLabel(m.role),
    colorKey: (m as { color_key?: string | null }).color_key ?? null,
    iconKey: (m as { icon_key?: string | null }).icon_key ?? null,
    // Fotoğraf — rozet ve yükleyici bunu okur.
    avatarUrl: m.profiles?.avatar_url ?? null,
  })).sort((a, b) => a.name.localeCompare(b.name, "tr"));

  /* Başka kişilerde KULLANILAN renkler — "Kişi ekle" formu aynı rengi ikinci
     kez teklif etmesin. Sunucuda hesaplanır: istemci bileşenine fonksiyon
     geçilemez (React Server Components kuralı), düz dizi geçilir. */
  const takenColors = identityMembers
    .map((m) => m.colorKey)
    .filter((c): c is string => !!c);

  // Giriş yapan kişinin efektif tonu — ekip geneli atamadan, panodakiyle aynı.
  const myTone = assignPersonTones(
    identityMembers.map((m) => m.userId),
    Object.fromEntries(identityMembers.map((m) => [m.userId, { colorKey: m.colorKey, iconKey: m.iconKey }])),
  )[user.id];
  const profileName = profile?.full_name ?? "—";

  return (
    <div className="w-full space-y-6 px-4 py-4 sm:px-6 lg:px-8">
      {/* Başlık uygulama çubuğunda. Burada ikinci kez büyük bir "Settings" +
          açıklama cümlesi + rol rozeti duruyordu; üçü de ~110px yiyor ve
          hiçbiri yeni bir şey söylemiyordu (rol zaten profil menüsünde). */}
      <h1 className="sr-only">Settings</h1>

      {/* SEKMELER — Aslı Hanım (2026-08-23): "diğer kısımlar da çok kötü,
          ayarlar sayfası." Dokuz bölüm tek yığındaydı: profil, hesap açma, ekip
          ve ürün verisi (sezon/usta/hammadde) yan yana duruyordu. Bunlar farklı
          işler ve farklı sıklıkta açılıyor; hepsini aynı anda göstermek her
          birini bulunmaz kılıyordu. Kart biçimi de tekleşti (SettingsSection):
          önce bazı başlıklar kartın içinde, bazıları dışındaydı. */}
      <SettingsTabs>
        <SettingsTab label="Ekip">
              {/* TEK SÜTUN. Burası `xl:grid-cols-2` idi ama içinde iki bölüm
                  vardı ve ilki `xl:col-span-2` ile tam genişlik alıyordu —
                  geriye tek başına kalan "Departmanlar" ızgaranın SOL yarısını
                  kaplayıp sağ yarıyı boş bırakıyordu (2026-08-29 ekran
                  görüntüsü: "sayfa boş gözükmemeli, yarısı boş gözükmemeli").
                  İki bölüm de tam genişlik: liste zaten yatayda okunur. */}
              <div className="space-y-6">
                {/* TEK BAŞLIK — Aslı Hanım (2026-08-23): "Bunların tamamı
                    aynı başlıkta toplanabilir, daha profesyonel tasarımla."
                    Üyeler, Kişi Kimliği ve Hesap oluştur üç ayrı karttı ve ilk
                    ikisi aynı sekiz kişiyi iki kez listeliyordu. Artık tek
                    satır: rozet + isim/kullanıcı adı/e-posta + rol + kimlik. */}
                <div>
                <SettingsSection
                  title="Ekip"
                  description="Roller, kullanıcı adları, bildirim e-postaları ve kişi kimlikleri (renk + fotoğraf). Görev kartları da kişinin rengini taşır — panoda kimin işi olduğu renkten okunur."
                  aside={<CountChip n={memberCount} birim="kişi" />}
                >
                  {/* MembersManager yetkiyi KENDİ içinde denetler (userRole
                      === "owner" olmayan rol/kaldırma düğmelerini çizmez), bu
                      yüzden herkese çizilir. Önce yalnız owner'a çiziliyordu ve
                      yönetici (admin) rolü kimlik düzenlemesini göremiyordu;
                      ayrıca aynı liste bir de salt-okur olarak tekrarlanıyordu. */}
                  <MembersManager
                    workspaceId={workspaceId}
                    currentUserId={user.id}
                    userRole={userRole}
                    initialMembers={
                      (membersResult.data ?? []) as (WorkspaceMember & { profiles?: Partial<Profile> | null })[]
                    }
                    pendingGrants={invites}
                    departments={departments}
                    deptMembers={deptMembers}
                    identities={identityMembers}
                    canManageIdentity={canManageDepts}
                    createPanel={
                      canManageDepts ? (
                        <CreateAccountPanel
                          workspaceId={workspaceId}
                          departments={departments}
                          takenColors={takenColors}
                        />
                      ) : undefined
                    }
                  />
                </SettingsSection>
                </div>

                <SettingsSection
                  title="Departmanlar"
                  description="Görevleri departmanlara atayın. Üyeler birden fazla departmanda yer alabilir."
                >
                  <DepartmentsManager
                    departments={departments}
                    deptMembers={deptMembers}
                    workspaceMembers={
                      (membersResult.data ?? []) as (WorkspaceMember & { profiles?: Partial<Profile> | null })[]
                    }
                    canManage={canManageDepts}
                  />
                </SettingsSection>

              </div>
        </SettingsTab>
        <SettingsTab label="Hesabım">
              <div className="grid items-start gap-6 lg:grid-cols-2">
                <SettingsSection
                  title="Profiliniz"
                  aside={
                    <Link
                      href="/profile"
                      className="inline-flex items-center gap-1 text-[13px] font-medium text-brand transition-colors duration-150 hover:text-brand-strong"
                    >
                      Düzenle
                      <ArrowRight size={13} aria-hidden />
                    </Link>
                  }
                >
                  <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    {/* Kişi her yerde aynı rozetle: fotoğraf varsa fotoğraf,
                        yoksa kendi renginde baş harfler — panodaki, rapordaki
                        ve Ekip listesindekiyle AYNI ton. */}
                    <PersonAvatar
                      name={profileName}
                      photoUrl={profile?.avatar_url ?? null}
                      colorHex={myTone?.hex ?? null}
                      size="md"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-ink">{profileName}</p>
                      <p className="text-[12.5px] text-muted">{roleLabel(userRole)}</p>
                    </div>
                  </div>
                  <dl className="divide-y divide-hairline border-t border-hairline">
                    <InfoRow label="E-posta">
                      {displayEmail ?? <span className="font-normal text-subtle">E-posta eklenmedi</span>}
                    </InfoRow>
                    {profile?.username && <InfoRow label="Kullanıcı adı">@{profile.username}</InfoRow>}
                  </dl>
                  </div>
                </SettingsSection>

                <SettingsSection title="Çalışma alanı">
                  <dl className="divide-y divide-hairline">
                    <InfoRow label="İsim">
                      {isOwner && workspace ? (
                        <WorkspaceNameEditor workspaceId={workspaceId} currentName={workspace.name} />
                      ) : (
                        workspace?.name
                      )}
                    </InfoRow>
                    <InfoRow label="Kısa ad">
                      <span className="font-mono font-normal text-muted">{workspace?.slug}</span>
                    </InfoRow>
                    <InfoRow label="Rolünüz">{roleLabel(userRole)}</InfoRow>
                  </dl>
                </SettingsSection>
              </div>
        </SettingsTab>
        <SettingsTab label="Yedekleme">
              {/* Sıraç (2026-08-29): "Kayıtların kesinlikle tutulması lazım…
                  yedekleme haftada bir." Tek bölüm, tek iş: yedeği indir. */}
              <SettingsSection
                title="Yedekleme"
                description="Bütün kayıtlar ve yüklenen dosyalar tek bir .zip olarak iner."
              >
                <BackupPanel last={lastBackup} />
              </SettingsSection>
        </SettingsTab>
      </SettingsTabs>
    </div>
  );
}

/** Hesabım sekmesindeki salt-okur satır: etiket solda, değer sağda; satırlar
 *  ince çizgiyle ayrılır — kart içinde kart yok. */
function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className="shrink-0 text-[13px] text-muted">{label}</dt>
      {/* break-words: uzun e-posta adresi dar ekranda satırı taşırıyordu. */}
      <dd className="min-w-0 flex-1 break-words text-right text-[13.5px] font-medium text-ink">{children}</dd>
    </div>
  );
}
