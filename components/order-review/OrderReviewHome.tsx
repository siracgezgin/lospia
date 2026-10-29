"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, FileSpreadsheet, Plus } from "lucide-react";
import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import { createOrderReview, importOrderReview } from "@/lib/actions/order-reviews";
import { cn } from "@/lib/utils/cn";
import {
  formatDateTr, ORDER_REVIEW_GRID, ORDER_REVIEW_HEADERS, rowNo,
} from "@/lib/order-review/model";
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
        /* İLK GİRİŞ = BOŞ TABLO. "Henüz yok" yazısı formatın sistemde
           olduğunu saklıyordu (Sıraç, 29.10.2026: "formatı sistemde yapmadın
           mı da onlar girebilsin"). Excel'in sütunları burada görünür; ilk
           satıra tıklamak değerlendirmeyi açar. */
        <div className="anim-fade-up">
          <div className="hidden overflow-x-auto rounded-card border border-line bg-surface shadow-card lg:block">
            <div className="min-w-max">
              <div className={cn("border-b border-line-strong bg-surface-muted", ORDER_REVIEW_GRID)} role="row">
                {ORDER_REVIEW_HEADERS.map((h, i) => (
                  <div key={i} className="border-r border-hairline px-2 py-2.5 text-[11.5px] font-semibold uppercase leading-tight tracking-[0.04em] text-muted last:border-r-0" role="columnheader">
                    {h}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={create}
                disabled={creating || !!importing}
                className={cn("w-full text-left transition-colors hover:bg-surface-muted disabled:opacity-60", ORDER_REVIEW_GRID)}
              >
                {ORDER_REVIEW_HEADERS.map((_, i) => (
                  <div key={i} className="h-24 border-r border-hairline px-2 py-2.5 text-[13.5px] text-subtle last:border-r-0">
                    {i === 0 ? rowNo(0) : i === 1 ? "Yazmaya başlamak için tıklayın" : ""}
                  </div>
                ))}
              </button>
            </div>
          </div>
          <div className="rounded-card border border-line bg-surface p-4 shadow-card lg:hidden">
            <p className="text-[14px] font-semibold text-ink">Ürün {rowNo(0)}</p>
            <p className="mt-1 text-[13.5px] text-muted">
              {ORDER_REVIEW_HEADERS.slice(1, -1).join(" · ")}
            </p>
            <Button className="mt-3" onClick={create} loading={creating} disabled={!!importing}>
              {!creating && <Plus size={15} aria-hidden />} Yazmaya başla
            </Button>
          </div>
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
