"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FolderPlus, Upload, Trash2, Loader2, Download, ChevronRight, Home,
  Lock, Users, Pencil, Plus, FileText, Table2, Link2 as LinkIcon,
  List as ListIcon, LayoutGrid, Check, X,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useConfirm } from "@/components/ui/useConfirm";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import { personTone } from "@/lib/design/person-colors";
import { getPersonDisplayName } from "@/lib/utils/person-display";
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
import { createTeamworkDoc, deleteOperationDocument } from "@/lib/actions/documents";
import { createSheetInFolder, deleteOperationSpreadsheet } from "@/lib/actions/sheets";

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
};

export type SheetItem = {
  id: string;
  title: string;
  folder_id: string | null;
  created_by: string | null;
  updated_at: string;
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
  /** Görsel dosyalar için imzalı önizleme adresi (sunucuda üretilir). */
  thumbUrl?: string | null;
};

/** Izgara ve listenin ORTAK biçimi — her tür buna indirgenir. */
type DriveItem = {
  key: string;
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
 * kendi ikonu ve rengiyle çizilir (lib/office/file-kind.ts). Üretim tek
 * Üretim düğmeleri araç çubuğunda AÇIK durur (Klasör · Word · Excel ·
 * Bağlantı · Yükle) ve her biri, üreteceği şeyin listedeki ikonuyla aynı
 * rengi taşır. Nereye tıklarsan ne olacağı ikondan bellidir.
 *
 * Sıra Drive'ın sırası: önce klasörler, sonra dosyalar — ada göre.
 */
export function DriveBrowser({
  folders, files, docs = [], sheets = [], links = [], memberNames, memberAvatars = {}, isAdmin,
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
  const [naming, setNaming] = useState(false);
  const [folderName, setFolderName] = useState("");
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
      key: `d-${d.id}`, kind: KIND_DOC, name: d.title, ownerId: d.created_by,
      date: d.updated_at, href: `/documents/${d.id}`, docId: d.id,
    }));

    const sheetItems: DriveItem[] = childSheets.map((x) => ({
      key: `s-${x.id}`, kind: KIND_SHEET, name: x.title, ownerId: x.created_by,
      date: x.updated_at, href: `/sheets/${x.id}`, sheetId: x.id,
    }));

    const linkItems: DriveItem[] = childLinks.map((l) => ({
      key: `l-${l.id}`, kind: linkKindOf(l.document_type), name: l.title,
      ownerId: null, date: l.updated_at,
      href: l.url ?? undefined, external: !!l.url, linkId: l.id,
    }));

    const fileItems: DriveItem[] = childFiles.map((d) => ({
      key: `x-${d.id}`,
      kind: fileKindOf(d.file_mime, d.file_name ?? d.title),
      name: d.file_name ?? d.title,
      ownerId: d.created_by,
      date: d.created_at,
      size: d.file_size,
      thumbUrl: d.thumbUrl ?? null,
      fileId: d.id,
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

  /** Öğeye göre aksiyonlar — liste ve ızgara AYNI düğmeleri kullanır. */
  function rowActions(it: DriveItem) {
    if (it.isFolder && it.folder) {
      const f = it.folder;
      if (!isAdmin) return null;
      return (
        <>
          <IconBtn title="Yeniden adlandır" onClick={() => setRenaming(f.id)}>
            <Pencil size={13} />
          </IconBtn>
          <IconBtn
            title={f.visibility === "admin" ? "Tüm ekibe aç" : "Yalnız yöneticiye kapat"}
            onClick={() =>
              run(`f-${f.id}`, () =>
                saveFolder(f.id, {
                  name: f.name,
                  parent_id: f.parent_id,
                  visibility: f.visibility === "admin" ? "all" : "admin",
                  section: f.section ?? section,
                }),
              )
            }
          >
            {f.visibility === "admin" ? <Users size={13} /> : <Lock size={13} />}
          </IconBtn>
          {/* ONAY ŞART. Klasör tek tıkla siliniyordu — geri alınamaz bir işlem
              için hiçbir soru sorulmuyordu (2026-08-29: "klasör sil yapınca
              direkt siliniyor, hiçbir popup çıkmıyor"). Diğer türlerde onay
              zaten vardı; eksik olan buydu. */}
          <IconBtn title="Sil (yalnız boş klasör)" danger busy={busy === `d-${f.id}`}
            onClick={async () => {
              if (!(await ask({
                title: "Klasör silinsin mi?",
                message: `"${f.name}" kalıcı olarak silinir.\n\nYalnız BOŞ klasör silinebilir; içinde bir şey varsa işlem reddedilir.`,
              }))) return;
              run(`d-${f.id}`, () => deleteFolder(f.id));
            }}>
            <Trash2 size={13} />
          </IconBtn>
        </>
      );
    }

    if (it.fileId) {
      const id = it.fileId;
      return (
        <>
          <IconBtn title="İndir" busy={busy === `dl-${id}`} onClick={() => download(id)}>
            <Download size={13} />
          </IconBtn>
          <IconBtn title="Sil" danger busy={busy === `x-${id}`}
            onClick={() => run(`x-${id}`, () => deleteDocumentFile(id))}>
            <Trash2 size={13} />
          </IconBtn>
        </>
      );
    }

    if (it.linkId) {
      const id = it.linkId;
      return (
        <>
          {onEditLink && (
            <IconBtn title="Düzenle" onClick={() => onEditLink(id)}><Pencil size={13} /></IconBtn>
          )}
          {isAdmin && (
            <IconBtn title="Sil" danger busy={busy === `lk-${id}`}
              onClick={async () => {
                if (!(await ask({ message: `"${it.name}" bağlantısı silinsin mi?` }))) return;
                run(`lk-${id}`, () => deleteOperationDocument(id));
              }}>
              <Trash2 size={13} />
            </IconBtn>
          )}
        </>
      );
    }

    if (!isAdmin) return null;
    if (it.docId) {
      const id = it.docId;
      return (
        <IconBtn title="Sil" danger busy={busy === `doc-${id}`}
          onClick={async () => {
            if (!(await ask({ message: `"${it.name}" yazısı kalıcı olarak silinsin mi?` }))) return;
            run(`doc-${id}`, () => deleteOperationDocument(id));
          }}>
          <Trash2 size={13} />
        </IconBtn>
      );
    }
    if (it.sheetId) {
      const id = it.sheetId;
      return (
        <IconBtn title="Sil" danger busy={busy === `sh-${id}`}
          onClick={async () => {
            if (!(await ask({ message: `"${it.name}" tablosu kalıcı olarak silinsin mi?` }))) return;
            run(`sh-${id}`, () => deleteOperationSpreadsheet(id));
          }}>
          <Trash2 size={13} />
        </IconBtn>
      );
    }
    return null;
  }

  return (
    <section className="space-y-3">
      {/* Kırıntı yolu + tek "Yeni" kapısı */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* TEK SATIR: Geri · kırıntı yolu · görünüm · Yeni.
            Üç ayrı satır vardı ("← Geri", ev simgesi, araç çubuğu) ve ikisi
            neredeyse boştu. Kökteyken kırıntı yolu hiç çizilmez — nerede
            olduğunu uygulama çubuğu zaten söylüyor. */}
        <nav className="flex min-w-0 flex-wrap items-center gap-1 text-[13px]">
          {leading}
          {trail.length > 0 && (
            <>
              <button
                onClick={() => setCwd(null)}
                title={rootLabel}
                aria-label={rootLabel}
                className="ml-1 inline-flex items-center rounded-md px-1.5 py-1 text-muted transition-colors hover:text-ink"
              >
                <Home size={14} />
              </button>
              {trail.map((f, i) => (
                <span key={f.id} className="inline-flex items-center gap-1">
                  <ChevronRight size={12} className="text-subtle" />
                  <button
                    onClick={() => setCwd(f.id)}
                    className={cn(
                      "rounded-md px-1.5 py-1 transition-colors",
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
        {/* Görünüm — Drive'daki gibi liste / ızgara. */}
        {/* h-9 — "Yeni" düğmesiyle aynı boy.
            SIRA: önce KART (varsayılan), sonra LİSTE — açılıştaki mod solda
            durur (2026-08-29: "iki ikonun da yerini değiştir"). */}
        <div className="inline-flex h-9 items-center rounded-lg border border-line bg-surface p-0.5">
          <button
            onClick={() => setView("grid")}
            title="Kart görünümü — klasörler kutu, dosyalar liste"
            aria-pressed={view === "grid"}
            className={cn(
              "inline-flex h-full items-center rounded-md px-2.5 transition-colors",
              view === "grid" ? "bg-surface-sunken text-ink" : "text-subtle hover:text-ink",
            )}
          >
            <LayoutGrid size={15} />
          </button>
          <button
            onClick={() => setView("list")}
            title="Liste görünümü — klasör ve dosya tek tabloda"
            aria-pressed={view === "list"}
            className={cn(
              "inline-flex h-full items-center rounded-md px-2.5 transition-colors",
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
          {isAdmin && (
            <CreateButton
              icon={FolderPlus}
              label="Klasör"
              title="Yeni klasör oluştur"
              hex={KIND_FOLDER.hex}
              onPick={() => { setNaming(true); setFolderName(""); }}
            />
          )}
          <CreateButton
            icon={FileText}
            label="Word"
            title="Yeni yazı (Word)"
            hex={KIND_DOC.hex}
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
            onPick={openFilePicker}
          />
          <input ref={fileRef} type="file" className="hidden" onChange={onPick} />
        </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="anim-fade-down rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">
          {error}
        </p>
      )}

      {/* Üstteki satır artık YALNIZ yeni klasör içindir. Yeniden adlandırma
          klasörün kendi kartında yapılıyor — sayfanın tepesinde tam genişlikte
          bir kutu açmak, düzenlenen klasörden metrelerce uzaktaydı
          (2026-08-29: "neden klasörde yapamıyoruz bunu"). */}
      {naming && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-ring/50 bg-surface-muted/50 p-3">
          <input
            autoFocus
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            placeholder="Klasör adı"
            className="h-9 min-w-48 flex-1 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink focus:border-brand-ring focus:outline-none focus:ring-2 focus:ring-brand-ring/40"
          />
          <button
            onClick={() =>
              run(
                "folder",
                () =>
                  saveFolder(null, {
                    name: folderName,
                    parent_id: cwd,
                    visibility: "admin",
                    section,
                  }),
                () => { setNaming(false); setFolderName(""); },
              )
            }
            disabled={!folderName.trim() || busy === "folder"}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-[13px] font-medium text-white hover:bg-brand-strong disabled:opacity-60"
          >
            {busy === "folder" ? <Loader2 size={14} className="animate-spin" /> : null} Kaydet
          </button>
          <button
            onClick={() => { setNaming(false); setFolderName(""); }}
            className="h-9 rounded-lg px-2 text-[13px] font-medium text-muted hover:text-ink"
          >
            İptal
          </button>
        </div>
      )}

      {isEmpty ? (
        <p className="rounded-xl border border-dashed border-line bg-surface px-4 py-6 text-[13px] text-subtle">
          Bu klasör boş. Üstteki düğmelerle klasör, yazı ya da tablo oluşturabilir;
          bağlantı ekleyip dosya yükleyebilirsiniz.
        </p>
      ) : (
        view === "list" ? (
          /* LİSTE — tek tablo, klasörler üstte. */
          <DriveList
            items={[...items.folders, ...items.files]}
            memberNames={memberNames}
            actions={rowActions}
          />
        ) : (
          /* KART — klasörler kutu, dosyalar tablo. */
          <div className="space-y-5">
            {items.folders.length > 0 && (
              <Section title="Klasörler">
                <DriveGrid
                  items={items.folders}
                  actions={rowActions}
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
                <DriveList
                  items={items.files}
                  memberNames={memberNames}
                  actions={rowActions}
                />
              </Section>
            )}
          </div>
        )
      )}
      {dialog}
    </section>
  );
}

/** Kartın üstünde beliren küçük aksiyon. <button> içinde <button> olmasın diye
 *  kartın KARDEŞİ olarak, mutlak konumda durur. */
function IconBtn({
  title, onClick, children, danger, busy,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      title={title}
      aria-label={title}
      className={cn(
        "tap-target rounded-md bg-surface/90 p-1.5 text-subtle shadow-sm backdrop-blur transition-colors disabled:opacity-50",
        danger ? "hover:text-danger" : "hover:text-ink",
      )}
    >
      {busy ? <Loader2 size={13} className="animate-spin" /> : children}
    </button>
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
  icon: Icon, label, title, hex, onPick,
}: { icon: typeof Plus; label: string; title?: string; hex: string; onPick: () => void }) {
  return (
    <button
      onClick={onPick}
      title={title ?? `Yeni ${label.toLocaleLowerCase("tr")}`}
      aria-label={title ?? `Yeni ${label.toLocaleLowerCase("tr")}`}
      className="group inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-line bg-surface pl-1.5 pr-2.5 text-[13px] font-medium text-muted transition-all duration-150 hover:border-line-strong hover:bg-surface-muted hover:text-ink active:scale-[0.98] sm:pr-3"
    >
      {/* ARTI ROZETİ — düğmeler "Word'e git" gibi okunuyordu (2026-08-29:
          "şu an sanki tıklayınca Word'e gidecekmiş gibi duruyor"). Rozet
          eylemin ÜRETMEK olduğunu ikonun kendisinde söyler; yazıyı
          uzatmadan ("Yeni Word") satır dar kalır. */}
      <span className="relative shrink-0">
        <span
          className="grid size-6 place-items-center rounded-md transition-colors duration-150"
          style={{ backgroundColor: hex + "1F", color: hex }}
        >
          <Icon size={14} strokeWidth={2} />
        </span>
        <span
          aria-hidden
          className="absolute -bottom-1 -right-1 grid size-3.5 place-items-center rounded-full text-white ring-2 ring-surface transition-colors duration-150"
          style={{ backgroundColor: hex }}
        >
          <Plus size={9} strokeWidth={3.5} />
        </span>
      </span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

/** Liste satırının ilk sütunu: küçük tür ikonu (ya da görsel önizlemesi) + ad.
 *  Tıklama alanı satırın tamamını kaplar — Drive'da da öyle. */
function ItemName({ item }: { item: DriveItem }) {
  const Icon = item.kind.icon;
  const inner = (
    <>
      <span
        className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-md"
        style={{ backgroundColor: item.kind.hex + "1A", color: item.kind.hex }}
      >
        {item.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.thumbUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <Icon size={15} strokeWidth={1.9} />
        )}
      </span>
      <span className="min-w-0 truncate text-[13.5px] font-medium text-ink" title={item.name}>
        {item.name}
      </span>
    </>
  );
  const cls = "flex min-w-0 items-center gap-2.5 text-left";

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
      <h3 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-subtle">
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
  items, memberNames, actions,
}: {
  items: DriveItem[];
  memberNames: Record<string, string>;
  actions: (_it: DriveItem) => React.ReactNode;
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
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      <div className="hidden grid-cols-[1fr_120px_120px_100px_88px] gap-3 border-b border-line px-3 py-2 sm:grid">
        <SortHeader active={sort === "name"} dir={dir} onSort={() => toggle("name")}>Ad</SortHeader>
        <SortHeader active={sort === "kind"} dir={dir} onSort={() => toggle("kind")}>Tür</SortHeader>
        <SortHeader active={sort === "owner"} dir={dir} onSort={() => toggle("owner")}>Sahibi</SortHeader>
        <SortHeader active={sort === "date"} dir={dir} onSort={() => toggle("date")} align="right">Tarih</SortHeader>
        <span />
      </div>
      <ul className="divide-y divide-hairline">
        {rows.map((it) => (
          <li
            key={it.key}
            className="group/row grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-2 transition-colors hover:bg-surface-hover sm:grid-cols-[1fr_120px_120px_100px_88px]"
          >
            <ItemName item={it} />
            <span className="hidden truncate text-[12.5px] text-muted sm:block">{it.kind.label}</span>
            <span className="hidden truncate text-[12.5px] text-muted sm:block">
              {it.ownerId ? memberNames[it.ownerId] ?? "—" : "—"}
            </span>
            <span className="hidden whitespace-nowrap text-right text-[12.5px] tabular-nums text-subtle sm:block">
              {it.date ? new Date(it.date).toLocaleDateString("tr-TR") : (it.note ?? "—")}
            </span>
            <span className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100">
              {actions(it)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** IZGARA — Drive'ın kutuları: ikon solda, ad sağda. Görselde önizleme. */
function DriveGrid({
  items, actions, memberNames, memberAvatars,
  renamingId, onRename, onCancelRename, busy,
}: {
  items: DriveItem[];
  actions: (_it: DriveItem) => React.ReactNode;
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
      {items.map((it) =>
        renamingId && it.folder?.id === renamingId ? (
          <FolderRename
            key={it.key}
            folder={it.folder}
            busy={busy === `rn-${it.folder.id}`}
            onSave={(name) => onRename?.(it.folder!, name)}
            onCancel={() => onCancelRename?.()}
          />
        ) : (
        <div key={it.key} className="group/tile relative">
          <Tile
            layout="row"
            href={it.href}
            external={it.external}
            onClick={it.href ? undefined : it.onOpen}
            title={it.name}
            /* Önce NE ZAMAN, sonra KİM. Avatar başta dururken klasör
               simgesiyle dikey olarak çakışıyor, iki yuvarlak yan yana
               okunmuyordu (2026-08-29). */
            metaNode={
              it.isFolder ? (
                <span className="flex items-center gap-1.5">
                  {it.date && (
                    <span className="shrink-0 tabular-nums">
                      {new Date(it.date).toLocaleDateString("tr-TR")}
                    </span>
                  )}
                  {it.ownerId && <span className="text-subtle">·</span>}
                  {it.ownerId && (
                    <PersonAvatar
                      name={memberNames[it.ownerId] ?? "—"}
                      photoUrl={memberAvatars[it.ownerId] ?? null}
                      colorHex={personTone(it.ownerId).hex}
                      size="xs"
                    />
                  )}
                  <span className="truncate">
                    {it.ownerId ? getPersonDisplayName(memberNames[it.ownerId] ?? "—") : "—"}
                  </span>
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
                  className="text-amber-700"
                  aria-label="Yalnız yönetici görebilir"
                />
              ) : undefined
            }
            meta={[it.kind.label, it.size ? humanSize(it.size) : null, it.note ?? null]
              .filter(Boolean).join(" · ")}
            photoUrl={it.thumbUrl ?? undefined}
            icon={it.kind.icon}
            colorHex={it.kind.hex}
          />
          <span className="absolute right-1.5 top-1/2 z-[3] flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/tile:opacity-100">
            {actions(it)}
          </span>
        </div>
        ),
      )}
    </TileGrid>
  );
}

/**
 * Klasör adını KARTIN YERİNDE düzenler.
 *
 * Sıraç (2026-08-29): "Klasörü yeniden adlandırmak için üstte bu kadar büyük
 * şeyin çıkmasına gerek var mı? Neden klasörde yapamıyoruz bunu?"
 *
 * Haklı: sayfanın tepesinde tam genişlikte bir kutu açılıyordu ve düzenlenen
 * klasör ekranın çok aşağısında kalıyordu — hangi klasörü adlandırdığın
 * görünmüyordu. Artık kart, aynı ölçüde bir metin alanına dönüşüyor.
 */
function FolderRename({
  folder, busy, onSave, onCancel,
}: {
  folder: DocFolder;
  busy: boolean;
  onSave: (_name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(folder.name);
  const commit = () => { if (name.trim()) onSave(name.trim()); };

  return (
    <div className="flex items-center gap-1.5 rounded-xl border border-brand-ring bg-surface px-2 py-2 shadow-card">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") onCancel();
        }}
        onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-[13.5px] font-medium text-ink focus:border-brand-ring focus:outline-none focus:ring-2 focus:ring-brand-ring/40"
      />
      <button
        onClick={commit}
        disabled={busy || !name.trim()}
        title="Kaydet"
        aria-label="Kaydet"
        className="tap-target shrink-0 rounded-md p-1.5 text-brand transition-colors hover:bg-brand-soft disabled:opacity-50"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
      </button>
      <button
        onClick={onCancel}
        title="Vazgeç"
        aria-label="Vazgeç"
        className="tap-target shrink-0 rounded-md p-1.5 text-subtle transition-colors hover:text-ink"
      >
        <X size={14} />
      </button>
    </div>
  );
}
