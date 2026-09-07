import { redirect } from "next/navigation";
import { redirectToSignIn } from "@/lib/auth/session-redirect";
import { Target } from "lucide-react";
import { addMonths, format, parseISO, isValid, startOfMonth } from "date-fns";
import { tr } from "date-fns/locale";
import { requireModuleMember } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { SetupRequiredNotice } from "@/components/modules/SetupRequiredNotice";
import { maybeDatabaseSetupRequired } from "@/lib/utils/supabase-errors";
import { assignPersonTones } from "@/lib/design/person-colors";
import { GoalsBoard, type GoalRow } from "@/components/goals/GoalsBoard";
import type { Profile } from "@/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Goals" };

/**
 * GOALS — kişi × ay hedefleri.
 *
 * Aslı Hanım (2026-09-07, sesli mesaj):
 *   "Önümüzdeki bir ay içindeki hedef, HER İNSANIN o bir ay içindeki hedefi,
 *    ikinci aydaki hedefi, üçüncü aydaki hedefi."
 *   "Oraya onu ben yazdığım zaman her gün herkesin saati de çıkacak,
 *    SORUMLULUĞU da çıkacak. BEN ARAYA İŞ SOKMAYACAĞIM. İŞ YÜRÜYECEK."
 *
 * Takvim "hangi gün hangi toplantı"yı söyler; burası "hangi kişi, hangi ay, ne
 * hedefliyor". İki ayrı soru olduğu için iki ayrı ekran.
 *
 * GİRİŞ KUTUCUKLARDIR (CLAUDE.md tek tasarım dili): Pano'nun kişi kartıyla
 * birebir aynı `Tile`. Kartın altında SAYI YOK — kişi puanlanmaz; onun yerine
 * bu ayki ilk hedefin METNİ yazar, yani kart listeyi tarif eder.
 */
export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; m?: string }>;
}) {
  const { supabase, user, workspaceId, isAdmin, gate } = await requireModuleMember();
  if (gate === "login") redirectToSignIn();
  if (gate !== "ok" || !workspaceId || !user) return <AccessDenied />;

  const sp = await searchParams;

  /* Üç aylık pencere. `?m=` verilmezse İÇİNDE BULUNDUĞUMUZ ay — AF "önümüzdeki
     bir ay / ikinci ay / üçüncü ay" derken bugünden sayıyor. Oklar pencereyi
     kaydırır ki geçmiş aylar da okunabilsin. */
  const anchor = sp.m && isValid(parseISO(sp.m)) ? startOfMonth(parseISO(sp.m)) : startOfMonth(new Date());
  const months = [0, 1, 2].map((i) => format(addMonths(anchor, i), "yyyy-MM-01"));
  const monthLabels = [0, 1, 2].map((i) =>
    format(addMonths(anchor, i), "LLLL yyyy", { locale: tr }),
  );

  const membersRes = await supabase
    .from("workspace_members")
    .select("user_id, role, color_key, icon_key, job_title, profiles(id, full_name, email, avatar_url)")
    .eq("workspace_id", workspaceId);

  type ProfileLite = Pick<Profile, "id" | "full_name" | "email" | "avatar_url">;
  type MemberRow = {
    user_id: string; role: string; color_key: string | null; icon_key: string | null;
    job_title: string | null; profiles: ProfileLite | ProfileLite[] | null;
  };
  const memberRows = (membersRes.data ?? []) as unknown as MemberRow[];

  const people = memberRows.map((m) => {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    return {
      id: m.user_id,
      name: p?.full_name || p?.email || "—",
      avatarUrl: p?.avatar_url ?? null,
      jobTitle: m.job_title,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "tr"));

  /* Kişi rengi Pano/Takvim ile AYNI kaynaktan — aynı insan her ekranda aynı. */
  const tones = assignPersonTones(
    memberRows.map((m) => m.user_id),
    Object.fromEntries(memberRows.map((m) => [m.user_id, { colorKey: m.color_key, iconKey: m.icon_key }])),
  );

  const goalsRes = await supabase
    .from("workspace_goals")
    .select("id, member_id, period_month, title, detail, status, position")
    .eq("workspace_id", workspaceId)
    .in("period_month", months)
    .order("position", { ascending: true });

  const setup = maybeDatabaseSetupRequired(goalsRes.error);
  const goals = (goalsRes.error ? [] : (goalsRes.data ?? [])) as GoalRow[];

  const header = (
    <ModulePageHeader
      title="Goals"
      description="Kişi başına aylık hedefler — bu ay, gelecek ay ve sonraki ay."
      icon={Target}
    />
  );

  if (setup.setupRequired) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 lg:px-8">
        {header}
        <SetupRequiredNotice
          variant="block"
          title="Hedef tablosu henüz oluşturulmadı"
          message={setup.message ?? "Goals için veritabanı güncellemesi bekleniyor (20240340)."}
          technicalDetail={isAdmin ? setup.technicalDetail : null}
        />
      </div>
    );
  }

  const selected = sp.p ? people.find((p) => p.id === sp.p) ?? null : null;

  /* KİŞİ IZGARASI ARTIK BURADA DEĞİL. Sıraç (2026-09-08): "Goals'ı Board ile
     birleştirip seçenek koyalım; AYNI SAYFA DUPLICATE EDİLMİŞ GİBİ çok kötü
     olmuş." Board ve Goals ikisi de kişi kutucuklarıyla açılıyordu — aynı
     ızgara iki modülde. Tek giriş Board'da kaldı; burası o kişinin "Hedefler"
     sekmesidir ve kişisiz açılırsa Board'a döner. */
  if (!selected) redirect("/board");

  // ── Kişi seçildi: ÜÇ AY ───────────────────────────────────────────────────
  return (
    <GoalsBoard
      person={{ ...selected, colorHex: tones[selected.id]?.hex ?? null }}
      months={months}
      monthLabels={monthLabels}
      anchorMonth={format(anchor, "yyyy-MM-01")}
      goals={goals.filter((g) => g.member_id === selected.id)}
      /* Yönetici herkesinkini, üye kendisininkini yazar (RLS ile aynı cümle). */
      canWrite={isAdmin || selected.id === user.id}
    />
  );
}
