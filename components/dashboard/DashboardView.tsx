import { Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tile, TileGrid } from "@/components/ui/TileGrid";
import { BackLink } from "@/components/modules/BackLink";
import { getPersonDisplayName } from "@/lib/utils/person-display";
import { initialsOf } from "@/lib/planning/initials";
import { DeliveryTable } from "./DeliveryTable";
import type { TaskStatus, TaskPriority } from "@/types";
import type { AdminPointsData, MemberPointsSummary } from "@/lib/points/queries";

export interface DueSoonTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** Boş olabilir — tarihsiz işler de listede yaşar. */
  due_date: string | null;
  assignee_id: string | null;
}

export interface ReportPerson {
  id: string;
  name: string;
  avatarUrl?: string | null;
  /** Kişi rengi (hex) — pano, takvim ve raporlarda AYNI olmalı. */
  colorHex?: string;
}

interface Props {
  dueSoonTasks: DueSoonTask[];
  /** profiles.id → görünen ad; satırdaki "kim" sütunu buradan gelir. */
  nameOf: Record<string, string>;
  /** Raporun kapısı: kişi kartları (tek sayfalık kişi raporuna gider). */
  people: ReportPerson[];
  isAdmin: boolean;
  adminPoints?: AdminPointsData | null;
  memberPoints?: MemberPointsSummary;
}

/**
 * Reports — yönetici görünümü.
 *
 * Sayfa bir zamanlar bir gösterge paneliydi: beş KPI karosu, duruma göre
 * çubuk grafik, "bu hafta geçen süre" sayacı, departman dağılımı çubukları,
 * son hareketler akışı ve puan bölümü. Aslı Hanım (2026-08-24):
 *   "Boş laf istemiyorum. Boş hesap istemiyorum. Kimseyi orada puanlamak
 *    istemiyorum. MÜHENDİS GİBİ HİSSETMEK İSTEMİYORUM."
 *
 * Rapor tek bir soruya cevap verir: KİM, NEYİ, NE ZAMAN teslim edecek?
 * Üstte kişiler (kompakt kart, tek bakışta yan yana), altta AÇIK İŞLERİN
 * TAMAMI tek sıralanabilir tabloda — eskiden iki dar kartta yalnız "geciken"
 * ve "yaklaşan" vardı, tarihi uzak ya da tarihsiz iş hiç görünmüyordu.
 * Kapısı da bu yüzden KİŞİdir (2026-08-29: "kişi adıyla tıklayınca gelse daha
 * güzel olur") — Pano'nun kişi ızgarasıyla, Koleksiyon'un kategori
 * kutucuklarıyla aynı kart dili. Kişiye tıklamak tek sayfalık raporunu açar
 * (/reports/[id]).
 *
 * KART = FOTOĞRAF + İSİM. Sayı, durum işareti ve alt açıklama yok: kartın
 * üzerine bir kişi hakkında bilgi koymak onu puanlamaya en yakın şey (Aslı
 * Hanım: "kimseyi orada puanlamak istemiyorum"). "Neyi, ne zaman" sorusunun
 * cevabı alttaki tabloda, işin kendi satırında duruyor.
 */
export function DashboardView({ dueSoonTasks, nameOf, people }: Props) {
  /* SIRA ALFABETİK — Pano'nun kişi ızgarasıyla aynı gerekçe: kart her açılışta
     aynı yerde dursun, aranan isim ezberlenen noktada bulunsun. Kartlar artık
     yalnız fotoğraf + isim taşıdığı için "en yakın teslime göre" gibi görünmeyen
     bir sıra kullanıcıya rastgele gelirdi. */
  const orderedPeople = [...people].sort((a, b) => a.name.localeCompare(b.name, "tr"));

  return (
    <div className="w-full p-4 sm:p-6">
      {/* Başlık uygulama çubuğunda; "Geri" bölüm başlığıyla aynı satırda —
          tek başına bir satır açmasın (2026-08-29). */}
      <h1 className="sr-only">Reports</h1>

      {/* ── Kapı: kişiler ─────────────────────────────────────────────────── */}
      {orderedPeople.length > 0 && (
        <div className="mb-5">
          <div className="mb-3">
            <BackLink />
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-ink">
              Kim, neyi, ne zaman teslim edecek?
            </h2>
            <p className="mt-0.5 text-[13px] text-muted">
              Bir kişiye tıklayın, tek sayfalık raporu açılsın.
            </p>
          </div>

          {/* KOMPAKT kartlar: ekip tek bakışta yan yana sığsın (2026-08-29). */}
          <TileGrid compact>
            {orderedPeople.map((p) => (
                /* KART = FOTOĞRAF + İSİM, o kadar (2026-08-29: "açıklamayı
                   kaldır, sadece kişi kartı kalsın"). Altındaki "sıradaki
                   teslim" satırı kartları farklı yüksekliklere itiyordu ve
                   aynı bilgi zaten alttaki tabloda duruyor. Gecikme noktası da
                   kalktı: bir kişinin kartına durum işareti koymak onu
                   puanlamaya en yakın şey. */
                <Tile
                  key={p.id}
                  compact
                  href={`/reports/${p.id}`}
                  title={getPersonDisplayName(p.name)}
                  photoUrl={p.avatarUrl}
                  initials={initialsOf(p.name)}
                  colorHex={p.colorHex}
                />
            ))}
          </TileGrid>
        </div>
      )}

      {/* ── Neyi, ne zaman: TÜM açık işler, tek tablo, sıralanabilir ──────── */}
      {dueSoonTasks.length === 0 ? (
        <Card className="p-5">
          <EmptyState
            icon={Sparkles}
            title="Açık iş yok"
            description="Herkesin masası temiz."
            className="py-8"
          />
        </Card>
      ) : (
        <DeliveryTable tasks={dueSoonTasks} nameOf={nameOf} />
      )}
    </div>
  );
}
