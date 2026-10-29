// Sipariş Değerlendirme → Excel. GET /collection/siparis/[id]/export
// Ekibin şablonuyla aynı düzende, fotoğraflar kendi hücrelerinde.
import { NextResponse } from "next/server";
import { requireModuleMember } from "@/lib/modules/context";
import { buildOrderReviewWorkbook } from "@/lib/order-review/xlsx-export";
import { ORDER_REVIEW_BUCKET, photoPrefix } from "@/lib/order-review/model";
import type { OrderReview, OrderReviewItem } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user, workspaceId, gate } = await requireModuleMember();
  if (gate !== "ok" || !workspaceId || !user) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 403 });
  }
  const { id } = await params;

  const { data: reviewRow } = await supabase
    .from("order_reviews")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!reviewRow) return NextResponse.json({ error: "Değerlendirme bulunamadı." }, { status: 404 });
  const review = reviewRow as OrderReview;

  const { data: itemRows, error } = await supabase
    .from("order_review_items")
    .select("*")
    .eq("review_id", id)
    .eq("workspace_id", workspaceId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: "Satırlar okunamadı." }, { status: 500 });

  let seasonName: string | null = null;
  if (review.season_id) {
    const { data } = await supabase.from("workspace_seasons").select("name").eq("id", review.season_id).maybeSingle();
    seasonName = (data as { name: string } | null)?.name ?? null;
  }

  /* Fotoğraf yalnız KENDİ klasöründen okunur. */
  const prefix = photoPrefix(workspaceId, id);
  const buffer = await buildOrderReviewWorkbook(review, (itemRows ?? []) as unknown as OrderReviewItem[], {
    seasonName,
    fetchPhoto: async (path) => {
      if (!path.startsWith(prefix)) return null;
      const { data } = await supabase.storage.from(ORDER_REVIEW_BUCKET).download(path);
      return data ? Buffer.from(await data.arrayBuffer()) : null;
    },
  });

  const stamp = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul", dateStyle: "short", timeStyle: "short" })
    .format(new Date(review.updated_at || Date.now())).replace(":", ".");
  const base = `${(review.title || "Siparis Degerlendirme").replace(/[\\/:*?"<>|]+/g, "-").trim()} ${stamp}`;
  const asciiName = base.replace(/[^\x20-\x7E]/g, "_") + ".xlsx";
  const utf8Name = encodeURIComponent(base + ".xlsx");

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`,
      "Cache-Control": "no-store",
    },
  });
}
