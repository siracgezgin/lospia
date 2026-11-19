"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Crown, Plus, Search, UserRound } from "lucide-react";
import { Tile, TileGrid } from "@/components/ui/TileGrid";
import { TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { CustomerDialog } from "@/components/customers/CustomerDialog";
import { TIERS, type CustomerTier } from "@/lib/customers/model";

/**
 * MÜŞTERİLER — giriş: katman kutucukları (tek tasarım dili) + arama.
 * Kutucuğun altındaki sayı listeyi TARİF eder (o katmandaki kişi sayısı).
 */
export function CustomersHome({ counts, canMarkTop }: { counts: Record<string, number>; canMarkTop: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const meta = (key: CustomerTier, label: string) => `${label} · ${(counts[key] ?? 0).toLocaleString("tr-TR")}`;

  return (
    <div className="anim-fade">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form
          className="relative w-full min-w-0 sm:w-auto sm:max-w-sm sm:flex-1"
          onSubmit={(e) => { e.preventDefault(); if (query.trim()) router.push(`/customers?q=${encodeURIComponent(query.trim())}`); }}
        >
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
          <TextInput
            type="search"
            aria-label="Kişi ara"
            placeholder="Ad, e-posta ya da telefon"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </form>
        <Button size="sm" className="ml-auto" onClick={() => setAdding(true)}>
          <Plus size={14} aria-hidden /> Yeni kişi
        </Button>
      </div>

      <TileGrid>
        {TIERS.map((t) => (
          <Tile
            key={t.key}
            href={`/customers?t=${encodeURIComponent(t.key)}`}
            title={t.key}
            meta={meta(t.key, t.label)}
            icon={t.key === "A+" ? Crown : UserRound}
          />
        ))}
      </TileGrid>

      {adding && <CustomerDialog customer={null} defaultTier="C" canMarkTop={canMarkTop} onClose={() => setAdding(false)} />}
    </div>
  );
}
