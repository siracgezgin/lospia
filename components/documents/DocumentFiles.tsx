"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Folder, FolderPlus, Upload, Trash2, Loader2, Download, ChevronRight,
  FileText, Lock, Users, Pencil, Home,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  saveFolder, deleteFolder, uploadDocumentFile,
  getDocumentDownloadUrl, deleteDocumentFile,
} from "@/lib/actions/document-files";

export type DocFolder = {
  id: string;
  parent_id: string | null;
  name: string;
  visibility: "all" | "admin";
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
  memberNames: Record<string, string>;
  isAdmin: boolean;
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
export function DocumentFiles({ folders, files, memberNames, isAdmin }: Props) {
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
            <Home size={13} /> Dokümanlar
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

      {childFolders.length === 0 && childFiles.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface px-4 py-10 text-center text-[13px] text-subtle">
          Bu klasör boş. Dosya yükleyin ya da alt klasör açın.
        </p>
      ) : (
        <ul className="divide-y divide-hairline overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          {childFolders.map((f) => (
            <li key={f.id} className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-hover/60">
              <button onClick={() => setCwd(f.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                  <Folder size={16} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium text-ink">{f.name}</span>
                  <span className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-subtle">
                    {f.visibility === "admin"
                      ? <><Lock size={10} /> yalnız yönetici</>
                      : <><Users size={10} /> tüm ekip</>}
                  </span>
                </span>
              </button>
              {isAdmin && (
                <span className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    onClick={() => { setRenaming(f); setNaming(false); setFolderName(f.name); }}
                    className="rounded-md p-1.5 text-subtle transition-colors hover:bg-surface-muted hover:text-ink"
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
                        }),
                      )
                    }
                    className="rounded-md p-1.5 text-subtle transition-colors hover:bg-surface-muted hover:text-ink"
                    title={f.visibility === "admin" ? "Tüm ekibe aç" : "Yalnız yöneticiye kapat"}
                  >
                    {f.visibility === "admin" ? <Users size={13} /> : <Lock size={13} />}
                  </button>
                  <button
                    onClick={() => run(`d-${f.id}`, () => deleteFolder(f.id))}
                    disabled={busy === `d-${f.id}`}
                    className="rounded-md p-1.5 text-subtle transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                    title="Sil (yalnız boş klasör)"
                  >
                    {busy === `d-${f.id}` ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </button>
                </span>
              )}
            </li>
          ))}

          {childFiles.map((d) => (
            <li key={d.id} className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-hover/60">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-muted text-muted">
                <FileText size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-ink" title={d.file_name ?? d.title}>
                  {d.file_name ?? d.title}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[12px] text-subtle tabular-nums">
                  <span>{humanSize(d.file_size)}</span>
                  {d.created_by && <span>{memberNames[d.created_by] ?? "—"}</span>}
                  <span>{new Date(d.created_at).toLocaleDateString("tr-TR")}</span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => download(d.id)}
                  disabled={busy === `dl-${d.id}`}
                  className="rounded-md p-1.5 text-subtle transition-colors hover:bg-surface-muted hover:text-ink disabled:opacity-50"
                  title="İndir"
                >
                  {busy === `dl-${d.id}` ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                </button>
                <button
                  onClick={() => run(`x-${d.id}`, () => deleteDocumentFile(d.id))}
                  disabled={busy === `x-${d.id}`}
                  className="rounded-md p-1.5 text-subtle opacity-0 transition-all hover:bg-danger/10 hover:text-danger disabled:opacity-50 group-hover:opacity-100"
                  title="Sil"
                >
                  {busy === `x-${d.id}` ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="px-1 text-[12px] text-subtle">
        Tek dosya en fazla 25 MB. Klasörler varsayılan olarak yalnız yöneticiye açıktır;
        kilit simgesiyle tüm ekibe açabilirsiniz.
      </p>
    </section>
  );
}
