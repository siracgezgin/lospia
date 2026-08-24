import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient, getAuthUser, getMembership, getProfile } from "@/lib/supabase/server";
import { getAppBrandForHost } from "@/lib/branding";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppHeader } from "@/components/layout/AppHeader";
import { MobileNav } from "@/components/layout/MobileNav";
import { pickDisplayEmail } from "@/lib/utils/display-identity";
import type { Workspace, Notification, WorkspaceRole } from "@/types";

/** Kabuğun workspace'ten ihtiyaç duyduğu tek şey: kimlik + ad. */
export type ShellWorkspace = Pick<Workspace, "id" | "name">;

// Co-locate serverless functions with the Supabase project (eu-north-1, Stockholm).
// Vercel's "arn1" is Stockholm; this removes the cross-region (fra1↔eu-north-1)
// latency that was being added to every Supabase round-trip. Falls back
// gracefully if the region is unavailable on the current plan.
export const preferredRegion = "arn1";

export default async function AppLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  // Parallel @modal slot — hosts the task-detail drawer (intercepting route).
  // Renders null (via @modal/default.tsx) on every non-intercepted route.
  modal: React.ReactNode;
}) {
  const supabase = await createClient();

  // Host-aware app-shell brand: the AF Operasyon pilot host keeps its own logo;
  // everything else is Lospia. Tenant/workspace NAME is separate user data.
  const brand = getAppBrandForHost((await headers()).get("host"));

  // Verify session — istek başına önbellekli; sayfa aynı çağrıyı tekrarlamaz.
  const user = await getAuthUser();

  if (!user) {
    redirect("/login");
  }

  /* KABUK EN FAZLA İKİ TUR ATAR.
     Eskiden dört adım SIRAYLA bekliyordu: membership → [workspace+bildirim+
     profil] → "hangi görev silinmiş?" sorgusu. Kabuk her gezinmede çalıştığı
     için bu gecikme TÜM sayfalara biniyordu (Supabase uzakta; her tur ~60ms).
     Bildirim ve profil sorguları yalnız user.id'ye ihtiyaç duyar — workspaceId'yi
     beklemelerine gerek yok. Bu yüzden membership ile AYNI dalgada gidiyorlar;
     geriye tek bir bağımlı sorgu kalıyor (workspaces, workspaceId gerektirir). */
  const [membership, notifResult, profile] = await Promise.all([
    getMembership(user.id),
    supabase
      .from("notifications")
      // Silinmiş görevi olan bildirim pasif çizilir ve okunmadı sayılmaz.
      // Bu bilgi ARTIK AYNI SORGUDA geliyor (gömülü ilişki) — eskiden ardından
      // ikinci bir "bu id'ler hâlâ duruyor mu?" turu atılıyordu.
      .select("*, task:tasks(id, deleted_at)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30),
    getProfile(user.id),
  ]);

  let workspaceId: string | null = membership?.workspace_id ?? null;
  const userRole: WorkspaceRole = (membership?.role as WorkspaceRole | undefined) ?? "member";
  const isAdmin = userRole === "owner" || userRole === "admin";

  // Attach the user to AF Operasyon when they have no membership yet. This is the
  // team-access model: accept_workspace_access_grant() consumes a pending
  // allowed-email grant (added by an admin in Settings) and joins the user with
  // the granted role. It never creates a personal/random workspace. If the e-mail
  // has no grant and the user is not already a member it returns {"error":"no_access"}
  // and we show a clean "no access" screen instead of the old confusing message.
  let provisionError: string | null = null;
  let noAccess = false;
  if (!workspaceId) {
    const fullName =
      (user.user_metadata?.full_name as string | undefined) ?? null;

    const { data: grant, error: rpcError } = await supabase.rpc(
      "accept_workspace_access_grant",
      { p_full_name: fullName }
    );

    const grantObj =
      grant && typeof grant === "object" ? (grant as Record<string, unknown>) : null;

    if (rpcError) {
      provisionError = rpcError.message;
    } else if (grantObj?.error === "no_access") {
      noAccess = true;
    } else if (grantObj?.workspace_id) {
      workspaceId = grantObj.workspace_id as string;
    } else {
      provisionError = "Çalışma alanına bağlanılamadı. Sayfayı yenileyin.";
    }
  }

  let workspace: ShellWorkspace | null = null;
  let unreadCount = 0;
  let notifications: Notification[] = [];
  // task_ids whose task is soft-deleted or gone → their notifications are passive.
  let deadTaskIds: string[] = [];

  let userName: string | null =
    (user.user_metadata?.full_name as string | undefined) ?? null;
  // Canonical display e-mail — @lospia.local auth placeholders are never shown
  // as the user's address; refined below once the profile row is loaded.
  let displayEmail: string | null = pickDisplayEmail({
    authEmail: user.email,
    notificationEmail: membership?.notification_email ?? null,
  });

  /* Çalışma alanı adı üyelik sorgusuyla AYNI turda geldi (bkz. getMembership) —
     ayrı bir workspaces turu yok. Tek istisna: kullanıcı bu istekte erişim
     davetiyle YENİ katıldıysa üyelik satırı okunduğunda henüz yoktu; o nadir
     durumda adı burada bir kez çekiyoruz. */
  workspace = membership?.workspace ?? null;
  if (workspaceId && !workspace) {
    const { data } = await supabase
      .from("workspaces")
      .select("id, name")
      .eq("id", workspaceId)
      .single();
    workspace = data;
  }

  if (workspaceId) {
    // NOT: saved_views sorgusu kabuktan kaldırıldı — sidebar'daki "Kaydedilen
    // görünümler" bölümü kalktı; pano/liste kendi sekme verisini kendisi çeker.
    /* Bildirimler yukarıdaki dalgada geldi. Gömülü `task` ilişkisi null ise
       görev tamamen silinmiş, deleted_at doluysa çöpe atılmış — ikisi de
       "ölü": pasif çizilir ve okunmadı rozetini şişirmez. */
    type NotifRow = Notification & { task?: { id: string; deleted_at: string | null } | null };
    const notifRows = (notifResult.data ?? []) as unknown as NotifRow[];
    deadTaskIds = notifRows
      .filter((n) => n.task_id != null && (!n.task || n.task.deleted_at != null))
      .map((n) => n.task_id as string);
    const deadSet = new Set(deadTaskIds);

    notifications = notifRows.map(({ task: _task, ...n }) => n as Notification);
    unreadCount = notifRows.filter(
      (n) => !n.is_read && !(n.task_id != null && deadSet.has(n.task_id)),
    ).length;

    userName = profile?.full_name ?? userName;
    displayEmail = pickDisplayEmail({
      profileEmail: profile?.email ?? null,
      authEmail: user.email,
      notificationEmail: membership?.notification_email ?? null,
    });

    // NOT: puan/takım özet sorguları buradan bilinçli olarak KALDIRILDI —
    // tek tüketicileri sidebar/header'daki {false && ...} ile gizlenmiş puan
    // kartlarıydı (Aslı/Nisa: "puan motive kalksın"). Kabuk her gezinmede
    // çalıştığı için bu 5-6 sorgu tüm sayfaları yavaşlatıyordu. Puan verisi
    // artık yalnız kendi sayfalarında (Profil, Gösterge Paneli) yüklenir;
    // kartlar geri istenirse veriyi orada değil, ilgili sayfada topla.
  }

  return (
    <div className="flex h-screen bg-app overflow-hidden">
      {/* no-print: kâğıtta kabuk yok — tek sayfa rapor A4'e sığsın. */}
      <div className="no-print contents">
      <AppSidebar
        workspace={workspace}
        brand={brand}
        userId={user.id}
        userRole={userRole}
      />
      </div>
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* no-print: sayfa başlığı çubuğu kâğıtta yer yer. */}
        <div className="no-print contents">
        <AppHeader
          workspace={workspace}
          unreadCount={unreadCount}
          userId={user.id}
          userName={userName}
          userEmail={displayEmail}
          notifications={notifications}
          deadTaskIds={deadTaskIds}
          userRole={userRole}
        />
        </div>
        {/* pb-bottom-nav keeps content clear of the fixed mobile bottom nav (incl.
            iOS safe-area inset); overflow-x-hidden stops stray wide children from
            producing a horizontal page scroll on phones. */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-bottom-nav">
          {noAccess ? (
            <div className="min-h-full flex items-center justify-center p-8">
              <div className="max-w-md w-full bg-amber-50 border border-amber-200 rounded-xl p-8 text-center space-y-4">
                <div className="text-4xl">🔒</div>
                <h2 className="text-lg font-semibold text-amber-900">
                  AF Operasyon erişimi yok
                </h2>
                <p className="text-sm text-amber-800">
                  Bu e-posta adresi için AF Operasyon erişimi tanımlı değil.
                  Erişim için yöneticinizle iletişime geçin.
                </p>
                <p className="text-xs text-amber-600">
                  Giriş yaptığınız hesap: {user.email}
                </p>
                <form action="/api/auth/signout" method="post">
                  <button
                    type="submit"
                    className="mt-2 text-sm text-amber-700 underline hover:text-amber-900"
                  >
                    Çıkış yap
                  </button>
                </form>
              </div>
            </div>
          ) : provisionError ? (
            <div className="p-8">
              <div className="max-w-md mx-auto bg-red-50 border border-red-200 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-red-800 mb-2">
                  Çalışma alanı kurulumu başarısız
                </h2>
                <p className="text-sm text-red-700 mb-4">{provisionError}</p>
                <p className="text-xs text-red-500">
                  Sayfayı yenilemeyi deneyin. Sorun devam ederse yöneticinize başvurun.
                </p>
              </div>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
      <div className="no-print contents"><MobileNav isAdmin={isAdmin} /></div>
      {/* Task-detail drawer slot (intercepting route). Empty on normal routes. */}
      {modal}
    </div>
  );
}
