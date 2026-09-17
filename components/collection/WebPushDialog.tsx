"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Download, FileUp, Globe, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Overlay } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { pendingWebEdits, type PendingWebEdit } from "@/lib/actions/collection-web";
import {
  readExportedDescriptions, rewriteDescription, toImportCsv,
  type WebTextField,
} from "@/lib/collection/website-export";

/**
 * FÖYDEKİ DÜZENLEMELERİ SİTEYE GÖNDER — WooCommerce içe aktarım CSV'si.
 *
 * Sıraç (2026-09-17): "Ben CSV ile indirip direkt siteye yükleyebileyim."
 *
 * ÜÇ ADIM, SIRASIYLA. Kullanıcı bu işi zaten elle yapıyordu
 * (`17/wordpress/af-guncelleme-TAM.csv`, 182 satır, `ID,Description`) ve
 * kendi güvenlik alışkanlığını kurmuştu: önce TEST dosyası, sonra TAM.
 * Panel o alışkanlığı BOZMUYOR, aynı iki dosyayı kendisi üretiyor.
 *
 * NEDEN DIŞA AKTARIM İSTİYORUZ: sitedeki ham açıklamanın tek doğru kaynağı
 * WooCommerce'in kendi CSV'si. Store API aynı metni işlenmiş döndürüyor
 * (`<p>` sarmalı, kıvrılmış tırnaklar) ve o hâli geri yazmak akordeonu
 * çökertir — ayrıntı `lib/collection/website-export.ts` başında.
 */

const FIELD_LABEL: Record<WebTextField, string> = {
  designers_note: "Designer's Note",
  size_fit: "Size & Fit",
  details_care: "Details & Care",
};

interface Prepared {
  item: PendingWebEdit;
  description: string;
  written: WebTextField[];
  missing: WebTextField[];
  /** Ürün yüklenen dışa aktarımda hiç yok — CSV'ye giremez. */
  absent: boolean;
}

