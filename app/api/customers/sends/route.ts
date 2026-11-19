import { NextResponse } from "next/server";
import { requireCustomerAccess } from "@/lib/customers/access";

/**
 * Kişinin bülten geçmişi — kişi kartı açılınca okunur. Kapı izin listesidir
 * (RLS de aynısını tutar); izni olmayan için uç YOKTUR (404).
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ctx = await requireCustomerAccess();
  if (ctx.gate !== "ok" || !ctx.workspaceId) return new NextResponse(null, { status: 404 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id || id.length > 64) return NextResponse.json({ sends: [] });
  const { data } = await ctx.supabase
    .from("customer_sends")
    .select("id, sent_on, subject, result")
    .eq("workspace_id", ctx.workspaceId)
    .eq("customer_id", id)
    .order("sent_on", { ascending: false })
    .limit(200);
  return NextResponse.json({ sends: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
