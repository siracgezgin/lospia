import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { startOfWeek, addDays, format } from "date-fns";
import { requireModuleMember } from "@/lib/modules/context";
import { getProfile } from "@/lib/supabase/server";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { PhotoNudge } from "@/components/home/PhotoNudge";
import { categoryMeta } from "@/lib/planning/categories";
import { cn } from "@/lib/utils/cn";
import type { TaskPriority, TaskStatus } from "@/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home Page" };

// Operasyon İstanbul saatiyle yaşar; sunucu (Vercel) UTC'dir — selamlama ve
// "bugün" hesabı bu yüzden Europe/Istanbul üzerinden yapılır.
const TZ = "Europe/Istanbul";

function istanbulNowParts(): { hour: number; todayIso: string; longDate: string } {
  const now = new Date();
  const hour = Number(
    new Intl.DateTimeFormat("tr-TR", { hour: "numeric", hourCycle: "h23", timeZone: TZ }).format(now),
  );
  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
  const longDate = new Intl.DateTimeFormat("tr-TR", {
    day: "numeric", month: "long", year: "numeric", weekday: "long", timeZone: TZ,
  }).format(now);
  return { hour, todayIso, longDate };
}

function greetingFor(hour: number): string {
  if (hour < 6) return "İyi geceler";
  if (hour < 12) return "Günaydın";
  if (hour < 18) return "İyi günler";
  return "İyi akşamlar";
}

/** "2026-07-28" → "28 Tem" — kompakt satır içi tarih. */
function shortTrDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(d);
}

/** "2026-07-28" → "Salı" */
function weekdayTr(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return new Intl.DateTimeFormat("tr-TR", { weekday: "long" }).format(d);
}

type MyTask = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority | null;
  due_date: string | null;
};

type HomeMeeting = {
  id: string;
  meeting_date: string;
  time_slot: string;
  category: string | null;
  title: string | null;
};

/**
 * ANA SAYFA — "şu an neyi bilmem gerekiyor?"
 *
 * Sıraç (2026-08-29): "Kişiyi çok güzel karşılamalı, daha anlaşılır olmalı.
 * Neyi görmek gerekiyorsa ilk etapta onu görsün; sonra detayı merak eden zaten
 * ilgili başlığa girip görecek."
 *
 * Önceki hali doğru veriyi YANLIŞ AĞIRLIKLA gösteriyordu: tek uzun sütunda
 * gecikmiş işlerin TAMAMI (on iki satır) alt alta diziliyor, bugünün toplantısı
 * kenarda küçük bir kutuda kalıyor, sayfanın sağ yarısı bomboş duruyordu. Yani
 * ekranın en değerli yeri en az acil şeye ayrılmıştı.
 *
 * Yeni düzen üç kademe:
 *   1. BUGÜN — tam genişlikte tek şerit: bugünün toplantıları ve bugün teslim
 *      edilecek işler yan yana. Sabah bakılan tek yer burası.
 *   2. Gecikmiş · Bu hafta — yan yana iki sütun, her biri İLK ALTI satır.
 *      Gerisi "Tümü" ile listeye gider; ana sayfa bir arşiv değil.
 *   3. Haftanın kalanı — önümüzdeki toplantılar.
 *
 * KISAYOL IZGARASI YOK: modül dizini sayfanın altında ikinci kez
 * listeleniyordu — "zaten yanda var her şey".
 *
 * SAYAÇ YOK (CLAUDE.md sadelik kuralı). "3 gecikti" bir puan tablosudur;
 * kaç tane olduğu satırlara bakınca görülür.
 */
