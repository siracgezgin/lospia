import { redirectToSignIn } from "@/lib/auth/session-redirect";
import { format, parseISO } from "date-fns";
import { tr } from "date-fns/locale";
import { requireModuleMember } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { SetupRequiredNotice } from "@/components/modules/SetupRequiredNotice";
import { maybeDatabaseSetupRequired } from "@/lib/utils/supabase-errors";
import { NewsletterMonth } from "@/components/newsletter/NewsletterMonth";
import { NewsletterWeekEditor } from "@/components/newsletter/NewsletterWeekEditor";
import { emptyWeek, isMonday, mondaysOfMonth, MONTH_RE, NEWSLETTER_SELECT, type NewsletterWeek } from "@/lib/newsletter/model";

export const dynamic = "force-dynamic";
export const metadata = { title: "Newsletter Plan" };

/**
 * NEWSLETTER PLAN — haftalık bültenin aylık planı (06.11.2026 toplantısı).
 *
 * Bülten her PAZARTESİ gider. Aylık plan Excel'de tutuluyordu; artık burada:
 * Nisa Hanım hazırlar, Aslı Hanım onaylar. Giriş ekranı ayın pazartesileri —
 * TileGrid kutucukları (tek tasarım dili). Kutucuğa girince o haftanın planı.
 *
 * Görünüm durumu ADRESTE: `?m=2026-11` ay, `?w=2026-11-16` hafta.
 * Gönderim panelde YOK — postayı afcom-seo/27_bulten atar; abone listesi
 * buraya girmez (KVKK).
 */
export default async function NewsletterPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; w?: string }>;
}) {
  const { supabase, user, workspaceId, isAdmin, role, gate } = await requireModuleMember();
  if (gate === "login") redirectToSignIn();
  if (gate !== "ok" || !workspaceId || !user) return <AccessDenied />;

  const sp = await searchParams;
  const week = sp.w && isMonday(sp.w) ? sp.w : null;
  /* Hafta seçiliyse ay onun ayıdır; yoksa adresteki ay; o da yoksa bu ay. */
  const month = week ? week.slice(0, 7) : sp.m && MONTH_RE.test(sp.m) ? sp.m : format(new Date(), "yyyy-MM");
  const mondays = mondaysOfMonth(month);

  const res = await supabase
    .from("newsletter_weeks")
    .select(NEWSLETTER_SELECT)
    .eq("workspace_id", workspaceId)
    .in("send_date", week ? [week] : mondays);

  const setup = maybeDatabaseSetupRequired(res.error);
  if (setup.setupRequired) {
    return (
      <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
        <ModulePageHeader title="Newsletter Plan" backHref="/documents" />
        <SetupRequiredNotice
          variant="block"
          title="Bülten planı için veritabanı güncellemesi bekleniyor"
          message={setup.message ?? "Newsletter Plan için veritabanı güncellemesi bekleniyor (20240369, 20240370)."}
          technicalDetail={isAdmin ? setup.technicalDetail : null}
        />
      </div>
    );
  }

  const rows = new Map(((res.data ?? []) as NewsletterWeek[]).map((r) => [r.send_date, r]));
  const canEdit = role !== "viewer";

  if (week) {
    const label = format(parseISO(week), "d MMMM yyyy, EEEE", { locale: tr });
    return (
      <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
        <ModulePageHeader
          title="Newsletter Plan"
          crumbs={[
            { label: "AF Teamwork", href: "/documents" },
            { label: "Newsletter Plan", href: `/newsletter?m=${month}` },
            { label },
          ]}
        />
        <NewsletterWeekEditor key={week} initial={rows.get(week) ?? emptyWeek(week)} label={label} canEdit={canEdit} />
      </div>
    );
  }

  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      <ModulePageHeader title="Newsletter Plan" backHref="/documents" />
      <NewsletterMonth month={month} weeks={mondays.map((d) => rows.get(d) ?? emptyWeek(d))} />
    </div>
  );
}
