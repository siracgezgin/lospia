"use client";

import { useMemo } from "react";
import { LayoutList } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { getPersonDisplayName } from "@/lib/utils/person-display";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import { assignPersonTones, personStyles, type PersonChoice } from "@/lib/design/person-colors";

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
 */
export function PeopleGrid({ people, meKey, onPick, onShowAll, choices }: Props) {
  const tones = useMemo(() => assignPersonTones(people.map((p) => p.id), choices), [people, choices]);
  /* Renk katmanı hex'ten türer: hazır palet ile serbest renk (Ayarlar'daki
     hex seçici) birebir aynı görünsün. Tailwind sınıfı çalışma anında
     üretilemediği için satır içi stil tek doğru yol. */
  const styles = useMemo(() => {
    const out: Record<string, ReturnType<typeof personStyles>> = {};
    for (const [id, t] of Object.entries(tones)) out[id] = personStyles(t.hex);
    return out;
  }, [tones]);
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
        <button
          onClick={onShowAll}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-muted transition-all duration-150 hover:border-line-strong hover:bg-surface-muted hover:text-ink active:scale-[0.98]"
        >
          <LayoutList size={14} />
          Tüm işler
        </button>
      </div>

      {ordered.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface px-4 py-6 text-center text-[13px] text-muted">
          Henüz ekip üyesi yok. Ayarlar → Ekip’ten kişi ekleyin.
        </p>
      ) : (
        /* BÜYÜK KARTLAR. Aslı Hanım (2026-08-24): "kişi kartları daha büyük
           olmalı" — ve 2026-08-19'da: "Ortada sıralansın. Büyük büyük. Seçelim
           bir tanesini, onun sayfasına gitsin."
           Beş sütuna kadar sıkışan küçük kartlar yerine en fazla dört sütun;
           kart artık dikey (fotoğraf üstte, isim altta ortalı), yüz 96px ve
           isim 19px. Tıklama alanı da büyüdü — telefonda tek elle isabet
           ettirmek kolaylaştı. */
        <div className="stagger-children grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 lg:gap-5">
          {ordered.map((p) => {
            const st = styles[p.id]!;
            const isMe = p.filterKey === meKey;
            return (
              <button
                key={p.filterKey}
                onClick={() => onPick(p.filterKey)}
                className={cn(
                  "group relative flex flex-col items-center gap-3 overflow-hidden rounded-2xl border bg-surface px-4 pb-6 pt-8 text-center shadow-card transition-all duration-200 ease-standard",
                  "hover:-translate-y-0.5 hover:shadow-card-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                )}
                style={{ ...st.border, ...st.soft }}
              >
                {/* Kimlik çubuğu — kişinin rengi. cn() dışında absolute bar
                    (tailwind-merge border-l renklerini yutuyor: proje kuralı). */}
                <span aria-hidden className="absolute inset-x-0 top-0 h-1.5" style={{ backgroundColor: st.hex }} />

                {/* FOTOĞRAF, yoksa baş harf. (Aslı Hanım, 2026-08-24: "ikon
                    kalkıp herkesin resmi gelecek… resmi olmayan yine aynı
                    şekilde, mesela Siraç Gezgin SG gibi.") */}
                <PersonAvatar
                  name={p.name}
                  photoUrl={p.avatarUrl}
                  colorHex={st.hex}
                  size="xl"
                  ring
                />

                <span className="w-full min-w-0">
                  <span className="block truncate text-[19px] font-semibold tracking-tight text-ink" title={p.name}>
                    {getPersonDisplayName(p.name)}
                  </span>
                  {/* ÜNVAN — sistem rolü DEĞİL. Aslı Hanım (2026-08-28):
                      "Bana da tasarımcı yazarsan; ben yönetici olmak
                      istemiyorum çünkü." Rol bir izin ayarıdır; kartta kişinin
                      kendi ünvanı yazar. Ünvan girilmemişse eski etikete
                      düşülür, kart hiçbir zaman boş kalmaz. */}
                  <span className="mt-1 block text-[13px] text-muted">
                    {p.jobTitle?.trim() || (isMe ? "Ben" : p.isAdmin ? "Yönetici" : "Ekip")}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
