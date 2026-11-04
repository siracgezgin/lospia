// Upcycle listesi → Excel. GET /collection/upcycle/export
// Gül Hanım'ın dosyasıyla aynı düzende, fotoğraflar kendi hücrelerinde.
import { NextResponse } from "next/server";
import { requireModuleMember } from "@/lib/modules/context";
import { buildUpcycleWorkbook } from "@/lib/upcycle/xlsx-export";
import { UPCYCLE_BUCKET, UPCYCLE_COLUMNS, upcyclePrefix } from "@/lib/upcycle/model";
import type { UpcycleItem } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const { supabase, user, workspaceId, gate } = await requireModuleMember();
  if (gate !== "ok" || !workspaceId || !user) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("upcycle_items")
    .select(UPCYCLE_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: "Liste okunamadı." }, { status: 500 });
  const items = (data ?? []) as unknown as UpcycleItem[];

  /* "Güncelleme Tarihi" — en son değişen satır. */
  const last = items.reduce<string | null>((m, i) => (!m || i.updated_at > m ? i.updated_at : m), null);
  const prefix = upcyclePrefix(workspaceId);
  const buffer = await buildUpcycleWorkbook(items, {
    updatedAt: last ? new Date(last) : null,
    fetchPhoto: async (path) => {
      if (!path.startsWith(prefix)) return null;
      const { data: blob } = await supabase.storage.from(UPCYCLE_BUCKET).download(path);
      return blob ? Buffer.from(await blob.arrayBuffer()) : null;
    },
  });

  const stamp = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date());
  const base = `Upcycle Yapilacaklar Listesi ${stamp}`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
