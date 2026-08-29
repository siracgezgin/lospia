"use client";

import { Printer } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/Button";
import { BackLink } from "@/components/modules/BackLink";
import { getPersonDisplayName } from "@/lib/utils/person-display";
import { assignPersonTones } from "@/lib/design/person-colors";
import { PersonAvatar } from "@/components/ui/PersonAvatar";

type ReportTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  completed_at: string | null;
};

type ReportMeeting = {
  id: string;
  meeting_date: string;
  time_slot: string;
  title: string | null;
};

interface Props {
  person: { id: string; name: string; avatarUrl: string | null };
  tasks: ReportTask[];
  meetings: ReportMeeting[];
  departments: string[];
  today: string;      // yyyy-MM-dd
  /** Ekibin tamamının kimliği — renk panodakiyle aynı çıksın diye. */
  teamIdentity?: { id: string; colorKey: string | null; iconKey: string | null }[];
}

const GUNLER = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const trTarih = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return `${GUNLER[(d.getDay() + 6) % 7]} ${d.getDate()}.${d.getMonth() + 1}`;
};

/**
 * Kişi bazlı TEK SAYFA rapor.
 *
 * Aslı Hanım (2026-08-19): "Beş sayfa gönderince o insanlar o beş sayfayı
 * okumuyor bile… Tek sayfalık, kişi bazlı — sadece bir sayfada kendisiyle
 * ilgili detayları okusun."
 *
 * Sayfa bir zamanlar ÜÇ BÜYÜK RAKAMLA açılıyordu (açık iş · devam eden ·
 * gecikmiş) ve altında "bu hafta tamamlanan / toplam tamamlanan" sayaçları
 * vardı. Aslı Hanım (2026-08-24) o dili kaldırttı:
 *   "tamamlandı, tamamlanmadı, eksik kaldı, geç kaldı, sıfır, bir bir…
 *    Öyle bir şey istemiyoruz ki. İsmi, işi, tarihi bu kadar."
 *   "Kimseyi orada puanlamak istemiyorum."
 * Rapor artık doğrudan işin kendisiyle açılıyor: gecikmişler en üstte, sonra
 * yaklaşan teslimler, toplantılar ve tarihsizler. Yazdırılabilir: A4 tek
 * sayfa (bkz. globals.css @media print).
 */
export function PersonReport({
  person, tasks, meetings, departments, today, teamIdentity,
}: Props) {
  /* Renk EKİP GENELİ atamadan gelir. Tek kişi için hesaplamak, panoda çakışma
     yüzünden kayan tonu ve yöneticinin Ayarlar'daki seçimini görmez; kişinin
     rengi rapor ile pano arasında tutmaz. */
  const seeds = (teamIdentity ?? [{ id: person.id, colorKey: null, iconKey: null }]).map((m) => m.id);
  const choices = Object.fromEntries(
    (teamIdentity ?? []).map((m) => [m.id, { colorKey: m.colorKey, iconKey: m.iconKey }]),
  );
  const tone = assignPersonTones(seeds, choices)[person.id] ?? assignPersonTones([person.id])[person.id]!;

  const open = tasks.filter((t) => t.status !== "done");
  const overdue = open.filter((t) => t.due_date && t.due_date < today);

  // Yaklaşanlar: tarihi olan açık işler, gecikmişler hariç, en yakın 8.
  const upcoming = open
    .filter((t) => t.due_date && t.due_date >= today)
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
    .slice(0, 8);
  // Tarihsizler ayrı: "ne zaman?" sorusu görünür olsun.
  const undated = open.filter((t) => !t.due_date).slice(0, 6);

  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      {/* Ekran kabuğu — kâğıda basılmaz */}
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        {/* Bu sayfaya artık Reports'un kişi kartından geliniyor; sabit
            "Board'a dön" yanlış yere götürüyordu. Hedefi geçmiş belirler. */}
        <BackLink href="/dashboard" />
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer size={14} aria-hidden /> Yazdır / PDF
        </Button>
      </div>

      {/* Kâğıt sayfası: A4 oranında dar kolon BİLEREK korunur — ekranda da
          basılacak sayfa gibi okunsun; .print-page kuralları kenarlık/gölgeyi
          kâğıtta kaldırır. */}
      <article className="print-page mx-auto max-w-3xl rounded-card border border-line bg-surface p-6 shadow-card sm:p-8">
        {/* Kimlik */}
        <header className="flex items-center gap-4 border-b border-line-strong pb-4">
          {/* Fotoğraf, yoksa kişinin renginde baş harfleri. */}
          <PersonAvatar
            name={person.name}
            photoUrl={person.avatarUrl}
            colorHex={tone.hex}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-ink">
              {getPersonDisplayName(person.name)}
            </h1>
            <p className="mt-0.5 text-[13px] text-muted">
              {departments.length ? departments.join(" · ") : "Departman atanmadı"}
            </p>
          </div>
          <span className="shrink-0 text-right text-[12px] text-subtle tabular-nums">
            {new Date(`${today}T00:00:00`).toLocaleDateString("tr-TR")}
          </span>
        </header>

        {/* Gecikmişler EN ÜSTTE — okunmayacak tek şey bu olmamalı. */}
        {overdue.length > 0 && (
          <Block title="Gecikmiş işler" tone="danger">
            <ul className="divide-y divide-hairline">
              {overdue.slice(0, 8).map((t) => (
                <Row key={t.id} title={t.title} right={trTarih(t.due_date!)} rightTone="text-danger" />
              ))}
            </ul>
          </Block>
        )}

        {upcoming.length > 0 && (
          <Block title="Yaklaşan teslimler">
            <ul className="divide-y divide-hairline">
              {upcoming.map((t) => (
                <Row key={t.id} title={t.title} right={trTarih(t.due_date!)} />
              ))}
            </ul>
          </Block>
        )}

        {meetings.length > 0 && (
          <Block title="Bu haftaki toplantıların">
            <ul className="divide-y divide-hairline">
              {meetings.map((m) => (
                <Row
                  key={m.id}
                  title={m.title ?? "Toplantı"}
                  right={`${trTarih(m.meeting_date)} · ${m.time_slot}`}
                />
              ))}
            </ul>
          </Block>
        )}

        {undated.length > 0 && (
          <Block title="Tarihi olmayan işler">
            <ul className="divide-y divide-hairline">
              {undated.map((t) => (
                <Row key={t.id} title={t.title} right="tarih yok" rightTone="text-subtle" />
              ))}
            </ul>
          </Block>
        )}

        {open.length === 0 && meetings.length === 0 && (
          <p className="mt-4 rounded-control border border-line bg-surface-muted px-3 py-4 text-center text-[13.5px] text-subtle">
            Açık iş ve toplantı yok.
          </p>
        )}
      </article>
    </div>
  );
}

function Block({ title, tone, children }: { title: string; tone?: "danger"; children: React.ReactNode }) {
  return (
    <section className="print-keep border-b border-line py-4 last:border-b-0">
      <h2 className={cn("mb-1.5 text-[13px] font-semibold uppercase tracking-wider", tone === "danger" ? "text-danger" : "text-muted")}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ title, right, rightTone }: { title: string; right: string; rightTone?: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="min-w-0 flex-1 text-[13.5px] leading-snug text-ink">{title}</span>
      <span className={cn("shrink-0 text-[12.5px] tabular-nums", rightTone ?? "text-muted")}>{right}</span>
    </li>
  );
}
