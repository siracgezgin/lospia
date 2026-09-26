
import { redirectToSignIn } from "@/lib/auth/session-redirect";
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

/* AKTARIM UZUN SÜREBİLİR — sunucu aksiyonu bu sayfanın zaman sınırını miras
   alır. AFCOM gibi bir dosya 13 sayfa, ~38 bin hücre ve yüzlerce gömülü görsel
   taşıyor; her görsel bir yükleme artı bir kayıt demek. Varsayılan sınır
   (saniyeler) bunun ortasında kesilir ve kullanıcı sebebini göremeden "dosya
   açılamadı" görürdü. Yedekleme rotası da aynı gerekçeyle 300 kullanıyor
   (app/api/backup/route.ts). */
export const maxDuration = 300;

/* KÜÇÜK RESİM ADRESLERİ YOL BAŞINA SAKLANIR.
   İmza her üretimde yeni bir `token` taşıyor; sayfa `force-dynamic` olduğu için
   `<img src>` her sunucu çiziminde DEĞİŞİYORDU. Tarayıcı önbelleği adresi
   anahtar aldığından hiç tutmuyor, AF Teamwork'e her girişte bütün fotoğraflar
   baştan iniyordu. Adres sabit kalınca ikinci ziyaret bedava: nesne zaten
   Supabase'in varsayılanı `max-age=3600` ile geliyor.
   ÖMÜR KISA TUTULUR: imzalı adres hamiline yazılıdır, RLS'ten geçmez — yönetici
   bir klasörü kapattığı anda elden çıkmış adres ömrü dolana kadar çalışmaya
   devam eder, yani TTL doğrudan iptal gecikmesidir. 1 saat + son çeyrekte
   yeniden imzalama, adresi 45 dakika sabit tutarak aynı önbellek kazancını
   maruziyeti dörde katlamadan veriyor. */
const THUMB_SIGN_TTL = 3600; // 1 saat — iptal gecikmesinin üst sınırı
const THUMB_REUSE_FLOOR_MS = 900_000; // 15 dakikadan az kalmışsa yeniden imzala
const THUMB_CACHE_MAX = 1000;
const thumbUrlCache = new Map<string, { url: string; expiresAt: number }>();

/** Yol → imzalı adres. Yalnız ömrü dolmak üzere olanlar yeniden imzalanır. */
async function previewUrls(
  paths: string[],
  sign: (_missing: string[]) => Promise<{ path?: string | null; signedUrl: string | null }[]>,
): Promise<Map<string, string>> {
  const now = Date.now();
  const missing = new Set<string>();
  for (const p of paths) {
    const hit = thumbUrlCache.get(p);
    if (!hit || hit.expiresAt - now < THUMB_REUSE_FLOOR_MS) missing.add(p);
  }
  if (missing.size > 0) {
    for (const r of await sign([...missing])) {
      if (r.path && r.signedUrl) {
        thumbUrlCache.set(r.path, { url: r.signedUrl, expiresAt: now + THUMB_SIGN_TTL * 1000 });
      }
    }
  }

  /* ÖNCE SONUÇ, SONRA TAHLİYE.
     Tahliye eskiden imzalamanın hemen ardında koşuyordu. Bir bölümde
     THUMB_CACHE_MAX'tan çok görsel varsa AZ ÖNCE imzalanan ilk girdiler,
     daha sonuç haritası kurulmadan siliniyordu; o dosyalar `thumbUrl: null`
     dönüyor ve her render aynı şeyi tekrarladığı için ilk N görsel KALICI
     olarak simgeye düşüyordu. */
  const out = new Map<string, string>();
  for (const p of paths) {
    const hit = thumbUrlCache.get(p);
    if (hit) out.set(p, hit.url);
  }

  /* LRU DÜZELTMESİ: `Map.set` var olan bir anahtarın EKLEME SIRASINI
     tazelemiyor, yani sürekli kullanılan bir yol "en eski" sayılıp
     düşebiliyordu. Bu isteğin kullandığı yollar sona taşınır ve tahliye
     yalnız onların DIŞINDAN siler. Tek bir istek sınırdan çok yol istiyorsa
     önbellek geçici olarak şişer — bu, ekranı bozmaktan iyidir. */
  for (const [pth, hit] of [...out.keys()].map((k) => [k, thumbUrlCache.get(k)!] as const)) {
    thumbUrlCache.delete(pth);
    thumbUrlCache.set(pth, hit);
  }
  for (const key of [...thumbUrlCache.keys()]) {
    if (thumbUrlCache.size <= THUMB_CACHE_MAX) break;
    if (out.has(key)) continue;
    thumbUrlCache.delete(key);
  }
  return out;
}

