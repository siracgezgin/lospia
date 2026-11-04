/**
 * Upcycle — yapılacaklar listesi (Gül Hanım · Nisa Hanım, 04.11.2026).
 * Tek yaşayan liste (Calendar gibi): ürünler ve malzeme listesi.
 */

import { Recycle } from "lucide-react";
import { redirectToSignIn } from "@/lib/auth/session-redirect";
import { requireModuleMember } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { SetupRequiredNotice } from "@/components/modules/SetupRequiredNotice";
import { maybeDatabaseSetupRequired } from "@/lib/utils/supabase-errors";
import { parseSection, UPCYCLE_COLUMNS } from "@/lib/upcycle/model";
import { UpcycleBoard } from "@/components/upcycle/UpcycleBoard";
import type { UpcycleItem } from "@/types";

export const dynamic = "force-dynamic";
/* İçe aktarma bu sayfadan çağrılıyor; fotoğraflı bir Excel saniyeler sürebilir. */
export const maxDuration = 120;
export const metadata = { title: "Upcycle" };

export default async function UpcyclePage({
  searchParams,
}: {
  searchParams: Promise<{ bolum?: string; uyari?: string }>;
}) {
  const { supabase, user, workspaceId, isAdmin, gate } = await requireModuleMember();
  if (gate === "login") redirectToSignIn();
  if (gate !== "ok" || !workspaceId || !user) return <AccessDenied />;
  const sp = await searchParams;

  const { data, error } = await supabase
    .from("upcycle_items")
    .select(UPCYCLE_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  const setup = maybeDatabaseSetupRequired(error);
  if (setup.setupRequired) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 lg:px-8">
        <ModulePageHeader
          title="Upcycle"
          description="Upcycle yapılacaklar listesi — ürünler ve malzemeler."
          icon={Recycle}
        />
        <SetupRequiredNotice
          variant="block"
          title="Upcycle tablosu henüz oluşturulmadı"
          message={setup.message ?? "Veritabanı güncellemesi (20240366) bekleniyor."}
          technicalDetail={isAdmin ? setup.technicalDetail : null}
        />
      </div>
    );
  }

  return (
    <UpcycleBoard
      initialItems={(data ?? []) as unknown as UpcycleItem[]}
      initialSection={parseSection(sp?.bolum)}
      workspaceId={workspaceId}
      userId={user.id}
      isAdmin={isAdmin}
      importWarnings={sp?.uyari ? sp.uyari.split("\n").filter(Boolean).slice(0, 10) : []}
    />
  );
}
