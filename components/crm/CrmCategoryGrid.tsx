"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Award, Building2, Crown, Factory, Handshake, Newspaper,
  Search, Users, UsersRound, CalendarClock, FolderOpen,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Tile, TileGrid } from "@/components/ui/TileGrid";
import { TextInput } from "@/components/ui/Field";
import { CRM_CATEGORIES, crmCategoryOfSegment } from "@/lib/crm/constants";
import type { WorkspaceContact } from "@/types";

/**
 * CRM GİRİŞİ — önce kutular, sonra içerik.
 *
 * Aslı Hanım (2026-09-07):
 *   "BU CRM'E BÖYLE GİREMEZSİN. Bak her girdiğin dosya BÖYLE BAŞLAMALI."
 *   "Yani şimdi burada girersen böyle DİREKT SEN DOSYAYA GİRİYORSUN."
 *   "AF Teamwork'ü anlamışsın. Böyle KUTU KUTU yapmayı. Şuradaki gibi,
 *    COLLECTION'daki gibi… Ben de diyorum ki BÜTÜN TASARIMI BÖYLE YAP."
 *
 * Bu ekran o talimatın CRM karşılığı: giriş artık bir tablo değil, Pano kişi
 * kartıyla aynı dilden kutucuklar (components/ui/TileGrid — uygulamanın TEK
 * giriş deseni). Kutuya tıklayınca o kategorinin listesi açılır.
 *
 * Karttaki sayı KİŞİ PUANLAMAZ, listeyi TARİF eder ("12 kişi") — sadelik
 * kuralının serbest bıraktığı taraf.
 *
 * Arama kutuların ÜSTÜNDE durur: bir ismi arayan kişi hangi kutuda olduğunu
 * bilmek zorunda değildir; eşleşen kutular süzülür.
 */

const CATEGORY_ICON: Record<string, LucideIcon> = {
  celebrity: Award,
  basin: Newspaper,
  vip: Crown,
  outsource: Factory,
  toplanti: CalendarClock,
  dis_ekip: Handshake,
  uretim: Building2,
  ekibimiz: UsersRound,
  dernek: Users,
  diger: FolderOpen,
};

/** Kutu kimliği — her kategori her açılışta AYNI renkte (Collection ile aynı
 *  yaklaşım: renk kimliktir, dekor değil). */
const CATEGORY_HEX: Record<string, string> = {
  celebrity: "#b03a2e",
  basin: "#43526b",
  vip: "#8a5e14",
  outsource: "#2f6142",
  toplanti: "#28448f",
  dis_ekip: "#5b3d84",
  uretim: "#82551a",
  ekibimiz: "#15665b",
  dernek: "#4a5262",
  diger: "#5c636b",
};

function norm(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/İ/g, "i");
}

export function CrmCategoryGrid({ contacts }: { contacts: WorkspaceContact[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  /* Kutu başına kayıt sayısı — tanınmayan segment "Diğer"e düşer, hiçbir kayıt
     kaybolmaz. */
  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const c of contacts) {
      const cat = crmCategoryOfSegment(c.segment);
      out[cat.key] = (out[cat.key] ?? 0) + 1;
    }
    return out;
  }, [contacts]);

  /* Aranan metin bir KİŞİ adıysa, o kişinin bulunduğu kutular kalır. Boş
     aramada bütün kutular görünür — giriş ekranı hep aynı yeri gösterir. */
  const visible = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return CRM_CATEGORIES;
    const hit = new Set<string>();
    for (const c of contacts) {
      const hay = norm([c.name, c.organization, c.role_label, c.email, c.notes].filter(Boolean).join(" "));
      if (hay.includes(q)) hit.add(crmCategoryOfSegment(c.segment).key);
    }
    return CRM_CATEGORIES.filter(
      (cat) => hit.has(cat.key) || norm(cat.label).includes(q),
    );
  }, [contacts, query]);

  return (
    <div className="anim-fade">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-ink sm:text-xl">Kimlerle çalışıyoruz?</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            Bir kutuya tıklayın — o gruptaki kişiler açılır, yeni kayıt da orada oluşur.
          </p>
        </div>
        <label className="relative w-full max-w-xs">
          <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ada göre ara — Sabri, Berna, Meral…"
            aria-label="Kişi ara"
            className="pl-9"
          />
        </label>
      </div>

      <TileGrid>
        {visible.map((cat) => {
          const n = counts[cat.key] ?? 0;
          return (
            <Tile
              key={cat.key}
              onClick={() => router.push(`/crm?k=${cat.key}`)}
              title={cat.label}
              meta={n > 0 ? `${n} kişi` : cat.hint}
              icon={CATEGORY_ICON[cat.key] ?? FolderOpen}
              colorHex={CATEGORY_HEX[cat.key] ?? "#5c636b"}
            />
          );
        })}
      </TileGrid>

      {visible.length === 0 && (
        <p className="mt-6 text-center text-[13.5px] text-muted">
          “{query}” için kayıt bulunamadı.
        </p>
      )}
    </div>
  );
}