export function WebPushDialog({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<PendingWebEdit[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [raw, setRaw] = useState<Map<number, string> | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    pendingWebEdits().then((res) => {
      if (!alive) return;
      if ("error" in res) setLoadError(res.error);
      else setItems(res.items);
    });
    return () => { alive = false; };
  }, []);

  async function pickFile(file: File) {
    setReading(true);
    setFileError(null);
    try {
      const text = await file.text();
      const map = readExportedDescriptions(text);
      if (map.size === 0) {
        setFileError("Bu dosyada ürün bulunamadı. WooCommerce → Ürünler → Dışa Aktar ile indirilen CSV olmalı (ID ve Description sütunları).");
        setRaw(null);
        setFileName(null);
      } else {
        setRaw(map);
        setFileName(file.name);
      }
    } catch {
      setFileError("Dosya okunamadı.");
    } finally {
      setReading(false);
    }
  }

  const prepared = useMemo<Prepared[]>(() => {
    if (!items || !raw) return [];
    return items.map((item) => {
      const source = raw.get(item.webProductId);
      if (source === undefined) {
        return { item, description: "", written: [], missing: [], absent: true };
      }
      const res = rewriteDescription(source, item.texts);
      return { item, description: res.description, written: res.written, missing: res.missing, absent: false };
    });
  }, [items, raw]);

  const ready = prepared.filter((p) => p.written.length > 0);
  const problem = prepared.filter((p) => p.written.length === 0);

  function download(rows: Prepared[], kind: "DENEME" | "TAM") {
    const csv = toImportCsv(rows.map((r) => ({ id: r.item.webProductId, description: r.description })));
    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `af-koleksiyon-${kind}-${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Overlay
      open
      onClose={onClose}
      title="Değişiklikleri siteye gönder"
      hint="Panelde yazdıklarını WooCommerce'in içe aktarıcısına hazır CSV olarak indirir"
      size="lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>Kapat</Button>
          {ready.length > 0 && (
            <>
              <Button variant="secondary" size="sm" onClick={() => download(ready.slice(0, 1), "DENEME")}>
                <Download size={14} aria-hidden />
                Deneme (1 ürün)
              </Button>
              <Button size="sm" onClick={() => download(ready, "TAM")}>
                <Download size={14} aria-hidden />
                Tamamı ({ready.length} ürün)
              </Button>
            </>
          )}
        </>
      }
    >
      <div className="space-y-5">
        {/* ADIM 1 — bekleyenler */}
        <Step n={1} title="Siteye gidecek düzenlemeler" done={!!items && items.length > 0}>
          {loadError && <Alert>{loadError}</Alert>}
          {!items && !loadError && (
            <p className="flex items-center gap-2 text-[13px] text-muted">
              <Loader2 size={14} className="animate-spin" aria-hidden /> Föyler okunuyor…
            </p>
          )}
          {items && items.length === 0 && (
            <p className="text-[13px] text-muted">
              Föylerdeki üç web metni sitedekiyle aynı — gönderilecek bir değişiklik yok.
            </p>
          )}
          {items && items.length > 0 && (
            <ul className="divide-y divide-line rounded-card border border-line">
              {items.map((it) => (
                <li key={it.sheetId} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-3 py-2">
                  <span className="text-[13.5px] font-semibold text-ink">{it.title}</span>
                  {it.webName && it.webName !== it.title && (
                    <span className="text-[12px] text-subtle">sitede: {it.webName}</span>
                  )}
                  <span className="ml-auto flex gap-1">
                    {(Object.keys(it.texts) as WebTextField[]).map((f) => (
                      <span key={f} className="rounded-full bg-brand-soft px-2 py-0.5 text-[11.5px] font-medium text-brand-strong">
                        {FIELD_LABEL[f]}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Step>

        {/* ADIM 2 — güncel dışa aktarım */}
        <Step n={2} title="WooCommerce'den güncel dışa aktarımı yükle" done={!!raw}>
          <p className="mb-2 text-[12.5px] leading-relaxed text-muted">
            Sitede <strong className="font-semibold text-ink">Ürünler → Dışa Aktar → Tüm ürünler</strong> ile
            CSV indir, sonra burada seç. Sitedeki açıklamanın ham hâli yalnız o dosyada bulunuyor;
            metni oradan alıp yalnız ilgili bölümü değiştiriyoruz, akordeonun kalanına dokunmuyoruz.
          </p>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickFile(f); }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => fileInput.current?.click()} disabled={reading}>
              {reading ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <FileUp size={14} aria-hidden />}
              {fileName ? "Başka dosya seç" : "CSV seç"}
            </Button>
            {fileName && (
              <span className="text-[12.5px] text-muted">
                <Check size={13} className="mr-1 inline text-success" aria-hidden />
                {fileName} · {raw?.size} ürün okundu
              </span>
            )}
          </div>
          {fileError && <Alert>{fileError}</Alert>}
        </Step>

        {/* ADIM 3 — sonuç */}
        <Step n={3} title="İndir ve siteye yükle" done={ready.length > 0}>
          {!raw && <p className="text-[13px] text-muted">Önce 2. adımdaki dosyayı seç.</p>}
          {raw && (
            <>
              <p className="text-[13px] text-ink">
                <strong className="font-semibold">{ready.length} ürün</strong> güncellenmeye hazır
                {problem.length > 0 && <> · <span className="text-warning">{problem.length} ürün gönderilemiyor</span></>}
              </p>
              {problem.length > 0 && (
                <ul className="mt-2 space-y-1 rounded-card border border-warning/30 bg-warning/5 px-3 py-2">
                  {problem.map((p) => (
                    <li key={p.item.sheetId} className="text-[12.5px] text-ink">
                      <AlertTriangle size={12} className="mr-1 inline text-warning" aria-hidden />
                      <span className="font-medium">{p.item.title}</span>{" "}
                      {p.absent
                        ? "— bu ürün yüklediğin dosyada yok (dışa aktarımı yenile)"
                        : `— sitede ${p.missing.map((f) => FIELD_LABEL[f]).join(", ")} bölümü yok, elle açılmalı`}
                    </li>
                  ))}
                </ul>
              )}
              {ready.length > 0 && (
                <ol className="mt-3 space-y-1.5 text-[12.5px] leading-relaxed text-muted">
                  <li><strong className="font-semibold text-ink">1.</strong> Önce <em>Deneme</em> dosyasını indir — tek ürün.</li>
                  <li><strong className="font-semibold text-ink">2.</strong> Sitede <strong className="font-semibold text-ink">Ürünler → İçe Aktar</strong>, dosyayı seç,
                    <strong className="font-semibold text-ink"> &ldquo;Mevcut ürünleri güncelle&rdquo;</strong> işaretli olsun.</li>
                  <li><strong className="font-semibold text-ink">3.</strong> O ürünün sayfasını sitede aç, akordeon düzgünse <em>Tamamı</em> dosyasını yükle.</li>
                </ol>
              )}
              <p className="mt-3 rounded-control bg-surface-muted px-3 py-2 text-[12px] leading-relaxed text-muted">
                Dosyada yalnız <code className="font-mono text-[11.5px]">ID</code> ve{" "}
                <code className="font-mono text-[11.5px]">Description</code> sütunları var; fiyat, stok, kategori
                ve beden bilgisi CSV&apos;de bulunmadığı için siteye dokunmaz. İçe aktarım geri alınamaz — deneme adımını atlamayın.
              </p>
            </>
          )}
        </Step>
      </div>
    </Overlay>
  );
}

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-ink">
        <span
          className={cn(
            "grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold",
            done ? "bg-success text-white" : "bg-surface-muted text-muted",
          )}
          aria-hidden
        >
          {done ? <Check size={12} /> : n}
        </span>
        {title}
      </h3>
      <div className="pl-7">{children}</div>
    </section>
  );
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-2 flex items-start gap-1.5 rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">
      <Globe size={13} className="mt-0.5 shrink-0" aria-hidden />
      {children}
    </p>
  );
}
