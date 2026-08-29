"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FolderPlus, Upload, Trash2, Loader2, Download, ChevronRight, Home,
  Lock, Users, Pencil, Plus, FileText, Table2, Link2 as LinkIcon,
  List as ListIcon, LayoutGrid, Check, X, MoreHorizontal, FolderOpen,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useConfirm } from "@/components/ui/useConfirm";
import { Button, IconButton } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import { personTone } from "@/lib/design/person-colors";
import { Tile, TileGrid } from "@/components/ui/TileGrid";
import { SortHeader } from "@/components/ui/SortHeader";
import {
  KIND_FOLDER, KIND_DOC, KIND_SHEET, fileKindOf, linkKindOf, humanSize,
  type FileKind,
} from "@/lib/office/file-kind";
import {
  saveFolder, deleteFolder, uploadDocumentFile,
  getDocumentDownloadUrl, deleteDocumentFile,
} from "@/lib/actions/document-files";
import { createTeamworkDoc, deleteOperationDocument, setOperationDocumentVisibility } from "@/lib/actions/documents";
import { createSheetInFolder, deleteOperationSpreadsheet, setOperationSpreadsheetVisibility } from "@/lib/actions/sheets";

export type DocFolder = {
  id: string;
  parent_id: string | null;
  name: string;
  visibility: "all" | "admin";
  section?: "teamwork" | "library";
  created_by?: string | null;
  created_at?: string | null;
};

export type DocItem = {
  id: string;
  title: string;
  folder_id: string | null;
  preview: string;
  created_by: string | null;
  updated_at: string;
  /** "all" = tüm üyeler görür · "admin" = yalnız yönetici (20240334). */
  visibility?: "all" | "admin";
};

export type SheetItem = {
  id: string;
  title: string;
  folder_id: string | null;
  created_by: string | null;
  updated_at: string;
  visibility?: "all" | "admin";
};

export type LinkItem = {
  id: string;
  title: string;
  folder_id: string | null;
  url: string | null;
  document_type: string;
  updated_at: string;
};

export type DocFile = {
  id: string;
  title: string;
  folder_id: string | null;
  file_name: string | null;
  file_size: number | null;
  file_mime: string | null;
  created_by: string | null;
  created_at: string;
  visibility?: "all" | "admin";
  /** Görsel dosyalar için imzalı önizleme adresi (sunucuda üretilir). */
  thumbUrl?: string | null;
};

/** Izgara ve listenin ORTAK biçimi — her tür buna indirgenir. */
type DriveItem = {
  key: string;
  /** Aksiyon meşguliyetini eşlemek için kaydın kendi kimliği. */
  id: string;
  kind: FileKind;
  name: string;
  /** Kartın/satırın ikinci satırı için ek not (klasörde "3 öğe · yalnız yönetici"). */
  note?: string;
  ownerId: string | null;
  date: string | null;
  size?: number | null;
  thumbUrl?: string | null;
  href?: string;
  external?: boolean;
  onOpen?: () => void;
  isFolder?: boolean;
  /** Yalnız yöneticiye açık — kartta kilit simgesiyle gösterilir. */
  restricted?: boolean;
  folder?: DocFolder;
  docId?: string;
  sheetId?: string;
  linkId?: string;
  fileId?: string;
};

/** ⋯ menüsünün bir satırı. */
type MenuAction = {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  danger?: boolean;
};

interface Props {
  folders: DocFolder[];
  files: DocFile[];
  docs?: DocItem[];
  sheets?: SheetItem[];
  /** Dış bağlantılar (Drive, Canva, Figma…) — artık ayrı bölüm değil, klasörün
   *  içinde bir öğe (2026-08-29). */
  links?: LinkItem[];
  memberNames: Record<string, string>;
  /** profiles.id → fotoğraf; klasör kartındaki "kim oluşturdu" rozeti için. */
  memberAvatars?: Record<string, string | null>;
  /** Oturumdaki kişi — KENDİ eklediğini yönetebilsin diye (20240334). */
  currentUserId?: string | null;
  isAdmin: boolean;
  rootLabel?: string;
  /** Araç çubuğunun başına konur (ör. "← Geri"). Ayrı bir satır açmamak için:
   *  kökteyken kırıntı yolu boş kalıyor ve tek başına bir ev simgesi satırı
   *  duruyordu (2026-08-29: "şu gereksiz ikon boşluk ne öyle"). */
  leading?: React.ReactNode;
  /** Bağlantı formunu açar; formu sayfa sahibi (DocumentsView) yönetir. */
  onNewLink?: (_folderId: string | null) => void;
  onEditLink?: (_id: string) => void;
}

/**
 * AF Teamwork — DRIVE.
 *
 * Sıraç (2026-08-29): "Mantık Drive'daki gibi olsun. Klasör oluşturalım,
 * klasörün içinde Excel de Word de oluşturulabilsin. Resim, MD, TXT gibi vs
 * eklenebilir; ona göre tasarlansın her şey."
 *
 * Önceki hâlin sorunu bir kompozisyon sorunuydu: aynı ızgarada bir kart klasör
 * AÇIYOR, biri başka bir MODÜLE gidiyor ("Sheets"), biri yazı editörü açıyordu
 * — hepsi de aynı nötr kartla çizilmişti. Ortak bir zihin modeli yoktu.
 *
 * Şimdi ızgarada YALNIZ İÇERİK var (klasör · yazı · tablo · dosya) ve her tür
 * kendi ikonu ve rengiyle çizilir (lib/office/file-kind.ts). Üretim düğmeleri
 * araç çubuğunda AÇIK durur (Klasör · Word · Excel · Bağlantı · Yükle) ve her
 * biri, üreteceği şeyin listedeki ikonuyla aynı rengi taşır. Nereye tıklarsan
 * ne olacağı ikondan bellidir.
 *
 * İKİNCİL EYLEMLER TEK ⋯ MENÜSÜNDE. Bir süre kartın üstünde fare gelince
 * beliren üç küçük ikon vardı: telefonda hover yok, dolayısıyla klasör
 * silinemiyor, dosya indirilemiyordu; masaüstünde de "Yalnız yöneticiye
 * kapat" gibi bir eylemi tek başına bir kilit simgesinden çözmek gerekiyordu.
 * Menü her cihazda görünür, her satırı adıyla yazar.
 *
 * Sıra Drive'ın sırası: önce klasörler, sonra dosyalar — ada göre.
 */
