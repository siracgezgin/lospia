import Link from "next/link";
import { redirect } from "next/navigation";
import { requireModuleMember } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { PersonReport } from "@/components/reports/PersonReport";
import { startOfWeek, addDays, format } from "date-fns";
import { istanbulTodayISO } from "@/components/dashboard/today";
import type { Task, Profile } from "@/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Person Report" };

/**
 * Kişi bazlı TEK SAYFA rapor.
 *
 * Aslı Hanım (2026-08-19): "Beş sayfa gönderince o insanlar o beş sayfayı
 * okumuyor bile, kendileriyle ilgili olanı bile… Tek sayfalık, kişi bazlı
 * böyle bir şey yapabiliriz — sadece bir sayfada kendisiyle ilgili detayları
 * okusun." Ve biçim için: "Instagram'da yapıyorlar ya, önce dikkati çekiyor,
 * daha fazlasını isteyince veriyor."
 *
 * Sayfa doğrudan işin kendisiyle açılır (gecikmiş → yaklaşan → toplantı →
 * tarihsiz); sayaç yok (Aslı Hanım, 2026-08-24: "İsmi, işi, tarihi bu
 * kadar"). Yazdırılabilir: A4 tek sayfa (bkz. globals.css @media print).
 */
export default async function PersonReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user, workspaceId, isAdmin, gate } = await requireModuleMember();
  if (gate === "login") redirect("/login");
  if (gate !== "ok" || !workspaceId || !user) return <AccessDenied />;

  // Üyeler yalnız KENDİ raporunu görür; yönetici herkesinkini.
  if (!isAdmin && id !== user.id) return <AccessDenied />;

  /* "Bugün" ve hafta penceresi İSTANBUL takvimine göre kurulur.
     `new Date()` SUNUCUNUN saatidir; Vercel UTC'de olduğu için gece
     yarısı–03:00 arasında bir önceki güne düşüyordu: bugün teslim edilecek
     işler "gecikmiş" kutusuna kayıyor ve pazartesi sabahları hafta bir önceki
     haftayı gösteriyordu (Ana Sayfa'da aynı hata 2026-08-24'te düzeltilmişti;
     rapor sayfası atlanmıştı). */
  const today = istanbulTodayISO();
  const monday = startOfWeek(new Date(`${today}T12:00:00`), { weekStartsOn: 1 });
  const weekStart = format(monday, "yyyy-MM-dd");
  const weekEnd = format(addDays(monday, 6), "yyyy-MM-dd");

  const [profileRes, membersRes, tasksRes, meetingsRes, deptRes, partRes] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, avatar_url").eq("id", id).maybeSingle(),
    // Kimlik seçimleri — raporun rengi panodakiyle AYNI olmalı. Tek kişilik
    // hesap yapılırsa takım geneli atamayla tutmaz, yöneticinin seçimini de
    // görmez; bu yüzden ekibin tamamı çekilir.
    supabase
      .from("workspace_members")
      // `id` de gelir: departman üyeliği department_members.member_id üzerinden
      // bağlıdır, kişinin auth id'siyle değil.
      .select("id, user_id, color_key, icon_key")
      .eq("workspace_id", workspaceId),
    // Kişinin işleri: sorumlu ya da iş birliği yapan.
    supabase
      .from("tasks")
      .select("id, title, status, priority, due_date, completed_at, department_id, custom_fields, visibility, assignee_id")
      .eq("workspace_id", workspaceId)
      .is("archived_at", null)
      .is("deleted_at", null),
    supabase
      .from("planning_meetings")
      .select("id, meeting_date, time_slot, title, category, participant_ids, collaborator_ids")
      .eq("workspace_id", workspaceId)
      .gte("meeting_date", weekStart)
      .lte("meeting_date", weekEnd)
      .order("meeting_date")
      .order("time_slot"),
    supabase
      .from("department_members")
      .select("department_id, member_id, workspace_departments(name)")
      .eq("workspace_id", workspaceId),
    /* Katılımcı olarak yürütülen işler — sorumluluk kuralı Pano'yla AYNI
       olmalı (atanan ∪ KATILIMCI ∪ iş birliği). Çok kişili görevlerde
       assignee_id yalnız İLK sorumluya eşitlendiği için ikinci/üçüncü
       sorumlunun raporu o işleri hiç göstermiyordu. */
    supabase
      .from("task_member_completions")
      .select("task_id, workspace_members!inner(user_id)")
      .eq("workspace_id", workspaceId)
      .eq("workspace_members.user_id", id),
  ]);

  const profile = profileRes.data as Pick<Profile, "id" | "full_name" | "email" | "avatar_url"> | null;
  /* "Kişi yok" ≠ "yetkin yok". Silinmiş/olmayan bir kimlikte AccessDenied
     göstermek kullanıcıya yanlış şeyi söylüyordu ("erişiminiz yok"), üstelik
     geri dönüş yolu da vermiyordu. */
  if (!profile) {
    return (
      <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-md rounded-card border border-line bg-surface px-6 py-12 text-center shadow-card">
          <p className="text-[15px] font-semibold tracking-tight text-ink">Kişi bulunamadı.</p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
            Bu rapor artık çalışma alanında olmayan bir kişiye ait olabilir.
          </p>
          <Link
            href="/dashboard"
            className="mt-4 inline-flex h-9 items-center rounded-control border border-line bg-surface px-3.5 text-[13.5px] font-medium text-ink transition-colors duration-150 hover:bg-surface-hover pointer-coarse:h-11"
          >
            Reports&apos;a dön
          </Link>
        </div>
      </div>
    );
  }

  // Görev sahipliği Pano'daki kuralla AYNI: sorumlu ∪ katılımcı ∪ iş birliği.
  const participantTaskIds = new Set(
    ((partRes.data ?? []) as unknown as { task_id: string }[]).map((r) => r.task_id),
  );
  type T = Pick<Task, "id" | "title" | "status" | "priority" | "due_date" | "completed_at" | "department_id"> & {
    custom_fields?: Record<string, unknown> | null;
    visibility?: string | null;
  };
  const mine = ((tasksRes.data ?? []) as unknown as (T & { assignee_id?: string | null })[]).filter((t) => {
    if (!isAdmin && t.visibility === "admin_only") return false;
    if (t.assignee_id === id) return true;
    if (participantTaskIds.has(t.id)) return true;
    const c = (t.custom_fields as Record<string, unknown> | null)?.collaborators;
    return Array.isArray(c) && (c as string[]).includes(id);
  });

  const meetings = ((meetingsRes.data ?? []) as unknown as {
    id: string; meeting_date: string; time_slot: string; title: string | null;
    category: string; participant_ids: string[] | null; collaborator_ids: string[] | null;
  }[]).filter((m) =>
    (m.participant_ids ?? []).includes(id) || (m.collaborator_ids ?? []).includes(id),
  );

  /* DEPARTMAN yalnız BU KİŞİNİN departmanı olmalı. Süzgeç yoktu: sorgu
     çalışma alanındaki TÜM departman üyeliklerini çekip hepsinin adını
     yazıyordu — herkesin raporunun başlığında bütün departmanlar diziliydi
     ("Üretim · Kreatif · Muhasebe"), yani satır hiçbir şey söylemiyordu.
     Bağ department_members.member_id → workspace_members.id üzerinden kurulur. */
  const myMemberId = ((membersRes.data ?? []) as unknown as { id: string; user_id: string }[])
    .find((m) => m.user_id === id)?.id ?? null;
  const deptNames = ((deptRes.data ?? []) as unknown as {
    department_id: string; member_id: string;
    workspace_departments: { name: string } | { name: string }[] | null;
  }[])
    .filter((d) => myMemberId !== null && d.member_id === myMemberId)
    .map((d) => {
      const w = Array.isArray(d.workspace_departments) ? d.workspace_departments[0] : d.workspace_departments;
      return w?.name;
    })
    .filter((n): n is string => !!n);

  return (
    <PersonReport
      teamIdentity={((membersRes.data ?? []) as { user_id: string; color_key: string | null; icon_key: string | null }[])
        .map((m) => ({ id: m.user_id, colorKey: m.color_key, iconKey: m.icon_key }))}
      person={{
        id: profile.id,
        name: profile.full_name ?? profile.email ?? "—",
        avatarUrl: profile.avatar_url ?? null,
      }}
      tasks={mine}
      meetings={meetings}
      departments={[...new Set(deptNames)]}
      today={today}
      /* Görev sorgusu patlarsa rapor BOŞ değil, UYARILI açılır: "işi yok" ile
         "liste gelmedi" aynı şey değil. */
      error={tasksRes.error ? "İşler getirilemedi. Sayfayı yenileyin; sorun sürerse yöneticinize bildirin." : null}
    />
  );
}
