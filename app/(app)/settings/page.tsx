import { createClient, getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { WorkspaceNameEditor } from "@/components/settings/WorkspaceNameEditor";
import { MembersManager } from "@/components/settings/MembersManager";
import { CreateAccountPanel } from "@/components/settings/CreateAccountPanel";
import { DepartmentsManager } from "@/components/settings/DepartmentsManager";
import { PersonIdentityManager, type IdentityMember } from "@/components/settings/PersonIdentityManager";
import { SettingsTabs, SettingsSection, CountChip } from "@/components/settings/SettingsTabs";
import { assignPersonTones } from "@/lib/design/person-colors";
import { ManufacturersManager, type ManagerManufacturer } from "@/components/settings/ManufacturersManager";
import { SeasonsManager, type ManagerSeason } from "@/components/settings/SeasonsManager";
import { MaterialsManager, type ManagerMaterial } from "@/components/settings/MaterialsManager";
import { canManageSettings, canRenameWorkspace, canManageMembers, canManageWorkspace } from "@/lib/auth/permissions";
import { roleLabel } from "@/lib/utils/roles";
import { getDisplayNotificationEmail } from "@/lib/utils/notification-email";
import { pickDisplayEmail } from "@/lib/utils/display-identity";
import { Avatar } from "@/components/ui/Avatar";
import { Shield } from "lucide-react";
import type {
  Workspace, WorkspaceMember, Profile,
  WorkspaceRole, WorkspaceInvite,
  WorkspaceDepartment, DepartmentMember,
} from "@/types";

export default async function SettingsPage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, id, notification_email")
    .eq("user_id", user.id)
    .limit(1);
  const workspaceId = memberRows?.[0]?.workspace_id;
  const userRole = (memberRows?.[0]?.role ?? "member") as WorkspaceRole;
  if (!workspaceId) return <div className="p-8 text-muted">Çalışma alanı bulunamadı.</div>;

  if (!canManageSettings(userRole)) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-ink mb-6">Settings</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800">
          Bu sayfayı düzenlemek için yetkiniz yok. Yöneticinize başvurun.
        </div>
      </div>
    );
  }

  const isOwner = canRenameWorkspace(userRole);
  const canManage = canManageMembers(userRole);          // owner-only (invites)
  const canManageDepts = canManageWorkspace(userRole);   // owner + admin (departments)

  const [wsResult, membersResult, profileResult, invitesResult,
         deptsResult, deptMembersResult, manufacturersResult, sheetProducerResult,
         seasonsResult, sheetSeasonResult, materialsResult, bomUsageResult, suppliersResult] =
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
      // Üretici (Usta) listesi — Aslı Hanım'ın "Cihan Usta, Hakan Usta" isteği.
      // Tablo migrate edilmemişse hata döner; bölüm sessizce gizlenir.
      supabase
        .from("workspace_manufacturers")
        .select("id, name, photo_url, city, country, currency, lead_time_days, min_order_qty, contact_name, phone, email, notes, is_active")
        .eq("workspace_id", workspaceId)
        .order("is_active", { ascending: false })
        .order("name"),
      // Usta başına föy sayısı — "hangi ürünler orada dikiliyor" göstergesi.
      supabase
        .from("production_sheets")
        .select("manufacturer_id")
        .eq("workspace_id", workspaceId)
        .not("manufacturer_id", "is", null),
      // Sezon — Ürün ekranlarının bağlamı (Zedonk `SS 21 - WW` deseni).
      supabase
        .from("workspace_seasons")
        .select("id, name, starts_on, ends_on, is_current")
        .eq("workspace_id", workspaceId)
        .order("is_current", { ascending: false })
        .order("name", { ascending: false }),
      supabase
        .from("production_sheets")
        .select("season_id")
        .eq("workspace_id", workspaceId)
        .not("season_id", "is", null),
      // Hammadde kütüphanesi — föy reçetelerinin kaynağı (20240310).
      supabase
        .from("workspace_materials")
        .select("id, code, name, category, supplier_id, composition, width_cm, unit, unit_price, currency, notes, is_active")
        .eq("workspace_id", workspaceId)
        .order("is_active", { ascending: false })
        .order("category")
        .order("name"),
      supabase
        .from("production_sheet_materials")
        .select("material_id")
        .eq("workspace_id", workspaceId),
      supabase
        .from("workspace_suppliers")
        .select("id, name")
        .eq("workspace_id", workspaceId)
        .eq("is_active", true)
        .order("name"),
    ]);

  const manufacturers = (manufacturersResult.data ?? []) as ManagerManufacturer[];
  const manufacturersAvailable = !manufacturersResult.error;
  const sheetCounts: Record<string, number> = {};
  for (const r of (sheetProducerResult.data ?? []) as { manufacturer_id: string | null }[]) {
    if (r.manufacturer_id) sheetCounts[r.manufacturer_id] = (sheetCounts[r.manufacturer_id] ?? 0) + 1;
  }

  const seasons = (seasonsResult.data ?? []) as ManagerSeason[];
  const seasonsAvailable = !seasonsResult.error;
  const seasonCounts: Record<string, number> = {};
  for (const r of (sheetSeasonResult.data ?? []) as { season_id: string | null }[]) {
    if (r.season_id) seasonCounts[r.season_id] = (seasonCounts[r.season_id] ?? 0) + 1;
  }

  const materials = (materialsResult.data ?? []) as ManagerMaterial[];
  const materialsAvailable = !materialsResult.error;
  const suppliers = (suppliersResult.data ?? []) as { id: string; name: string }[];
  const materialUsage: Record<string, number> = {};
  for (const r of (bomUsageResult.data ?? []) as { material_id: string }[]) {
    materialUsage[r.material_id] = (materialUsage[r.material_id] ?? 0) + 1;
  }

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
  })).sort((a, b) => a.name.localeCompare(b.name, "tr"));

  // Giriş yapan kişinin efektif tonu — ekip geneli atamadan, panodakiyle aynı.
  const myTone = assignPersonTones(
    identityMembers.map((m) => m.userId),
    Object.fromEntries(identityMembers.map((m) => [m.userId, { colorKey: m.colorKey, iconKey: m.iconKey }])),
  )[user.id];
  const profileName = profile?.full_name ?? "—";

  return (
    <div className="w-full p-4 sm:p-6 lg:p-8 space-y-8">
      {/* Page header: title + summary chips */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink tracking-tight">Settings</h1>
          <p className="text-sm text-muted mt-1">
            Profilinizi, çalışma alanınızı, departmanları ve ekip üyelerini buradan yönetin.
          </p>
        </div>
        {/* Yalnız rol. Departman ve üye sayısı artık sekmelerde ve bölüm
            başlıklarında duruyordu; başlıkta tekrar etmeleri gürültüydü. */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted shadow-card">
            <Shield size={12} className="text-brand" />
            {roleLabel(userRole)}
          </span>
        </div>
      </div>

      {/* SEKMELER — Aslı Hanım (2026-08-23): "diğer kısımlar da çok kötü,
          ayarlar sayfası." Dokuz bölüm tek yığındaydı: profil, hesap açma, ekip
          ve ürün verisi (sezon/usta/hammadde) yan yana duruyordu. Bunlar farklı
          işler ve farklı sıklıkta açılıyor; hepsini aynı anda göstermek her
          birini bulunmaz kılıyordu. Kart biçimi de tekleşti (SettingsSection):
          önce bazı başlıklar kartın içinde, bazıları dışındaydı. */}
      <SettingsTabs
        tabs={[
          {
            key: "ekip",
            label: "Ekip",
            count: memberCount,
            node: (
              /* İki kolon: bölümler kısa, tam genişlikte tek sütun olunca satırlar
                 1100px'e yayılıp sağda kocaman boşluk bırakıyordu. items-start
                 ile kolonlar birbirinin boyuna esir olmaz. */
              <div className="grid items-start gap-6 xl:grid-cols-2">
                <SettingsSection
                  title="Üyeler"
                  description="Ekip üyelerinin rollerini, kullanıcı adlarını ve bildirim e-postalarını yönetin."
                >
                  {canManage ? (
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
                    />
                  ) : (
                    <div className="divide-y divide-hairline rounded-xl border border-line">
                      {(membersResult.data ?? []).map(
                        (m: WorkspaceMember & { profiles?: Partial<Profile> | null }) => {
                          const display = getDisplayNotificationEmail(m);
                          return (
                            <div key={m.id} className="flex items-center justify-between px-4 py-3">
                              <div>
                                <p className="text-sm font-medium">
                                  {m.profiles?.full_name ?? m.profiles?.email ?? "—"}
                                </p>
                                <p className={display.email ? "text-xs text-subtle" : "text-xs text-warning"}>
                                  {display.email ?? "Bildirim e-postası eklenmedi"}
                                </p>
                              </div>
                              <span className="shrink-0 rounded-full bg-surface-sunken px-2.5 py-0.5 text-xs text-muted">
                                {roleLabel(m.role)}
                              </span>
                            </div>
                          );
                        },
                      )}
                    </div>
                  )}
                </SettingsSection>

                {/* Kişi Kimliği — Aslı Hanım (2026-08-19): "Herkesin bir rengi
                    olsa da herkes kendi rengini takip etse" / "Herkese ikon koy." */}
                <SettingsSection
                  title="Kişi Kimliği"
                  description="Her kişinin rengi ve ikonu. Görev kartları da kişinin rengini taşır — panoda kimin işi olduğu renkten okunur."
                >
                  <PersonIdentityManager members={identityMembers} canManage={canManageDepts} />
                </SettingsSection>

                <SettingsSection
                  title="Departmanlar"
                  description="Görevleri departmanlara atayın. Üyeler birden fazla departmanda yer alabilir."
                  aside={<CountChip n={departments.length} birim="departman" />}
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

                {/* Hesap oluştur — kendi kaydolma akışının yerine geçti: kişi
                    burada verilen kullanıcı adı + şifreyle doğrudan giriş yapar. */}
                {canManageDepts && (
                  <SettingsSection
                    title="Hesap oluştur"
                    description="Yalnızca yöneticiler ve çalışma alanı sahibi yeni hesap oluşturabilir."
                  >
                    <CreateAccountPanel workspaceId={workspaceId} departments={departments} />
                  </SettingsSection>
                )}
              </div>
            ),
          },
          {
            key: "urun",
            label: "Ürün verisi",
            node: (
              /* Sezon ve Usta kısa listelerdir → yan yana. Hammadde satırı daha
                 çok veri taşır (fiyat, kategori, kaç föyde) → tam genişlik. */
              <div className="grid items-start gap-6 xl:grid-cols-2">
                {/* Sezon — Ürün ekranlarının BAĞLAMI. */}
                {seasonsAvailable && (
                  <SettingsSection
                    title="Sezonlar"
                    description="Koleksiyon, Maliyet ve Ödeme Tablosu seçili sezona göre süzülür. Aktif sezon üst çubukta ilk gelen ve yeni föyün varsayılanıdır."
                    aside={<CountChip n={seasons.length} birim="sezon" />}
                  >
                    <SeasonsManager seasons={seasons} sheetCounts={seasonCounts} canManage={canManageDepts} />
                  </SettingsSection>
                )}

                {/* Üretici (Usta) — "Cihan Usta, o ustaları da öyle açacağız…
                    hangi ürünler orada dikiliyor." */}
                {manufacturersAvailable && (
                  <SettingsSection
                    title="Üreticiler (Ustalar)"
                    description="Föydeki “Üretici” alanı ve Ödeme Tablosu buradan beslenir. Teslim süresi ve minimum adet sipariş verirken lazım olur."
                    aside={<CountChip n={manufacturers.length} birim="usta" />}
                  >
                    <ManufacturersManager
                      manufacturers={manufacturers}
                      sheetCounts={sheetCounts}
                      canManage={canManageDepts}
                    />
                  </SettingsSection>
                )}

                {/* Hammadde — föy reçetelerinin kaynağı. */}
                {materialsAvailable && (
                  <div className="xl:col-span-2">
                  <SettingsSection
                    title="Hammadde"
                    description="Kumaş ve aksesuarlar burada bir kez tanımlanır. Föyün reçetesine eklenince maliyet hesaplanır; fiyat burada değişince tüm föyler güncellenir."
                    aside={<CountChip n={materials.length} birim="malzeme" />}
                  >
                    <MaterialsManager
                      materials={materials}
                      suppliers={suppliers}
                      usageCounts={materialUsage}
                      canManage={canManageDepts}
                    />
                  </SettingsSection>
                  </div>
                )}
              </div>
            ),
          },
          {
            key: "hesap",
            label: "Hesabım",
            node: (
              <div className="grid items-start gap-6 lg:grid-cols-2">
                <SettingsSection title="Profiliniz">
                  <div className="flex items-center gap-3">
                    {/* Kendi renginiz — panodaki, rapordaki ve Kişi Kimliği'ndekiyle
                        AYNI ton. Avatar kendi paletine düşerse aynı kişi iki
                        farklı renkte görünüyor. */}
                    <Avatar name={profileName} size="md" colorHex={myTone?.hex} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{profileName}</p>
                      <p className="text-xs text-subtle">{roleLabel(userRole)}</p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-3 border-t border-hairline pt-4">
                    <div>
                      <p className="text-xs text-subtle">E-posta</p>
                      <p className={displayEmail ? "text-sm font-medium text-ink" : "text-sm italic text-subtle"}>
                        {displayEmail ?? "E-posta eklenmedi"}
                      </p>
                    </div>
                    {profile?.username && (
                      <div>
                        <p className="text-xs text-subtle">Kullanıcı adı</p>
                        <p className="text-sm font-medium text-ink">@{profile.username}</p>
                      </div>
                    )}
                  </div>
                </SettingsSection>

                <SettingsSection title="Çalışma alanı">
                  <div>
                    <p className="mb-1 text-xs text-subtle">İsim</p>
                    {isOwner && workspace ? (
                      <WorkspaceNameEditor workspaceId={workspaceId} currentName={workspace.name} />
                    ) : (
                      <p className="text-sm font-medium text-ink">{workspace?.name}</p>
                    )}
                  </div>
                  <div className="mt-4 space-y-3 border-t border-hairline pt-4">
                    <div>
                      <p className="text-xs text-subtle">Kısa ad</p>
                      <p className="font-mono text-sm text-muted">{workspace?.slug}</p>
                    </div>
                    <div>
                      <p className="text-xs text-subtle">Rolünüz</p>
                      <p className="text-sm font-medium text-ink">{roleLabel(userRole)}</p>
                    </div>
                  </div>
                </SettingsSection>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
