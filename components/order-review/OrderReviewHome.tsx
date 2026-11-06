"use client";

import { ClipboardCheck, MessageSquareText } from "lucide-react";
import { formatDateTr } from "@/lib/order-review/model";
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

/**
 * ESKİ ORDER REVIEW KAYITLARI — salt arşiv.
 *
 * Aslı Hanım (06.11.2026): "Buradan order review kalkıyor, Collection'ın
 * içine giriyor." Ürünün değerlendirmesi artık föyündeki "Toplantı notları"
 * sekmesinde. Bu sayfa menüde yok; eski kayıtlar föylere aktarılana kadar
 * (scripts/order-review-to-sheets.ts) adresle açılıp okunabilsin diye duruyor.
 * Yeni değerlendirme açılmaz, Excel aktarılmaz.
 */
export function OrderReviewHome({
  tiles, seasons,
}: {
  tiles: ReviewTile[];
  seasons: SwitchSeason[];
  seasonId?: string | null;
  workspaceId?: string;
}) {
  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      <h1 className="sr-only">Order Review</h1>
      <CollectionTabs active="siparis" actions={<SeasonSwitch seasons={seasons} />} />

      <div role="status" className="mb-4 flex items-start gap-2.5 rounded-card border border-brand/25 bg-brand-soft px-4 py-3 text-[13.5px] text-ink">
        <MessageSquareText size={16} className="mt-0.5 shrink-0 text-brand-strong" aria-hidden />
        <p className="min-w-0">
          <b className="font-semibold">Order Review ürünlerin içine taşındı.</b>{" "}
          Her ürünün değerlendirmesi artık Collection’da ürünün föyünde,
          <b className="font-semibold"> Toplantı notları</b> sekmesinde. Buradaki eski kayıtlar
          föylere aktarılana kadar okunabilir.
        </p>
      </div>

      {tiles.length === 0 ? (
        <p className="rounded-card border border-dashed border-line-strong px-4 py-6 text-center text-[13.5px] text-muted">
          Eski kayıt yok.
        </p>
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
