"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, FileSpreadsheet, Plus } from "lucide-react";
import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import { createOrderReview, importOrderReview } from "@/lib/actions/order-reviews";
import { formatDateTr } from "@/lib/order-review/model";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
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
        <EmptyState
          icon={ClipboardCheck}
          className="anim-fade-up"
          title="Henüz sipariş değerlendirmesi yok."
          description="Yeni bir değerlendirme açın ya da ekibin Excel şablonunu aktarın — fotoğraflar ve notlar birlikte gelir."
        />
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
