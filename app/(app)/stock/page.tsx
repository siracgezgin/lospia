import { redirectToSignIn } from "@/lib/auth/session-redirect";
import { requireModuleAdmin } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { SetupRequiredNotice } from "@/components/modules/SetupRequiredNotice";
import { maybeDatabaseSetupRequired } from "@/lib/utils/supabase-errors";
import { StockHome } from "@/components/stock/StockHome";
import { StockList } from "@/components/stock/StockList";
import { StockMovements, type MovementRow } from "@/components/stock/StockMovements";
import type { StockLevel, StockLocation, StockProduct } from "@/lib/stock/model";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stock" };

/**
 * STOCK — üç yerin stoğu tek yerde (9.11.2026, Aslı Hanım: "çok önemli").
 *
 * Giriş ekranı YERLERDİR (TileGrid — tek tasarım dili): Market 212 İstanbul,
 * Market 212 Çeşme, Online ve hepsinin toplamı. Bir yere girince o yerin ürün
 * listesi; satış/giriş/transfer/sayım oradan yapılır. Eldeki adet defterdeki
 * hareketlerin toplamıdır (20240373).
 *
 * Görünüm durumu ADRESTE: `?l=<yer|all>` · `&v=hareketler`.
 */
export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ l?: string; v?: string }>;
}) {
  /* Şimdilik yalnız yönetici — Aslı Hanım onaylayınca ekibe açılacak
     (bkz. registry'deki not ve 20240376). */
  const { supabase, user, workspaceId, isAdmin, role, gate } = await requireModuleAdmin();
  if (gate === "login") redirectToSignIn();
  if (gate !== "ok" || !workspaceId || !user) return <AccessDenied />;
  const sp = await searchParams;

  const locRes = await supabase
    .from("stock_locations")
    .select("id, name, kind, position")
    .eq("workspace_id", workspaceId)
    .order("position", { ascending: true });

  const setup = maybeDatabaseSetupRequired(locRes.error);
  if (setup.setupRequired) {
    return (
      <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
        <ModulePageHeader title="Stock" />
        <SetupRequiredNotice
          variant="block"
          title="Stok için veritabanı güncellemesi bekleniyor"
          message={setup.message ?? "Stock için veritabanı güncellemesi bekleniyor (20240373)."}
          technicalDetail={isAdmin ? setup.technicalDetail : null}
        />
      </div>
    );
  }
  const locations = (locRes.data ?? []) as StockLocation[];

  /* PostgREST tek istekte en çok 1000 satır döndürür; ürün × beden × yer bunu
     aşar. Sayfa sayfa okunur — yoksa binden sonrası sessizce kaybolurdu. */
  async function fetchAll<T>(table: string, cols: string, order: string): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; from < 50_000; from += 1000) {
      const { data, error } = await supabase
        .from(table).select(cols).eq("workspace_id", workspaceId).order(order).range(from, from + 999);
      if (error || !data?.length) break;
      out.push(...(data as T[]));
      if (data.length < 1000) break;
    }
    return out;
  }

  const levels = await fetchAll<StockLevel>("stock_levels", "product_id, location_id, size, qty", "product_id");

  // ── Giriş: yerler ─────────────────────────────────────────────────────────
  const scope = sp.l === "all" ? "all" : locations.find((l) => l.id === sp.l)?.id ?? null;
  if (!scope) {
    return (
      <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
        <ModulePageHeader title="Stock" />
        <StockHome locations={locations} levels={levels} />
      </div>
    );
  }

  const locationId = scope === "all" ? null : scope;
  const scopeName = locationId ? locations.find((l) => l.id === locationId)!.name : "Tüm stok";
  const canEdit = role !== "viewer";
  const crumbs = [{ label: "Stock", href: "/stock" }, { label: scopeName }];

  // ── Hareketler ────────────────────────────────────────────────────────────
  if (sp.v === "hareketler") {
    let q = supabase
      .from("stock_movements")
      .select("id, product_id, location_id, size, kind, qty, unit_price, note, transfer_id, created_by, created_at, stock_products(name, code)")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(300);
    if (locationId) q = q.eq("location_id", locationId);
    const movRes = await q;
    const rows = (movRes.data ?? []) as unknown as MovementRow[];

    const authorIds = [...new Set(rows.map((r) => r.created_by).filter(Boolean))] as string[];
    const names: Record<string, string> = {};
    if (authorIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", authorIds);
      for (const p of (profs ?? []) as { id: string; full_name: string | null; email: string | null }[]) {
        names[p.id] = p.full_name || p.email || "";
      }
    }
    return (
      <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
        <ModulePageHeader title="Stock" crumbs={crumbs} />
        <StockMovements scope={scope} scopeName={scopeName} rows={rows} locations={locations} names={names} isAdmin={isAdmin} />
      </div>
    );
  }

  // ── Ürün listesi ──────────────────────────────────────────────────────────
  const products = await fetchAll<StockProduct>(
    "stock_products", "id, code, barcode, name, price, image_url, web_url, web_product_id, active", "name",
  );
  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      <ModulePageHeader title="Stock" crumbs={crumbs} />
      <StockList
        scope={scope}
        scopeName={scopeName}
        locationId={locationId}
        locations={locations}
        products={products.filter((p) => p.active)}
        levels={levels}
        canEdit={canEdit}
        workspaceId={workspaceId}
      />
    </div>
  );
}
