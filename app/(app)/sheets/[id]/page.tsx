import { notFound } from "next/navigation";
import { redirectToSignIn } from "@/lib/auth/session-redirect";
import { requireModuleMember } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { SetupRequiredNotice } from "@/components/modules/SetupRequiredNotice";
import { maybeDatabaseSetupRequired } from "@/lib/utils/supabase-errors";
import { SheetDetailView } from "@/components/sheets/SheetDetailView";
import type { OperationSpreadsheet, WorkspaceDepartment } from "@/types";

export const dynamic = "force-dynamic";

/* TEK TERMİNOLOJİ: tablo AF Teamwork'ün içinde yaşıyor ve uygulama çubuğu
   (AppHeader PAGE_TITLES) /sheets için "AF Teamwork" yazıyor — sekme adı da
   aynı olmalı, aynı ekran iki ayrı adla anılmaz. */
export const metadata = { title: "AF Teamwork" };

export default async function SheetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user, workspaceId, isAdmin, gate } = await requireModuleMember();
  if (gate === "login") redirectToSignIn();
  if (gate !== "ok" || !workspaceId || !user) return <AccessDenied />;

  const sheetResult = await supabase
    .from("operation_spreadsheets")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const setup = maybeDatabaseSetupRequired(sheetResult.error);
  if (setup.setupRequired) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 lg:px-8">
        {/* Tablolar AF Teamwork klasöründe yaşıyor; "Geri" oraya döner. */}
        <ModulePageHeader title="AF Teamwork" backHref="/documents" />
        <SetupRequiredNotice
          variant="block"
          title="Tablolar henüz oluşturulmadı"
          message={
            setup.message ??
            "Tablolar için veritabanı güncellemesi bekleniyor. Güncelleme uygulandığında bu ekran açılacak."
          }
          technicalDetail={isAdmin ? setup.technicalDetail : null}
        />
      </div>
    );
  }

  const sheet = sheetResult.data as OperationSpreadsheet | null;
  if (!sheet) notFound();

  const [deptsResult, tasksResult, contactsResult] = await Promise.all([
    supabase
      .from("workspace_departments")
      .select("id, parent_id, name, color_key")
      .eq("workspace_id", workspaceId)
      .is("parent_id", null)
      .order("position"),
    supabase
      .from("tasks")
      .select("id, title")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("workspace_contacts")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .order("name"),
  ]);

  /* GERÇEK KONUM — kırıntı yolunun klasör halkaları.
     Eskiden yalnız klasörün ADI çekiliyor ve başlığın altında küçük bir
     satırda yazıyordu; kırıntı yolu ise "AF Teamwork › Tablo" diyerek en başa
     işaret ediyordu (Sıraç, 12.09.2026: "Excel içindeki klasörlerden birinin
     içindeki dosyayı açtım ama direkt en baş gösteriyor").
     Artık ÜST KLASÖR ZİNCİRİNİN tamamı çekiliyor ve her halka kendi klasörünü
     açıyor — kullanıcı tablodan çıkıp geldiği yere tek tıkla dönebiliyor. */
  let folderTrail: { id: string; name: string }[] = [];
  if (sheet.folder_id) {
    const { data: allFolders } = await supabase
      .from("document_folders")
      .select("id, name, parent_id")
      .eq("workspace_id", workspaceId);
    const byId = new Map(
      ((allFolders ?? []) as { id: string; name: string; parent_id: string | null }[])
        .map((f) => [f.id, f]),
    );
    const guard = new Set<string>();   // bozuk veri döngü yaparsa durdurur
    let cur: string | null = sheet.folder_id as string;
    while (cur && !guard.has(cur)) {
      guard.add(cur);
      const f = byId.get(cur);
      if (!f) break;
      folderTrail.unshift({ id: f.id, name: f.name });
      cur = f.parent_id;
    }
  }

  return (
    <SheetDetailView
      sheet={sheet}
      folderTrail={folderTrail}
      departments={(deptsResult.data ?? []) as WorkspaceDepartment[]}
      tasks={(tasksResult.data ?? []) as { id: string; title: string }[]}
      contacts={(contactsResult.data ?? []) as { id: string; name: string }[]}
      currentUserId={user.id}
      isAdmin={isAdmin}
    />
  );
}