export function DriveBrowser({
  folders, files, docs = [], sheets = [], links = [], memberNames, memberAvatars = {}, currentUserId = null, isAdmin,
  rootLabel = "AF Teamwork", leading, onNewLink, onEditLink,
}: Props) {
  const { ask, dialog } = useConfirm();
  /* TEK BÖLÜM. Bir süre "AF Teamwork" ve "Kütüphane" diye iki bölüm vardı;
     Sıraç (2026-08-29): "Bu ayrıma neden gerek duyduk, biz zaten her şeyi
     burada verelim dedik." Kütüphane bir BÖLÜM değil, bir KLASÖR olmalı —
     Drive'da da öyle. `section` alanı veritabanında duruyor, hep 'teamwork'. */
  const section = "teamwork" as const;
  const router = useRouter();
  const [cwd, setCwd] = useState<string | null>(null);   // null = kök
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /** Yeni klasörün adı yazılıyor — kart, klasörlerin başında yerinde açılır. */
  const [naming, setNaming] = useState(false);
  /** Kartın içinde adı düzenlenen klasörün id'si. */
  const [renaming, setRenaming] = useState<string | null>(null);
  /* Görünüm — Drive'ın iki modu (2026-08-29):
       KART (VARSAYILAN): klasörler KART, dosyalar LİSTE. Klasör bir kap,
         gözle taranır; dosya bir kayıt, sütunlarıyla okunur.
       LİSTE: her şey TEK tabloda — klasörler de dosyalarla aynı listede,
         üstte. Drive'ın liste modu da böyle.
     Bir ara klasörler her iki modda da kart kalıyordu; liste görünümü yarım
     kalıyordu. */
  const [view, setView] = useState<"grid" | "list">("grid");
  const fileRef = useRef<HTMLInputElement>(null);
  const [, startWork] = useTransition();

  const childFolders = useMemo(
    () => folders.filter((f) => f.parent_id === cwd).sort((a, b) => a.name.localeCompare(b.name, "tr")),
    [folders, cwd],
  );
  const childDocs = useMemo(() => docs.filter((d) => d.folder_id === cwd), [docs, cwd]);
  const childSheets = useMemo(() => sheets.filter((s) => s.folder_id === cwd), [sheets, cwd]);
  const childLinks = useMemo(() => links.filter((l) => l.folder_id === cwd), [links, cwd]);
  const childFiles = useMemo(
    () => [...files.filter((f) => f.folder_id === cwd)]
      .sort((a, b) => (a.file_name ?? a.title).localeCompare(b.file_name ?? b.title, "tr")),
    [files, cwd],
  );
  const isEmpty =
    childFolders.length + childDocs.length + childSheets.length +
    childLinks.length + childFiles.length === 0;

  /**
   * TEK ÖĞE LİSTESİ. Klasör, yazı, tablo, bağlantı ve dosya aynı biçime
   * indirgenir; liste de ızgara da bunu çizer. Eskiden beş neredeyse aynı JSX
   * bloğu vardı ve her görünüm için ikinci kez yazılması gerekirdi.
   * Sıra Drive'ın sırası: önce klasörler, sonra içerik — ada göre.
   */
  const items = useMemo<{ folders: DriveItem[]; files: DriveItem[] }>(() => {
    const folderItems: DriveItem[] = childFolders.map((f) => {
      const n =
        files.filter((x) => x.folder_id === f.id).length +
        docs.filter((x) => x.folder_id === f.id).length +
        sheets.filter((x) => x.folder_id === f.id).length +
        links.filter((x) => x.folder_id === f.id).length +
        folders.filter((x) => x.parent_id === f.id).length;
      return {
        key: `f-${f.id}`,
        id: f.id,
        kind: KIND_FOLDER,
        name: f.name,
        /* "Klasör" yazmıyoruz — simge zaten söylüyor. Yerine KİM ve NE ZAMAN
           oluşturdu (2026-08-29). Öğe sayısı listede "Tarih" sütununa düşen
           yedek bilgi olarak duruyor. */
        note: n > 0 ? `${n} öğe` : "boş",
        ownerId: f.created_by ?? null,
        date: f.created_at ?? null,
        isFolder: true,
        restricted: f.visibility === "admin",
        onOpen: () => setCwd(f.id),
        folder: f,
      };
    });

    const docItems: DriveItem[] = childDocs.map((d) => ({
      key: `d-${d.id}`, id: d.id, kind: KIND_DOC, name: d.title, ownerId: d.created_by,
      date: d.updated_at, href: `/documents/${d.id}`, docId: d.id,
      restricted: d.visibility === "admin",
    }));

    const sheetItems: DriveItem[] = childSheets.map((x) => ({
      key: `s-${x.id}`, id: x.id, kind: KIND_SHEET, name: x.title, ownerId: x.created_by,
      date: x.updated_at, href: `/sheets/${x.id}`, sheetId: x.id,
      restricted: x.visibility === "admin",
    }));

    const linkItems: DriveItem[] = childLinks.map((l) => ({
      key: `l-${l.id}`, id: l.id, kind: linkKindOf(l.document_type), name: l.title,
      ownerId: null, date: l.updated_at,
      href: l.url ?? undefined, external: !!l.url, linkId: l.id,
    }));

    const fileItems: DriveItem[] = childFiles.map((d) => ({
      key: `x-${d.id}`,
      id: d.id,
      kind: fileKindOf(d.file_mime, d.file_name ?? d.title),
      name: d.file_name ?? d.title,
      ownerId: d.created_by,
      date: d.created_at,
      size: d.file_size,
      thumbUrl: d.thumbUrl ?? null,
      fileId: d.id,
      restricted: d.visibility === "admin",
      onOpen: () => download(d.id),
    }));

    /* SIRA — Drive'ın sırası (2026-08-29: "üstte klasörler olsun, altta
       dosyalar, o da son eklenme tarihine göre").
         • Klasör: ADA göre. Yeri sabit kalsın, aranan klasör ezberlenen
           noktada bulunsun.
         • Dosya: TARİHE göre, en yeni önce. Üzerinde çalışılan şey en üstte. */
    const byName = (a: DriveItem, b: DriveItem) => a.name.localeCompare(b.name, "tr");
    const byNewest = (a: DriveItem, b: DriveItem) => (b.date ?? "").localeCompare(a.date ?? "");
    return {
      folders: folderItems.sort(byName),
      files: [...docItems, ...sheetItems, ...linkItems, ...fileItems].sort(byNewest),
    };
    // download/setCwd sabit; bağımlılık listesi veriden ibaret.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childFolders, childDocs, childSheets, childLinks, childFiles, files, docs, sheets, links, folders]);

  /** Kökten buraya kadar olan yol — üstteki kırıntı çubuğu. */
  const trail = useMemo(() => {
    const out: DocFolder[] = [];
    let id = cwd;
    const byId = new Map(folders.map((f) => [f.id, f]));
    while (id) {
      const f = byId.get(id);
      if (!f) break;
      out.unshift(f);
      id = f.parent_id;
    }
    return out;
  }, [cwd, folders]);

  function run(key: string, fn: () => Promise<{ error?: string } | unknown>, after?: () => void) {
    setError(null);
    setBusy(key);
    startWork(async () => {
      // try/catch şart: sunucu aksiyonu THROW ederse (kolon yok, ağ koptu…)
      // hata sessizce yutuluyor, kullanıcı hiçbir şey görmüyordu.
      try {
        const res = (await fn()) as { error?: string };
        if (res && "error" in res && res.error) { setError(res.error); return; }
        after?.();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Beklenmeyen bir hata oluştu.");
      } finally {
        setBusy(null);
      }
    });
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    if (cwd) fd.append("folder_id", cwd);
    fd.append("section", section);
    run("upload", () => uploadDocumentFile(fd));
  }

  /* Ayrı fonksiyon: ok işlevi doğrudan `newAction(...)` çağrısının içinde
     yazılınca lint bunu "render sırasında ref okuma" sanıyordu. */
  function openFilePicker() {
    fileRef.current?.click();
  }

  function download(id: string) {
    run(`dl-${id}`, async () => {
      const res = await getDocumentDownloadUrl(id);
      if ("error" in res) return res;
      // İmzalı URL 60 saniye geçerli — paylaşılan bağlantı kalıcı erişim vermez.
      window.open(res.url, "_blank", "noopener");
      return {};
    });
  }

  /** Bu öğe üzerinde bir iş sürüyor mu? Meşguliyet anahtarları `önek-id`. */
  const isItemBusy = (it: DriveItem) => busy !== null && busy.endsWith(`-${it.id}`);

  /** SAHİPLİK — yönetici her şeyi, üye KENDİ EKLEDİĞİNİ yönetir.
   *  Sıraç (2026-08-30): "Üye kendi eklediği yazıyı, klasörü vs silebilme
   *  yetkisi olsun." Aynı kural RLS'te de yazılı (20240334); buradaki kontrol
   *  yalnız yapamayacağı bir seçeneği hiç göstermemek için. */
  const canManage = (it: DriveItem) =>
    isAdmin || (!!currentUserId && !!it.ownerId && it.ownerId === currentUserId);

  /** Görünürlük satırı — klasör, yazı, tablo ve dosyada AYNI cümle.
   *  Sıraç (2026-08-30): "klasördeki gibi diğerlerinde de tüm üyelere göster
   *  kısmı da olsun." */
  const visibilityAction = (
    it: DriveItem,
    apply: (next: "all" | "admin") => Promise<{ error?: string } | unknown>,
    key: string,
  ): MenuAction => ({
    label: it.restricted ? "Tüm üyelere göster" : "Yalnız yöneticiye kapat",
    icon: it.restricted ? Users : Lock,
    onSelect: () => run(key, () => apply(it.restricted ? "all" : "admin")),
  });

  /** Öğeye göre ⋯ menüsünün satırları — liste ve ızgara AYNI menüyü kullanır.
   *  Boş dizi = menü çizilmez (kişinin dokunamadığı öğe). */
  function itemActions(it: DriveItem): MenuAction[] {
    if (it.isFolder && it.folder) {
      const f = it.folder;
      if (!canManage(it)) return [];
      return [
        { label: "Yeniden adlandır", icon: Pencil, onSelect: () => setRenaming(f.id) },
        {
          label: f.visibility === "admin" ? "Tüm üyelere göster" : "Yalnız yöneticiye kapat",
          icon: f.visibility === "admin" ? Users : Lock,
          onSelect: () =>
            run(`f-${f.id}`, () =>
              saveFolder(f.id, {
                name: f.name,
                parent_id: f.parent_id,
                visibility: f.visibility === "admin" ? "all" : "admin",
                section: f.section ?? section,
              }),
            ),
        },
        /* ONAY ŞART. Klasör tek tıkla siliniyordu — geri alınamaz bir işlem
           için hiçbir soru sorulmuyordu (2026-08-29: "klasör sil yapınca
           direkt siliniyor, hiçbir popup çıkmıyor"). */
        {
          label: "Sil",
          icon: Trash2,
          danger: true,
          onSelect: async () => {
            if (!(await ask({
              title: "Klasör silinsin mi?",
              message: `"${f.name}" kalıcı olarak silinir.\n\nYalnız BOŞ klasör silinebilir; içinde bir şey varsa işlem reddedilir.`,
            }))) return;
            run(`d-${f.id}`, () => deleteFolder(f.id));
          },
        },
      ];
    }

    if (it.fileId) {
      const id = it.fileId;
      if (!canManage(it)) return [{ label: "İndir", icon: Download, onSelect: () => download(id) }];
      return [
        { label: "İndir", icon: Download, onSelect: () => download(id) },
        visibilityAction(it, (next) => setOperationDocumentVisibility(id, next), `v-${id}`),
        /* Dosya silme de sorar — diğer türlerde onay vardı, yalnız yüklenen
           dosyada eksikti. */
        {
          label: "Sil",
          icon: Trash2,
          danger: true,
          onSelect: async () => {
            if (!(await ask({ message: `"${it.name}" dosyası kalıcı olarak silinsin mi?` }))) return;
            run(`x-${id}`, () => deleteDocumentFile(id));
          },
        },
      ];
    }

    if (it.linkId) {
      const id = it.linkId;
      const out: MenuAction[] = [];
      if (onEditLink && canManage(it)) out.push({ label: "Düzenle", icon: Pencil, onSelect: () => onEditLink(id) });
      if (canManage(it)) {
        out.push(visibilityAction(it, (next) => setOperationDocumentVisibility(id, next), `v-${id}`));
        out.push({
          label: "Sil",
          icon: Trash2,
          danger: true,
          onSelect: async () => {
            if (!(await ask({ message: `"${it.name}" bağlantısı silinsin mi?` }))) return;
            run(`lk-${id}`, () => deleteOperationDocument(id));
          },
        });
      }
      return out;
    }

    if (!canManage(it)) return [];
    if (it.docId) {
      const id = it.docId;
      return [
      visibilityAction(it, (next) => setOperationDocumentVisibility(id, next), `v-${id}`),
      {
        label: "Sil",
        icon: Trash2,
        danger: true,
        onSelect: async () => {
          if (!(await ask({ message: `"${it.name}" yazısı kalıcı olarak silinsin mi?` }))) return;
          run(`doc-${id}`, () => deleteOperationDocument(id));
        },
      }];
    }
    if (it.sheetId) {
      const id = it.sheetId;
      return [
      visibilityAction(it, (next) => setOperationSpreadsheetVisibility(id, next), `v-${id}`),
      {
        label: "Sil",
        icon: Trash2,
        danger: true,
        onSelect: async () => {
          if (!(await ask({ message: `"${it.name}" tablosu kalıcı olarak silinsin mi?` }))) return;
          run(`sh-${id}`, () => deleteOperationSpreadsheet(id));
        },
      }];
    }
    return [];
  }

  /** Satırın/kartın ⋯ menüsü; eylem yoksa hiç çizilmez. */
  function renderMenu(it: DriveItem) {
    const actions = itemActions(it);
    if (actions.length === 0) return null;
    return <ItemMenu label={`${it.name} — seçenekler`} actions={actions} busy={isItemBusy(it)} />;
  }

  /* YENİ KLASÖR — kartın yerinde. Sayfanın tepesinde tam genişlikte bir kutu
     açılıyordu; yeniden adlandırma nasıl klasörün kendi kartında yapılıyorsa
     (2026-08-29: "neden klasörde yapamıyoruz bunu"), yeni klasör de
     klasörlerin başında, kendi boyunda bir kart olarak açılır. */
  const namingTile = naming ? (
    <FolderNameTile
      key="new-folder"
      initialName=""
      placeholder="Klasör adı"
      busy={busy === "folder"}
      onSave={(name) =>
        run(
          "folder",
          /* Varsayılan "all": klasör açan kişi aksini söylemedikçe ekip görür.
             "admin" varsayılanı, üyenin açtığı klasörü ekipten gizliyordu. */
          () => saveFolder(null, { name, parent_id: cwd, visibility: "all", section }),
          () => setNaming(false),
        )
      }
      onCancel={() => setNaming(false)}
    />
  ) : null;

  const listItems = view === "list" ? [...items.folders, ...items.files] : items.files;

  return (
    <section className="space-y-3">
      {/* Kırıntı yolu + üretim düğmeleri */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* TEK SATIR: Geri · kırıntı yolu · görünüm · üretim.
            Üç ayrı satır vardı ("← Geri", ev simgesi, araç çubuğu) ve ikisi
            neredeyse boştu. Kökteyken kırıntı yolu hiç çizilmez — nerede
            olduğunu uygulama çubuğu zaten söylüyor. */}
        <nav aria-label="Klasör yolu" className="flex min-w-0 flex-wrap items-center gap-1 text-[13.5px]">
          {leading}
          {trail.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setCwd(null)}
                title={rootLabel}
                aria-label={rootLabel}
                className="tap-target ml-1 inline-flex h-8 items-center rounded-control px-1.5 text-muted transition-colors duration-150 hover:text-ink"
              >
                <Home size={14} />
              </button>
              {trail.map((f, i) => (
                <span key={f.id} className="inline-flex items-center gap-1">
                  <ChevronRight size={12} className="text-subtle" aria-hidden />
                  <button
                    type="button"
                    onClick={() => setCwd(f.id)}
                    aria-current={i === trail.length - 1 ? "location" : undefined}
                    className={cn(
                      "inline-flex h-8 max-w-[14rem] items-center truncate rounded-control px-1.5 transition-colors duration-150",
                      i === trail.length - 1 ? "font-semibold text-ink" : "text-muted hover:text-ink",
                    )}
                  >
                    {f.name}
                  </button>
                </span>
              ))}
            </>
          )}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {/* Görünüm — Drive'daki gibi kart / liste.
              SIRA: önce KART (varsayılan), sonra LİSTE — açılıştaki mod solda
              durur (2026-08-29: "iki ikonun da yerini değiştir"). */}
          <div role="group" aria-label="Görünüm" className="inline-flex h-9 items-center rounded-control border border-line bg-surface p-0.5">
            <button
              type="button"
              onClick={() => setView("grid")}
              title="Kart görünümü"
              aria-label="Kart görünümü"
              aria-pressed={view === "grid"}
              className={cn(
                "inline-flex h-full items-center rounded-[6px] px-2.5 transition-colors duration-150",
                view === "grid" ? "bg-surface-sunken text-ink" : "text-subtle hover:text-ink",
              )}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              title="Liste görünümü"
              aria-label="Liste görünümü"
              aria-pressed={view === "list"}
              className={cn(
                "inline-flex h-full items-center rounded-[6px] px-2.5 transition-colors duration-150",
                view === "list" ? "bg-surface-sunken text-ink" : "text-subtle hover:text-ink",
              )}
            >
              <ListIcon size={15} />
            </button>
          </div>

          {/* ÜRETİM DÜĞMELERİ — beşi de AÇIK, menü arkasında değil.
              Sıraç (2026-08-29): "Bunları ayrı ayrı verelim sağ üstte, açık
              olsun ve anlaşılır olsun. Klasör sarımsı, Excel yeşil, Word mavi
              şeklinde olabilir."

              Renkler uydurulmadı: listedeki dosya ikonlarının rengiyle AYNI
              kaynaktan (lib/office/file-kind.ts) geliyor. Yani "yeşil düğmeyle
              oluşturduğum şey listede yeşil ikonla duruyor" — düğme ile sonuç
              arasında görsel bir söz var.

              Dar ekranda yazılar gizlenir, ikon kalır: beş düğme 180px'e sığar
              ve araç çubuğu satır atlamaz. */}
          <div className="flex shrink-0 items-center gap-1.5">
            {/* KLASÖR herkese açık: üye de kendi çalışma alanını kurabilmeli
                (Sıraç, 2026-08-30). Açtığı klasörü yalnız kendisi yönetir;
                yönetici hepsini yönetir (bkz. canManage + RLS 20240334). */}
            <CreateButton
              icon={FolderPlus}
              label="Klasör"
              title="Yeni klasör"
              hex={KIND_FOLDER.hex}
              onPick={() => { setRenaming(null); setNaming(true); }}
            />
            <CreateButton
              icon={FileText}
              label="Word"
              title="Yeni yazı (Word)"
              hex={KIND_DOC.hex}
              busy={busy === "newdoc"}
              onPick={() =>
                run("newdoc", async () => {
                  const res = await createTeamworkDoc({ title: "Adsız yazı", folder_id: cwd, section });
                  if ("error" in res) return res;
                  router.push(`/documents/${res.id}`);
                  return {};
                })
              }
            />
            <CreateButton
              icon={Table2}
              label="Excel"
              title="Yeni tablo (Excel)"
              hex={KIND_SHEET.hex}
              busy={busy === "newsheet"}
              onPick={() =>
                run("newsheet", async () => {
                  const res = await createSheetInFolder({ title: "Adsız tablo", folder_id: cwd, section });
                  if ("error" in res) return res;
                  router.push(`/sheets/${res.id}`);
                  return {};
                })
              }
            />
            {onNewLink && (
              <CreateButton
                icon={LinkIcon}
                label="Bağlantı"
                title="Bağlantı ekle (Drive, Canva…)"
                hex="#5b6e8a"
                onPick={() => onNewLink(cwd)}
              />
            )}
            <CreateButton
              icon={Upload}
              label="Yükle"
              title="Dosya yükle"
              hex="#7c3aed"
              busy={busy === "upload"}
              onPick={openFilePicker}
            />
            <input ref={fileRef} type="file" className="hidden" onChange={onPick} />
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="anim-fade-down rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">
          {error}
        </p>
      )}

      {isEmpty && !naming ? (
        <EmptyState
          icon={FolderOpen}
          title={cwd ? "Bu klasör boş." : "Henüz dosya yok."}
          description="Üstteki düğmelerle klasör, yazı ya da tablo oluşturun; bağlantı ekleyin ya da dosya yükleyin."
          action={
            <Button size="sm" variant="secondary" onClick={openFilePicker} loading={busy === "upload"}>
              <Upload size={14} aria-hidden /> Dosya yükle
            </Button>
          }
        />
      ) : view === "list" ? (
        /* LİSTE — tek tablo, klasörler üstte. Yeni klasör kartı listenin
           üstünde açılır; liste satırı bir ad kutusu taşıyamaz. */
        <div className="space-y-3">
          {namingTile && <TileGrid row>{namingTile}</TileGrid>}
          {listItems.length > 0 && (
            <DriveList items={listItems} memberNames={memberNames} menu={renderMenu} />
          )}
        </div>
      ) : (
        /* KART — klasörler kutu, dosyalar tablo. */
        <div className="space-y-5">
          {(items.folders.length > 0 || naming) && (
            <Section title="Klasörler">
              <DriveGrid
                items={items.folders}
                leading={namingTile}
                menu={renderMenu}
                memberNames={memberNames}
                memberAvatars={memberAvatars}
                renamingId={renaming}
                busy={busy}
                onCancelRename={() => setRenaming(null)}
                onRename={(f, name) =>
                  run(
                    `rn-${f.id}`,
                    () =>
                      saveFolder(f.id, {
                        name,
                        parent_id: f.parent_id,
                        visibility: f.visibility,
                        section: f.section ?? section,
                      }),
                    () => setRenaming(null),
                  )
                }
              />
            </Section>
          )}
          {items.files.length > 0 && (
            <Section title="Dosyalar">
              <DriveList items={items.files} memberNames={memberNames} menu={renderMenu} />
            </Section>
          )}
        </div>
      )}
      {dialog}
    </section>
  );
}

