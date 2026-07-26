import { redirect } from "next/navigation";
import {
  LayoutGrid, FolderOpen, FileText, Table2, Palette, CalendarRange, Shirt, Calculator, Wallet,
} from "lucide-react";
import { requireModuleAdmin } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { DEPARTMENT_MODULES } from "@/lib/modules/registry";
import { DepartmentCard } from "@/components/modules/DepartmentCard";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { OfficeCenterCard } from "@/components/modules/OfficeCenterCard";

export const dynamic = "force-dynamic";

// Live record count for an Ofis Merkezi card; null when the backing table is
// not migrated yet (the card then shows "Kurulum bekleniyor" instead of 0).
async function officeCount(
  supabase: Awaited<ReturnType<typeof requireModuleAdmin>>["supabase"],
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

// Count for tables without a status column (planlama, finans). Extra eq
// filters are applied verbatim; null again means "table not migrated yet".
async function plainCount(
  supabase: Awaited<ReturnType<typeof requireModuleAdmin>>["supabase"],
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

/** Bu haftanın pazartesi günü (yyyy-MM-dd) — planlama sayacı için. */
function mondayOfThisWeek(): string {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // 0=Pazartesi
  now.setDate(now.getDate() - day);
  return now.toISOString().slice(0, 10);
}

export const metadata = { title: "Operasyon Modülleri" };

export default async function ModulesPage() {
  const { supabase, workspaceId, isAdmin, gate } = await requireModuleAdmin();
  if (gate === "login") redirect("/login");
  if (gate !== "ok" || !workspaceId) return <AccessDenied />;

  // Top-level departments → id, to join live task counts by name.
  const { data: deptRows } = await supabase
    .from("workspace_departments")
    .select("id, name")
    .eq("workspace_id", workspaceId)
    .is("parent_id", null);
  const deptIdByName = new Map<string, string>(
    (deptRows ?? []).map((d) => [d.name as string, d.id as string]),
  );

  // Active tasks (not done/archived, not deleted) — used for the light summaries.
  // Non-admins never see admin_only tasks (RLS + explicit filter as a backstop).
  const tasksQuery = supabase
    .from("tasks")
    .select("department_id, status, due_date")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .not("status", "in", "(done,archived)");
  if (!isAdmin) tasksQuery.eq("visibility", "workspace");
  const { data: taskRows } = await tasksQuery;

  const today = new Date().toISOString().slice(0, 10);
  const activeByDept = new Map<string, number>();
  const overdueByDept = new Map<string, number>();
  for (const t of taskRows ?? []) {
    const dept = (t.department_id as string | null) ?? null;
    if (!dept) continue;
    activeByDept.set(dept, (activeByDept.get(dept) ?? 0) + 1);
    if (t.due_date && (t.due_date as string) < today) {
      overdueByDept.set(dept, (overdueByDept.get(dept) ?? 0) + 1);
    }
  }

  // Ofis Merkezi live counts — each falls back to "Kurulum bekleniyor" when its
  // table has not been migrated yet, so this page never crashes on a fresh DB.
  const [documentCount, templateCount, sheetCount, creativeCount] = await Promise.all([
    officeCount(supabase, "operation_documents", workspaceId),
    officeCount(supabase, "document_templates", workspaceId),
    officeCount(supabase, "operation_spreadsheets", workspaceId),
    officeCount(supabase, "creative_assets", workspaceId),
  ]);

  // Çekirdek operasyon sayaçları — haftanın toplantıları, aktif föyler,
  // bekleyen ödemeler. null → tablo migrate edilmemiş ("Kurulum bekleniyor").
  const [weekMeetingCount, sheetCount2, pendingPaymentCount] = await Promise.all([
    plainCount(supabase, "planning_meetings", workspaceId, {}, {
      column: "meeting_date", value: mondayOfThisWeek(),
    }),
    officeCount(supabase, "production_sheets", workspaceId),
    plainCount(supabase, "finance_payments", workspaceId, { status: "bekliyor" }),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Page header */}
      <ModulePageHeader
        title="Operasyon Modülleri"
        description="Tüm çalışma alanları tek yerde — her kart çalışan bir modüle gider."
        icon={LayoutGrid}
        badge="Yönetici operasyon alanı"
        backHref="/board"
        backLabel="Panoya dön"
      />

      {/* Bölüm 0: Çekirdek Operasyon — haftalık ritim + ürün + para akışı.
          Toplantıdaki üç ana başlığın (planlama, üretim, finans) giriş kapısı. */}
      <div className="mb-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-subtle">
          Çekirdek Operasyon
        </h2>
      </div>
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OfficeCenterCard
          title="Planlama Takvimi"
          description="Haftalık toplantı ritmi — renkli bloklar, konular, kişiler ve görevler."
          href="/planning"
          icon={CalendarRange}
          count={weekMeetingCount}
          countLabel="toplantı bu hafta"
        />
        <OfficeCenterCard
          title="Koleksiyon & Üretim"
          description="Üretim föyleri, kategoriler, ölçüler ve fotoğraflar — ürünün tek doğru kaynağı."
          href="/collection"
          icon={Shirt}
          count={sheetCount2}
          countLabel="föy"
        />
        <OfficeCenterCard
          title="Maliyet Tablosu"
          description="Föy bazlı maliyet ve fiyat tablosu; Excel çıktısı tek tıkla."
          href="/collection/maliyet"
          icon={Calculator}
          count={sheetCount2}
          countLabel="kayıt"
        />
        <OfficeCenterCard
          title="Finans — Ödeme Takibi"
          description="Kime, ne kadar, ne zaman — bekleyen ve ödenen ödemeler (yalnız yönetici)."
          href="/finance"
          icon={Wallet}
          count={pendingPaymentCount}
          countLabel="bekleyen ödeme"
        />
      </div>

      {/* Bölüm 1: Departman Modülleri */}
      <div className="mb-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-subtle">
          Departman Modülleri
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {DEPARTMENT_MODULES.map((dept) => {
          const id = deptIdByName.get(dept.departmentName);
          return (
            <DepartmentCard
              key={dept.key}
              department={dept}
              activeCount={id ? activeByDept.get(id) ?? 0 : 0}
              overdueCount={id ? overdueByDept.get(id) ?? 0 : 0}
              isAdmin={isAdmin}
            />
          );
        })}
      </div>

      {/* Bölüm 2: Ofis Merkezi — Word/Excel ihtiyacının sistemdeki karşılığı.
          "Excel nerede?" → Tablolar; "Word nerede?" → Dokümanlar & Şablonlar. */}
      <div className="mb-3 mt-8">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-subtle">
          Ofis Merkezi
        </h2>
        <p className="mt-1 text-[12.5px] text-muted">
          Doküman &amp; tablolar — Word/Excel ile yürüyen operasyon işlerinin sistemdeki karşılığı.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OfficeCenterCard
          title="Dokümanlar"
          description="Operasyon metinleri, format e-postalar, arşiv notları ve Word/Drive bağlantıları."
          href="/documents"
          icon={FolderOpen}
          count={documentCount}
          countLabel="doküman"
        />
        <OfficeCenterCard
          title="Şablonlar"
          description="Hazır e-posta, müşteri ve üretici iletişim formatları — kopyala, yapıştır, gönder."
          href="/templates"
          icon={FileText}
          count={templateCount}
          countLabel="şablon"
        />
        <OfficeCenterCard
          title="Tablolar"
          description="Excel/CSV düzenleri ve operasyon tabloları — stok, koleksiyon, maliyet takibi."
          href="/sheets"
          icon={Table2}
          count={sheetCount}
          countLabel="tablo"
        />
        <OfficeCenterCard
          title="Kreatif Linkler"
          description="Canva, Drive, Figma, lookbook ve onay bağlantıları tek listede."
          href="/creative"
          icon={Palette}
          count={creativeCount}
          countLabel="bağlantı"
        />
      </div>
    </div>
  );
}
