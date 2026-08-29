"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Folder, FolderPlus, Upload, Trash2, Loader2, Download, ChevronRight,
  FileText, Lock, Users, Pencil, Home, FilePlus2, PenLine,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Tile, TileGrid } from "@/components/ui/TileGrid";
import { personTone } from "@/lib/design/person-colors";
import {
  saveFolder, deleteFolder, uploadDocumentFile,
  getDocumentDownloadUrl, deleteDocumentFile,
} from "@/lib/actions/document-files";
import { createTeamworkDoc, deleteOperationDocument } from "@/lib/actions/documents";

export type DocFolder = {
  id: string;
  parent_id: string | null;
  name: string;
  visibility: "all" | "admin";
  /** AF Teamwork mü Kütüphane mi (20240324). */
  section?: "teamwork" | "library";
};

/** Sistemde yazılan yazı (Word karşılığı, 20240325). */
export type DocItem = {
  id: string;
  title: string;
  folder_id: string | null;
  preview: string;
  created_by: string | null;
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
};

interface Props {
  folders: DocFolder[];
  files: DocFile[];
  /** Yazılar — Excel'in yanındaki "Word" (Aslı Hanım, 2026-08-28). */
  docs?: DocItem[];
  memberNames: Record<string, string>;
  isAdmin: boolean;
  /** Yeni klasörlerin açılacağı bölüm. Kök kırıntısının adı da bundan gelir. */
  section?: "teamwork" | "library";
  rootLabel?: string;
}

