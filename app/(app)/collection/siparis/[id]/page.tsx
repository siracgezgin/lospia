import { notFound } from "next/navigation";
import { redirectToSignIn } from "@/lib/auth/session-redirect";
import { requireModuleMember } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { OrderReviewEditor } from "@/components/order-review/OrderReviewEditor";
import type { OrderReview, OrderReviewItem } from "@/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Order Review" };

const ITEM_COLUMNS =
  "id, workspace_id, review_id, position, code, product_group, critique, meeting_notes, fabric, colors, " +
  "planned_qty, unit_price, currency, decision, original_photos, sample_photos, created_by, updated_by, created_at, updated_at";

export default async function OrderReviewDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ uyari?: string }>;
}) {
  const { supabase, user, workspaceId, isAdmin, gate } = await requireModuleMember();
  if (gate === "login") redirectToSignIn();
  if (gate !== "ok" || !workspaceId || !user) return <AccessDenied />;
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [reviewRes, itemsRes, seasonsRes] = await Promise.all([
    supabase
      .from("order_reviews")
      .select("*")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    supabase
      .from("order_review_items")
      .select(ITEM_COLUMNS)
      .eq("review_id", id)
      .eq("workspace_id", workspaceId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("workspace_seasons")
      .select("id, name, is_current")
      .eq("workspace_id", workspaceId)
      .order("is_current", { ascending: false })
      .order("position")
      .order("name", { ascending: false }),
  ]);
  if (!reviewRes.data) notFound();

  return (
    <OrderReviewEditor
      review={reviewRes.data as OrderReview}
      initialItems={(itemsRes.data ?? []) as unknown as OrderReviewItem[]}
      seasons={(seasonsRes.data ?? []) as { id: string; name: string; is_current: boolean }[]}
      workspaceId={workspaceId}
      userId={user.id}
      isAdmin={isAdmin}
      importWarnings={sp?.uyari ? sp.uyari.split("\n").filter(Boolean).slice(0, 10) : []}
    />
  );
}
