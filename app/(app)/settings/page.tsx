import { createClient, getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { WorkspaceNameEditor } from "@/components/settings/WorkspaceNameEditor";
import { MembersManager } from "@/components/settings/MembersManager";
import { CreateAccountPanel } from "@/components/settings/CreateAccountPanel";
import { DepartmentsManager } from "@/components/settings/DepartmentsManager";
import { PersonIdentityManager, type IdentityMember } from "@/components/settings/PersonIdentityManager";
import { assignPersonTones } from "@/lib/design/person-colors";
import { ManufacturersManager, type ManagerManufacturer } from "@/components/settings/ManufacturersManager";
import { SeasonsManager, type ManagerSeason } from "@/components/settings/SeasonsManager";
import { MaterialsManager, type ManagerMaterial } from "@/components/settings/MaterialsManager";
import { canManageSettings, canRenameWorkspace, canManageMembers, canManageWorkspace } from "@/lib/auth/permissions";
import { roleLabel } from "@/lib/utils/roles";
import { getDisplayNotificationEmail } from "@/lib/utils/notification-email";
import { pickDisplayEmail } from "@/lib/utils/display-identity";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Building2, Shield, Users } from "lucide-react";
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
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted shadow-card">
            <Shield size={12} className="text-brand" />
            {roleLabel(userRole)}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted shadow-card tabular-nums">
            <Building2 size={12} className="text-brand" />
            {departments.length} departman
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted shadow-card tabular-nums">
            <Users size={12} className="text-brand" />
            {memberCount} ekip üyesi
          </span>
        </div>
      </div>

      {/* Tek hizalı iki sütun (xl): sol 2/3 = Profil + Hesap + Üyeler,
          sağ 1/3 = Çalışma alanı + Departmanlar. Ayrı grid'ler sağ sütunda
          boşluk bırakıyordu — tüm sayfa tek grid'de hizalanır. */}
      <div className="grid items-start gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-8 xl:col-span-2">
        {/* Profile */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-ink">Profiliniz</h2>
          <Card className="p-5 h-full space-y-4">
            <div className="flex items-center gap-3">
              {/* Kendi renginiz — panodaki, rapordaki ve Kişi Kimliği'ndekiyle
                  AYNI ton. Avatar kendi paletine düşerse aynı kişi iki farklı
                  renkte görünüyor. */}
              <Avatar name={profileName} size="md" colorClass={myTone?.solid} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink truncate">{profileName}</p>
                <p className="text-xs text-subtle">{roleLabel(userRole)}</p>
              </div>
            </div>
            <div className="space-y-3 border-t border-hairline pt-4">
              <div>
                <p className="text-xs text-subtle">E-posta</p>
                <p className={displayEmail ? "text-sm font-medium text-ink" : "text-sm text-subtle italic"}>
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
          </Card>
        </section>

      {/* Account creation — admin-created accounts (owner + admin). Replaces the
          old self-signup flow: the person signs in directly with the username +
          password set here. */}
      {canManageDepts && (
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-ink">Hesap oluştur</h2>
            <p className="text-[13px] text-muted mt-0.5">
              Yalnızca yöneticiler ve çalışma alanı sahibi yeni hesap oluşturabilir.
            </p>
          </div>
          <CreateAccountPanel workspaceId={workspaceId} departments={departments} />
        </section>
      )}

      {/* Members */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Üyeler</h2>
          <p className="text-[13px] text-muted mt-0.5">
            Ekip üyelerinin rollerini, kullanıcı adlarını ve bildirim e-postalarını yönetin.
          </p>
        </div>
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
          <Card className="divide-y divide-hairline">
            {(membersResult.data ?? []).map(
              (m: WorkspaceMember & { profiles?: Partial<Profile> | null }) => {
                const display = getDisplayNotificationEmail(m);
                return (
                <div key={m.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium">
                      {m.profiles?.full_name ?? m.profiles?.email ?? "—"}
                    </p>
                    <p className={display.email ? "text-xs text-subtle" : "text-xs text-warning"}>
                      {display.email ?? "Bildirim e-postası eklenmedi"}
                    </p>
                  </div>
                  <span className="text-xs text-muted bg-surface-sunken px-2.5 py-0.5 rounded-full">
                    {roleLabel(m.role)}
                  </span>
                </div>
                );
              }
            )}
          </Card>
        )}
      </section>

      {/* Kişi Kimliği — renk + ikon.
          Aslı Hanım (2026-08-19): "Herkesin bir rengi olsa da herkes kendi
          rengini takip etse" / "Herkese ikon koy." Seçim yoksa kimlikten
          otomatik türetilir; kimse renksiz kalmaz. */}
      <section className="space-y-3">
        <Card className="p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-ink">Kişi Kimliği</h2>
            <p className="text-[13px] text-muted mt-0.5">
              Her kişinin rengi ve ikonu. Görev kartları da kişinin rengini taşır —
              panoda kimin işi olduğu renkten okunur.
            </p>
          </div>
          <PersonIdentityManager
            members={identityMembers}
            canManage={canManageDepts}
          />
        </Card>
      </section>

        </div>

        {/* Sağ sütun (1/3): Çalışma alanı + Departmanlar — sol sütunla aynı
            grid satırından başlar, boşluk kalmaz. */}
        <div className="min-w-0 space-y-8">
          {/* Workspace */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-ink">Çalışma alanı</h2>
            <Card className="p-5 space-y-4">
              <div>
                <p className="text-xs text-subtle mb-1">İsim</p>
                {isOwner && workspace ? (
                  <WorkspaceNameEditor workspaceId={workspaceId} currentName={workspace.name} />
                ) : (
                  <p className="text-sm font-medium text-ink">{workspace?.name}</p>
                )}
              </div>
              <div className="space-y-3 border-t border-hairline pt-4">
                <div>
                  <p className="text-xs text-subtle">Kısa ad</p>
                  <p className="text-sm font-mono text-muted">{workspace?.slug}</p>
                </div>
                <div>
                  <p className="text-xs text-subtle">Rolünüz</p>
                  <p className="text-sm font-medium text-ink">{roleLabel(userRole)}</p>
                </div>
              </div>
            </Card>
          </section>

          {/* Departmanlar */}
          <section className="space-y-3">
            <Card className="p-5 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-ink">Departmanlar</h2>
                  <p className="text-[13px] text-muted mt-0.5">
                    Görevleri departmanlara atayın. Üyeler birden fazla departmanda yer alabilir.
                  </p>
                </div>
                <span className="text-xs text-muted bg-surface-sunken px-2.5 py-1 rounded-full tabular-nums shrink-0">
                  {departments.length} departman
                </span>
              </div>
              <DepartmentsManager
                departments={departments}
                deptMembers={deptMembers}
                workspaceMembers={
                  (membersResult.data ?? []) as (WorkspaceMember & { profiles?: Partial<Profile> | null })[]
                }
                canManage={canManageDepts}
              />
            </Card>
          </section>

          {/* Sezon — Ürün ekranlarının BAĞLAMI. Koleksiyon, Maliyet ve Ödeme
              Tablosu üstteki seçiciyle bu listeden süzülür. */}
          {seasonsAvailable && (
            <section className="space-y-3">
              <Card className="p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-ink">Sezonlar</h2>
                    <p className="text-[13px] text-muted mt-0.5">
                      Koleksiyon, Maliyet ve Ödeme Tablosu seçili sezona göre süzülür.
                      Aktif sezon üst çubukta ilk gelen ve yeni föyün varsayılanıdır.
                    </p>
                  </div>
                  <span className="text-xs text-muted bg-surface-sunken px-2.5 py-1 rounded-full tabular-nums shrink-0">
                    {seasons.length} sezon
                  </span>
                </div>
                <SeasonsManager seasons={seasons} sheetCounts={seasonCounts} canManage={canManageDepts} />
              </Card>
            </section>
          )}

          {/* Üretici (Usta) — Aslı Hanım (2026-08-19): "Cihan Usta, o ustaları
              da öyle açacağız… hangi ürünler orada dikiliyor." Föydeki üretici
              alanı ve Ödeme Tablosu bu listeden beslenir. Tablo henüz migrate
              edilmemişse bölüm hiç çizilmez. */}
          {manufacturersAvailable && (
            <section className="space-y-3">
              <Card className="p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-ink">Üreticiler (Ustalar)</h2>
                    <p className="text-[13px] text-muted mt-0.5">
                      Föydeki “Üretici” alanı ve Ödeme Tablosu buradan beslenir.
                      Teslim süresi ve minimum adet sipariş verirken lazım olur.
                    </p>
                  </div>
                  <span className="text-xs text-muted bg-surface-sunken px-2.5 py-1 rounded-full tabular-nums shrink-0">
                    {manufacturers.length} usta
                  </span>
                </div>
                <ManufacturersManager
                  manufacturers={manufacturers}
                  sheetCounts={sheetCounts}
                  canManage={canManageDepts}
                />
              </Card>
            </section>
          )}

          {/* Hammadde — föy reçetelerinin kaynağı. Malzeme burada BİR KEZ
              tanımlanır; fiyatı değişince tüm föylerin maliyeti güncellenir. */}
          {materialsAvailable && (
            <section className="space-y-3">
              <Card className="p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-ink">Hammadde</h2>
                    <p className="text-[13px] text-muted mt-0.5">
                      Kumaş ve aksesuarlar burada bir kez tanımlanır. Föyün reçetesine eklenince
                      maliyet <b className="font-semibold text-ink">hesaplanır</b>; fiyat burada
                      değişince tüm föyler güncellenir.
                    </p>
                  </div>
                  <span className="text-xs text-muted bg-surface-sunken px-2.5 py-1 rounded-full tabular-nums shrink-0">
                    {materials.length} malzeme
                  </span>
                </div>
                <MaterialsManager
                  materials={materials}
                  suppliers={suppliers}
                  usageCounts={materialUsage}
                  canManage={canManageDepts}
                />
              </Card>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
