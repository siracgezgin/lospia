/**
 * Order Review — Sipariş Değerlendirme (Nisa Hanım, 29.10.2026).
 * Giriş = değerlendirme kutucukları; her kutucuk bir sipariş / referans.
 */

import { redirectToSignIn } from "@/lib/auth/session-redirect";
import { ClipboardCheck } from "lucide-react";
import { requireModuleMember } from "@/lib/modules/context";
import { resolveSeasonId } from "@/lib/collection/season";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { SetupRequiredNotice } from "@/components/modules/SetupRequiredNotice";
import { maybeDatabaseSetupRequired } from "@/lib/utils/supabase-errors";
import { OrderReviewHome, type ReviewTile } from "@/components/order-review/OrderReviewHome";
import type { OrderReview, OrderReviewPhoto } from "@/types";

export const dynamic = "force-dynamic";
/* İçe aktarma bu sayfadan çağrılıyor; fotoğraflı bir Excel saniyeler sürebilir. */
export const maxDuration = 120;
export const metadata = { title: "Order Review" };

export default async function OrderReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ sezon?: string }>;
}) {
  const { supabase, user, workspaceId, isAdmin, gate } = await requireModuleMember();
  if (gate === "login") redirectToSignIn();
  if (gate !== "ok" || !workspaceId || !user) return <AccessDenied />;
  const sp = await searchParams;

  const [seasonsRes, reviewsRes] = await Promise.all([
    supabase
      .from("workspace_seasons")
      .select("id, name, is_current")
      .eq("workspace_id", workspaceId)
      .order("is_current", { ascending: false })
      .order("position")
      .order("name", { ascending: false }),
    supabase
      .from("order_reviews")
      .select("id, title, season_id, review_date, created_at, created_by")
      .eq("workspace_id", workspaceId)
      .order("review_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
  ]);

  const setup = maybeDatabaseSetupRequired(reviewsRes.error);
  if (setup.setupRequired) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 lg:px-8">
        <ModulePageHeader
          title="Order Review"
          description="Sipariş değerlendirme — fotoğraf, numune, kritik, toplantı notu ve karar."
          icon={ClipboardCheck}
        />
        <SetupRequiredNotice
          variant="block"
          title="Sipariş değerlendirme tablosu henüz oluşturulmadı"
          message={setup.message ?? "Veritabanı güncellemesi (20240365) bekleniyor."}
          technicalDetail={isAdmin ? setup.technicalDetail : null}
        />
      </div>
    );
  }

  const seasons = (seasonsRes.data ?? []) as { id: string; name: string; is_current: boolean }[];
  const seasonId = resolveSeasonId(sp?.sezon, seasons);
  const seasonName = new Map(seasons.map((s) => [s.id, s.name]));

  /* Sezonsuz değerlendirme her sezon bağlamında görünür (Koleksiyon kuralı). */
  const reviews = ((reviewsRes.data ?? []) as Pick<OrderReview, "id" | "title" | "season_id" | "review_date" | "created_at" | "created_by">[])
    .filter((r) => !seasonId || !r.season_id || r.season_id === seasonId);

  /* Kutucuk kapağı = ilk ürünün ilk fotoğrafı; alt satır = ürün sayısı
     (listeyi TARİF eden sayı — sadelik kuralı). */
  const ids = reviews.map((r) => r.id);
  const itemsRes = ids.length
    ? await supabase
        .from("order_review_items")
        .select("review_id, position, original_photos")
        .in("review_id", ids)
        .order("position", { ascending: true })
    : { data: [] };
  const count = new Map<string, number>();
  const cover = new Map<string, string>();
  for (const it of (itemsRes.data ?? []) as { review_id: string; original_photos: OrderReviewPhoto[] }[]) {
    count.set(it.review_id, (count.get(it.review_id) ?? 0) + 1);
    if (!cover.has(it.review_id) && it.original_photos?.[0]?.url) cover.set(it.review_id, it.original_photos[0].url);
  }

  const tiles: ReviewTile[] = reviews.map((r) => ({
    id: r.id,
    title: r.title,
    seasonName: r.season_id ? seasonName.get(r.season_id) ?? null : null,
    reviewDate: r.review_date,
    itemCount: count.get(r.id) ?? 0,
    coverUrl: cover.get(r.id) ?? null,
  }));

  return (
    <OrderReviewHome
      key={seasonId ?? "tum"}
      tiles={tiles}
      seasons={seasons}
      seasonId={seasonId}
      workspaceId={workspaceId}
    />
  );
}
