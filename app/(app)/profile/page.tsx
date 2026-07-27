import { redirect } from "next/navigation";
import { Mail, Shield, Sparkles, Clock3, CheckCircle2, ClipboardCheck, AtSign, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/ui/Avatar";
import { getMemberPointsSummary } from "@/lib/points/queries";
import { getPersonDisplayName } from "@/lib/utils/person-display";
import { roleLabel } from "@/lib/utils/roles";
import { signOut } from "@/lib/actions/auth";
import type { WorkspaceRole } from "@/types";

// Lightweight personal profile, surfaced for members in the mobile bottom nav
// (admins reach it from the top-right avatar menu). Read-only snapshot of who
// you are plus your own points — no team data ever crosses to a member here.
export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1);
  const workspaceId = memberRows?.[0]?.workspace_id ?? null;
  const role = (memberRows?.[0]?.role ?? "member") as WorkspaceRole;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, username")
    .eq("id", user.id)
    .maybeSingle();

  const points = workspaceId
    ? await getMemberPointsSummary(supabase, workspaceId, user.id)
    : { monthPoints: 0, pending: 0, doneCount: 0, reviewCount: 0 };

  const displayName = getPersonDisplayName(profile?.full_name ?? user.email ?? null);

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8 space-y-5">
      <h1 className="text-xl font-semibold text-ink">Profil</h1>

      {/* lg+: kimlik kartı solda, puan özeti sağda — içerik birebir aynı. */}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-6">
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

        {/* Personal points — only your own figures */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 min-w-0 2xl:grid-cols-4">
          <PointCard icon={<Sparkles size={15} className="text-brand" />} label="Bu ay" value={`${points.monthPoints} puan`} />
          <PointCard icon={<Clock3 size={15} className="text-warning" />} label="Onay bekleyen" value={`${points.pending} puan`} hint="Görev yönetici tarafından tamamlandığında kesinleşir." />
          <PointCard icon={<CheckCircle2 size={15} className="text-[#1c7a52]" />} label="Tamamladığım işler" value={points.doneCount} />
          <PointCard icon={<ClipboardCheck size={15} className="text-[#2f9e63]" />} label="Kontrol bekleyen" value={points.reviewCount} />
        </div>
      </div>
    </div>
  );
}

function PointCard({
  icon, label, value, hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="bg-surface rounded-xl border border-line shadow-card p-4" title={hint}>
      <div className="flex items-center gap-2 text-subtle">
        {icon}
        <span className="text-[13px] font-medium text-muted">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}
