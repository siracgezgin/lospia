import { redirect } from "next/navigation";
import { LayoutGrid } from "lucide-react";
import { requireModuleMember } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { getModuleEntry } from "@/lib/modules/registry";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { OfficeCenterCard } from "@/components/modules/OfficeCenterCard";

export const dynamic = "force-dynamic";

type SB = Awaited<ReturnType<typeof requireModuleMember>>["supabase"];

// Live record count for a hub card; null when the backing table is not
// migrated yet (the card then shows "Kurulum bekleniyor" instead of 0).
async function officeCount(
  supabase: SB,
  table: string,
  workspaceId: string,
): Promise<number | null> {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .neq("status", "archived");
  if (error) return null;
  return count ?? 0;
}

// Count for tables without a status column (planlama, finans, crm). Extra eq
// filters are applied verbatim; null again means "table not migrated yet".
async function plainCount(
  supabase: SB,
  table: string,
  workspaceId: string,
  filters: Record<string, string> = {},
  gte?: { column: string; value: string },
): Promise<number | null> {
  let q = supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);
  for (const [col, val] of Object.entries(filters)) q = q.eq(col, val);
  if (gte) q = q.gte(gte.column, gte.value);
  const { count, error } = await q;
  if (error) return null;
  return count ?? 0;
}

/** Arşivlenen / çöpteki görev sayıları (timestamp kolonu dolu olanlar). */
async function tombstoneCount(
  supabase: SB,
  workspaceId: string,
  column: "archived_at" | "deleted_at",
): Promise<number | null> {
  const { count, error } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .not(column, "is", null);
  if (error) return null;
  return count ?? 0;
}

/** Bu haftanın pazartesi günü (yyyy-MM-dd) — planlama sayacı için. */
function mondayOfThisWeek(): string {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // 0=Pazartesi
  now.setDate(now.getDate() - day);
  return now.toISOString().slice(0, 10);
}

/** Registry kaydını sayaçlı hub kartına çevirir — isim/ikon TEK kaynaktan. */
function hubCard(key: string, count: number | null, countLabel: string) {
  const m = getModuleEntry(key);
  return (
    <OfficeCenterCard
      key={m.key}
      title={m.title}
      description={m.description}
      href={m.href}
      icon={m.icon}
      count={count}
      countLabel={countLabel}
    />
  );
}

function SectionHeading({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-subtle">{title}</h2>
      {note && <p className="mt-1 text-[13px] text-muted">{note}</p>}
    </div>
  );
}

export const metadata = { title: "Operation Modules" };

export default async function ModulesPage() {
  // Herkes görür ("ekip olarak herkes her şeyi görebilmeli") — yalnız Yönetim
  // bölümü ve Finans kartı yönetici-only kalır (veri düzeyinde de kapalılar).
  const { supabase, workspaceId, isAdmin, gate } = await requireModuleMember();
  if (gate === "login") redirect("/login");
  if (gate !== "ok" || !workspaceId) return <AccessDenied />;

  // Tüm sayaçlar tek dalgada — her biri tablo migrate edilmemişse null döner
  // ("Kurulum bekleniyor"), sayfa taze veritabanında da çökmez.
  const [
    weekMeetingCount,
    productionSheetCount,
    contactCount,
    documentCount,
    templateCount,
    sheetCount,
    creativeCount,
    pendingPaymentCount,
    activityCount,
    archivedCount,
    trashedCount,
    memberCount,
  ] = await Promise.all([
    plainCount(supabase, "planning_meetings", workspaceId, {}, {
      column: "meeting_date", value: mondayOfThisWeek(),
    }),
    officeCount(supabase, "production_sheets", workspaceId),
    plainCount(supabase, "workspace_contacts", workspaceId),
    officeCount(supabase, "operation_documents", workspaceId),
    officeCount(supabase, "document_templates", workspaceId),
    officeCount(supabase, "operation_spreadsheets", workspaceId),
    officeCount(supabase, "creative_assets", workspaceId),
    isAdmin ? plainCount(supabase, "finance_payments", workspaceId, { status: "bekliyor" }) : Promise.resolve(null),
    isAdmin ? plainCount(supabase, "task_activity_logs", workspaceId) : Promise.resolve(null),
    isAdmin ? tombstoneCount(supabase, workspaceId, "archived_at") : Promise.resolve(null),
    isAdmin ? tombstoneCount(supabase, workspaceId, "deleted_at") : Promise.resolve(null),
    isAdmin ? plainCount(supabase, "workspace_members", workspaceId) : Promise.resolve(null),
  ]);

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      {/* Page header */}
      <ModulePageHeader
        title="Operation Modules"
        description="Tüm modüllerin genel bakışı — her ekran sistemde TEK isimle yaşar; buradaki kartlar sol menüyle aynı adı taşır."
        icon={LayoutGrid}
        badge={isAdmin ? "Yönetici düzenler" : "Görüntüleme"}
      />

      {/* Çekirdek Operasyon — haftalık ritim + ürün. */}
      <SectionHeading title="Çekirdek Operasyon" />
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {hubCard("planning", weekMeetingCount, "toplantı bu hafta")}
        {hubCard("collection", productionSheetCount, "föy")}
        {hubCard("maliyet", productionSheetCount, "föy")}
        {hubCard("crm", contactCount, "kişi")}
      </div>

      {/* Ofis Merkezi — Word/Excel ihtiyacının sistemdeki karşılığı. */}
      <SectionHeading
        title="Ofis Merkezi"
        note="Doküman & tablolar — Word/Excel ile yürüyen operasyon işlerinin sistemdeki karşılığı."
      />
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {hubCard("documents", documentCount, "doküman")}
        {hubCard("templates", templateCount, "şablon")}
        {hubCard("sheets", sheetCount, "tablo")}
        {hubCard("creative", creativeCount, "bağlantı")}
      </div>

      {/* Yönetim — yalnız yönetici: para akışı + denetim + düzen. */}
      {isAdmin && (
        <>
          <SectionHeading
            title="Yönetim"
            note="Yalnız yönetici — ödemeler, hareket kaydı, arşiv/çöp ve çalışma alanı ayarları."
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {hubCard("finance", pendingPaymentCount, "bekleyen ödeme")}
            {hubCard("activity", activityCount, "kayıt")}
            {hubCard("archive", archivedCount, "görev")}
            {hubCard("trash", trashedCount, "görev")}
            {hubCard("settings", memberCount, "üye")}
          </div>
        </>
      )}
    </div>
  );
}
