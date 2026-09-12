"use client";

import { useCallback, useEffect, useState } from "react";
import {
  History, Plus, Pencil, Trash2, CopyPlus, Send, CheckCircle2, XCircle,
  MoveRight, Loader2, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Overlay } from "@/components/ui/Overlay";
import { EmptyState } from "@/components/ui/EmptyState";
import { fetchCalendarActivity, type CalendarActivityRow } from "@/lib/actions/planning-activity";

/**
 * TAKVİM GEÇMİŞİ — "kim ne yaptı, saat kaçta".
 *
 * Sıraç (2026-09-12): "Calendar'da da Excel'deki gibi üstte geçmiş hareketler
 * gibi bir etkinlik geçmişi kısmı olsun."
 *
 * NEDEN PENCERE, NEDEN SABİT PANEL DEĞİL: takvimin kendisi ekranın tamamını
 * kullanıyor (haftalık ızgara yatayda zaten dar). Kalıcı bir geçmiş şeridi her
 * gün her kullanıcıdan yer çalar, oysa geçmişe ancak bir şey ters gittiğinde
 * bakılır. Çubukta tek düğme durur, içerik istendiğinde açılır.
 *
 * VERİ AÇILDIĞINDA ÇEKİLİR, sayfa yüklenirken değil: takvim zaten ağır bir
 * ekran, kimsenin bakmadığı bir liste için her açılışta bir tur daha atmanın
 * karşılığı yok.
 */

type Tone = "info" | "neutral" | "danger" | "success" | "approval";

const META: Record<string, { verb: string; tone: Tone; icon: LucideIcon }> = {
  meeting_created:    { verb: "toplantı açtı",                 tone: "info",     icon: Plus },
  meeting_renamed:    { verb: "başlığı değiştirdi",            tone: "neutral",  icon: Pencil },
  meeting_deleted:    { verb: "toplantıyı sildi",              tone: "danger",   icon: Trash2 },
  meeting_duplicated: { verb: "toplantıyı çoğalttı",           tone: "neutral",  icon: CopyPlus },
  meeting_invited:    { verb: "davet gönderdi",                tone: "approval", icon: Send },
  topic_added:        { verb: "konu ekledi",                   tone: "info",     icon: Plus },
  topic_deleted:      { verb: "konuyu sildi",                  tone: "danger",   icon: Trash2 },
  topic_done:         { verb: "konuyu tamamlandı işaretledi",  tone: "success",  icon: CheckCircle2 },
  topic_missed:       { verb: "konuyu aksadı işaretledi",      tone: "danger",   icon: XCircle },
  topic_moved:        { verb: "konuyu taşıdı",                 tone: "neutral",  icon: MoveRight },
};

const TONE_CLASS: Record<Tone, string> = {
  info:     "bg-brand-soft text-brand-strong",
  neutral:  "bg-surface-sunken text-muted",
  danger:   "bg-danger/10 text-danger",
  success:  "bg-success/10 text-success",
  approval: "bg-approval/10 text-approval",
};

/** "14:07 · 12 Eylül" — SAAT ÖNDE. Geçmişe bakan kişi "ne zaman" değil
 *  "az önce mi" diye sorar; gün ikinci bilgidir. */
function stamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul",
  }).format(d);
  const day = new Intl.DateTimeFormat("tr-TR", {
    day: "numeric", month: "long", timeZone: "Europe/Istanbul",
  }).format(d);
  return `${time} · ${day}`;
}

export function CalendarHistory() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<CalendarActivityRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetchCalendarActivity()
      .then(setRows)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (open && rows === null) load(); }, [open, rows, load]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Takvimde kim ne yaptı — etkinlik geçmişi"
        className="tap-target inline-flex h-9 shrink-0 items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 text-[13px] font-medium text-muted transition-[background-color,border-color,color] duration-150 ease-standard hover:border-line-strong hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring"
      >
        <History size={14} aria-hidden />
        <span className="hidden sm:inline">Geçmiş</span>
      </button>

      {open && (
        <Overlay
          open
          onClose={() => setOpen(false)}
          title="Takvim geçmişi"
          hint="Kim ne yaptı, ne zaman"
          size="md"
        >
          {loading && rows === null ? (
            <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-muted">
              <Loader2 size={15} className="animate-spin" aria-hidden /> Yükleniyor…
            </div>
          ) : !rows?.length ? (
            <EmptyState
              icon={History}
              title="Henüz kayıt yok."
              description="Toplantı açıldığında, konu eklendiğinde ya da silindiğinde burada görünür."
            />
          ) : (
            <ul className="divide-y divide-hairline">
              {rows.map((r) => {
                const m = META[r.action] ?? { verb: r.action, tone: "neutral" as Tone, icon: History };
                const Icon = m.icon;
                return (
                  <li key={r.id} className="flex items-start gap-2.5 py-2.5">
                    <span
                      className={cn(
                        "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
                        TONE_CLASS[m.tone],
                      )}
                    >
                      <Icon size={13} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] leading-snug text-ink">
                        <strong className="font-semibold">{r.actorName}</strong>{" "}
                        <span className="text-muted">{m.verb}</span>
                        {r.label && <>{" — "}<span className="font-medium">{r.label}</span></>}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-subtle">
                        {stamp(r.createdAt)}
                        {/* Olayın işaret ettiği gün/saat — "8 Eylül · 10:00".
                            Eylemin NE ZAMAN yapıldığından farklıdır: biri
                            kaydın saati, diğeri toplantının saati. */}
                        {r.whenLabel && <> · <span className="text-muted">{r.whenLabel}</span></>}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Overlay>
      )}
    </>
  );
}
