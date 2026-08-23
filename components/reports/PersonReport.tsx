"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Printer, CheckCircle2, Activity, AlertTriangle, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { getPersonDisplayName, getPersonInitials } from "@/lib/utils/person-display";
import { assignPersonTones, assignPersonIcons } from "@/lib/design/person-colors";

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
  weekStart: string;  // yyyy-MM-dd (pazartesi)
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
 * Biçim yine onun tarifi: "Instagram'da yapıyorlar ya, önce dikkati çekiyor,
 * daha fazlasını isteyince veriyor." Sayfa ÜÇ BÜYÜK RAKAMLA açılıyor; detay
 * altta ve kısa. Gecikmiş iş varsa en üste çıkıyor — okunmayacak tek şey o
 * olmamalı.
 */
export function PersonReport({ person, tasks, meetings, departments, today, weekStart }: Props) {
  const tone = assignPersonTones([person.id])[person.id]!;
  const Icon = assignPersonIcons([person.id])[person.id]!;

  const done = tasks.filter((t) => t.status === "done");
  const open = tasks.filter((t) => t.status !== "done");
  const inProgress = open.filter((t) => ["in_progress", "review"].includes(t.status));
  const overdue = open.filter((t) => t.due_date && t.due_date < today);
  const doneThisWeek = done.filter((t) => t.completed_at && t.completed_at.slice(0, 10) >= weekStart);

  // Yaklaşanlar: tarihi olan açık işler, gecikmişler hariç, en yakın 8.
  const upcoming = open
    .filter((t) => t.due_date && t.due_date >= today)
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
    .slice(0, 8);
  // Tarihsizler ayrı: "ne zaman?" sorusu görünür olsun.
  const undated = open.filter((t) => !t.due_date).slice(0, 6);

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      {/* Ekran kabuğu — kâğıda basılmaz */}
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/board"
          className="group inline-flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-0.5" /> Board’a dön
        </Link>
        <button
          onClick={() => window.print()}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-muted transition-all duration-150 hover:border-line-strong hover:bg-surface-muted hover:text-ink active:scale-[0.98]"
        >
          <Printer size={14} /> Yazdır / PDF
        </button>
      </div>

      <article className="print-page mx-auto max-w-3xl rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
        {/* Kimlik */}
        <header className="flex items-center gap-4 border-b border-line-strong pb-4">
          {person.avatarUrl ? (
            <Image src={person.avatarUrl} alt="" width={56} height={56} className="h-14 w-14 shrink-0 rounded-full object-cover" unoptimized />
          ) : (
            <span className={cn("relative grid h-14 w-14 shrink-0 place-items-center rounded-full text-white", tone.solid)}>
              <Icon size={22} strokeWidth={1.9} />
              <span className="absolute -bottom-0.5 -right-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-surface px-1 text-[9.5px] font-bold text-ink ring-1 ring-line">
                {getPersonInitials(person.name)}
              </span>
            </span>
          )}
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

        {/* ÜÇ BÜYÜK RAKAM — "önce dikkati çek" */}
        <section className="print-keep grid grid-cols-3 gap-3 border-b border-line py-5">
          <Stat n={open.length} label="açık iş" tone="text-ink" />
          <Stat n={inProgress.length} label="devam eden" tone="text-info" icon={<Activity size={13} />} />
          <Stat
            n={overdue.length}
            label="gecikmiş"
            tone={overdue.length ? "text-danger" : "text-subtle"}
            icon={overdue.length ? <AlertTriangle size={13} /> : undefined}
          />
        </section>

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

        <footer className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-[12px] text-subtle">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 size={12} className="text-success" />
            Bu hafta tamamlanan: <b className="font-semibold text-ink tabular-nums">{doneThisWeek.length}</b>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock size={12} />
            Toplam tamamlanan: <b className="font-semibold text-ink tabular-nums">{done.length}</b>
          </span>
        </footer>

        {open.length === 0 && meetings.length === 0 && (
          <p className="mt-4 rounded-lg border border-line bg-surface-muted px-3 py-4 text-center text-[13px] text-subtle">
            Açık iş ve toplantı yok.
          </p>
        )}
      </article>
    </div>
  );
}

function Stat({ n, label, tone, icon }: { n: number; label: string; tone: string; icon?: React.ReactNode }) {
  return (
    <div className="text-center">
      <div className={cn("text-3xl font-semibold tabular-nums leading-none", tone)}>{n}</div>
      <div className="mt-1.5 inline-flex items-center gap-1 text-[12px] text-muted">
        {icon}{label}
      </div>
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
