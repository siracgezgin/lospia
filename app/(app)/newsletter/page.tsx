import { randomUUID } from "crypto";
import { redirectToSignIn } from "@/lib/auth/session-redirect";
import { format, parseISO, subWeeks } from "date-fns";
import { tr } from "date-fns/locale";
import { requireModuleMember } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { SetupRequiredNotice } from "@/components/modules/SetupRequiredNotice";
import { maybeDatabaseSetupRequired } from "@/lib/utils/supabase-errors";
import { NewsletterMonth } from "@/components/newsletter/NewsletterMonth";
import { NewsletterWeekEditor } from "@/components/newsletter/NewsletterWeekEditor";
import {
  emptyWeek, isMonday, mondaysOfMonth, MONTH_RE, NEWSLETTER_SELECT, normalizeBlock,
  type NewsletterBlock, type NewsletterWeek,
} from "@/lib/newsletter/model";

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

  /* jsonb'den gelen her blok tam kalıba tamamlanır — eski/eksik alan
     ekranda `undefined` olarak patlamasın. */
  const toWeek = (r: NewsletterWeek): NewsletterWeek => ({
    ...r,
    subject: r.subject ?? "", theme: r.theme ?? "", notes: r.notes ?? "",
    blocks: (Array.isArray(r.blocks) ? r.blocks : []).map((b, i) =>
      normalizeBlock(b as Partial<NewsletterBlock>, `${r.send_date}-${i}`)),
  });
  const rows = new Map(((res.data ?? []) as NewsletterWeek[]).map((r) => [r.send_date, toWeek(r)]));
  const canEdit = role !== "viewer";

  if (week) {
    const label = format(parseISO(week), "d MMMM yyyy, EEEE", { locale: tr });

    /* TEKRAR UYARILARI İÇİN GEÇMİŞ (Aslı Hanım: "aynı ürün bültenlerde
       tekrar etmez"; story son 4 haftada tekrar etmesin). Önceki 26 hafta
       yeter — yalnız bloklar okunur. */
    const histRes = await supabase
      .from("newsletter_weeks")
      .select("send_date, blocks")
      .eq("workspace_id", workspaceId)
      .lt("send_date", week)
      .gte("send_date", format(subWeeks(parseISO(week), 26), "yyyy-MM-dd"))
      .order("send_date", { ascending: false });
    const usedProducts: Record<string, string> = {};
    const usedStories: Record<string, string> = {};
    const storyCutoff = format(subWeeks(parseISO(week), 4), "yyyy-MM-dd");
    for (const h of (histRes.data ?? []) as { send_date: string; blocks: Partial<NewsletterBlock>[] | null }[]) {
      for (const b of Array.isArray(h.blocks) ? h.blocks : []) {
        if (b.type === "urun") for (const p of b.products ?? []) usedProducts[String(p.id)] ??= h.send_date;
        if (b.type === "story" && b.link && h.send_date >= storyCutoff) usedStories[b.link] ??= h.send_date;
      }
    }

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
        <NewsletterWeekEditor
          key={week}
          initial={rows.get(week) ?? emptyWeek(week, randomUUID)}
          label={label}
          canEdit={canEdit}
          workspaceId={workspaceId}
          usedProducts={usedProducts}
          usedStories={usedStories}
        />
      </div>
    );
  }

  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      <ModulePageHeader title="Newsletter Plan" backHref="/documents" />
      <NewsletterMonth month={month} weeks={mondays.map((d) => rows.get(d) ?? emptyWeek(d, randomUUID))} />
    </div>
  );
}
