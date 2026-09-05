import { redirect } from "next/navigation";
import { redirectToSignIn } from "@/lib/auth/session-redirect";
import { CalendarRange } from "lucide-react";
import { startOfWeek, addDays, format, parseISO, isValid, startOfYear, endOfYear } from "date-fns";
import { requireModuleMember } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { SetupRequiredNotice } from "@/components/modules/SetupRequiredNotice";
import { maybeDatabaseSetupRequired } from "@/lib/utils/supabase-errors";
import { ensureWeekScaffold } from "@/lib/planning/scaffold";
import { defaultRuntimeBands, type RuntimeBand } from "@/lib/planning/bands";
import { PlanningBoard } from "@/components/planning/PlanningBoard";
import { PlanningDayView } from "@/components/planning/PlanningDayView";
import { CalendarViewSwitch } from "@/components/planning/CalendarViewSwitch";
import { asCalendarScale } from "@/lib/planning/calendar-scale";
import { assignPersonTones } from "@/lib/design/person-colors";
import { CalendarYearView, type YearDayLoad } from "@/components/planning/CalendarYearView";
import { CalendarView } from "@/components/calendar/CalendarView";
import type {
  PlanningMeeting, PlanningTopic, PlanningMeetingWithTopics,
  Task, Profile, WorkspaceContact, WorkspaceDepartment,
} from "@/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Calendar" };

