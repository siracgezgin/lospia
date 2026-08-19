import { redirect } from "next/navigation";
import { Mail, Shield, AtSign, LogOut } from "lucide-react";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { Avatar } from "@/components/ui/Avatar";
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
    .select("full_name, username")
    .eq("id", user.id)
    .maybeSingle();

  const displayName = getPersonDisplayName(profile?.full_name ?? user.email ?? null);

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8 space-y-5">
      <h1 className="text-xl font-semibold text-ink">Profile</h1>

      <div className="max-w-2xl">
        <div className="space-y-5 min-w-0">
          {/* Identity card */}
          <div className="bg-surface rounded-2xl border border-line shadow-card p-5">
            <div className="flex items-center gap-4">
              <Avatar name={displayName} size="lg" />
              <div className="min-w-0">
                <p className="text-lg font-semibold text-ink truncate">{displayName}</p>
                <p className="flex items-center gap-1.5 text-[13px] text-muted truncate">
                  <Mail size={13} className="shrink-0" />
                  <span className="truncate">{user.email ?? "—"}</span>
                </p>
              </div>
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
