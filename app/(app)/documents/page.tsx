import { redirect } from "next/navigation";
import { requireModuleMember } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { SetupRequiredNotice } from "@/components/modules/SetupRequiredNotice";
import { maybeDatabaseSetupRequired } from "@/lib/utils/supabase-errors";
import { DocumentsView } from "@/components/documents/DocumentsView";
import type { DocFolder, DocFile, DocItem, SheetItem } from "@/components/documents/DriveBrowser";
import { richTextPreview } from "@/lib/office/sanitize-html";
import type { OperationDocument, WorkspaceDepartment } from "@/types";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const { supabase, user, workspaceId, isAdmin, gate } = await requireModuleMember();
  if (gate === "login") redirect("/login");
  if (gate !== "ok" || !workspaceId || !user) return <AccessDenied />;

  /* AF Teamwork YALNIZ kendi bölümünü gösterir (20240327). `section` kolonu
     yoksa (migration uygulanmamış) sorgu hata verir; kolonsuz tekrar denenir
     ve her şey Teamwork sayılır — ekran çalışmaya devam eder. */
  const sectionedDocs = await supabase
    .from("operation_documents")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("section", "teamwork")
    .order("updated_at", { ascending: false });
  const documentsResult = sectionedDocs.error
    ? await supabase
        .from("operation_documents")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("updated_at", { ascending: false })
    : sectionedDocs;

  // Graceful shell while the office-center migration is not applied yet.
  const setup = maybeDatabaseSetupRequired(documentsResult.error);
  if (setup.setupRequired) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 lg:px-8">
        {/* Başlık uygulama çubuğunda; burada yalnız ekran okuyucu <h1>'i. */}
        <ModulePageHeader title="AF Teamwork" />
        <SetupRequiredNotice
          variant="block"
          title="AF Teamwork tablosu henüz oluşturulmadı"
          message={
            setup.message ??
            "AF Teamwork için veritabanı güncellemesi bekleniyor. Güncelleme uygulandığında bu ekran açılacak."
          }
          technicalDetail={isAdmin ? setup.technicalDetail : null}
        />
      </div>
    );
  }

  const [deptsResult, tasksResult, contactsResult, membersResult] = await Promise.all([
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
    supabase
      .from("workspace_members")
      .select("user_id, profiles(id, full_name, email, avatar_url)")
      .eq("workspace_id", workspaceId),
  ]);

  const documents = (documentsResult.data ?? []) as OperationDocument[];
  const departments = (deptsResult.data ?? []) as WorkspaceDepartment[];
  const tasks = (tasksResult.data ?? []) as { id: string; title: string }[];
  const contacts = (contactsResult.data ?? []) as { id: string; name: string }[];
  const memberNames: Record<string, string> = {};
  /* Klasör kartı "kim oluşturdu" rozeti taşıyor (2026-08-29) — fotoğraf varsa
     fotoğraf, yoksa kişinin kendi renginde baş harfleri. */
  const memberAvatars: Record<string, string | null> = {};
  for (const m of membersResult.data ?? []) {
    const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as
      | { id: string; full_name: string | null; email: string | null; avatar_url?: string | null }
      | null;
    if (p) {
      memberNames[m.user_id as string] = p.full_name || p.email || "—";
      memberAvatars[m.user_id as string] = p.avatar_url ?? null;
    }
  }

  // Klasör ağacı (20240312). RLS görünürlüğe göre süzer: 'admin' klasörleri
  // üyeye hiç dönmez. Tablo migrate edilmemişse boş liste → bölüm çizilmez.
  // 20240324: klasör ağacı ikiye ayrıldı — AF Teamwork (burası) ve Kütüphane
  // (/library). `section` kolonu yoksa (migration uygulanmamışsa) sorgu hata
  // verir; o durumda kolonsuz tekrar denenir ve her şey Teamwork sayılır.
  const sectioned = await supabase
    .from("document_folders")
    .select("id, parent_id, name, visibility, section, created_by, created_at")
    .eq("workspace_id", workspaceId)
    .eq("section", "teamwork")
    .order("position")
    .order("name");
  /* TABLOLAR — artık klasörün içinde yaşıyor (20240329). `section` kolonu
     yoksa (migration uygulanmamış) sorgu hata verir; klasörlerde ve
     dokümanlarda olduğu gibi burada da kolonsuz tekrar denenir — yoksa
     migration'sız kurulumda Drive'daki TÜM tablolar görünmez oluyordu. */
  const sheetsSectioned = await supabase
    .from("operation_spreadsheets")
    .select("id, title, folder_id, created_by, updated_at, visibility")
    .eq("workspace_id", workspaceId)
    .eq("section", "teamwork")
    .neq("status", "archived")
    .order("updated_at", { ascending: false });
  const sheetsRes = sheetsSectioned.error
    ? await supabase
        .from("operation_spreadsheets")
        .select("id, title, folder_id, created_by, updated_at, visibility")
        .eq("workspace_id", workspaceId)
        .neq("status", "archived")
        .order("updated_at", { ascending: false })
    : sheetsSectioned;
  const sheets: SheetItem[] = sheetsRes.error
    ? []
    : ((sheetsRes.data ?? []) as unknown as SheetItem[]);

  const foldersRes = sectioned.error
    ? await supabase
        .from("document_folders")
        .select("id, parent_id, name, visibility, created_by, created_at")
        .eq("workspace_id", workspaceId)
        .order("position")
        .order("name")
    : sectioned;
  const folders = (foldersRes.data ?? []) as unknown as DocFolder[];
  const filesAvailable = !foldersRes.error;
  // Yüklenmiş dosyalar — bağlantı kayıtlarından ayrı (document_type = 'file').
  type FileRow = DocFile & { file_path: string | null };
  /* ARŞİVLENEN kayıt Drive'da görünmez. Bağlantılarda bu süzgeç zaten vardı
     (DocumentsView); dosya ve yazıda yoktu — arşivlenmiş bir dosya klasörde
     durmaya devam ediyordu. */
  const files: FileRow[] = documents
    .filter((d) => (d as { document_type?: string }).document_type === "file")
    .filter((d) => d.status !== "archived")
    .map((d) => {
      const r = d as unknown as Record<string, unknown>;
      return {
        id: r.id as string,
        title: r.title as string,
        folder_id: (r.folder_id as string | null) ?? null,
        file_name: (r.file_name as string | null) ?? null,
        file_size: (r.file_size as number | null) ?? null,
        file_mime: (r.file_mime as string | null) ?? null,
        file_path: (r.file_path as string | null) ?? null,
        created_by: (r.created_by as string | null) ?? null,
        created_at: r.created_at as string,
        visibility: ((r.visibility as string | null) ?? "all") as "all" | "admin",
        thumbUrl: null,
      };
    });

  // YAZILAR (20240325) — Excel'in yanındaki Word. Gövde listeye taşınmaz;
  // yalnız ilk satırı önizleme olarak gider.
  const docs: DocItem[] = documents
    .filter((d) => (d as { document_type?: string }).document_type === "doc")
    .filter((d) => d.status !== "archived")
    .map((d) => {
      const r = d as unknown as Record<string, unknown>;
      return {
        id: r.id as string,
        title: (r.title as string) || "Adsız yazı",
        folder_id: (r.folder_id as string | null) ?? null,
        preview: richTextPreview(r.body as string | null, 90),
        created_by: (r.created_by as string | null) ?? null,
        updated_at: r.updated_at as string,
        visibility: ((r.visibility as string | null) ?? "all") as "all" | "admin",
      };
    });

  /* GÖRSEL ÖNİZLEMESİ. `documents` bucket'ı private; kart üzerinde görseli
     çizebilmek için imzalı adres şart. Tek turda toplu üretilir (1 saat) —
     dosya başına ayrı istek atılmaz. Görsel olmayanlar hiç sorulmaz. */
  const imagePaths = files
    .filter((f) => (f.file_mime ?? "").startsWith("image/") && f.file_path)
    .map((f) => f.file_path as string);
  if (imagePaths.length > 0) {
    const signed = await supabase.storage.from("documents").createSignedUrls(imagePaths, 3600);
    const byPath = new Map(
      (signed.data ?? []).map((r) => [r.path ?? "", r.signedUrl as string | null]),
    );
    for (const f of files) {
      if (f.file_path) f.thumbUrl = byPath.get(f.file_path) ?? null;
    }
  }

  return (
    <DocumentsView
      documents={documents}
      folders={folders}
      files={files}
      docs={docs}
      sheets={sheets}
      filesAvailable={filesAvailable}
      departments={departments}
      tasks={tasks}
      contacts={contacts}
      memberNames={memberNames}
      memberAvatars={memberAvatars}
      currentUserId={user.id}
      isAdmin={isAdmin}
    />
  );
}