export default async function HomePage() {
  const { supabase, user, workspaceId, isAdmin, gate } = await requireModuleMember();
  if (gate === "login") redirect("/login");
  if (gate !== "ok" || !workspaceId || !user) return <AccessDenied />;

  const { hour, todayIso, longDate } = istanbulNowParts();
  /* Hafta penceresi BUGÜNDEN türer, `new Date()`ten değil.
     todayIso İstanbul saatiyle, startOfWeek(new Date()) ise SUNUCU saatiyle
     hesaplanıyordu. Vercel UTC'de olduğu için gece yarısı–03:00 arasında ikisi
     farklı güne düşüyor: hafta bir önceki haftaya kayıyor ve "bugünkü toplantı"
     hep 0 çıkıyordu (Aslı Hanım, 2026-08-24 00:32'de bunu gördü). */
  const monday = startOfWeek(new Date(`${todayIso}T12:00:00`), { weekStartsOn: 1 });
  const weekEnd = format(addDays(monday, 6), "yyyy-MM-dd");

  /* SORUMLULUK KURALI panonunkiyle AYNI: atanan VEYA katılımcı
     (applyPersonFilter). Yalnız assignee_id'ye bakılırsa katılımcı olarak
     yürütülen işler sayılmaz ve Ana Sayfa ile Pano farklı şey gösterir
     (Aslı Hanım, 2026-08-24: "bu kısımlar doğru çalışmıyor"). */
  const myTasksQuery = supabase
    .from("tasks")
    .select("id, title, status, priority, due_date")
    .eq("workspace_id", workspaceId)
    .or(`assignee_id.eq.${user.id},custom_fields->collaborators.cs.["${user.id}"]`)
    .not("status", "in", "(done,archived)")
    .is("deleted_at", null)
    .is("archived_at", null)
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(100);
  if (!isAdmin) myTasksQuery.eq("visibility", "workspace");

  /* YEDEK HATIRLATMASI — yalnız yöneticiye, yalnız süresi geçtiyse.
     Sıraç (2026-08-29): "Haftada bir bu yedeği alıp indirmemiz gerekiyor."
     Ayarlar'daki şerit ancak oraya giren görür; ritmi ayakta tutan şey giriş
     ekranındaki tek satırlık hatırlatmadır. Üye bu sorguyu HİÇ çalıştırmaz. */
  const lastBackupQuery = isAdmin
    ? supabase
        .from("workspace_backups")
        .select("created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(1)
    : Promise.resolve({ data: [] as { created_at: string }[] });

  const [myTasksRes, meetingsRes, profile, lastBackupRes] = await Promise.all([
    myTasksQuery,
    supabase
      .from("planning_meetings")
      .select("id, meeting_date, time_slot, category, title")
      .eq("workspace_id", workspaceId)
      .gte("meeting_date", todayIso)
      .lte("meeting_date", weekEnd)
      .order("meeting_date", { ascending: true })
      .order("time_slot", { ascending: true })
      .order("position", { ascending: true }),
    // Kabuk aynı satırı zaten çekti — getProfile react/cache'li, ikinci
    // istek gitmez.
    getProfile(user.id),
    lastBackupQuery,
  ]);

  /* Kaç gün önce yedek alındı? Tablo henüz canlıya taşınmadıysa sorgu hata
     döner ve `data` boş gelir — hatırlatma o durumda da doğru davranır
     ("hiç alınmamış" gibi okunur). */
  const lastBackupIso =
    (lastBackupRes?.data?.[0] as { created_at?: string } | undefined)?.created_at ?? null;
  const backupAgeDays = lastBackupIso
    ? Math.floor(
        (new Date(`${todayIso}T12:00:00`).getTime() - new Date(lastBackupIso).getTime()) / 86_400_000,
      )
    : null;
  const backupDue = isAdmin && (backupAgeDays === null || backupAgeDays >= 7);

  const myTasks = (myTasksRes.data ?? []) as MyTask[];

  /* ZAMAN KOVALARI — sayfanın omurgası. Bir tasarımcı "hangisi bugüne ait?"
     sorusunu tarih okuyarak değil, başlığa bakarak cevaplasın. */
  const dueOf = (t: MyTask) => (t.due_date ? t.due_date.slice(0, 10) : null);
  type Bucket = { key: string; label: string; tone: "danger" | "brand" | "muted"; items: MyTask[] };
  const buckets: Bucket[] = ([
    { key: "late",  label: "Gecikmiş",   tone: "danger", items: myTasks.filter((t) => { const d = dueOf(t); return d !== null && d < todayIso; }) },
    { key: "today", label: "Bugün",      tone: "brand",  items: myTasks.filter((t) => dueOf(t) === todayIso) },
    { key: "week",  label: "Bu hafta",   tone: "muted",  items: myTasks.filter((t) => { const d = dueOf(t); return d !== null && d > todayIso && d <= weekEnd; }) },
    { key: "later", label: "Sonrası",    tone: "muted",  items: myTasks.filter((t) => { const d = dueOf(t); return d !== null && d > weekEnd; }) },
    { key: "undated", label: "Tarihsiz", tone: "muted",  items: myTasks.filter((t) => dueOf(t) === null) },
  ] as Bucket[]).filter((b) => b.items.length > 0);

  // Takvim tablosu migrate edilmemişse sessizce boş kalır — Ana Sayfa çökmez.
  const meetings = (meetingsRes.error ? [] : (meetingsRes.data ?? [])) as HomeMeeting[];
  const todayMeetings = meetings.filter((m) => m.meeting_date === todayIso);
  const laterMeetings = meetings.filter((m) => m.meeting_date > todayIso);

  const fullName = profile?.full_name ?? null;
  const firstName = fullName?.trim().split(/\s+/)[0] ?? null;

  /* Ana sayfa bir arşiv değil: uzun kuyruklar kesilir, gerisi listeye gider. */
  const CAP = 6;
  const late = buckets.find((b) => b.key === "late")?.items ?? [];
  const today = buckets.find((b) => b.key === "today")?.items ?? [];
  const week = buckets.find((b) => b.key === "week")?.items ?? [];
  const rest = [
    ...(buckets.find((b) => b.key === "later")?.items ?? []),
    ...(buckets.find((b) => b.key === "undated")?.items ?? []),
  ];
  const nothingAtAll = myTasks.length === 0 && meetings.length === 0;

  /* İkincil kutular TEK listede: hangisinin dolu olduğuna göre ızgaraya
     sırayla dizilirler. Böylece "bu hafta boş" diye sayfanın yarısı
     boşalmaz. Sıra önem sırasıdır: gecikmiş → bu hafta → toplantılar →
     sonrası. */
  const panels: { key: string; node: React.ReactNode }[] = [];
  if (late.length > 0) {
    panels.push({
      key: "late",
      node: (
        <Panel title="Gecikmiş" tone="danger" href="/list?view=mine">
          <ul className="divide-y divide-hairline">
            {late.slice(0, CAP).map((t) => <TaskRow key={t.id} task={t} overdue />)}
          </ul>
          {late.length > CAP && <MoreLink href="/list?view=mine" />}
        </Panel>
      ),
    });
  }
  if (week.length > 0) {
    panels.push({
      key: "week",
      node: (
        <Panel title="Bu hafta" href="/list?view=mine">
          <ul className="divide-y divide-hairline">
            {week.slice(0, CAP).map((t) => <TaskRow key={t.id} task={t} />)}
          </ul>
          {week.length > CAP && <MoreLink href="/list?view=mine" />}
        </Panel>
      ),
    });
  }
  if (laterMeetings.length > 0) {
    panels.push({
      key: "meetings",
      node: (
        <Panel title="Haftanın kalanı" href={`/planning?week=${todayIso}`}>
          <ul className="space-y-2 pt-1">
            {laterMeetings.slice(0, 8).map((m) => (
              <MeetingRow key={m.id} meeting={m} day={weekdayTr(m.meeting_date)} />
            ))}
          </ul>
        </Panel>
      ),
    });
  }
  if (rest.length > 0) {
    panels.push({
      key: "rest",
      node: (
        <Panel title="Sonrası" href="/list?view=mine">
          <ul className="divide-y divide-hairline">
            {rest.slice(0, CAP).map((t) => <TaskRow key={t.id} task={t} />)}
          </ul>
          {rest.length > CAP && <MoreLink href="/list?view=mine" />}
        </Panel>
      ),
    });
  }

  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      {/* Karşılama */}
      <header className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-tight text-ink sm:text-2xl">
          {greetingFor(hour)}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-0.5 text-[13px] text-muted sm:text-sm">{longDate}</p>
      </header>

      {/* FOTOĞRAF DAVETİ — yalnız fotoğrafı olmayana. Kişi kendi rozetini
          görüp tek tıkla profiline gider (bkz. PhotoNudge). */}
      {!profile?.avatar_url && (
        <PhotoNudge name={fullName ?? "—"} colorHex={null} />
      )}

      {/* Yedek hatırlatması — tek satır, yalnız zamanı geldiğinde. */}
      {backupDue && (
        <Link
          href="/settings"
          className="anim-fade mb-4 flex items-center justify-between gap-3 rounded-card border border-warning/30 bg-warning/5 px-4 py-2.5 transition-colors duration-150 hover:bg-warning/10"
        >
          <span className="flex min-w-0 items-center gap-2.5 text-[13.5px] text-ink">
            <ShieldAlert size={16} className="shrink-0 text-warning" />
            <span className="truncate">
              {backupAgeDays === null
                ? "Sistemin yedeği hiç alınmadı."
                : `Son yedek ${backupAgeDays} gün önce alındı.`}{" "}
              <span className="text-muted">Haftalık yedeği indirin.</span>
            </span>
          </span>
          <ArrowRight size={15} className="shrink-0 text-warning" />
        </Link>
      )}

      {nothingAtAll ? (
        <div className="rounded-card border border-dashed border-line bg-surface px-6 py-14 text-center">
          <p className="text-sm font-medium text-ink">Bugün için planlanmış bir şey yok.</p>
          <p className="mt-1 text-[13px] text-muted">
            <Link href="/board" className="font-medium text-brand hover:text-brand-strong">Pano</Link>
            {" · "}
            <Link href="/planning" className="font-medium text-brand hover:text-brand-strong">Calendar</Link>
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* ── 1. BUGÜN — sayfanın en değerli yeri ────────────────────── */}
          <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
            <div className="flex items-center justify-between gap-2 border-b border-hairline px-5 py-3">
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-brand-strong">Bugün</h2>
              <span className="text-[12px] text-subtle">{weekdayTr(todayIso)}</span>
            </div>
            <div className="grid grid-cols-1 divide-y divide-hairline md:grid-cols-2 md:divide-x md:divide-y-0">
              {/* Toplantılar */}
              <div className="min-w-0 p-5">
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <h3 className="text-[13px] font-semibold tracking-tight text-ink">Toplantılar</h3>
                  {/* Takvimin BUGÜNÜNE açılır (gün kartı), genel takvime değil.
                      Sıraç (2026-08-30): "Ana sayfaya da burayla ilişkili bir
                      şeyler ekleyelim ki giren kişi anlasın." Ana Sayfa
                      "bugün ne var?" diye soruyor; bağlantı da aynı günü
                      açmalı — kullanıcı haftada kendi gününü aramasın. */}
                  <SeeAll href={`/planning?v=gun&d=${todayIso}`} label="Günü aç" />
                </div>
                {todayMeetings.length === 0 ? (
                  <p className="text-[13.5px] text-subtle">Planlı toplantı yok.</p>
                ) : (
                  <ul className="space-y-2">
                    {todayMeetings.map((m) => (
                      <MeetingRow key={m.id} meeting={m} />
                    ))}
                  </ul>
                )}
              </div>

              {/* Bugün teslim */}
              <div className="min-w-0 p-5">
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <h3 className="text-[13px] font-semibold tracking-tight text-ink">Teslim edilecek</h3>
                  <SeeAll href="/list?view=mine" label="İşlerim" />
                </div>
                {today.length === 0 ? (
                  <p className="text-[13.5px] text-subtle">Bugün teslim edilecek iş yok.</p>
                ) : (
                  <ul className="divide-y divide-hairline">
                    {today.map((t) => (
                      <TaskRow key={t.id} task={t} />
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          {/* ── 2 & 3. Kutular ──────────────────────────────────────────
              Sıraç (2026-08-29): "Ana sayfada neden eşit boyda, hizada değil?
              Sayfa boş gözükmemeli, yarısı boş gözükmemeli."

              Önceden her kademe kendi `lg:grid-cols-2` ızgarasındaydı: o
              kademede tek kutu varsa (bu hafta hiç iş yoksa) sağ yarı bomboş
              kalıyordu. Artık BÜTÜN ikincil kutular tek listede toplanıyor,
              ızgaraya sırayla diziliyor ve TEK kalan kutu satırın tamamını
              kaplıyor — hiçbir satır yarım kalmaz.

              `items-stretch` + `h-full`: yan yana iki kutu farklı sayıda satır
              taşısa da aynı boyda durur. */}
          {panels.length > 0 && (
            <div className={cn("grid items-stretch gap-4", panels.length > 1 && "lg:grid-cols-2")}>
              {panels.map((p, i) => (
                <div
                  key={p.key}
                  className={cn(
                    /* min-w-0 ŞART: ızgara hücresi varsayılan olarak
                       `min-width: auto` taşır, yani içeriğinin min-content
                       genişliğinin altına İNMEZ. Satır başlıkları `truncate`
                       (white-space: nowrap) olduğu için min-content = başlığın
                       tam genişliği; hücre telefonda ekranı aşıyor, başlık ve
                       tarih sağdan kırpılıyordu. html/body'deki `overflow-x:
                       clip` bunu sessizce gizlediği için yatay kaydırma bile
                       görünmüyordu (2026-08-29 mobil taraması). */
                    "h-full min-w-0",
                    // Tek sayıda kutu varsa SONUNCUSU tam genişlik alır.
                    panels.length % 2 === 1 && i === panels.length - 1 && "lg:col-span-2",
                  )}
                >
                  {p.node}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Başlıklı kutu — üç kademenin ortak çerçevesi. */
function Panel({
  title, tone = "muted", href, children,
}: {
  title: string;
  tone?: "danger" | "muted";
  href: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="flex items-center justify-between gap-2 border-b border-hairline px-5 py-3">
        <h2
          className={cn(
            "text-[12px] font-semibold uppercase tracking-[0.08em]",
            tone === "danger" ? "text-danger" : "text-subtle",
          )}
        >
          {title}
        </h2>
        <SeeAll href={href} label="Tümü" />
      </div>
      <div className="flex-1 px-5 py-3">{children}</div>
    </section>
  );
}

/** Tek görev satırı — "isim, iş, tarih." */
function TaskRow({ task, overdue = false }: { task: MyTask; overdue?: boolean }) {
  const due = task.due_date ? task.due_date.slice(0, 10) : null;
  return (
    <li>
      <Link
        href={`/tasks/${task.id}`}
        className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-150 hover:bg-surface-hover"
      >
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink transition-colors duration-150 group-hover:text-brand-strong">
          {task.title}
        </span>
        {/* Acil bir DURUM değil, bir uyarı — tek rozet kuralı. */}
        {task.priority === "urgent" && (
          <span className="hidden shrink-0 rounded-md bg-urgent/10 px-1.5 py-0.5 text-[12px] font-medium text-urgent sm:inline">
            Acil
          </span>
        )}
        <span
          className={cn(
            "w-14 shrink-0 text-right text-[12px] tabular-nums",
            overdue ? "font-semibold text-danger" : "text-muted",
          )}
        >
          {due ? shortTrDate(due) : "—"}
        </span>
      </Link>
    </li>
  );
}

/** Kutu başlığındaki ince bağlantı. */
function SeeAll({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      /* tap-target: 19px'lik bir metin bağlantısı parmakla zor tutuluyordu;
         görünüm aynı kalır, hedef kaba işaretçide 40px olur. */
      className="tap-target group inline-flex shrink-0 items-center gap-1 text-[12.5px] font-medium text-brand transition-colors duration-150 hover:text-brand-strong"
    >
      {label}
      <ArrowRight size={12} className="transition-transform duration-150 ease-standard group-hover:translate-x-0.5" />
    </Link>
  );
}

/** Kesilen listenin altındaki devam satırı. */
function MoreLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="mt-1 flex min-h-9 items-center justify-center rounded-lg py-1.5 text-center text-[12.5px] font-medium text-brand transition-colors duration-150 hover:bg-surface-hover hover:text-brand-strong pointer-coarse:min-h-11"
    >
      Kalanları listede gör
    </Link>
  );
}

/** Tek toplantı satırı — saat · renk · başlık. "İsim, iş, tarih."
 *  Satırın tamamı o GÜNÜN takvim kartına gider: Ana Sayfa'da bir toplantı
 *  görüp "detayı nerede?" diye aramak gerekmesin. */
function MeetingRow({ meeting, day }: { meeting: HomeMeeting; day?: string }) {
  const meta = categoryMeta(meeting.category);
  const iso = String(meeting.meeting_date).slice(0, 10);
  return (
    <li>
      <Link
        href={`/planning?v=gun&d=${iso}`}
        className="-mx-2 flex min-h-9 items-baseline gap-2.5 rounded-lg px-2 py-1.5 text-[13.5px] transition-colors duration-150 hover:bg-surface-hover pointer-coarse:min-h-11"
      >
      <span className="w-11 shrink-0 font-semibold tabular-nums text-ink">
        {meeting.time_slot.slice(0, 5)}
      </span>
      <span aria-hidden className={cn("size-2 shrink-0 translate-y-[-1px] rounded-full", meta.dot)} />
      <span className="min-w-0 flex-1 truncate text-ink">
        {meeting.title?.trim() || meta.label}
      </span>
      {day && <span className="shrink-0 text-[12px] text-subtle">{day}</span>}
      </Link>
    </li>
  );
}
