"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FolderPlus, Upload, Trash2, Loader2, Download, ChevronRight, Home,
  Lock, Users, Pencil, Plus, FileText, Table2, Link2 as LinkIcon,
  List as ListIcon, LayoutGrid, Check, X, MoreHorizontal, FolderOpen,
  Search, FolderInput, Eye, Folder as FolderIcon, AlertCircle, SearchX,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useAnchoredMenu } from "@/lib/utils/use-anchored-menu";
import { useConfirm } from "@/components/ui/useConfirm";
import { Button, IconButton } from "@/components/ui/Button";
import { SelectInput, TextInput } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { Overlay } from "@/components/ui/Overlay";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import { personTone } from "@/lib/design/person-colors";
import { Tile, TileGrid } from "@/components/ui/TileGrid";
import { SortHeader } from "@/components/ui/SortHeader";
import {
  KIND_FOLDER, KIND_DOC, KIND_SHEET, fileKindOf, linkKindOf, humanSize,
  type FileKind,
} from "@/lib/office/file-kind";
import {
  saveFolder, deleteFolder, uploadDocumentFile, moveDocument,
  getDocumentDownloadUrl, deleteDocumentFile,
} from "@/lib/actions/document-files";
import { createTeamworkDoc, deleteOperationDocument, setOperationDocumentVisibility } from "@/lib/actions/documents";
import {
  createSheetInFolder, deleteOperationSpreadsheet, renameOperationSpreadsheet,
  setOperationSpreadsheetVisibility,
} from "@/lib/actions/sheets";

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
  /* Bağlantıyı EKLEYEN kişi. Uzun süre taşınmıyordu ve bunun iki görünür
     sonucu vardı: (1) üye kendi eklediği bağlantıyı düzenleyip silemiyordu —
     ⋯ menüsü boş çıkıyordu, (2) "Sahibi" sütunu bağlantı satırlarında hep
     "—" yazıyordu. */
  created_by?: string | null;
  /** Görünürlük — menüdeki satırın doğru yönü göstermesi için. */
  visibility?: "all" | "admin";
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

/** Öğenin cinsi — süzgeç ve menü kuralları buna bakar. */
type ItemType = "folder" | "doc" | "sheet" | "link" | "file";

/** Izgara ve listenin ORTAK biçimi — her tür buna indirgenir. */
type DriveItem = {
  key: string;
  /** Aksiyon meşguliyetini eşlemek için kaydın kendi kimliği. */
  id: string;
  type: ItemType;
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
  /** Bulunduğu klasör — "Taşı" penceresinde bulunduğu yer işaretlenir. */
  parentId: string | null;
  /** Arama sonucunda öğenin yolu ("AF Teamwork / Sözleşmeler"). */
  path?: string;
  /** Yerinde önizlenebilir mi (görsel · PDF)? */
  previewable?: boolean;
  /** Yalnız yöneticiye açık — kartta kilit simgesiyle gösterilir. */
  restricted?: boolean;
  folder?: DocFolder;
};

/** ⋯ menüsünün bir satırı. */
type MenuAction = {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  danger?: boolean;
};

/** Yükleme kuyruğunun durumu — ilerleme, iptal ve dosya başına hata. */
type UploadState = {
  total: number;
  done: number;
  name: string;
  errors: string[];
  finished: boolean;
};

/** Yerinde önizleme penceresi. */
type PreviewState = {
  id: string;
  name: string;
  mode: "image" | "pdf";
  url: string | null;
  loading: boolean;
  error: string | null;
};

/** Sunucudaki sınırın aynısı (lib/actions/document-files.ts). Burada da
 *  bakılır ki 40 MB'lık dosya ağa hiç çıkmadan uyarı alsın. */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * YÜKLEME BAYRAĞI HAKKINDA (2026-09-05).
 *
 * `NEXT_PUBLIC_FEATURE_UPLOADS_ENABLED` GÖREV EKLERİNİ kapatır
 * (modules/uploads) — AF Teamwork'ün dosya katmanını DEĞİL. Buradaki yükleme
 * kendi sunucu aksiyonuna ve kendi özel `documents` bucket'ına dayanır
 * (20240312), bayraktan bağımsız çalışır. Bu yüzden "Yükle" düğmesi bayrağa
 * bakmaz: bayrak kapalıyken de ölü değildir. Kapatılırsa modülün ana işlevi
 * (Drive) çalışmaz hâle gelirdi.
 */

/* ARAÇ ÇUBUĞUNUN RENKLERİ — hiçbiri elle yazılmaz, hepsi tür kimliğinden
   türetilir (lib/office/file-kind.ts). Klasör · Yazı · Tablo kendi
   sabitlerinden; "Bağlantı" genel bağlantı kimliğinden; "Yükle" ise yüklenen
   dosyaların görsel kimliğinden — böylece listedeki ikonla araç çubuğundaki
   düğme AYNI rengi taşır ve renk tek yerden değişir. */
const LINK_HEX = linkKindOf(null).hex;
const UPLOAD_HEX = fileKindOf("image/png", null).hex;

const TYPE_FILTERS: { key: "all" | ItemType; label: string }[] = [
  { key: "all", label: "Tüm türler" },
  { key: "folder", label: "Klasör" },
  { key: "doc", label: "Yazı (Word)" },
  { key: "sheet", label: "Tablo (Excel)" },
  { key: "link", label: "Bağlantı" },
  { key: "file", label: "Yüklenen dosya" },
];