/**
 * Calendar — TEK takvim.
 *
 * Aslı Hanım (2026-08-19): "Bu takvimi ben buraya entegre edeyim bence. Bence
 * tek takvim yap. Buradan görebilelim." Eskiden ayrı iki ekran vardı
 * (Planlama = haftalık toplantı ızgarası, Görev Takvimi = aylık görev grid'i);
 * artık aynı sayfanın üç ölçeği: Hafta · Ay · Yıl.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; v?: string; d?: string }>;
}) {
  const { supabase, user, workspaceId, isAdmin, gate } = await requireModuleMember();
  if (gate === "login") redirectToSignIn();
  if (gate !== "ok" || !workspaceId || !user) return <AccessDenied />;

  const sp = await searchParams;
  const scale = asCalendarScale(sp.v);

  /* Sistemdeki üyeler — her ölçekte lazım (Kim rozetleri, kişi seçimi).
     Sorgu burada BAŞLATILIR ama beklenmez: aşağıdaki toplantı sorgusuyla
     paralel gitsin diye promise olarak tutuluyor. */
  const membersPromise = supabase
    .from("workspace_members")
    .select("id, user_id, role, color_key, icon_key, profiles(id, full_name, email, avatar_url)")
    .eq("workspace_id", workspaceId);
  const membersRes = await membersPromise;
  type ProfileLite = Pick<Profile, "id" | "full_name" | "email" | "avatar_url">;
  type MemberRow = { id: string; user_id: string; role: string; color_key: string | null; icon_key: string | null; profiles: ProfileLite | ProfileLite[] | null };
  const memberRowsData = (membersRes.data ?? []) as unknown as MemberRow[];
  /* Kişi seçicideki rozetler artık FOTOĞRAF taşıyor (List'teki süzgeç
     baloncuklarıyla aynı dil), o yüzden avatar da toplanır. Renk aşağıda
     `personHex` ile aynı kaynaktan gelir — kişi her ekranda aynı görünür. */
  const members: { id: string; name: string; photoUrl?: string | null }[] = [];
  const memberNames: Record<string, string> = {};
  /** profiles.id → fotoğraf. Kişi rozetleri artık YUVARLAK KART: fotoğrafı
   *  olanın fotoğrafı, olmayanın kendi renginde baş harfi (Sıraç, 2026-08-30:
   *  "isimler her yerde kart olmalı, harf olarak değil"). */
  const memberPhotos: Record<string, string | null> = {};
  for (const m of memberRowsData) {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    if (p) {
      const name = p.full_name || p.email || "—";
      members.push({ id: m.user_id, name, photoUrl: p.avatar_url ?? null });
      memberNames[m.user_id] = name;
      memberPhotos[m.user_id] = p.avatar_url ?? null;
    }
  }

  /* Kişi renkleri — takvimdeki baş harf rozetleri (SE, GÖ, AF) herkeste aynı
     marka rengindeydi; kimin olduğu ancak okunarak anlaşılıyordu. Aslı Hanım
     (2026-08-24): "Kişilerin isimleri kendi renklerinde olsun."
     Hesap panodakiyle AYNI kaynaktan: ekip geneli atama + yöneticinin seçimi. */
  const personHex: Record<string, string> = {};
  {
    const seeds = memberRowsData.map((m) => m.user_id);
    const choices = Object.fromEntries(
      memberRowsData.map((m) => [m.user_id, { colorKey: m.color_key, iconKey: m.icon_key }]),
    );
    for (const [id, tone] of Object.entries(assignPersonTones(seeds, choices))) {
      personHex[id] = tone.hex;
    }
  }

  /* Ölçek seçici (Hafta/Ay/Yıl) BU BAŞLIKTA DEĞİL: her görünüm onu kendi araç
     çubuğunun sağ ucunda çiziyor. Burada dururken hafta görünümünde sağda,
     ay görünümünde ayrı bir satırda solda kalıyordu — aynı kontrol sayfadan
     sayfaya yer değiştiriyordu (2026-08-29: "mantıksız olmuş, bir sağ bir
     sol"). JSX ÖZNİTELİKLERİ ARASINA yorum yazılmaz: Turbopack derlemeyi
     orada kırıyor (next build'in SWC'si sessizce geçiyor). */
  const header = (
    <ModulePageHeader
      title="Calendar"
      description={
        scale === "hafta"
          ? (isAdmin
            ? "Haftalık toplantı ızgarası — gün, saat, konu ve sorumlular."
            : "Haftalık toplantı ızgarası — takvimi yöneticiler düzenler; size atanan işler Board’da görünür.")
          : scale === "ay"
            ? "Ay görünümü — görevler teslim tarihine göre."
            : "Yıl görünümü — 12 ay bir arada; bir güne tıklayınca o gün açılır."
      }
      icon={CalendarRange}
    />
  );

  // ── Ay ve Yıl: görev verisi ────────────────────────────────────────────────
  if (scale === "ay" || scale === "yil") {
    const tasksQuery = supabase
      .from("tasks")
      .select("id, title, status, priority, due_date, start_date, department_id, visibility")
      .eq("workspace_id", workspaceId)
      .neq("status", "archived")
      .is("archived_at", null)
      .is("deleted_at", null);
    if (!isAdmin) tasksQuery.eq("visibility", "workspace");

    const [tasksResult, contactsResult, deptsResult, deptMembersResult] = await Promise.all([
      tasksQuery.or("due_date.not.is.null,start_date.not.is.null"),
      supabase.from("workspace_contacts").select("*").eq("workspace_id", workspaceId).order("created_at"),
      supabase.from("workspace_departments").select("id, parent_id, name, color_key").eq("workspace_id", workspaceId).order("position"),
      supabase.from("department_members").select("department_id, member_id").eq("workspace_id", workspaceId),
    ]);

    const tasks = (tasksResult.data ?? []) as Pick<
      Task, "id" | "title" | "status" | "priority" | "due_date" | "start_date" | "department_id" | "visibility"
    >[];
    const profiles: ProfileLite[] = memberRowsData.flatMap((m) =>
      Array.isArray(m.profiles) ? m.profiles : m.profiles ? [m.profiles] : []);
    const calMembers = memberRowsData.map((m) => {
      const prof = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      return { memberId: m.id, userId: m.user_id, name: prof?.full_name ?? prof?.email ?? "—" };
    });
    const contacts = (contactsResult.data ?? []) as WorkspaceContact[];
    const departments = (deptsResult.data ?? []) as WorkspaceDepartment[];
    const deptMembers = (deptMembersResult.data ?? []) as { department_id: string; member_id: string }[];

    if (scale === "ay") {
      return (
        /* HAFTA İLE AYNI KABUK: tam yükseklik, sayfa dolgusu yok — araç
           çubuğu her ölçekte ekranın aynı yerinde başlar. Dolgu artık
           görünümün GÖVDESİNDE (bkz. CalendarView embedded). */
        <div className="flex h-full min-h-0 w-full flex-col">
          <h1 className="sr-only">Calendar</h1>
          <CalendarView
            viewSwitch={<CalendarViewSwitch scale={scale} />}
            embedded
            initialDate={sp.d ?? null}
            tasks={tasks}
            workspaceId={workspaceId}
            profiles={profiles}
            contacts={contacts}
            departments={departments}
            members={calMembers}
            deptMembers={deptMembers}
            isAdmin={isAdmin}
          />
        </div>
      );
    }

    // Yıl — gün yoğunluğu haritası (görev + toplantı). Toplantı tablosu henüz
    // migrate edilmediyse yalnız görevler sayılır; sayfa çalışmaya devam eder.
    const focusYear = sp.d && isValid(parseISO(sp.d)) ? parseISO(sp.d).getFullYear() : new Date().getFullYear();
    const yearStart = format(startOfYear(new Date(focusYear, 0, 1)), "yyyy-MM-dd");
    const yearEnd = format(endOfYear(new Date(focusYear, 0, 1)), "yyyy-MM-dd");
    const meetingDaysRes = await supabase
      .from("planning_meetings")
      .select("meeting_date")
      .eq("workspace_id", workspaceId)
      .gte("meeting_date", yearStart)
      .lte("meeting_date", yearEnd);

    const loadByDay: Record<string, YearDayLoad> = {};
    const bump = (iso: string, key: keyof YearDayLoad) => {
      (loadByDay[iso] ??= { tasks: 0, meetings: 0 })[key]++;
    };
    for (const t of tasks) {
      const iso = (t.due_date ?? t.start_date)?.slice(0, 10);
      if (iso) bump(iso, "tasks");
    }
    for (const m of (meetingDaysRes.data ?? []) as { meeting_date: string }[]) {
      bump(String(m.meeting_date).slice(0, 10), "meetings");
    }

    return (
      <div className="flex h-full min-h-0 w-full flex-col">
        <h1 className="sr-only">Calendar</h1>
        <CalendarYearView
          loadByDay={loadByDay}
          initialYear={focusYear}
          viewSwitch={<CalendarViewSwitch scale={scale} />}
        />
      </div>
    );
  }

  // ── Hafta (varsayılan) — haftalık toplantı ızgarası ────────────────────────
  /* Sol sütun (şerit adı · saat · konu satırı) artık VERİ — Aslı Hanım
     (2026-08-28): "Buraya neden müdahale edemiyorum?" Tablo boşsa ya da henüz
     migrate edilmediyse kod varsayılanlarına düşülür; takvim her hâlükârda
     açılır. */
  const bandsRes = await supabase
    .from("planning_bands")
    .select("id, slot, category, label, topic_rows, columns")
    .eq("workspace_id", workspaceId)
    .order("position");
  type BandRow = {
    id: string; slot: string; category: string; label: string;
    topic_rows: number; columns: unknown;
  };
  const bandRows = (bandsRes.error ? [] : (bandsRes.data ?? [])) as unknown as BandRow[];
  const bands: RuntimeBand[] = bandRows.length
    ? bandRows.map((b) => ({
        id: b.id,
        slot: b.slot,
        category: b.category as RuntimeBand["category"],
        label: b.label,
        topicRows: b.topic_rows ?? 3,
        columns: Array.isArray(b.columns) ? (b.columns as string[]) : [],
      }))
    : defaultRuntimeBands();

  /* GÜN — AYRI SAYFA DEĞİL, haftanın üstünde bir KART.
     Sıraç (2026-08-30): "Gün pop-up'ı hafta kısmında kart olarak açılsın,
     başka sayfa değil." Bu yüzden `?v=gun` kendi veri yolunu açmaz: hafta
     normal şekilde yüklenir ve kart o günde açık gelir. Hafta zaten yedi günün
     toplantılarını çekiyor — gün kartı için EK SORGU YOK. */
  const openDay =
    scale === "gun"
      ? (sp.d && isValid(parseISO(sp.d)) ? sp.d.slice(0, 10) : format(new Date(), "yyyy-MM-dd"))
      : null;

  /* GÜN KARTI AÇIKSA HAFTA ONDAN TÜRER. Önce `?week=` önceliğe sahipti:
     ölçek seçicisiyle başka bir haftadan "Gün"e geçince (week=eski hafta,
     d=bugün) sunucu ESKİ haftayı yüklüyor, kart ise o haftada olmayan bir güne
     bakıyordu — hücre haritası boş olduğu için gün kartı, o günde toplantı olsa
     bile BOŞ açılıyordu. Kartın günü tek doğrudur; hafta ona uyar. */
  const ref = openDay
    ? parseISO(openDay)
    : sp.week && isValid(parseISO(sp.week))
      ? parseISO(sp.week)
      : new Date();
  const monday = startOfWeek(ref, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const isoDays = days.map((d) => format(d, "yyyy-MM-dd"));
  const weekStart = isoDays[0];
  const weekEnd = isoDays[6];

  /* TOPLANTILAR + KONULARI TEK TURDA.
     Sayfa eskiden üç adım sırayla bekliyordu: iskelet yoklaması → toplantılar
     → konular. Konular gömülü ilişkiyle aynı sorguda geliyor; iskelet
     yoklaması da kalktı, çünkü hafta dolu mu boş mu zaten bu sorgunun
     sonucundan belli. İskelet ancak hafta GERÇEKTEN boşken kurulur ve o nadir
     durumda bir kez daha okuruz. */
  const weekQuery = () =>
    supabase
      .from("planning_meetings")
      .select("*, planning_topics(*)")
      .eq("workspace_id", workspaceId)
      .gte("meeting_date", weekStart)
      .lte("meeting_date", weekEnd)
      .order("time_slot", { ascending: true })
      .order("position", { ascending: true });

  let meetingsRes = await weekQuery();

  // Her hafta AYNI iskeletle açılır — boşsa sessizce kurulur.
  // (Aslı Hanım, 2026-08-20: "Ben tek tek uğraşmayayım.")
  if (!meetingsRes.error && (meetingsRes.data ?? []).length === 0) {
    const added = await ensureWeekScaffold(supabase, {
      workspaceId, userId: user.id, isAdmin, weekStart, weekEnd, bands,
    });
    if (added > 0) meetingsRes = await weekQuery();
  }

  const setup = maybeDatabaseSetupRequired(meetingsRes.error);
  if (setup.setupRequired) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 lg:px-8">
        {header}
        <SetupRequiredNotice
          variant="block"
          title="Takvim tabloları henüz oluşturulmadı"
          message={setup.message ?? "Calendar için veritabanı güncellemesi bekleniyor."}
        />
      </div>
    );
  }

  type MeetingWithEmbedded = PlanningMeeting & { planning_topics?: PlanningTopic[] | null };
  const meetings = (meetingsRes.data ?? []) as unknown as MeetingWithEmbedded[];
  const withTopics: PlanningMeetingWithTopics[] = meetings.map(({ planning_topics, ...m }) => ({
    ...(m as PlanningMeeting),
    // Gömülü ilişki sırayı garanti etmez — konu sırası burada uygulanır.
    topics: [...(planning_topics ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
  }));

  /* Takvimin ALTINDAKİ üç blok (açık konular · hafta matrisi · operasyon
     adımları) kaldırıldı — Aslı Hanım, 2026-08-24: "Bunun altında yazılar iş
     bölümü… Gül'ün işlerini boarduna alacaksın. Buradan çıkacak bunlar."
     Üç sorgu da bu yüzden burada YOK; sayfa üç round-trip daha hızlı açılıyor.
     Satırlar veritabanında duruyor, yalnız çizilmiyor. */

  return (
    <PlanningBoard
      meetings={withTopics}
      weekDays={isoDays}
      weekStart={weekStart}
      members={members}
      memberNames={memberNames}
      memberPhotos={memberPhotos}
      personHex={personHex}
      isAdmin={isAdmin}
      bands={bands}
      openDay={openDay}
    />
  );
}
