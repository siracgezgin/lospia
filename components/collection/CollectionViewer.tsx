"use client";

import { useMemo, useRef, useState } from "react";
import {
  Boxes, Upload, Search, ShieldAlert, Lock, Info, FileWarning, X,
} from "lucide-react";
import { parseDelimited, isSensitiveColumn, type ParsedTable } from "@/lib/utils/csv";
import { cn } from "@/lib/utils/cn";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";

interface Props {
  isAdmin: boolean;
}

const MAX_ROWS_RENDERED = 1000;
const MAX_BYTES = 8 * 1024 * 1024; // 8MB browser-parse guard

// Suggested mapping — shown as information only. No data is written anywhere.
const MAPPING_HINTS: { from: string; to: string }[] = [
  { from: "Ürün Adı / Kodu", to: "ürün adı / kodu" },
  { from: "Kumaş", to: "kumaş açıklaması" },
  { from: "Renk", to: "renk / varyant" },
  { from: "XS / S / M / L / XL", to: "beden dağılımı" },
  { from: "Perakende Satış Fiyatı TL", to: "perakende fiyat (hassas)" },
  { from: "Fatura kesilecek", to: "fatura aksiyonu (hassas)" },
];

export function CollectionViewer({ isAdmin }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showMapping, setShowMapping] = useState(false);

  function handleFile(file: File) {
    setError(null);
    if (file.size > MAX_BYTES) {
      setError("Dosya çok büyük (8 MB üzeri). Lütfen daha küçük bir CSV/TSV deneyin.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseDelimited(String(reader.result ?? ""));
        if (parsed.headers.length === 0) {
          setError("Dosya boş görünüyor veya okunamadı.");
          return;
        }
        setTable(parsed);
        setFileName(file.name);
        setQuery("");
      } catch {
        setError("Dosya okunurken bir sorun oluştu.");
      }
    };
    reader.onerror = () => setError("Dosya okunamadı.");
    reader.readAsText(file, "utf-8");
  }

  const filteredRows = useMemo(() => {
    if (!table) return [];
    const q = query.trim().toLowerCase();
    const rows = q
      ? table.rows.filter((r) => r.some((c) => c.toLowerCase().includes(q)))
      : table.rows;
    return rows;
  }, [table, query]);

  const shownRows = filteredRows.slice(0, MAX_ROWS_RENDERED);

  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      {/* Header */}
      <ModulePageHeader title="Collection" />

      {/* Read-only banner */}
      <div className="mb-4 flex items-start gap-2.5 rounded-card border border-info/30 bg-info/10 px-4 py-3">
        <ShieldAlert size={16} className="mt-0.5 shrink-0 text-info" />
        <div className="text-[13px] leading-relaxed text-ink">
          <span className="font-semibold">
            Bu alan şu anda yalnızca yöneticiler için salt okunur önizleme modundadır.
          </span>{" "}
          Supabase&apos;e kalıcı import yapılmıyor; dosya yalnızca tarayıcınızda geçici olarak
          okunur ve hiçbir yere yüklenmez.
        </div>
      </div>

      {/* Upload / controls */}
      {isAdmin ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          <Button onClick={() => fileRef.current?.click()}>
            <Upload size={15} />
            CSV / TSV önizle
          </Button>
          {table && (
            <>
              <div className="relative min-w-[200px] flex-1">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                <TextInput
                            value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Tabloda ara…"
                  aria-label="Tabloda ara"
                  className="pl-9"
                />
              </div>
              <Button variant="secondary" onClick={() => { setTable(null); setFileName(""); setQuery(""); }}>
                <X size={14} /> Temizle
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="mb-4 flex items-start gap-2.5 rounded-card border border-line bg-surface-muted px-4 py-3">
          <Lock size={15} className="mt-0.5 shrink-0 text-subtle" />
          <p className="text-[13px] text-muted">
            Koleksiyon dosyası önizlemesi yalnızca yöneticiler tarafından açılabilir.
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-card border border-danger/30 bg-danger/10 px-4 py-3 text-[13px] text-danger">
          <FileWarning size={15} className="shrink-0" /> {error}
        </div>
      )}

      {/* Table */}
      {table && (
        <>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
            <p className="text-[12px] text-subtle">
              <span className="font-medium text-muted">{fileName}</span> · {table.headers.length} sütun ·{" "}
              {filteredRows.length} satır{query ? ` (filtreli)` : ""}
              {filteredRows.length > MAX_ROWS_RENDERED && (
                <span className="text-warning"> — ilk {MAX_ROWS_RENDERED} satır gösteriliyor</span>
              )}
            </p>
            <button
              onClick={() => setShowMapping((s) => !s)}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-brand hover:text-brand-strong"
            >
              <Info size={13} /> Kolon eşleştirme fikri
            </button>
          </div>

          {showMapping && (
            <div className="mb-3 rounded-card border border-line bg-surface p-4 shadow-card">
              <div className="mb-2 flex items-center gap-1.5">
                <span className="rounded bg-surface-sunken px-2 py-0.5 text-[12px] font-medium uppercase tracking-wide text-subtle">
                  Hazırlık aşamasında
                </span>
                <p className="text-[13px] font-medium text-ink">Kolon eşleştirme yakında</p>
              </div>
              <p className="mb-3 text-[13px] text-muted">
                Bu yalnızca fikir amaçlıdır; hiçbir veri yazılmaz. İleride bu eşleştirme ile
                seçili kolonlar kontrollü şekilde sisteme alınabilecek.
              </p>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {MAPPING_HINTS.map((m) => (
                  <div key={m.from} className="flex items-center gap-2 text-[12px]">
                    <span className="rounded bg-surface-muted px-2 py-0.5 text-muted">{m.from}</span>
                    <span className="text-subtle">→</span>
                    <span className={cn("truncate", m.to.includes("hassas") ? "text-warning" : "text-muted")}>
                      {m.to}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-[12px] text-warning">
                <Lock size={12} /> Maliyet/fiyat gibi hassas kolonlar ileride Finans / Yönetim yetkisi gerektirecek.
              </p>
            </div>
          )}

          <div className="overflow-auto rounded-card border border-line bg-surface shadow-card" style={{ maxHeight: "70vh" }}>
            <table className="min-w-full text-[13px]">
              <thead className="sticky top-0 z-20">
                <tr>
                  {table.headers.map((h, i) => {
                    const sensitive = isSensitiveColumn(h);
                    return (
                      <th
                        key={i}
                        className={cn(
                          "border-b border-line bg-surface-muted px-3 py-2 text-left font-semibold whitespace-nowrap",
                          sensitive ? "text-warning" : "text-muted",
                          i === 0 && "sticky left-0 z-20 bg-surface-muted",
                        )}
                      >
                        <span className="inline-flex items-center gap-1">
                          {sensitive && <Lock size={11} />}
                          {h}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {shownRows.length === 0 ? (
                  <tr>
                    <td colSpan={table.headers.length} className="px-3 py-10 text-center text-[13px] text-subtle">
                      Eşleşen satır yok.
                    </td>
                  </tr>
                ) : (
                  shownRows.map((row, ri) => (
                    <tr key={ri} className="hover:bg-surface-hover">
                      {row.map((cell, ci) => (
                        <td
                          key={ci}
                          className={cn(
                            "max-w-[280px] truncate px-3 py-1.5 align-top text-muted",
                            ci === 0 && "sticky left-0 z-10 bg-surface font-medium text-ink",
                          )}
                          title={cell}
                        >
                          {cell || <span className="text-subtle">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Empty state (no file yet) */}
      {!table && !error && (
        <EmptyState
          icon={Boxes}
          title={isAdmin ? "Henüz dosya seçilmedi." : "Görüntülenecek veri yok."}
          description={
            isAdmin
              ? "Bir CSV/TSV dosyası seçin; yalnız tarayıcınızda okunur, hiçbir yere yüklenmez."
              : "Koleksiyon dosyası önizlemesini yalnız yöneticiler açabilir."
          }
        />
      )}
    </div>
  );
}