/** Dosya yerinde açılabiliyor mu? Görsel ve PDF açılır; gerisi indirilir. */
function previewModeOf(mime: string | null, name: string | null): "image" | "pdf" | null {
  const m = (mime ?? "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m === "application/pdf") return "pdf";
  if ((name ?? "").toLowerCase().endsWith(".pdf")) return "pdf";
  return null;
}

/** İndirme — imzalı adrese `download` parametresi eklenir ki tarayıcı dosyayı
 *  yeni sekmede AÇMAK yerine kaydetsin. `window.open` bekleme sonrası çağrılınca
 *  Safari'de açılır pencere engelleyicisine takılıyordu. */
function saveAs(url: string, name: string) {
  let href = url;
  try {
    const u = new URL(url);
    u.searchParams.set("download", name);
    href = u.toString();
  } catch {
    /* Adres çözümlenemezse ham hâliyle denenir. */
  }
  const a = document.createElement("a");
  a.href = href;
  a.rel = "noopener";
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Bırakılan şeyi ayıklar: KLASÖR bırakıldığında tarayıcı boyutu 0 olan sahte
 * bir File verir; eskiden bu "dosya boş, atlandı" diye geçiyordu ve kullanıcı
 * neden olmadığını anlamıyordu. Klasörler ayrı toplanır, adlarıyla söylenir.
 *
 * `getAsFile()` SENKRON çağrılmalı: ilk `await`ten sonra DataTransfer boşalır.
 */
function splitDropped(dt: DataTransfer): { files: File[]; folderNames: string[] } {
  const files: File[] = [];
  const folderNames: string[] = [];
  const items: DataTransferItem[] = dt.items ? Array.from(dt.items) : [];
  const canInspect = items.length > 0 && typeof items[0].webkitGetAsEntry === "function";
  if (!canInspect) return { files: dt.files ? Array.from(dt.files) : [], folderNames };
  for (const item of items) {
    if (item.kind !== "file") continue;
    const entry = item.webkitGetAsEntry();
    const file = item.getAsFile();
    if (entry?.isDirectory) {
      folderNames.push(entry.name);
      continue;
    }
    if (file) files.push(file);
  }
  return { files, folderNames };
}

/**
 * SAĞ TIK = ⋯ MENÜSÜ. Drive'da beklenen hareket sağ tıklamaktır; telefonda
 * ise sağ tık yoktur, karşılığı satırın/kartın ⋯ düğmesidir. İkisi de AYNI
 * menüyü açsın diye sağ tık o düğmeye basar — ayrı bir menü kopyası yok.
 * Menüsü olmayan öğede tarayıcının kendi menüsü kalır.
 */
function openMenuOnContext(e: React.MouseEvent<HTMLElement>) {
  /* BAĞLANTININ ÜSTÜNDE tarayıcının kendi menüsü kalır: yazı ve tablo satırları
     birer <a>'dır, "bağlantıyı yeni sekmede aç" elinden alınmamalı. Menü
     satırın boşluğuna, ikona ya da ⋯ düğmesine sağ tıklayınca açılır. */
  if ((e.target as HTMLElement | null)?.closest("a")) return;
  const btn = e.currentTarget.querySelector<HTMLButtonElement>("[data-drive-menu] button");
  if (!btn || btn.disabled) return;
  e.preventDefault();
  btn.click();
}

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
 * Izgarada YALNIZ İÇERİK var (klasör · yazı · tablo · bağlantı · dosya) ve her
 * tür kendi ikonu ve rengiyle çizilir (lib/office/file-kind.ts). Üretim
 * düğmeleri araç çubuğunda AÇIK durur (Klasör · Word · Excel · Bağlantı ·
 * Yükle) ve her biri, üreteceği şeyin listedeki ikonuyla aynı rengi taşır.
 *
 * İKİNCİL EYLEMLER TEK ⋯ MENÜSÜNDE: telefonda hover yok, dolayısıyla karta
 * gelince beliren ikonlarla klasör silinemiyor, dosya indirilemiyordu. Menü her
 * cihazda görünür, her satırı adıyla yazar.
 *
 * DRIVE'IN GERİ KALANI (2026-09-05). Ekran "bakılabilir" ama "kullanılabilir"
 * değildi: dosya tek tek seçilerek yükleniyordu (sürükle-bırak yok, ilerleme
 * yok, 25 MB sınırı ancak sunucudan dönen hatayla anlaşılıyordu), yüklenen
 * dosya BAŞKA KLASÖRE TAŞINAMIYORDU (sunucu aksiyonu `moveDocument` yazılmış
 * ama hiçbir yerden çağrılmıyordu), arama ve tür süzgeci yoktu, görsele
 * tıklayınca önizleme yerine indirme başlıyordu.
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
  /** Kart görünümü DIŞINDA (liste · arama) ya da klasör olmayan öğede adı
   *  değiştirilen kayıt — küçük bir pencerede sorulur. */
  const [renameTarget, setRenameTarget] = useState<DriveItem | null>(null);
  /** Arama kutusu — boş değilse TÜM ağaçta arar (Drive gibi). */
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | ItemType>("all");
  const [upload, setUpload] = useState<UploadState | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  /** "Taşı" penceresinde duran öğe. */
  const [moving, setMoving] = useState<DriveItem | null>(null);
  const [dragOver, setDragOver] = useState(false);
  /** "İptal"e basıldı — kuyruk sıradaki dosyada duracak. Ref işi yapıyor ama
   *  düğmenin de cevap vermesi gerek; yoksa basılıp basılmadığı belli olmuyor. */
  const [cancelling, setCancelling] = useState(false);
  const dragDepth = useRef(0);
  const cancelUpload = useRef(false);
  /* Görünüm — Drive'ın iki modu:
       KART (VARSAYILAN): klasörler KART, dosyalar LİSTE.
       LİSTE: her şey TEK tabloda — klasörler de dosyalarla aynı listede. */
  const [view, setView] = useState<"grid" | "list">("grid");
  const fileRef = useRef<HTMLInputElement>(null);
  const [, startWork] = useTransition();

  const searching = query.trim().length > 0;
  const needle = query.trim().toLocaleLowerCase("tr");

  /** Klasör başına içerik sayısı — her klasör için tek tek saymak yerine tek
   *  turda. Bu bir TARİF (kaç öğe var), kimseyi puanlamaz. */
  const childCount = useMemo(() => {
    const m = new Map<string, number>();
    const bump = (id: string | null | undefined) => {
      if (id) m.set(id, (m.get(id) ?? 0) + 1);
    };
    for (const x of files) bump(x.folder_id);
    for (const x of docs) bump(x.folder_id);
    for (const x of sheets) bump(x.folder_id);
    for (const x of links) bump(x.folder_id);
    for (const x of folders) bump(x.parent_id);
    return m;
  }, [files, docs, sheets, links, folders]);

  /** Klasör kimliğinden okunur yol — arama sonucunda "nerede?" sorusu için. */
  const pathOf = useMemo(() => {
    const byId = new Map(folders.map((f) => [f.id, f]));
    const cache = new Map<string, string>();
    return (id: string | null): string => {
      if (!id) return rootLabel;
      const hit = cache.get(id);
      if (hit !== undefined) return hit;
      const parts: string[] = [];
      const seen = new Set<string>();
      let cur: string | null = id;
      while (cur && !seen.has(cur)) {
        seen.add(cur);
        const f: DocFolder | undefined = byId.get(cur);
        if (!f) break;
        parts.unshift(f.name);
        cur = f.parent_id;
      }
      const value = [rootLabel, ...parts].join(" / ");
      cache.set(id, value);
      return value;
    };
  }, [folders, rootLabel]);

  /** İmzalı adres alır; hem indirme hem önizleme aynı kapıdan geçer. */
  const download = useCallback(
    (id: string) => {
      setError(null);
      setBusy(`dl-${id}`);
      startWork(async () => {
        try {
          const res = await getDocumentDownloadUrl(id);
          if ("error" in res) { setError(res.error); return; }
          saveAs(res.url, res.name);
        } catch (e) {
          setError(e instanceof Error ? e.message : "İndirme bağlantısı alınamadı.");
        } finally {
          setBusy(null);
        }
      });
    },
    [startWork],
  );

  /** Görsel/PDF'i YERİNDE açar. Görselin imzalı adresi sunucudan hazır gelir
   *  (thumbUrl, 1 saat) — o zaman ek istek atılmaz. */
  const openPreview = useCallback((f: DocFile) => {
    const mode = previewModeOf(f.file_mime, f.file_name ?? f.title);
    if (!mode) return;
    const name = f.file_name ?? f.title;
    if (f.thumbUrl) {
      setPreview({ id: f.id, name, mode, url: f.thumbUrl, loading: false, error: null });
      return;
    }
    setPreview({ id: f.id, name, mode, url: null, loading: true, error: null });
    void (async () => {
      try {
        const res = await getDocumentDownloadUrl(f.id);
        setPreview((p) => {
          if (!p || p.id !== f.id) return p;
          if ("error" in res) return { ...p, loading: false, error: res.error };
          return { ...p, loading: false, url: res.url };
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Önizleme açılamadı.";
        setPreview((p) => (p && p.id === f.id ? { ...p, loading: false, error: message } : p));
      }
    })();
  }, []);

  /**
   * TEK ÖĞE LİSTESİ. Klasör, yazı, tablo, bağlantı ve dosya aynı biçime
   * indirgenir; liste de ızgara da bunu çizer. Arama açıkken kaynak TÜM ağaç,
   * kapalıyken yalnız içinde bulunulan klasördür.
   */
  const items = useMemo<{ folders: DriveItem[]; files: DriveItem[] }>(() => {
    const inScope = <T,>(rows: T[], parentOf: (_r: T) => string | null) =>
      searching ? rows : rows.filter((r) => parentOf(r) === cwd);

    const folderItems: DriveItem[] = inScope(folders, (f) => f.parent_id).map((f) => {
      const n = childCount.get(f.id) ?? 0;
      return {
        key: `f-${f.id}`,
        id: f.id,
        type: "folder" as const,
        kind: KIND_FOLDER,
        name: f.name,
        /* "Klasör" yazmıyoruz — simge zaten söylüyor. Yerine KİM ve NE ZAMAN
           oluşturdu. Öğe sayısı listenin "Tarih" sütununa düşen yedek bilgi. */
        note: n > 0 ? `${n} öğe` : "boş",
        ownerId: f.created_by ?? null,
        date: f.created_at ?? null,
        parentId: f.parent_id,
        restricted: f.visibility === "admin",
        onOpen: () => { setQuery(""); setCwd(f.id); },
        folder: f,
      };
    });

    const docItems: DriveItem[] = inScope(docs, (d) => d.folder_id).map((d) => ({
      key: `d-${d.id}`, id: d.id, type: "doc" as const, kind: KIND_DOC, name: d.title,
      ownerId: d.created_by, date: d.updated_at, href: `/documents/${d.id}`,
      parentId: d.folder_id, restricted: d.visibility === "admin",
    }));

    const sheetItems: DriveItem[] = inScope(sheets, (s) => s.folder_id).map((x) => ({
      key: `s-${x.id}`, id: x.id, type: "sheet" as const, kind: KIND_SHEET, name: x.title,
      ownerId: x.created_by, date: x.updated_at, href: `/sheets/${x.id}`,
      parentId: x.folder_id, restricted: x.visibility === "admin",
    }));

    const linkItems: DriveItem[] = inScope(links, (l) => l.folder_id).map((l) => ({
      key: `l-${l.id}`, id: l.id, type: "link" as const, kind: linkKindOf(l.document_type), name: l.title,
      ownerId: l.created_by ?? null, date: l.updated_at,
      href: l.url ?? undefined, external: !!l.url,
      parentId: l.folder_id, restricted: l.visibility === "admin",
      /* Adresi olmayan bağlantı (dahili not) tıklanınca hiçbir şey yapmıyordu;
         artık kendi formunu açar. */
      onOpen: l.url ? undefined : onEditLink ? () => onEditLink(l.id) : undefined,
    }));

    const fileItems: DriveItem[] = inScope(files, (f) => f.folder_id).map((d) => {
      const name = d.file_name ?? d.title;
      const mode = previewModeOf(d.file_mime, name);
      return {
        key: `x-${d.id}`,
        id: d.id,
        type: "file" as const,
        kind: fileKindOf(d.file_mime, name),
        name,
        ownerId: d.created_by,
        date: d.created_at,
        size: d.file_size,
        thumbUrl: d.thumbUrl ?? null,
        parentId: d.folder_id,
        previewable: mode !== null,
        restricted: d.visibility === "admin",
        /* Görsel/PDF önce GÖSTERİLİR — Drive da öyle yapar. Diğer türlerde
           tek anlamlı davranış indirmektir. */
        onOpen: () => (mode ? openPreview(d) : download(d.id)),
      };
    });

    let folderOut = folderItems;
    let fileOut = [...docItems, ...sheetItems, ...linkItems, ...fileItems];

    if (typeFilter !== "all") {
      folderOut = typeFilter === "folder" ? folderOut : [];
      fileOut = fileOut.filter((i) => i.type === typeFilter);
    }
    if (needle) {
      const hit = (i: DriveItem) => i.name.toLocaleLowerCase("tr").includes(needle);
      folderOut = folderOut.filter(hit).map((i) => ({ ...i, path: pathOf(i.parentId) }));
      fileOut = fileOut.filter(hit).map((i) => ({ ...i, path: pathOf(i.parentId) }));
    }

    /* SIRA — Drive'ın sırası (2026-08-29: "üstte klasörler olsun, altta
       dosyalar, o da son eklenme tarihine göre").
         • Klasör: ADA göre — yeri sabit kalsın.
         • Dosya: TARİHE göre, en yeni önce. */
    const byName = (a: DriveItem, b: DriveItem) => a.name.localeCompare(b.name, "tr");
    const byNewest = (a: DriveItem, b: DriveItem) => (b.date ?? "").localeCompare(a.date ?? "");
    return { folders: folderOut.sort(byName), files: fileOut.sort(byNewest) };
  }, [
    folders, docs, sheets, links, files, cwd, searching, needle, typeFilter,
    childCount, pathOf, download, openPreview, onEditLink,
  ]);

  const resultCount = items.folders.length + items.files.length;
  const filtering = searching || typeFilter !== "all";
  /** Ağaçta hiç içerik yoksa arama satırı gereksiz gürültüdür. */
  const hasAnything = folders.length + docs.length + sheets.length + links.length + files.length > 0;

  /** Kökten buraya kadar olan yol — üstteki kırıntı çubuğu. */
  const trail = useMemo(() => {
    const out: DocFolder[] = [];
    const seen = new Set<string>();
    let id = cwd;
    const byId = new Map(folders.map((f) => [f.id, f]));
    while (id && !seen.has(id)) {
      seen.add(id);
      const f = byId.get(id);
      if (!f) break;
      out.unshift(f);
      id = f.parent_id;
    }
    return out;
  }, [cwd, folders]);

  /** "Taşı" penceresinin hedef listesi — kendi altına taşımak engellenir. */
  const moveTargets = useMemo<{ id: string | null; label: string; depth: number }[]>(() => {
    if (!moving) return [];
    const blocked = new Set<string>();
    if (moving.type === "folder") {
      blocked.add(moving.id);
      let grew = true;
      while (grew) {
        grew = false;
        for (const f of folders) {
          if (f.parent_id && blocked.has(f.parent_id) && !blocked.has(f.id)) {
            blocked.add(f.id);
            grew = true;
          }
        }
      }
    }
    const out: { id: string | null; label: string; depth: number }[] = [
      { id: null, label: rootLabel, depth: 0 },
    ];
    const walk = (parent: string | null, depth: number) => {
      const kids = folders
        .filter((f) => f.parent_id === parent)
        .sort((a, b) => a.name.localeCompare(b.name, "tr"));
      for (const f of kids) {
        if (blocked.has(f.id)) continue;
        out.push({ id: f.id, label: f.name, depth });
        walk(f.id, depth + 1);
      }
    };
    walk(null, 1);
    return out;
  }, [moving, folders, rootLabel]);

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

  /**
   * YÜKLEME KUYRUĞU — çoklu seçim, sürükle-bırak, ilerleme, iptal.
   *
   * Önceden `files[0]` alınıyordu: on dosya seçilse biri yükleniyordu; 25 MB
   * sınırı ancak sunucudan dönen hatayla anlaşılıyor, bu sırada dosya ağa
   * çıkmış oluyordu; yükleme sürerken hiçbir şey görünmüyordu.
   *
   * Dosyalar SIRAYLA gider: kaçıncıda olunduğu yazılabilsin, bir dosyanın
   * hatası diğerlerini düşürmesin ve "İptal" kalan kuyruğu durdurabilsin.
   */
  const uploadFiles = useCallback(
    async (picked: File[], rejected: string[] = []) => {
      if (picked.length === 0 && rejected.length === 0) return;
      setError(null);
      /* Dosyalar AÇIK OLAN klasöre iner. Arama ya da tür süzgeci açıkken
         yüklenen dosya listeye hiç düşmüyor, "kaybolmuş" gibi görünüyordu. */
      setQuery("");
      setTypeFilter("all");
      const errors: string[] = [...rejected];
      const queue: File[] = [];
      for (const f of picked) {
        if (f.size === 0) { errors.push(`${f.name}: dosya boş, atlandı.`); continue; }
        if (f.size > MAX_UPLOAD_BYTES) {
          const mb = (f.size / 1024 / 1024).toFixed(1).replace(".", ",");
          errors.push(`${f.name}: 25 MB sınırını aşıyor (${mb} MB).`);
          continue;
        }
        queue.push(f);
      }
      if (queue.length === 0) {
        setUpload({ total: 0, done: 0, name: "", errors, finished: true });
        return;
      }
      cancelUpload.current = false;
      setCancelling(false);
      const target = cwd;
      let done = 0;
      setUpload({ total: queue.length, done, name: queue[0].name, errors: [...errors], finished: false });
      for (const file of queue) {
        if (cancelUpload.current) {
          errors.push(`${queue.length - done} dosya iptal edildi.`);
          break;
        }
        setUpload({ total: queue.length, done, name: file.name, errors: [...errors], finished: false });
        try {
          const fd = new FormData();
          fd.append("file", file);
          if (target) fd.append("folder_id", target);
          fd.append("section", section);
          const res = await uploadDocumentFile(fd);
          if ("error" in res) errors.push(`${file.name}: ${res.error}`);
        } catch (e) {
          errors.push(`${file.name}: ${e instanceof Error ? e.message : "yüklenemedi."}`);
        }
        done += 1;
      }
      // Hata varsa panel açık kalır (kullanıcı okusun); temizse kendiliğinden kapanır.
      setUpload(errors.length > 0 ? { total: queue.length, done, name: "", errors, finished: true } : null);
      setCancelling(false);
      router.refresh();
    },
    [cwd, router, section],
  );

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    void uploadFiles(picked);
  }

  /* Ayrı fonksiyon: ok işlevi doğrudan `onPick={...}` içinde yazılınca lint
     bunu "render sırasında ref okuma" sanıyordu. */
  function openFilePicker() {
    fileRef.current?.click();
  }

  const uploading = upload !== null && !upload.finished;

  /** Sürüklenen şey DOSYA mı? (Kart sürüklemesi yükleme başlatmasın.) */
  const dragHasFiles = (e: React.DragEvent) =>
    Array.from(e.dataTransfer?.types ?? []).includes("Files");

  /** Bu öğe üzerinde bir iş sürüyor mu? Meşguliyet anahtarları `önek-id`. */
  const isItemBusy = (it: DriveItem) => busy !== null && busy.endsWith(`-${it.id}`);

  /** SAHİPLİK — yönetici her şeyi, üye KENDİ EKLEDİĞİNİ yönetir.
   *  Sıraç (2026-08-30): "Üye kendi eklediği yazıyı, klasörü vs silebilme
   *  yetkisi olsun." Aynı kural RLS'te de yazılı (20240334); buradaki kontrol
   *  yalnız yapamayacağı bir seçeneği hiç göstermemek için. */
  const canManage = (it: DriveItem) =>
    isAdmin || (!!currentUserId && !!it.ownerId && it.ownerId === currentUserId);

  /** Görünürlük satırı — klasör, yazı, tablo ve dosyada AYNI cümle. */
  const visibilityAction = (
    it: DriveItem,
    apply: (next: "all" | "admin") => Promise<{ error?: string } | unknown>,
    key: string,
  ): MenuAction => ({
    label: it.restricted ? "Tüm üyelere göster" : "Yalnız yöneticiye kapat",
    icon: it.restricted ? Users : Lock,
    onSelect: () => run(key, () => apply(it.restricted ? "all" : "admin")),
  });

  /** "Taşı" satırı — klasör de dosya da başka bir klasöre gider. */
  const moveAction = (it: DriveItem): MenuAction => ({
    label: "Taşı",
    icon: FolderInput,
    onSelect: () => setMoving(it),
  });

  function applyMove(it: DriveItem, target: string | null) {
    setMoving(null);
    if (it.parentId === target) return;
    if (it.type === "folder" && it.folder) {
      const f = it.folder;
      run(`mv-${f.id}`, () =>
        saveFolder(f.id, {
          name: f.name,
          parent_id: target,
          visibility: f.visibility,
          section: f.section ?? section,
        }),
      );
      return;
    }
    run(`mv-${it.id}`, () => moveDocument(it.id, target));
  }

  /** Kart görünümü dışında (liste · arama) ve tabloda ad değiştirme. */
  function applyRename(it: DriveItem, raw: string) {
    const name = raw.trim();
    if (!name || name === it.name) { setRenameTarget(null); return; }
    if (it.type === "folder" && it.folder) {
      const f = it.folder;
      run(
        `rn-${f.id}`,
        () =>
          saveFolder(f.id, {
            name,
            parent_id: f.parent_id,
            visibility: f.visibility,
            section: f.section ?? section,
          }),
        () => setRenameTarget(null),
      );
      return;
    }
    if (it.type === "sheet") {
      run(`rn-${it.id}`, () => renameOperationSpreadsheet(it.id, name), () => setRenameTarget(null));
    }
  }

  /** Öğeye göre ⋯ menüsünün satırları — liste ve ızgara AYNI menüyü kullanır.
   *  Boş dizi = menü çizilmez (kişinin dokunamadığı öğe). */
  function itemActions(it: DriveItem): MenuAction[] {
    const id = it.id;
    /* Ad kutusu klasörün KENDİ KARTINDA açılır — ama o kart yalnız KART
       görünümünde ve klasörün bulunduğu dizinde çizilir. Liste görünümünde ya
       da arama sonucundayken aynı satır küçük bir pencerede sorulur; eskiden
       kullanıcı zorla kart görünümüne atılıyor, araması siliniyordu. */
    const renameInPlace = !searching && view === "grid";

    /* ARAMA SONUCU — "bu dosya neredeydi?" sorusunun eylemi. Yol satırın
       altında yazıyor ama tıklanamıyordu (kart/satırın kendisi zaten bir
       bağlantı; içine ikinci bir bağlantı konamaz). Herkese açık: kaydı
       yönetemeyen de klasörüne gidebilmeli. */
    const locate: MenuAction[] = searching
      ? [{
          label: "Bulunduğu klasöre git",
          icon: FolderOpen,
          onSelect: () => { setQuery(""); setTypeFilter("all"); setCwd(it.parentId); },
        }]
      : [];

    if (it.type === "folder" && it.folder) {
      const f = it.folder;
      if (!canManage(it)) return locate;
      return [
        ...locate,
        {
          label: "Yeniden adlandır",
          icon: Pencil,
          onSelect: () => (renameInPlace ? setRenaming(f.id) : setRenameTarget(it)),
        },
        moveAction(it),
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
           için hiçbir soru sorulmuyordu (2026-08-29). */
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

    if (it.type === "file") {
      const out: MenuAction[] = [...locate];
      if (it.previewable) out.push({ label: "Önizle", icon: Eye, onSelect: () => it.onOpen?.() });
      out.push({ label: "İndir", icon: Download, onSelect: () => download(id) });
      if (!canManage(it)) return out;
      out.push(moveAction(it));
      out.push(visibilityAction(it, (next) => setOperationDocumentVisibility(id, next), `v-${id}`));
      out.push({
        label: "Sil",
        icon: Trash2,
        danger: true,
        onSelect: async () => {
          if (!(await ask({ message: `"${it.name}" dosyası kalıcı olarak silinsin mi?` }))) return;
          run(`x-${id}`, () => deleteDocumentFile(id));
        },
      });
      return out;
    }

    if (it.type === "link") {
      if (!canManage(it)) return locate;
      const out: MenuAction[] = [...locate];
      if (onEditLink) out.push({ label: "Düzenle", icon: Pencil, onSelect: () => onEditLink(id) });
      out.push(moveAction(it));
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
      return out;
    }

    if (!canManage(it)) return locate;
    if (it.type === "doc") {
      /* Yazıda "Yeniden adlandır" YOK: başlık gövdeyle birlikte kaydedilir
         (saveTeamworkDoc), gövdesiz çağrı yazının içeriğini siler. Ad, yazının
         kendi editöründe değişir — olmayan bir eylemi menüye koymuyoruz. */
      return [
        ...locate,
        moveAction(it),
        visibilityAction(it, (next) => setOperationDocumentVisibility(id, next), `v-${id}`),
        {
          label: "Sil",
          icon: Trash2,
          danger: true,
          onSelect: async () => {
            if (!(await ask({ message: `"${it.name}" yazısı kalıcı olarak silinsin mi?` }))) return;
            run(`doc-${id}`, () => deleteOperationDocument(id));
          },
        },
      ];
    }
    if (it.type === "sheet") {
      /* Tabloda "Taşı" YOK: `operation_spreadsheets.folder_id`'yi güncelleyen
         bir sunucu aksiyonu henüz yazılmadı; olmayan bir eylemi menüye
         koymaktansa hiç göstermemek doğru. Ad ise değişebilir
         (renameOperationSpreadsheet) — Drive'ın gerisiyle aynı satır. */
      return [
        ...locate,
        { label: "Yeniden adlandır", icon: Pencil, onSelect: () => setRenameTarget(it) },
        visibilityAction(it, (next) => setOperationSpreadsheetVisibility(id, next), `v-${id}`),
        {
          label: "Sil",
          icon: Trash2,
          danger: true,
          onSelect: async () => {
            if (!(await ask({ message: `"${it.name}" tablosu kalıcı olarak silinsin mi?` }))) return;
            run(`sh-${id}`, () => deleteOperationSpreadsheet(id));
          },
        },
      ];
    }
    return locate;
  }

  /** Satırın/kartın ⋯ menüsü; eylem yoksa hiç çizilmez. */
  function renderMenu(it: DriveItem) {
    const actions = itemActions(it);
    if (actions.length === 0) return null;
    return <ItemMenu label={`${it.name} — seçenekler`} actions={actions} busy={isItemBusy(it)} />;
  }

  /* YENİ KLASÖR — kartın yerinde. Sayfanın tepesinde tam genişlikte bir kutu
     açılıyordu; yeniden adlandırma nasıl klasörün kendi kartında yapılıyorsa,
     yeni klasör de klasörlerin başında kendi boyunda bir kart olarak açılır. */
  const namingTile = naming ? (
    <FolderNameTile
      key="new-folder"
      initialName=""
      placeholder="Klasör adı"
      busy={busy === "folder"}
      onSave={(name) =>
        run(
          "folder",
          /* Varsayılan "all": klasör açan kişi aksini söylemedikçe ekip görür. */
          () => saveFolder(null, { name, parent_id: cwd, visibility: "all", section }),
          () => setNaming(false),
        )
      }
      onCancel={() => setNaming(false)}
    />
  ) : null;

  /* Arama açıkken kart/liste ayrımı kalkar: sonuçlar tek listede, yolu yazılı
     olarak durur — "hangi klasördeydi?" sorusunun cevabı orada. */
  const flat = searching || view === "list";
  const listItems = flat ? [...items.folders, ...items.files] : items.files;

  return (
    <section
      className="relative space-y-3"
      onDragEnter={(e) => {
        if (!dragHasFiles(e)) return;
        e.preventDefault();
        dragDepth.current += 1;
        setDragOver(true);
      }}
      onDragOver={(e) => {
        if (!dragHasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        if (!dragHasFiles(e)) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragOver(false);
      }}
      onDrop={(e) => {
        if (!dragHasFiles(e)) return;
        e.preventDefault();
        dragDepth.current = 0;
        setDragOver(false);
        const { files: dropped, folderNames } = splitDropped(e.dataTransfer);
        void uploadFiles(
          dropped,
          folderNames.map((n) => `${n}: klasör yüklenemez — içindeki dosyaları seçin.`),
        );
      }}
    >
      {/* SÜRÜKLE-BIRAK. Dosya yüklemenin tek yolu "Yükle" düğmesiydi; Drive'da
          alışılmış hareket dosyayı pencereye bırakmaktır. */}
      {dragOver && (
        <div className="anim-fade-down pointer-events-none absolute inset-0 z-30 grid place-items-center rounded-card border-2 border-dashed border-brand-ring bg-brand-soft/80 backdrop-blur-[1px]">
          <span className="flex items-center gap-2 rounded-control bg-surface px-3 py-2 text-[13px] font-semibold text-ink shadow-pop">
            <Upload size={15} aria-hidden />
            {trail.length > 0 ? `"${trail[trail.length - 1].name}" klasörüne bırakın` : `${rootLabel} köküne bırakın`}
          </span>
        </div>
      )}

      {/* Kırıntı yolu + üretim düğmeleri */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* TEK SATIR: Geri · kırıntı yolu · üretim. Kökteyken kırıntı yolu hiç
            çizilmez — nerede olduğunu uygulama çubuğu zaten söylüyor.
            `overflow-x-auto`: derin klasörde yol uzayınca gövde YATAY
            KAYMASIN, yol kendi kabında kaysın. */}
        <nav
          aria-label="Klasör yolu"
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-[13.5px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {leading}
          {trail.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setCwd(null)}
                title={rootLabel}
                aria-label={rootLabel}
                className="tap-target ml-1 inline-flex h-8 shrink-0 items-center rounded-control px-1.5 text-muted transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring"
              >
                <Home size={14} />
              </button>
              {trail.map((f, i) => (
                <span key={f.id} className="inline-flex shrink-0 items-center gap-1">
                  <ChevronRight size={12} className="text-subtle" aria-hidden />
                  <button
                    type="button"
                    onClick={() => setCwd(f.id)}
                    aria-current={i === trail.length - 1 ? "location" : undefined}
                    className={cn(
                      "inline-flex h-8 max-w-[14rem] items-center truncate rounded-control px-1.5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring",
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

        {/* ÜRETİM DÜĞMELERİ — beşi de AÇIK, menü arkasında değil.
            Sıraç (2026-08-29): "Bunları ayrı ayrı verelim sağ üstte, açık
            olsun ve anlaşılır olsun. Klasör sarımsı, Excel yeşil, Word mavi."
            Renkler uydurulmadı: listedeki dosya ikonlarının rengiyle AYNI
            kaynaktan (lib/office/file-kind.ts) geliyor.
            Dar ekranda yazılar gizlenir, ikon kalır. */}
        <div className="flex shrink-0 items-center gap-1.5">
          {/* KLASÖR herkese açık: üye de kendi çalışma alanını kurabilmeli.
              Açtığı klasörü yalnız kendisi yönetir (canManage + RLS 20240334). */}
          <CreateButton
            icon={FolderPlus}
            label="Klasör"
            title="Yeni klasör"
            hex={KIND_FOLDER.hex}
            /* Süzgeç de sıfırlanır: "Yüklenen dosya" süzgeci açıkken klasör
               açılınca yeni klasör listeye hiç düşmüyordu. */
            onPick={() => { setQuery(""); setTypeFilter("all"); setRenaming(null); setNaming(true); }}
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
              /* Renk ELLE YAZILMAZ: listedeki bağlantı ikonunun rengiyle aynı
                 kaynaktan gelir (lib/office/file-kind.ts). */
              hex={LINK_HEX}
              onPick={() => onNewLink(cwd)}
            />
          )}
          <CreateButton
            icon={Upload}
            label="Yükle"
            title="Dosya yükle — birden fazla seçebilir ya da sürükleyip bırakabilirsiniz"
            hex={UPLOAD_HEX}
            busy={uploading}
            onPick={openFilePicker}
          />
          {/* `multiple`: on dosya seçilip biri yükleniyordu. */}
          <input ref={fileRef} type="file" multiple className="hidden" onChange={onPick} />
        </div>
      </div>

      {/* ARAMA · TÜR · GÖRÜNÜM. Süzgeç kuralı (CLAUDE.md): başlık · tür —
          fazlası satırın içinde yazar. Arama TÜM ağaçta çalışır; bulunan
          öğenin yolu satırın altında durur. */}
      {hasAnything && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search
              size={14}
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle"
            />
            <TextInput
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              /* Esc = aramadan çık. `type="search"` bazı tarayıcılarda kutuyu
                 kendiliğinden temizliyor, bazılarında hiçbir şey yapmıyordu. */
              onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); setQuery(""); } }}
              aria-label="Dosya ve klasörlerde ara"
              placeholder="Ara — tüm klasörlerde"
              className="h-9 pl-8 pr-8 pointer-coarse:h-11"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Aramayı temizle"
                title="Aramayı temizle"
                className="tap-target absolute right-1 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-control text-subtle transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring"
              >
                <X size={14} aria-hidden />
              </button>
            )}
          </div>

          <SelectInput
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as "all" | ItemType)}
            aria-label="Tür süzgeci"
            className="h-9 w-[8.5rem] shrink-0 text-[13px] pointer-coarse:h-11"
          >
            {TYPE_FILTERS.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </SelectInput>

          {/* Görünüm — Drive'daki gibi kart / liste. Aramada sonuç zaten tek
              liste olduğu için düğmeler pasif kalır. */}
          <div
            role="group"
            aria-label="Görünüm"
            className="ml-auto inline-flex h-9 shrink-0 items-center rounded-control border border-line bg-surface p-0.5 pointer-coarse:h-11"
          >
            <button
              type="button"
              onClick={() => setView("grid")}
              title={searching ? "Arama sonucu tek listede gösterilir" : "Kart görünümü"}
              aria-label="Kart görünümü"
              aria-pressed={view === "grid"}
              disabled={searching}
              className={cn(
                "inline-flex h-full items-center rounded-[6px] px-2.5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring disabled:cursor-not-allowed disabled:opacity-50",
                view === "grid" ? "bg-surface-sunken text-ink" : "text-subtle hover:text-ink",
              )}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              title={searching ? "Arama sonucu tek listede gösterilir" : "Liste görünümü"}
              aria-label="Liste görünümü"
              aria-pressed={view === "list"}
              disabled={searching}
              className={cn(
                "inline-flex h-full items-center rounded-[6px] px-2.5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring disabled:cursor-not-allowed disabled:opacity-50",
                view === "list" ? "bg-surface-sunken text-ink" : "text-subtle hover:text-ink",
              )}
            >
              <ListIcon size={15} />
            </button>
          </div>
        </div>
      )}

      {/* YÜKLEME DURUMU — kaçıncı dosya, hangi dosya, iptal ve hatalar. */}
      {upload && (
        <div
          role="status"
          aria-live="polite"
          className="anim-fade-down rounded-card border border-line bg-surface px-3 py-2.5 shadow-card"
        >
          {!upload.finished ? (
            <>
              <div className="flex items-center gap-2 text-[13px]">
                <Loader2 size={14} className="shrink-0 animate-spin text-brand" aria-hidden />
                <span className="shrink-0 font-medium text-ink tabular-nums">
                  Yükleniyor {Math.min(upload.done + 1, upload.total)}/{upload.total}
                </span>
                <span className="min-w-0 flex-1 truncate text-muted" title={upload.name}>
                  {upload.name}
                </span>
                {/* İptal SIRADAKİ dosyada geçerli: yarım kalan yükleme yarıda
                    kesilip depoda öksüz kayıt bırakmasın. */}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={cancelling}
                  onClick={() => { cancelUpload.current = true; setCancelling(true); }}
                >
                  {cancelling ? "İptal ediliyor…" : "İptal"}
                </Button>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-sunken">
                <div
                  className="h-full rounded-full bg-brand transition-[width] duration-300 ease-standard"
                  style={{ width: `${Math.round((upload.done / Math.max(1, upload.total)) * 100)}%` }}
                />
              </div>
            </>
          ) : (
            <div className="flex items-start gap-2">
              <AlertCircle size={15} className="mt-0.5 shrink-0 text-danger" aria-hidden />
              <div className="min-w-0 flex-1 space-y-1 text-[12.5px] leading-relaxed text-danger">
                <p className="font-semibold">Bazı dosyalar yüklenemedi</p>
                <ul className="space-y-0.5">
                  {upload.errors.map((m, i) => (
                    <li key={`${i}-${m}`} className="break-words">{m}</li>
                  ))}
                </ul>
              </div>
              <IconButton size="sm" aria-label="Kapat" onClick={() => setUpload(null)}>
                <X size={15} aria-hidden />
              </IconButton>
            </div>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="anim-fade-down rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">
          {error}
        </p>
      )}

      {resultCount === 0 && !naming ? (
        filtering ? (
          <EmptyState
            icon={SearchX}
            title="Eşleşen bir şey yok."
            description={
              searching
                ? `"${query.trim()}" için tüm klasörlerde arandı.`
                : "Seçilen türde kayıt bulunamadı."
            }
            action={
              <Button size="sm" variant="secondary" onClick={() => { setQuery(""); setTypeFilter("all"); }}>
                Süzgeci temizle
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={FolderOpen}
            title={cwd ? "Bu klasör boş." : "Henüz dosya yok."}
            description="Üstteki düğmelerle klasör, yazı ya da tablo oluşturun; bağlantı ekleyin ya da dosyayı buraya sürükleyip bırakın."
            action={
              <Button size="sm" variant="secondary" onClick={openFilePicker} loading={uploading}>
                <Upload size={14} aria-hidden /> Dosya yükle
              </Button>
            }
          />
        )
      ) : flat ? (
        /* LİSTE (ve arama sonucu) — tek tablo, klasörler üstte. */
        <div className="space-y-3">
          {namingTile && <TileGrid row>{namingTile}</TileGrid>}
          {searching && (
            <p className="text-[12.5px] text-muted">
              <span className="tabular-nums">{resultCount}</span> sonuç — tüm klasörlerde arandı.
            </p>
          )}
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

      {/* YENİDEN ADLANDIR — kart görünümü dışında ve tabloda. Kart
          görünümündeki klasör adını hâlâ kendi kartında yazıyoruz. */}
      {renameTarget && (
        <RenameDialog
          key={renameTarget.key}
          item={renameTarget}
          busy={busy === `rn-${renameTarget.id}`}
          onCancel={() => setRenameTarget(null)}
          onSave={(name) => applyRename(renameTarget, name)}
        />
      )}

      {/* TAŞI — hedef klasör ağacı. Klasör kendi altına taşınamaz (liste onu
          hiç göstermez), bulunduğu yer "burada" diye işaretlenir. */}
      {moving && (
        <Overlay
          open
          onClose={() => setMoving(null)}
          title="Taşı"
          size="sm"
          footer={
            <Button variant="ghost" size="sm" onClick={() => setMoving(null)}>
              Vazgeç
            </Button>
          }
        >
          <p className="mb-2 text-[12.5px] text-muted">
            <span className="font-medium text-ink">{moving.name}</span> hangi klasöre taşınsın?
          </p>
          <ul className="max-h-[46vh] space-y-0.5 overflow-y-auto">
            {moveTargets.map((t) => {
              const here = (t.id ?? null) === moving.parentId;
              return (
                <li key={t.id ?? "root"}>
                  <button
                    type="button"
                    onClick={() => applyMove(moving, t.id)}
                    disabled={here}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-control px-2 py-2 text-left text-[13.5px] transition-colors duration-150",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring",
                      here
                        ? "cursor-not-allowed bg-surface-sunken text-subtle"
                        : "text-ink hover:bg-surface-muted",
                    )}
                    style={{ paddingLeft: `${0.5 + t.depth * 0.9}rem` }}
                  >
                    {t.id === null ? (
                      <Home size={14} className="shrink-0 text-muted" aria-hidden />
                    ) : (
                      <FolderIcon size={14} className="shrink-0" style={{ color: KIND_FOLDER.hex }} aria-hidden />
                    )}
                    <span className="min-w-0 flex-1 truncate">{t.label}</span>
                    {here && <span className="shrink-0 text-[11.5px]">burada</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </Overlay>
      )}

      {/* ÖNİZLEME — görsel ve PDF yerinde açılır. Diğer türlerde indirme
          zaten tek anlamlı davranış olduğu için pencere hiç açılmaz. */}
      {preview && (
        <Overlay
          open
          onClose={() => setPreview(null)}
          title={preview.name}
          size="lg"
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>Kapat</Button>
              <Button size="sm" onClick={() => download(preview.id)} loading={busy === `dl-${preview.id}`}>
                <Download size={14} aria-hidden /> İndir
              </Button>
            </>
          }
        >
          {preview.loading ? (
            <div className="grid h-56 place-items-center text-muted">
              <Loader2 size={20} className="animate-spin" aria-hidden />
              <span className="sr-only">Önizleme yükleniyor</span>
            </div>
          ) : preview.error ? (
            <div role="alert" className="flex items-start gap-2 rounded-control border border-danger/30 bg-danger/10 px-3 py-2.5 text-[12.5px] leading-relaxed text-danger">
              <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden />
              <span className="min-w-0 break-words">{preview.error}</span>
            </div>
          ) : preview.url && preview.mode === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview.url}
              alt={preview.name}
              className="mx-auto max-h-[65vh] w-auto max-w-full rounded-control object-contain"
            />
          ) : preview.url ? (
            <iframe
              src={preview.url}
              title={preview.name}
              className="h-[65vh] w-full rounded-control border border-line bg-surface-sunken"
            />
          ) : null}
          <p className="mt-2 text-[12px] text-muted">
            Önizleme adresi kısa sürelidir; dosyayı saklamak için indirin.
          </p>
        </Overlay>
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

  /* Kapanma/konum davranışı ORTAK kuralda (lib/utils/use-anchored-menu):
     menünün kendi kaydırması yok sayılır, dışarıdaki kaydırmada menü düğmeyi
     TAKİP eder, düğme ekrandan çıkarsa kapanır. Esc'te odak düğmeye döner. */
  const closeMenu = useCallback(() => { setOpen(false); btnRef.current?.focus(); }, []);
  useAnchoredMenu({ open, onClose: closeMenu, triggerRef: btnRef, menuRef, reposition: place });

  return (
    <>
      <IconButton
        ref={btnRef}
        size="sm"
        aria-label={label}
        title="Seçenekler"
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
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-ring",
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
      className="inline-flex h-9 shrink-0 items-center gap-2 rounded-control border border-line bg-surface pl-1.5 pr-2.5 text-[13px] font-medium text-muted transition-[background-color,border-color,color,transform] duration-150 ease-standard hover:border-line-strong hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring active:scale-[0.98] disabled:cursor-not-allowed disabled:text-subtle disabled:opacity-70 sm:pr-3 pointer-coarse:h-11"
    >
      {/* ARTI ROZETİ — düğmeler "Word'e git" gibi okunuyordu (2026-08-29:
          "şu an sanki tıklayınca Word'e gidecekmiş gibi duruyor"). Rozet
          eylemin ÜRETMEK olduğunu ikonun kendisinde söyler. */}
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
    it.type === "folder" ? it.note ?? null : it.date ? new Date(it.date).toLocaleDateString("tr-TR") : null,
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
        {/* Arama sonucunda "nerede?" — yol her ekranda görünür. */}
        {item.path && (
          <span className="block truncate text-[12px] text-subtle" title={item.path}>{item.path}</span>
        )}
        <span className="block truncate text-[12px] text-muted sm:hidden">{metaOf(item)}</span>
      </span>
    </>
  );
  const cls =
    "flex min-w-0 items-center gap-2.5 rounded-control py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring";

  if (item.href && item.external) {
    return <a href={item.href} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>;
  }
  if (item.href) return <Link href={item.href} className={cls}>{inner}</Link>;
  return (
    <button type="button" onClick={item.onOpen} disabled={!item.onOpen} className={cn(cls, !item.onOpen && "cursor-default")}>
      {inner}
    </button>
  );
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
      <div className="hidden grid-cols-[minmax(0,1fr)_120px_140px_100px_44px] gap-3 border-b border-line px-3 py-2 sm:grid">
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
            onContextMenu={openMenuOnContext}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 transition-colors duration-150 hover:bg-surface-hover sm:grid-cols-[minmax(0,1fr)_120px_140px_100px_44px]"
          >
            <ItemName item={it} />
            <span className="hidden min-w-0 truncate text-[12.5px] text-muted sm:block">{it.kind.label}</span>
            <span className="hidden min-w-0 truncate text-[12.5px] text-muted sm:block">
              {it.ownerId ? memberNames[it.ownerId] ?? "—" : "—"}
            </span>
            <span className="hidden whitespace-nowrap text-right text-[12.5px] tabular-nums text-subtle sm:block">
              {it.date ? new Date(it.date).toLocaleDateString("tr-TR") : (it.note ?? "—")}
            </span>
            <span data-drive-menu="" className="flex items-center justify-end">{menu(it)}</span>
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
          <div
            key={it.key}
            onContextMenu={openMenuOnContext}
            className={cn("relative min-w-0", actions && "[&>a]:pr-11 [&>button]:pr-11")}
          >
            <Tile
              layout="row"
              href={it.href}
              external={it.external}
              onClick={it.href ? undefined : it.onOpen}
              title={it.name}
              /* Önce NE ZAMAN, sonra KİM. AD METNİ YAZILMAZ (2026-08-29):
                 kutucuğun meta satırı dar, ad tek harfe kırpılıyordu. Kimlik
                 avatardan okunur; tam ad title'dan ve sr-only metinden gelir. */
              metaNode={
                it.type === "folder" ? (
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
                 durumunu böyle gösterir. */
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
              <span
                data-drive-menu=""
                className="absolute right-1.5 top-1/2 z-[3] flex -translate-y-1/2 items-center"
              >
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
 * YENİDEN ADLANDIR PENCERESİ — kart görünümünün DIŞINDA kalan durumlar için.
 *
 * Kart görünümündeki klasör adı hâlâ kendi kartında değişir (FolderNameTile);
 * ama liste görünümünde ve arama sonucunda o kart ekranda yoktur, tablonun da
 * hiç kartı yoktur. Eskiden bu satır ya hiçbir şey yapmıyor ya da kullanıcıyı
 * zorla kart görünümüne atıp aramasını siliyordu.
 */
function RenameDialog({
  item, busy, onSave, onCancel,
}: {
  item: DriveItem;
  busy: boolean;
  onSave: (_name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(item.name);
  const clean = name.trim();

  return (
    <Overlay
      open
      onClose={onCancel}
      title="Yeniden adlandır"
      size="sm"
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>Vazgeç</Button>
          <Button size="sm" onClick={() => onSave(clean)} loading={busy} disabled={!clean}>
            Kaydet
          </Button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); if (clean) onSave(clean); }}>
        <TextInput
          autoFocus
          aria-label={item.type === "folder" ? "Klasör adı" : "Tablo adı"}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          disabled={busy}
        />
      </form>
    </Overlay>
  );
}

/**
 * Klasör adını KARTIN YERİNDE yazar — yeni klasör için de, yeniden adlandırma
 * için de aynı kart.
 *
 * Sıraç (2026-08-29): "Klasörü yeniden adlandırmak için üstte bu kadar büyük
 * şeyin çıkmasına gerek var mı? Neden klasörde yapamıyoruz bunu?"
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
    <div className="flex min-w-0 items-center gap-1 rounded-card border border-brand-ring bg-surface px-2 py-2 shadow-card">
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
        className="h-8 min-w-0 flex-1 font-medium"
      />
      <IconButton
        size="sm"
        aria-label="Kaydet"
        title="Kaydet"
        onClick={commit}
        disabled={busy || !name.trim()}
        className="text-brand hover:bg-brand-soft hover:text-brand-strong"
      >
        {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Check size={15} aria-hidden />}
      </IconButton>
      <IconButton size="sm" aria-label="Vazgeç" title="Vazgeç" onClick={onCancel}>
        <X size={15} aria-hidden />
      </IconButton>
    </div>
  );
}
