"use client";

import { useMemo } from "react";
import { LayoutList } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tile, TileGrid } from "@/components/ui/TileGrid";
import { getPersonDisplayName, getPersonInitials } from "@/lib/utils/person-display";
import { assignPersonTones, type PersonChoice } from "@/lib/design/person-colors";

export type GridPerson = {
  /** personFilter değeri — "member:<uuid>" ya da "contact:<uuid>". */
  filterKey: string;
  /** Renk/ikon tohumu — kişinin kalıcı id'si. */
  id: string;
  name: string;
  avatarUrl?: string | null;
  isAdmin?: boolean;
  /** Ayarlar'dan girilen ünvan (20240323). Boşsa rolden türetilen etiket. */
  jobTitle?: string | null;
};

interface Props {
  people: GridPerson[];
  /** Şu an giriş yapan kişinin filterKey'i — kendi kartı öne alınır. */
  meKey?: string | null;
  onPick: (_filterKey: string) => void;
  onShowAll: () => void;
  /** Yöneticinin Ayarlar'dan seçtiği renk/ikon (id → seçim). Boşsa otomatik. */
  choices?: Record<string, PersonChoice>;
}

/**
 * Pano giriş ekranı — kişiler.
 *
 * Aslı Hanım (2026-08-19):
 *   "Ben ya burada dört sayfa göreyim… Gül, Selen, Kısmet, Nisa, Aslı, Esin,
 *    Sıraç diye göreyim. Ya onların renklerine gireyim ve işler açılsın."
 *
 * Yani kişi seçimi bir FİLTRE DEĞİL, panonun kapısıdır. Departman başlıkları
 * ("Üretim ve Tedarik Zinciri", "Finans ve Operasyon") burada bilerek yoktur —
 * "yoruyor onlar bizi".
 *
 * Kart kimliği FOTOĞRAFTIR; fotoğrafı olmayan kişi kendi renginde bir daire
 * içinde baş harfleriyle çıkar (eskiden rastgele sembol ikonlarla çiziliyordu —
 * sembol kimseyi tanıtmıyordu).
 *
 * KART ÜZERİNDE RAKAM YOKTUR. Bir süre kartın altında "devam / bitti /
 * gecikti / zamanında" şeridi ve sağda büyük bir açık-iş sayısı duruyordu;
 * Aslı Hanım (2026-08-24) ikisini de kaldırttı:
 *   "O 0, 4 ne onlar?" → "Orada alttaki şeyleri kaldır."
 *   "Boş hesap istemiyorum. Kimseyi orada puanlamak istemiyorum.
 *    Mühendis gibi hissetmek istemiyorum."
 * Kart bu yüzden yalnız kimlik taşır: renk, ikon, isim. Sayı istiyorsan
 * kişinin panosunu aç — orada zaten işin kendisi var.
 *
 * Sıralama da bu yüzden yüke göre DEĞİL alfabetiktir: kartlar her açılışta
 * aynı yerde dursun, kişi aradığı ismi ezberlediği noktada bulsun.
 *
 * KART, ORTAK `Tile` PRİMİTİFİDİR (2026-08-29). Bu ızgara TileGrid'in
 * referansıydı ama kendi kopyasını çiziyordu (rounded-2xl, hover'da
 * yukarı kayma…); iki kopya zamanla ayrışıyordu. Artık Koleksiyon, AF
 * Teamwork ve Library ile BİREBİR aynı karttan çizilir — "bir tasarımı her
 * yerde devam ettirmen gerekiyor" (Aslı Hanım, 2026-08-28).
 */
export function PeopleGrid({ people, meKey, onPick, onShowAll, choices }: Props) {
  const tones = useMemo(() => assignPersonTones(people.map((p) => p.id), choices), [people, choices]);
  // Sıra: önce ben, sonra alfabetik — kart yeri sabit kalsın.
  const ordered = useMemo(() => {
    return [...people].sort((a, b) => {
      if (meKey) {
        if (a.filterKey === meKey) return -1;
        if (b.filterKey === meKey) return 1;
      }
      return a.name.localeCompare(b.name, "tr");
    });
  }, [people, meKey]);

  return (
    <div className="anim-fade px-4 py-6 sm:px-6 md:min-h-0 md:flex-1 md:overflow-y-auto lg:px-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-ink sm:text-xl">Kim ne yapıyor?</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            Bir kişiye tıklayın, işleri açılsın.
          </p>
        </div>
        <Button variant="secondary" onClick={onShowAll} className="text-muted">
          <LayoutList size={14} />
          Tüm işler
        </Button>
      </div>

      {ordered.length === 0 ? (
        <EmptyState
          compact
          title="Henüz ekip üyesi yok"
          description="Ayarlar → Ekip’ten kişi ekleyin."
        />
      ) : (
        /* BÜYÜK KARTLAR. Aslı Hanım (2026-08-24): "kişi kartları daha büyük
           olmalı" — ve 2026-08-19'da: "Ortada sıralansın. Büyük büyük. Seçelim
           bir tanesini, onun sayfasına gitsin." Kırılımlar TileGrid'de
           (2 / 3 / 4 sütun); yüz 96px, isim 18px. */
        <TileGrid>
          {ordered.map((p) => {
            const isMe = p.filterKey === meKey;
            return (
              <Tile
                key={p.filterKey}
                onClick={() => onPick(p.filterKey)}
                title={getPersonDisplayName(p.name)}
                /* ÜNVAN — sistem rolü DEĞİL. Aslı Hanım (2026-08-28): "Bana da
                   tasarımcı yazarsan; ben yönetici olmak istemiyorum çünkü."
                   Ünvan girilmemişse yalnız "Ben"; rol etiketi yazılmaz. */
                meta={p.jobTitle?.trim() || (isMe ? "Ben" : "")}
                /* FOTOĞRAF, yoksa baş harf (Aslı Hanım, 2026-08-24: "resmi
                   olmayan yine aynı şekilde, mesela Siraç Gezgin SG gibi"). */
                photoUrl={p.avatarUrl}
                initials={getPersonInitials(p.name)}
                colorHex={tones[p.id]?.hex}
              />
            );
          })}
        </TileGrid>
      )}
    </div>
  );
}
