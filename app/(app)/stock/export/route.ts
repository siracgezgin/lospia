import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireModuleAdmin } from "@/lib/modules/context";
import { sortSizes, type StockLevel, type StockLocation, type StockProduct } from "@/lib/stock/model";
import { fetchAllRows, fetchSales, isSalesPeriod } from "@/lib/stock/queries";

export const dynamic = "force-dynamic";

/**
 * STOK → EXCEL.  /stock/export?l=<yer|all>&v=stok|satis[&d=<dönem>]
 *
 * Ekip Excel'e alışık; eski programda da "Export to Excel" vardı.
 *   v=stok  → yer · kod · barkod · ürün · beden · adet · fiyat (satır = beden)
 *   v=satis → tarih · yer · kod · ürün · beden · adet · birim fiyat · tutar
 * Erişim sayfayla aynı kapıdan: stok şimdilik yalnız yönetici (20240376).
 */
export async function GET(request: Request) {
  const { supabase, workspaceId, gate } = await requireModuleAdmin();
  if (gate !== "ok" || !workspaceId) return NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 });

  const url = new URL(request.url);
  const view = url.searchParams.get("v") === "satis" ? "satis" : "stok";
  const l = url.searchParams.get("l") ?? "all";

  const { data: locData } = await supabase
    .from("stock_locations").select("id, name, kind, position").eq("workspace_id", workspaceId).order("position");
  const locations = (locData ?? []) as StockLocation[];
  const location = locations.find((x) => x.id === l) ?? null;
  const locName = new Map(locations.map((x) => [x.id, x.name]));

  const book = new ExcelJS.Workbook();
  const head = (ws: ExcelJS.Worksheet) => {
    const row = ws.getRow(1);
    row.font = { bold: true };
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF2" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };

  if (view === "stok") {
    const [products, levels] = await Promise.all([
      fetchAllRows<StockProduct>((a, b) => supabase.from("stock_products")
        .select("id, code, barcode, name, price, image_url, web_url, web_product_id, active")
        .eq("workspace_id", workspaceId).eq("active", true).order("name").range(a, b)),
      fetchAllRows<StockLevel>((a, b) => supabase.from("stock_levels")
        .select("product_id, location_id, size, qty").eq("workspace_id", workspaceId).order("product_id").range(a, b)),
    ]);
    const ws = book.addWorksheet("Stok");
    ws.columns = [
      { header: "Yer", key: "yer", width: 24 }, { header: "Kod", key: "kod", width: 22 },
      { header: "Barkod", key: "barkod", width: 14 }, { header: "Ürün", key: "urun", width: 42 },
      { header: "Beden", key: "beden", width: 12 }, { header: "Adet", key: "adet", width: 8 },
      { header: "Fiyat (₺)", key: "fiyat", width: 14 },
    ];
    const byProduct = new Map(products.map((p) => [p.id, p]));
    const rows = levels
      .filter((v) => byProduct.has(v.product_id) && (!location || v.location_id === location.id))
      .map((v) => ({ v, p: byProduct.get(v.product_id)! }))
      .sort((x, y) =>
        (locName.get(x.v.location_id) ?? "").localeCompare(locName.get(y.v.location_id) ?? "", "tr")
        || x.p.name.localeCompare(y.p.name, "tr")
        || sortSizes([x.v.size, y.v.size]).indexOf(x.v.size) - sortSizes([x.v.size, y.v.size]).indexOf(y.v.size));
    for (const { v, p } of rows) {
      ws.addRow({ yer: locName.get(v.location_id) ?? "", kod: p.code, barkod: p.barcode, urun: p.name, beden: v.size, adet: v.qty, fiyat: p.price });
    }
    ws.getColumn("fiyat").numFmt = "#,##0.00";
    head(ws);
  } else {
    const dParam = url.searchParams.get("d") ?? undefined;
    const period = isSalesPeriod(dParam) ? dParam : "hepsi";
    const sales = await fetchSales(supabase, workspaceId, location?.id ?? null, period);
    const ws = book.addWorksheet("Satışlar");
    ws.columns = [
      { header: "Tarih", key: "tarih", width: 18 }, { header: "Yer", key: "yer", width: 24 },
      { header: "Kod", key: "kod", width: 22 }, { header: "Ürün", key: "urun", width: 42 },
      { header: "Beden", key: "beden", width: 12 }, { header: "Tür", key: "tur", width: 10 },
      { header: "Adet", key: "adet", width: 8 }, { header: "Birim fiyat (₺)", key: "fiyat", width: 16 },
      { header: "Tutar (₺)", key: "tutar", width: 14 },
    ];
    for (const r of sales) {
      const n = Math.abs(r.qty) * (r.kind === "iade" ? -1 : 1);
      ws.addRow({
        tarih: new Date(r.created_at), yer: locName.get(r.location_id) ?? "", kod: r.stock_products?.code ?? "",
        urun: r.stock_products?.name ?? "", beden: r.size, tur: r.kind === "iade" ? "İade" : "Satış",
        adet: n, fiyat: r.unit_price, tutar: r.unit_price != null ? n * r.unit_price : null,
      });
    }
    ws.getColumn("tarih").numFmt = "dd.mm.yyyy hh:mm";
    ws.getColumn("fiyat").numFmt = "#,##0.00";
    ws.getColumn("tutar").numFmt = "#,##0.00";
    head(ws);
  }

  const stamp = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date());
  const where = (location?.name ?? "Tum-stok").replace(/[^\p{L}\p{N}]+/gu, "-");
  const name = `${view === "stok" ? "Stok" : "Satislar"}_${where}_${stamp}.xlsx`;
  const buffer = await book.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name.replace(/[^\x20-\x7E]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
