"use client";

import Link from "next/link";
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
  /** Veri getirilemediyse Türkçe uyarı — boş rapor "işi yok" gibi okunmasın. */
  error?: string | null;
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
  person, tasks, meetings, departments, today, teamIdentity, error,
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
  const overdueAll = open.filter((t) => t.due_date && t.due_date < today);

  // Yaklaşanlar: tarihi olan açık işler, gecikmişler hariç, en yakın 8.
  const upcomingAll = open
    .filter((t) => t.due_date && t.due_date >= today)
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
  // Tarihsizler ayrı: "ne zaman?" sorusu görünür olsun.
  const undatedAll = open.filter((t) => !t.due_date);

  /* Sayfa A4'e SIĞMALI, bu yüzden liste kesilir. Ama kesildiğini SÖYLEMEZSE
     rapor yalan söyler: on iki gecikmiş işi olan kişinin raporunda sekiz satır
     görünüp gerisi sessizce kayboluyordu. Kesildiğinde tam listeye giden bir
     bağlantı düşer (kâğıda basılmaz). SAYI YAZMAZ — kimseyi puanlamaz. */
  const overdue = overdueAll.slice(0, 8);
  const upcoming = upcomingAll.slice(0, 8);
  const undated = undatedAll.slice(0, 6);
  const allHref = `/list?person=${person.id}`;

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
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line-strong pb-4">
          {/* Fotoğraf, yoksa kişinin renginde baş harfleri. */}
          <PersonAvatar
            name={person.name}
            photoUrl={person.avatarUrl}
            colorHex={tone.hex}
            size="lg"
          />
          <div className="min-w-0 flex-1 basis-40">
            <h1 className="truncate text-xl font-semibold tracking-tight text-ink sm:text-2xl">
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
              {overdue.map((t) => (
                <Row key={t.id} title={t.title} right={trTarih(t.due_date!)} rightTone="text-danger" />
              ))}
            </ul>
            {overdueAll.length > overdue.length && <AllLink href={allHref} />}
          </Block>
        )}

        {upcoming.length > 0 && (
          <Block title="Yaklaşan teslimler">
            <ul className="divide-y divide-hairline">
              {upcoming.map((t) => (
                <Row key={t.id} title={t.title} right={trTarih(t.due_date!)} />
              ))}
            </ul>
            {upcomingAll.length > upcoming.length && <AllLink href={allHref} />}
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
            {undatedAll.length > undated.length && <AllLink href={allHref} />}
          </Block>
        )}

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-control border border-danger/30 bg-danger/5 px-3 py-4 text-center text-[13.5px] text-ink"
          >
            {error}
          </p>
        ) : (
          open.length === 0 && meetings.length === 0 && (
            <p className="mt-4 rounded-control border border-line bg-surface-muted px-3 py-4 text-center text-[13.5px] text-subtle">
              Açık iş ve toplantı yok. Masası temiz.
            </p>
          )
        )}
      </article>
    </div>
  );
}

/** Kesilen listenin altındaki tek satır — ekranda bağlantı, kâğıtta yok. */
function AllLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="no-print mt-1.5 inline-flex min-h-9 items-center text-[12.5px] font-medium text-brand transition-colors duration-150 hover:text-brand-strong pointer-coarse:min-h-11"
    >
      Tümünü listede gör
    </Link>
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
