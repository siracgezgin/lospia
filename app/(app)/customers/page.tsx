import { notFound } from "next/navigation";
import { redirectToSignIn } from "@/lib/auth/session-redirect";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { requireCustomerAccess } from "@/lib/customers/access";
import { CustomersHome } from "@/components/customers/CustomersHome";
import { CustomerList } from "@/components/customers/CustomerList";
import { CUSTOMER_SELECT, isTier, TIERS, type Customer, type CustomerTier } from "@/lib/customers/model";
import { fetchAllRows } from "@/lib/stock/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customers" };

/**
 * CUSTOMERS — müşteri CRM'i (KVKK; yalnız izin listesindeki dört kişi).
 *
 * İzni olmayan için bu sayfa YOKTUR (404) — yönetici de olsa; var olduğu bile
 * söylenmez. Giriş ekranı katmanlardır (TileGrid — tek tasarım dili): A+, A,
 * B, C, D. Katmana girince kişiler yıla göre gruplu listelenir.
 *
 * Görünüm durumu ADRESTE: `?t=<katman>` · `?q=<arama>` (katmanlar arası).
 */
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; q?: string }>;
}) {
  const { supabase, workspaceId, gate, canMarkTop } = await requireCustomerAccess();
  if (gate === "login") redirectToSignIn();
  if (gate !== "ok" || !workspaceId) notFound();
  const sp = await searchParams;
  const tier: CustomerTier | null = isTier(sp.t) ? sp.t : null;
  const query = (sp.q ?? "").trim().slice(0, 120);
  const root = { label: "CRM", href: "/crm" };

  // ── Giriş: katmanlar ──────────────────────────────────────────────────────
  if (!tier && !query) {
    const counts = await Promise.all(TIERS.map(async (t) => {
      const { count } = await supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("tier", t.key);
      return [t.key, count ?? 0] as const;
    }));
    return (
      <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
        <ModulePageHeader title="Customers" crumbs={[root, { label: "Customers" }]} />
        <CustomersHome counts={Object.fromEntries(counts)} canMarkTop={canMarkTop} />
      </div>
    );
  }

  // ── Liste ─────────────────────────────────────────────────────────────────
  const rows = await fetchAllRows<Customer>((a, b) => {
    let q = supabase.from("customers").select(CUSTOMER_SELECT).eq("workspace_id", workspaceId);
    if (tier) q = q.eq("tier", tier);
    return q.order("id").range(a, b);
  });
  const title = tier ?? "Arama";
  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      <ModulePageHeader title="Customers" crumbs={[root, { label: "Customers", href: "/customers" }, { label: title }]} />
      <CustomerList
        key={`${tier ?? ""}|${query}`}
        tier={tier}
        initialQuery={query}
        rows={rows}
        canMarkTop={canMarkTop}
        thisYear={Number(new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Istanbul", year: "numeric" }).format(new Date()))}
      />
    </div>
  );
}