/** 1536000 → "1,5 MB" */
function humanSize(bytes: number | null): string {
  if (!bytes) return "—";
  const mb = bytes / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Dokümanlar — klasör ağacı + dosya.
 *
 * Aslı Hanım (2026-08-19): "Drive, Word, Excel hepsinin burada olduğu böyle
 * klasör şeklinde ayırmayı düşündüm… maliyetine bir bak." Maliyet araştırıldı
 * (Pro planda 100 GB dahil, AF'nin hacmi ~8,7 GB/yıl → ek maliyet ₺0), o yüzden
 * modül gerçek dosya saklamaya açıldı. Bugüne kadar yalnız dış bağlantı
 * tutuluyordu.
 *
 * Klasör görünürlüğü Aslı Hanım'ın ikinci cümlesinin karşılığı: "dökümanlara
 * herkesin erişimi olmayacak." Varsayılan YÖNETİCİ — modül açılınca içerik
 * sızmasın; klasör tek tek "tüm ekip"e açılır.
 */
export function DocumentFiles({
  folders, files, docs = [], memberNames, isAdmin, section = "teamwork",
  rootLabel = "Dokümanlar",
}: Props) {
  const router = useRouter();
  const [cwd, setCwd] = useState<string | null>(null);   // null = kök
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [renaming, setRenaming] = useState<DocFolder | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [, startWork] = useTransition();

  const childFolders = useMemo(
    () => folders.filter((f) => f.parent_id === cwd).sort((a, b) => a.name.localeCompare(b.name, "tr")),
    [folders, cwd],
  );
  const childFiles = useMemo(
    () => files.filter((f) => f.folder_id === cwd),
    [files, cwd],
  );
  const childDocs = useMemo(
    () => docs.filter((d) => d.folder_id === cwd),
    [docs, cwd],
  );

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
      // hata sessizce yutuluyordu — kullanıcı hiçbir şey görmüyor, dosya da
      // yüklenmiyordu. Bu teşhisi geciktiren asıl sebep buydu.
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
    fd.append("section", section);   // klasörsüz yükleme de doğru ekranda kalsın
    run("upload", () => uploadDocumentFile(fd));
  }

  function download(id: string) {
    run(`dl-${id}`, async () => {
      const res = await getDocumentDownloadUrl(id);
      if ("error" in res) return res;
      // İmzalı URL 60 saniye geçerli — yeni sekmede açılır, paylaşılan
      // bağlantı kalıcı erişim vermez.
      window.open(res.url, "_blank", "noopener");
      return {};
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Kırıntı yolu */}
        <nav className="flex min-w-0 flex-wrap items-center gap-1 text-[13px]">
          <button
            onClick={() => setCwd(null)}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors",
              cwd === null ? "font-semibold text-ink" : "text-muted hover:text-ink",
            )}
          >
            <Home size={13} /> {rootLabel}
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
        </nav>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {isAdmin && (
            <button
              onClick={() => { setNaming(true); setRenaming(null); setFolderName(""); }}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-muted transition-all duration-150 hover:border-line-strong hover:bg-surface-muted hover:text-ink active:scale-[0.98]"
            >
              <FolderPlus size={14} /> Klasör
            </button>
          )}
          {/* YENİ YAZI — Aslı Hanım (2026-08-28): "Excel'in yanına Word'ü de
              gir." Yazı sistemde açılıp düzenlenir; dosya gibi indirilip başka
              programda açılmaz. */}
          <button
            onClick={() =>
              run("newdoc", async () => {
                const res = await createTeamworkDoc({ title: "Adsız yazı", folder_id: cwd, section });
                if ("error" in res) return res;
                router.push(`/documents/${res.id}`);
                return {};
              })
            }
            disabled={busy === "newdoc"}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-muted transition-all duration-150 hover:border-brand hover:text-brand active:scale-[0.98] disabled:opacity-60"
          >
            {busy === "newdoc" ? <Loader2 size={14} className="animate-spin" /> : <FilePlus2 size={14} />}
            Yeni yazı
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy === "upload"}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-[13px] font-medium text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
          >
            {busy === "upload" ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Dosya yükle
          </button>
          <input ref={fileRef} type="file" className="hidden" onChange={onPick} />
        </div>
      </div>

      {error && (
        <p className="anim-fade-down rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">
          {error}
        </p>
      )}

      {(naming || renaming) && (
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
                  saveFolder(renaming?.id ?? null, {
                    name: folderName,
                    parent_id: renaming ? renaming.parent_id : cwd,
                    visibility: renaming?.visibility ?? "admin",
                    section: renaming?.section ?? section,
                  }),
                () => { setNaming(false); setRenaming(null); setFolderName(""); },
              )
            }
            disabled={!folderName.trim() || busy === "folder"}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-[13px] font-medium text-white hover:bg-brand-strong disabled:opacity-60"
          >
            {busy === "folder" ? <Loader2 size={14} className="animate-spin" /> : null} Kaydet
          </button>
          <button
            onClick={() => { setNaming(false); setRenaming(null); setFolderName(""); }}
            className="h-9 rounded-lg px-2 text-[13px] font-medium text-muted hover:text-ink"
          >
            İptal
          </button>
        </div>
      )}

      {/* KLASÖRLER — kutucuk. Aslı Hanım (2026-08-28): "Sen şu document
          kısmını da bu collection ve board kısmı gibi yapabilir misin? File
          file gibi." Ortak primitif: components/ui/TileGrid.tsx.
          Yönetici düğmeleri kutucuğun ÜSTÜNDE kardeş katman olarak durur —
          <button> içinde <button> geçersiz HTML'dir. */}
      {(childFolders.length > 0 || childDocs.length > 0 || childFiles.length > 0) && (
        <TileGrid className="mb-1">
          {childFolders.map((f) => {
            const n = files.filter((x) => x.folder_id === f.id).length
              + docs.filter((x) => x.folder_id === f.id).length;
            const sub = folders.filter((x) => x.parent_id === f.id).length;
            return (
              <div key={f.id} className="group/tile relative">
                <Tile
                  onClick={() => setCwd(f.id)}
                  title={f.name}
                  meta={[
                    sub > 0 ? `${sub} klasör` : null,
                    `${n} öğe`,
                    f.visibility === "admin" ? "yalnız yönetici" : null,
                  ].filter(Boolean).join(" · ")}
                  icon={Folder}
                  colorHex={personTone(f.id).hex}
                />
                {isAdmin && (
                  <span className="absolute right-2 top-2 z-[3] flex items-center gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/tile:opacity-100">
                    <button
                      onClick={() => { setRenaming(f); setNaming(false); setFolderName(f.name); }}
                      className="tap-target rounded-md bg-surface/90 p-1.5 text-subtle shadow-sm backdrop-blur transition-colors hover:text-ink"
                      title="Yeniden adlandır"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
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
                      className="tap-target rounded-md bg-surface/90 p-1.5 text-subtle shadow-sm backdrop-blur transition-colors hover:text-ink"
                      title={f.visibility === "admin" ? "Tüm ekibe aç" : "Yalnız yöneticiye kapat"}
                    >
                      {f.visibility === "admin" ? <Users size={13} /> : <Lock size={13} />}
                    </button>
                    <button
                      onClick={() => run(`d-${f.id}`, () => deleteFolder(f.id))}
                      disabled={busy === `d-${f.id}`}
                      className="tap-target rounded-md bg-surface/90 p-1.5 text-subtle shadow-sm backdrop-blur transition-colors hover:text-danger disabled:opacity-50"
                      title="Sil (yalnız boş klasör)"
                    >
                      {busy === `d-${f.id}` ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </button>
                  </span>
                )}
              </div>
            );
          })}

          {/* YAZILAR — klasörlerle AYNI kart. Aslı Hanım (2026-08-29):
              "Dokümanlar ve Bağlantılar kısmı da kart olsun, hepsi aynı
              mantıkta olsun artık tüm sayfalarda." Önce alt alta liste
              satırlarıydı; klasörler kart, dosyalar liste olunca aynı ekranda
              iki ayrı dil konuşuluyordu. */}
          {childDocs.map((d) => (
            <div key={d.id} className="group/tile relative">
              <Tile
                href={`/documents/${d.id}`}
                title={d.title}
                meta={[
                  d.preview || "Boş yazı",
                  new Date(d.updated_at).toLocaleDateString("tr-TR"),
                ].filter(Boolean).join(" · ")}
                icon={PenLine}
                colorHex="#2563c9"
              />
              {isAdmin && (
                <span className="absolute right-2 top-2 z-[3] opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/tile:opacity-100">
                  <button
                    onClick={() => {
                      if (!confirm(`"${d.title}" yazısı kalıcı olarak silinsin mi?`)) return;
                      run(`doc-${d.id}`, () => deleteOperationDocument(d.id));
                    }}
                    disabled={busy === `doc-${d.id}`}
                    className="tap-target rounded-md bg-surface/90 p-1.5 text-subtle shadow-sm backdrop-blur transition-colors hover:text-danger disabled:opacity-50"
                    title="Sil"
                  >
                    {busy === `doc-${d.id}` ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </button>
                </span>
              )}
            </div>
          ))}

          {/* DOSYALAR — aynı kart; tıklayınca imzalı bağlantıyla iner. */}
          {childFiles.map((d) => (
            <div key={d.id} className="group/tile relative">
              <Tile
                onClick={() => download(d.id)}
                title={d.file_name ?? d.title}
                meta={[
                  humanSize(d.file_size),
                  d.created_by ? memberNames[d.created_by] ?? null : null,
                  new Date(d.created_at).toLocaleDateString("tr-TR"),
                ].filter(Boolean).join(" · ")}
                icon={busy === `dl-${d.id}` ? Loader2 : FileText}
              />
              <span className="absolute right-2 top-2 z-[3] flex items-center gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/tile:opacity-100">
                <button
                  onClick={() => download(d.id)}
                  disabled={busy === `dl-${d.id}`}
                  className="tap-target rounded-md bg-surface/90 p-1.5 text-subtle shadow-sm backdrop-blur transition-colors hover:text-ink disabled:opacity-50"
                  title="İndir"
                >
                  <Download size={13} />
                </button>
                <button
                  onClick={() => run(`x-${d.id}`, () => deleteDocumentFile(d.id))}
                  disabled={busy === `x-${d.id}`}
                  className="tap-target rounded-md bg-surface/90 p-1.5 text-subtle shadow-sm backdrop-blur transition-colors hover:text-danger disabled:opacity-50"
                  title="Sil"
                >
                  {busy === `x-${d.id}` ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </button>
              </span>
            </div>
          ))}
        </TileGrid>
      )}

      {childFolders.length === 0 && childFiles.length === 0 && childDocs.length === 0 && (
        /* Sola yaslı ve alçak: metin çok geniş bir kutunun ortasında asılı
           kalıyordu. Altındaki "25 MB / görünürlük" bilgi satırı da kaldırıldı —
           sınır aşılınca zaten hata çıkıyor, kilit simgesinin de ipucu var. */
        <p className="rounded-xl border border-dashed border-line bg-surface px-4 py-6 text-[13px] text-subtle">
          Bu klasör boş. Yazı açın, dosya yükleyin ya da alt klasör oluşturun.
        </p>
      )}

    </section>
  );
}