/* ⋯ menüsünün ölçüleri — yerleşim ilk karede doğru çıksın diye tahmini boy. */
const MENU_W = 208;
const MENU_EST_H = 120;

/**
 * ⋯ MENÜSÜ — bir öğenin ikincil eylemleri.
 *
 * Portal ile <body>'ye çizilir: liste kabı köşeleri için `overflow-hidden`
 * taşıyor ve son satırın menüsü kutunun içinde kesiliyordu. Sabit konum
 * kaydırmayı takip edemez; kaydırma/yeniden boyutlanmada kapanır (Pano'daki
 * görev menüsüyle aynı yaklaşım).
 */
function ItemMenu({ label, actions, busy }: { label: string; actions: MenuAction[]; busy?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const height = menuRef.current?.offsetHeight ?? MENU_EST_H;
    const left = Math.min(Math.max(8, r.right - MENU_W), Math.max(8, window.innerWidth - MENU_W - 8));
    const below = r.bottom + 4;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, r.top - height - 4) : below;
    setPos((p) => (p && p.top === top && p.left === left ? p : { top, left }));
  }, []);

  // Gerçek yükseklik bilinince bir kez daha yerleştir — çevrilen menü
  // ekrandan sarkmasın.
  useEffect(() => { if (open) place(); }, [open, place]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.stopPropagation(); setOpen(false); btnRef.current?.focus(); }
    }
    const dismiss = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [open]);

  return (
    <>
      <IconButton
        ref={btnRef}
        size="sm"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => { if (!open) place(); setOpen((o) => !o); }}
        className={cn("bg-surface", open && "bg-surface-muted text-ink")}
      >
        {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <MoreHorizontal size={15} aria-hidden />}
      </IconButton>

      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: MENU_W }}
          className="anim-fade-down fixed z-[100] origin-top-right rounded-card border border-line bg-surface py-1 shadow-pop"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); a.onSelect(); }}
              className={cn(
                "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13.5px] font-medium transition-colors duration-150",
                a.danger ? "text-danger hover:bg-danger/10" : "text-ink hover:bg-surface-muted",
              )}
            >
              <a.icon size={14} className={cn("shrink-0", !a.danger && "text-muted")} aria-hidden />
              {a.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

/**
 * ÜRETİM DÜĞMESİ — araç çubuğundaki renkli tek eylem.
 *
 * Bileşen DIŞARIDA: render içinde tanımlanan bileşen her çizimde yeniden
 * yaratılır ve React ağacı söker.
 *
 * Renk yalnız İKONDA ve onun yumuşak zemininde. Beş düğmenin beşi de dolu
 * renk olsaydı araç çubuğu bir oyuncak kutusuna dönerdi; kimlik ikonda, düzen
 * ortak çerçevede kalır.
 */
function CreateButton({
  icon: Icon, label, title, hex, busy, onPick,
}: { icon: LucideIcon; label: string; title?: string; hex: string; busy?: boolean; onPick: () => void }) {
  const name = title ?? `Yeni ${label.toLocaleLowerCase("tr")}`;
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={busy}
      aria-busy={busy || undefined}
      title={name}
      aria-label={name}
      className="inline-flex h-9 shrink-0 items-center gap-2 rounded-control border border-line bg-surface pl-1.5 pr-2.5 text-[13px] font-medium text-muted transition-[background-color,border-color,color,transform] duration-150 ease-standard hover:border-line-strong hover:bg-surface-muted hover:text-ink active:scale-[0.98] disabled:pointer-events-none disabled:text-subtle sm:pr-3"
    >
      {/* ARTI ROZETİ — düğmeler "Word'e git" gibi okunuyordu (2026-08-29:
          "şu an sanki tıklayınca Word'e gidecekmiş gibi duruyor"). Rozet
          eylemin ÜRETMEK olduğunu ikonun kendisinde söyler; yazıyı
          uzatmadan ("Yeni Word") satır dar kalır. */}
      <span className="relative shrink-0">
        <span
          className="grid size-6 place-items-center rounded-[6px]"
          style={{ backgroundColor: hex + "1F", color: hex }}
        >
          {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Icon size={14} strokeWidth={2} aria-hidden />}
        </span>
        <span
          aria-hidden
          className="absolute -bottom-1 -right-1 grid size-3.5 place-items-center rounded-full text-white ring-2 ring-surface"
          style={{ backgroundColor: hex }}
        >
          <Plus size={9} strokeWidth={3.5} />
        </span>
      </span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

/** Satırın tek meta satırı: tür · boyut · tarih (klasörde tür · içerik). */
function metaOf(it: DriveItem): string {
  return [
    it.kind.label,
    it.size ? humanSize(it.size) : null,
    it.isFolder ? it.note ?? null : it.date ? new Date(it.date).toLocaleDateString("tr-TR") : null,
  ].filter(Boolean).join(" · ");
}

/** Liste satırının ilk sütunu: küçük tür ikonu (ya da görsel önizlemesi) + ad.
 *  Dar ekranda sütunlar gizlenir; tür · boyut · tarih adın altında tek satır
 *  olarak yazar ki telefonda da dosyanın ne olduğu görünsün. */
function ItemName({ item }: { item: DriveItem }) {
  const Icon = item.kind.icon;
  const inner = (
    <>
      <span
        className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-[6px]"
        style={{ backgroundColor: item.kind.hex + "1A", color: item.kind.hex }}
      >
        {item.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.thumbUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <Icon size={15} strokeWidth={1.9} aria-hidden />
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13.5px] font-medium text-ink" title={item.name}>
          {item.name}
        </span>
        <span className="block truncate text-[12px] text-muted sm:hidden">{metaOf(item)}</span>
      </span>
    </>
  );
  const cls = "flex min-w-0 items-center gap-2.5 rounded-control text-left";

  if (item.href && item.external) {
    return <a href={item.href} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>;
  }
  if (item.href) return <Link href={item.href} className={cls}>{inner}</Link>;
  return <button type="button" onClick={item.onOpen} className={cls}>{inner}</button>;
}

/** İki bölümün ortak başlığı — Drive'ın "Klasörler / Dosyalar" ayrımı. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle">
        {title}
      </h3>
      {children}
    </div>
  );
}

type SortKey = "name" | "kind" | "owner" | "date";

/**
 * LİSTE — Drive'ın varsayılanı: Ad · Tür · Sahibi · Tarih.
 *
 * Başlıklar SIRALANABİLİR (2026-08-29: "Ad, Tür, Sahibi, Tarih bunlar
 * listelenecek şekilde olmalı"). Varsayılan sıra "en yeni önce"; başlığa
 * tıklayınca o sütuna göre, tekrar tıklayınca ters çevrilir.
 */
function DriveList({
  items, memberNames, menu,
}: {
  items: DriveItem[];
  memberNames: Record<string, string>;
  menu: (_it: DriveItem) => React.ReactNode;
}) {
  const [sort, setSort] = useState<SortKey | null>(null);
  const [dir, setDir] = useState<"asc" | "desc">("asc");

  function toggle(k: SortKey) {
    if (k === sort) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSort(k); setDir("asc"); }
  }

  const rows = useMemo(() => {
    if (!sort) return items;   // dokunulmadıysa gelen sıra (en yeni önce)
    const key = (it: DriveItem) => {
      switch (sort) {
        case "kind":  return it.kind.label;
        case "owner": return it.ownerId ? memberNames[it.ownerId] ?? "" : "￿";
        case "date":  return it.date ?? "";
        default:      return it.name;
      }
    };
    return [...items].sort((a, b) => {
      const r = key(a).localeCompare(key(b), "tr");
      return dir === "asc" ? r : -r;
    });
  }, [items, memberNames, sort, dir]);

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="hidden grid-cols-[1fr_120px_140px_100px_44px] gap-3 border-b border-line px-3 py-2 sm:grid">
        <SortHeader active={sort === "name"} dir={dir} onSort={() => toggle("name")}>Ad</SortHeader>
        <SortHeader active={sort === "kind"} dir={dir} onSort={() => toggle("kind")}>Tür</SortHeader>
        <SortHeader active={sort === "owner"} dir={dir} onSort={() => toggle("owner")}>Sahibi</SortHeader>
        <SortHeader active={sort === "date"} dir={dir} onSort={() => toggle("date")} align="right">Tarih</SortHeader>
        <span aria-hidden />
      </div>
      <ul className="divide-y divide-hairline">
        {rows.map((it) => (
          <li
            key={it.key}
            className="grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-2 transition-colors duration-150 hover:bg-surface-hover sm:grid-cols-[1fr_120px_140px_100px_44px]"
          >
            <ItemName item={it} />
            <span className="hidden truncate text-[12.5px] text-muted sm:block">{it.kind.label}</span>
            <span className="hidden truncate text-[12.5px] text-muted sm:block">
              {it.ownerId ? memberNames[it.ownerId] ?? "—" : "—"}
            </span>
            <span className="hidden whitespace-nowrap text-right text-[12.5px] tabular-nums text-subtle sm:block">
              {it.date ? new Date(it.date).toLocaleDateString("tr-TR") : (it.note ?? "—")}
            </span>
            <span className="flex items-center justify-end">{menu(it)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** IZGARA — Drive'ın kutuları: ikon solda, ad sağda. Görselde önizleme. */
function DriveGrid({
  items, leading, menu, memberNames, memberAvatars,
  renamingId, onRename, onCancelRename, busy,
}: {
  items: DriveItem[];
  /** Izgaranın başına konan kart (yeni klasör adı kutusu). */
  leading?: React.ReactNode;
  menu: (_it: DriveItem) => React.ReactNode;
  memberNames: Record<string, string>;
  memberAvatars: Record<string, string | null>;
  /** Adı KART İÇİNDE düzenlenen klasör. */
  renamingId?: string | null;
  onRename?: (_folder: DocFolder, _name: string) => void;
  onCancelRename?: () => void;
  busy?: string | null;
}) {
  return (
    <TileGrid row>
      {leading}
      {items.map((it) => {
        if (renamingId && it.folder?.id === renamingId) {
          const folder = it.folder;
          return (
            <FolderNameTile
              key={it.key}
              initialName={folder.name}
              placeholder="Klasör adı"
              busy={busy === `rn-${folder.id}`}
              onSave={(name) => onRename?.(folder, name)}
              onCancel={() => onCancelRename?.()}
            />
          );
        }
        const actions = menu(it);
        // Sahip: kimlik AVATARDAN okunur, ad METNİ yazılmaz (aşağıdaki not).
        const ownerId = it.ownerId;
        const ownerName = ownerId ? memberNames[ownerId] ?? null : null;
        return (
          /* ⋯ menüsü kartın KARDEŞİ: kart bir <a>/<button>, içine ikinci bir
             düğme giremez. Kartın sağında menü kadar boşluk bırakılır
             ([&>a]:pr-11) ki uzun ad düğmenin altında kalmasın. */
          <div key={it.key} className={cn("relative", actions && "[&>a]:pr-11 [&>button]:pr-11")}>
            <Tile
              layout="row"
              href={it.href}
              external={it.external}
              onClick={it.href ? undefined : it.onOpen}
              title={it.name}
              /* Önce NE ZAMAN, sonra KİM. Avatar başta dururken klasör
                 simgesiyle dikey olarak çakışıyor, iki yuvarlak yan yana
                 okunmuyordu (2026-08-29).
                 AD METNİ YAZILMAZ (2026-08-29: "isim kırpılmış şekilde…
                 ya resmi görünmeli ya da baş harfleri isim olmasın hiç"):
                 kutucuğun meta satırı dar, ad tek harfe kırpılıyordu. Kimlik
                 avatardan okunur (fotoğraf, yoksa kişinin renginde baş harf);
                 tam ad üstüne gelince title'dan, ekran okuyucuda sr-only
                 metinden gelir. */
              metaNode={
                it.isFolder ? (
                  <span className="flex items-center gap-1.5">
                    {it.date && (
                      <span className="shrink-0 tabular-nums">
                        {new Date(it.date).toLocaleDateString("tr-TR")}
                      </span>
                    )}
                    {/* Ayraç yalnız iki yanı da doluyken çizilir. */}
                    {it.date && ownerId && ownerName && (
                      <span className="text-subtle" aria-hidden>·</span>
                    )}
                    {ownerId && ownerName && (
                      <>
                        <PersonAvatar
                          name={ownerName}
                          photoUrl={memberAvatars[ownerId] ?? null}
                          colorHex={personTone(ownerId).hex}
                          size="xs"
                          title={ownerName}
                        />
                        <span className="sr-only">{ownerName}</span>
                      </>
                    )}
                  </span>
                ) : undefined
              }
              /* GÖRÜNÜRLÜK simgenin köşesinde — Drive da klasörün paylaşım
                 durumunu böyle gösterir. Meta satırının sonundaki küçük gri
                 kilit fark edilmiyordu ("anlaşılmıyor"). */
              iconBadge={
                it.restricted ? (
                  <Lock
                    size={10}
                    strokeWidth={2.4}
                    className="text-warning"
                    aria-label="Yalnız yönetici görebilir"
                  />
                ) : undefined
              }
              meta={metaOf(it)}
              photoUrl={it.thumbUrl ?? undefined}
              icon={it.kind.icon}
              colorHex={it.kind.hex}
            />
            {actions && (
              <span className="absolute right-1.5 top-1/2 z-[3] flex -translate-y-1/2 items-center">
                {actions}
              </span>
            )}
          </div>
        );
      })}
    </TileGrid>
  );
}

/**
 * Klasör adını KARTIN YERİNDE yazar — yeni klasör için de, yeniden adlandırma
 * için de aynı kart.
 *
 * Sıraç (2026-08-29): "Klasörü yeniden adlandırmak için üstte bu kadar büyük
 * şeyin çıkmasına gerek var mı? Neden klasörde yapamıyoruz bunu?"
 *
 * Haklı: sayfanın tepesinde tam genişlikte bir kutu açılıyordu ve düzenlenen
 * klasör ekranın çok aşağısında kalıyordu — hangi klasörü adlandırdığın
 * görünmüyordu. Artık kart, aynı ölçüde bir metin alanına dönüşüyor.
 */
function FolderNameTile({
  initialName, placeholder, busy, onSave, onCancel,
}: {
  initialName: string;
  placeholder: string;
  busy: boolean;
  onSave: (_name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const commit = () => { if (name.trim()) onSave(name.trim()); };

  return (
    <div className="flex items-center gap-1 rounded-card border border-brand-ring bg-surface px-2 py-2 shadow-card">
      <TextInput
        autoFocus
        aria-label="Klasör adı"
        placeholder={placeholder}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") onCancel();
        }}
        onFocus={(e) => e.currentTarget.select()}
        className="h-8 flex-1 font-medium"
      />
      <IconButton
        size="sm"
        aria-label="Kaydet"
        onClick={commit}
        disabled={busy || !name.trim()}
        className="text-brand hover:bg-brand-soft hover:text-brand-strong"
      >
        {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Check size={15} aria-hidden />}
      </IconButton>
      <IconButton size="sm" aria-label="Vazgeç" onClick={onCancel}>
        <X size={15} aria-hidden />
      </IconButton>
    </div>
  );
}