export default async function DocumentsPage() {
  const { supabase, user, workspaceId, isAdmin, gate } = await requireModuleMember();
  if (gate === "login") redirectToSignIn();
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

  /* KAPALI KLASÖRÜN İÇİ DE KAPALIDIR.
     Görünürlük üç tabloda birbirinden habersiz duruyordu: klasörü "Yalnız
     yöneticiye kapat" yapmak yalnız KLASÖR satırını gizliyor, içindeki
     dosya/yazı/tablo `visibility='all'` kaldığı için okumadan geçmeye devam
     ediyordu. Üye arama kutusuna adın bir parçasını yazınca dosya listeye
     düşüyor, "Bulunduğu klasöre git" ile gizli klasörün içine girebiliyor,
     hatta paylaşılan ?f=<gizli-klasör-id> adresiyle de oraya ulaşabiliyordu.
     Asıl kapı veritabanında (20240358); burası AYNI kuralı sunucuda bir kez
     daha uygular — migration elle uygulanana kadar panel açıkta kalmasın.
     Kural RLS ile birebir: yönetici her şeyi, herkes KENDİ kaydını görür;
     gerisi ancak klasör zincirinin TAMAMI açıksa görünür. */
  const folderById = new Map(folders.map((f) => [f.id, f]));
  const folderOpenMemo = new Map<string, boolean>();
  const folderOpen = (id: string | null): boolean => {
    if (!id) return true; // kök herkese açık
    const hit = folderOpenMemo.get(id);
    if (hit !== undefined) return hit;
    folderOpenMemo.set(id, false); // klasör kendi altına taşınmışsa döngüye girmesin
    const f = folderById.get(id);
    // Listede olmayan klasör = okuma kuralının gizlediği klasör.
    const open = !!f && f.visibility !== "admin" && folderOpen(f.parent_id);
    folderOpenMemo.set(id, open);
    return open;
  };
  /* filesAvailable=false → klasör tablosu henüz yok, Drive zaten çizilmiyor;
     orada süzmek kaydı boşuna gizlemek olurdu. */
  const inOpenFolder = (r: { folder_id?: string | null; created_by?: string | null }) =>
    !filesAvailable || isAdmin || r.created_by === user.id || folderOpen(r.folder_id ?? null);
  const openFolders = folders.filter(
    (f) => !filesAvailable || isAdmin || f.created_by === user.id || folderOpen(f.id),
  );
  const openDocuments = documents.filter(inOpenFolder);
  const openSheets = sheets.filter(inOpenFolder);

  // Yüklenmiş dosyalar — bağlantı kayıtlarından ayrı (document_type = 'file').
  type FileRow = DocFile & { file_path: string | null; thumb_path: string | null };
  /* ARŞİVLENEN kayıt Drive'da görünmez. Bağlantılarda bu süzgeç zaten vardı
     (DocumentsView); dosya ve yazıda yoktu — arşivlenmiş bir dosya klasörde
     durmaya devam ediyordu. */
  const files: FileRow[] = openDocuments
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
        thumb_path: (r.thumb_path as string | null) ?? null,
        created_by: (r.created_by as string | null) ?? null,
        created_at: r.created_at as string,
        visibility: ((r.visibility as string | null) ?? "all") as "all" | "admin",
        thumbUrl: null,
      };
    });

  // YAZILAR (20240325) — Excel'in yanındaki Word. Gövde listeye taşınmaz;
  // yalnız ilk satırı önizleme olarak gider.
  const docs: DocItem[] = openDocuments
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

  /* GÖRSEL ÖNİZLEMESİ. `documents` kovası özel; kart üzerinde görseli
     çizebilmek için imzalı adres şart. Tek turda toplu üretilir — dosya başına
     ayrı istek atılmaz. Görsel olmayanlar hiç sorulmaz.
     Önizleme dosyası varsa (20240337 `thumb_path`) ORİJİNAL DEĞİL O imzalanır:
     32–96 piksellik bir kutuya 5 MB'lık ürün fotoğrafının tamamını indirmenin
     karşılığı yok. Boşsa orijinale düşer, yani eski kayıtlar bozulmaz. */
  const previewPathOf = (f: FileRow): string | null =>
    (f.file_mime ?? "").startsWith("image/") ? f.thumb_path ?? f.file_path : null;
  const byPath = await previewUrls(
    files.map(previewPathOf).filter((p): p is string => !!p),
    async (missing) => {
      const signed = await supabase.storage
        .from("documents")
        .createSignedUrls(missing, THUMB_SIGN_TTL);
      return signed.data ?? [];
    },
  );
  for (const f of files) {
    const p = previewPathOf(f);
    f.thumbUrl = p ? byPath.get(p) ?? null : null;
  }

  return (
    <DocumentsView
      documents={openDocuments}
      folders={openFolders}
      files={files}
      docs={docs}
      sheets={openSheets}
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
