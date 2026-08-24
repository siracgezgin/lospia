import { redirect } from "next/navigation";
import { Mail, Shield, AtSign, LogOut } from "lucide-react";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { AvatarUploader } from "@/components/settings/AvatarUploader";
import { assignPersonTones } from "@/lib/design/person-colors";
import { getPersonDisplayName } from "@/lib/utils/person-display";
import { roleLabel } from "@/lib/utils/roles";
import { signOut } from "@/lib/actions/auth";
import type { WorkspaceRole } from "@/types";

// Lightweight personal profile, surfaced for members in the mobile bottom nav
// (admins reach it from the top-right avatar menu). Read-only snapshot of who
// you are — no team data ever crosses to a member here.
// NOT: puan kartları kaldırıldı (puan sistemi gizli — sidebar/header'dan da
// kaldırılmıştı, burası son kalan yüzeydi); sorgusu da artık çalışmıyor.
export default async function ProfilePage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1);
  const role = (memberRows?.[0]?.role ?? "member") as WorkspaceRole;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, username, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const displayName = getPersonDisplayName(profile?.full_name ?? user.email ?? null);

  /* Kişinin kimlik rengi — fotoğraf yoksa baş harflerin arkasındaki renk
     panodakiyle AYNI olsun diye ekip geneli atamadan hesaplanır. */
  const { data: teamRows } = await supabase
    .from("workspace_members")
    .select("user_id, color_key, icon_key")
    .eq("workspace_id", memberRows?.[0]?.workspace_id ?? "");
  const team = (teamRows ?? []) as { user_id: string; color_key: string | null; icon_key: string | null }[];
  const myTone = assignPersonTones(
    team.map((m) => m.user_id),
    Object.fromEntries(team.map((m) => [m.user_id, { colorKey: m.color_key, iconKey: m.icon_key }])),
  )[user.id];

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8 space-y-5">
      <h1 className="text-xl font-semibold text-ink">Profile</h1>

      <div className="max-w-2xl">
        <div className="space-y-5 min-w-0">
          {/* Identity card */}
          <div className="bg-surface rounded-2xl border border-line shadow-card p-5">
            <div className="flex flex-wrap items-center gap-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold text-ink">{displayName}</p>
                <p className="flex items-center gap-1.5 truncate text-[13px] text-muted">
                  <Mail size={13} className="shrink-0" />
                  <span className="truncate">{user.email ?? "—"}</span>
                </p>
              </div>
            </div>

            {/* Fotoğraf — herkes kendi resmini buradan koyar; yoksa baş harf
                gösterilir (Aslı Hanım, 2026-08-24: "artık kişiler resmiyle
                görünecek… resmi olmayan yine aynı şekilde"). */}
            <div className="mt-4 border-t border-hairline pt-4">
              <AvatarUploader
                userId={user.id}
                name={displayName}
                photoUrl={profile?.avatar_url ?? null}
                colorHex={myTone?.hex ?? null}
              />
            </div>

            <dl className="mt-5 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-line bg-line">
              {profile?.username && (
                <div className="flex items-center justify-between gap-3 bg-surface px-4 py-3">
                  <dt className="flex items-center gap-2 text-sm text-muted">
                    <AtSign size={14} className="text-subtle shrink-0" />
                    Kullanıcı adı
                  </dt>
                  <dd className="text-sm font-medium text-ink truncate">{profile.username}</dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 bg-surface px-4 py-3">
                <dt className="flex items-center gap-2 text-sm text-muted">
                  <Shield size={14} className="text-subtle shrink-0" />
                  Rol
                </dt>
                <dd className="text-sm font-medium text-ink">{roleLabel(role)}</dd>
              </div>
            </dl>
          </div>

          {/* Sign out */}
          <form action={signOut}>
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm font-medium text-[#a83a2c] hover:bg-[#fbeae7] transition-colors"
            >
              <LogOut size={16} />
              Çıkış yap
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
