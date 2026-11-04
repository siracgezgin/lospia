"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, FileSpreadsheet, ImagePlus, Loader2, Plus } from "lucide-react";
import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import { createOrderReview, importOrderReview } from "@/lib/actions/order-reviews";
import { cn } from "@/lib/utils/cn";
import { formatDateTr, rowNo } from "@/lib/order-review/model";
import { Button } from "@/components/ui/Button";
import { Tile, TileGrid } from "@/components/ui/TileGrid";
import { CollectionTabs } from "@/components/collection/PaymentTable";
import { SeasonSwitch, type SwitchSeason } from "@/components/collection/SeasonSwitch";

export type ReviewTile = {
  id: string;
  title: string;
  seasonName: string | null;
  reviewDate: string | null;
  itemCount: number;
  coverUrl: string | null;
};

/* Boş kartın alan taslakları — düzenleyicideki alanlarla aynı ölçü. */
function Label({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-[0.05em] text-muted">{children}</span>;
}
function Ghost({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <span className={cn("flex h-9 items-center rounded-control border border-line bg-surface px-2.5 text-[13.5px] text-subtle", className)}>
      {children}
    </span>
  );
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * ORDER REVIEW GİRİŞİ — değerlendirme kutucukları (TEK TASARIM DİLİ: giriş
 * her modülde TileGrid). Kutucuk = bir sipariş / referans; içinde ürün
 * satırları. Yeni değerlendirme boş açılır ya da ekibin Excel şablonundan
 * aktarılır.
 */
export function OrderReviewHome({
  tiles, seasons, seasonId, workspaceId,
}: {
  tiles: ReviewTile[];
  seasons: SwitchSeason[];
  seasonId: string | null;
  workspaceId: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [creating, startCreate] = useTransition();
  const [importing, setImporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function create() {
    setError(null);
    startCreate(async () => {
      try {
        const res = await createOrderReview({ season_id: seasonId });
        if ("error" in res) { setError(res.error); return; }
        router.push(`/collection/siparis/${res.id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Bağlantı kurulamadı.");
      }
    });
  }

  /* EXCEL'DEN AKTAR. Dosya önce tarayıcıdan doğrudan depoya gider (sunucu
     eyleminin 4,5 MB'lık gövde sınırı fotoğraflı Excel'i taşımaz), sonra
     sunucu onu okuyup kaydı açar ve geçici dosyayı siler. */
  async function importFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!/\.(xlsx|xlsm)$/i.test(file.name)) {
      setError("Yalnız .xlsx dosyası aktarılabilir. Eski .xls ise Excel'de .xlsx olarak kaydedin.");
      return;
    }
    setImporting(file.name);
    try {
      const supabase = createBrowserSupabase();
      const path = `${workspaceId}/_imports/${crypto.randomUUID()}.xlsx`;
      const { error: upErr } = await supabase.storage
        .from("documents")
        .upload(path, file, { contentType: XLSX_MIME, upsert: false });
      if (upErr) { setError(`Dosya yüklenemedi: ${upErr.message}`); return; }
      const res = await importOrderReview(path, file.name);
      if ("error" in res) { setError(res.error); return; }
      const q = res.warnings.length ? `?uyari=${encodeURIComponent(res.warnings.join("\n"))}` : "";
      router.push(`/collection/siparis/${res.id}${q}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Excel aktarılamadı.");
    } finally {
      setImporting(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const actions = (
    <>
      <SeasonSwitch seasons={seasons} />
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xlsm"
        className="hidden"
        onChange={(e) => importFile(e.target.files?.[0])}
      />
      <Button variant="secondary" onClick={() => fileRef.current?.click()} loading={!!importing} disabled={creating}>
        {!importing && <FileSpreadsheet size={15} aria-hidden />} Excel&apos;den aktar
      </Button>
      <Button onClick={create} loading={creating} disabled={!!importing}>
        {!creating && <Plus size={15} aria-hidden />} Yeni değerlendirme
      </Button>
    </>
  );

  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      <h1 className="sr-only">Order Review</h1>
      <CollectionTabs active="siparis" actions={actions} />

      {importing && (
        <p role="status" className="anim-fade-down mb-3 rounded-control border border-line bg-surface px-3 py-2 text-[13.5px] text-muted">
          “{importing}” aktarılıyor — fotoğraflar yükleniyor…
        </p>
      )}
      {error && (
        <p role="alert" className="anim-fade-down mb-3 rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[13.5px] font-medium text-danger">
          {error}
        </p>
      )}

      {tiles.length === 0 ? (
        /* İLK GİRİŞ = BOŞ ÜRÜN KARTI. "Henüz yok" yazısı formatın sistemde
           olduğunu saklıyordu (Sıraç, 29.10.2026: "formatı sistemde yapmadın
           mı da onlar girebilsin"). Düzenleyicideki kartın aynısı boş hâliyle
           görünür; tıklamak değerlendirmeyi ilk ürünüyle açar. */
        <div className="anim-fade-up">
          <button
            type="button"
            onClick={create}
            disabled={creating || !!importing}
            className="group block w-full rounded-card border border-line bg-surface text-left shadow-card transition-[border-color,box-shadow] duration-150 hover:border-brand hover:shadow-pop disabled:opacity-60"
          >
            <span className="flex flex-wrap items-center gap-2 border-b border-hairline px-3 py-2.5 sm:px-4">
              <span className="grid h-9 min-w-9 place-items-center rounded-control bg-surface-muted px-1.5 text-[13px] font-semibold tabular-nums text-muted">{rowNo(0)}</span>
              <Ghost className="min-w-0 flex-1 sm:w-28 sm:flex-none">Kod</Ghost>
              <Ghost className="basis-full sm:min-w-[12rem] sm:flex-1 sm:basis-auto max-sm:order-last">Ürün grubu</Ghost>
              <span className="ml-auto inline-flex h-9 items-center rounded-full bg-surface-sunken px-3 text-[13px] font-semibold text-muted">Değerlendirmede</span>
            </span>
            <span className="grid gap-4 p-3 sm:p-4 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,300px)_minmax(0,1fr)_minmax(0,1fr)]">
              <span className="grid grid-cols-2 gap-3 max-md:max-w-sm md:row-span-2 xl:row-span-1">
                {["Orijinal", "Numune"].map((l) => (
                  <span key={l} className="min-w-0">
                    <Label>{l}</Label>
                    <span className="grid aspect-[3/4] place-items-center rounded-control border border-dashed border-line-strong bg-surface-muted/40 text-subtle">
                      <ImagePlus size={20} aria-hidden />
                    </span>
                  </span>
                ))}
              </span>
              <span className="min-w-0 space-y-3">
                <span className="block"><Label>Ürün kritikleri / deneme notları</Label><Ghost className="h-24" /></span>
                <span className="grid gap-3 sm:grid-cols-2">
                  {["Kumaş / içerik", "Önerilen renkler", "Planlanan adet", "Birim fiyat"].map((l) => (
                    <span key={l} className="block min-w-0"><Label>{l}</Label><Ghost /></span>
                  ))}
                </span>
              </span>
              <span className="block min-w-0 rounded-card border border-hairline bg-surface-muted/50 p-3">
                <Label>Aslı Hanım&apos;ın notları</Label>
                <span className="block rounded-control border border-dashed border-line-strong px-3 py-4 text-[13px] text-subtle">
                  Her toplantının notu kendi tarihiyle burada durur.
                </span>
              </span>
            </span>
            <span className="flex items-center justify-center gap-2 border-t border-hairline px-4 py-3 text-[14px] font-semibold text-brand-strong group-hover:bg-brand-soft">
              {creating ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Plus size={16} aria-hidden />}
              İlk ürünü yazmaya başlayın
            </span>
          </button>
          <p className="mt-3 text-[13.5px] text-muted">
            Elinizde dolu bir Excel varsa sağ üstten “Excel&apos;den aktar” ile fotoğraflarıyla birlikte getirebilirsiniz.
          </p>
        </div>
      ) : (
        <TileGrid>
          {tiles.map((t) => (
            <Tile
              key={t.id}
              href={`/collection/siparis/${t.id}`}
              title={t.title || "Adsız değerlendirme"}
              meta={[
                `${t.itemCount} ürün`,
                t.seasonName,
                formatDateTr(t.reviewDate),
              ].filter(Boolean).join(" · ")}
              photoUrl={t.coverUrl}
              icon={ClipboardCheck}
            />
          ))}
        </TileGrid>
      )}
    </div>
  );
}
