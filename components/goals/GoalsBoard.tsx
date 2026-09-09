"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check, ChevronLeft, ChevronRight, CornerDownRight, Loader2, Plus, Trash2, Undo2,
} from "lucide-react";
import { addMonths, format, parseISO } from "date-fns";
import { cn } from "@/lib/utils/cn";
import { Button, IconButton } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/Field";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import { useConfirm } from "@/components/ui/useConfirm";
import { createGoal, updateGoal, deleteGoal } from "@/lib/actions/goals";

export type GoalRow = {
  id: string;
  member_id: string;
  period_month: string;
  title: string;
  detail: string | null;
  status: "open" | "done" | "dropped";
  position: number;
};

/**
 * BİR KİŞİNİN ÜÇ AYI.
 *
 * Aslı Hanım (2026-09-07): "Her insanın o bir ay içindeki hedefi, İKİNCİ AYDAKİ
 * hedefi, ÜÇÜNCÜ AYDAKİ hedefi." Üç sütun tam olarak bu — yan yana, çünkü
 * hedefin anlamı komşu aylarla birlikte okununca çıkıyor.
 *
 * Yazma tek satırlık bir alandır: Enter ekler, imleç alanda kalır. AF oturup
 * arka arkaya yazacak ("oturup önümüzdeki aylık takvimi yapalım") — her hedef
 * için pencere açtırmak o oturumu imkânsız kılardı.
 *
 * AKSAYAN HEDEF KAYBOLMAZ, TAŞINIR: "→" düğmesi hedefi bir sonraki aya atar.
 * Böylece kişinin önündeki üç ay her zaman GÜNCEL olanı gösterir.
 */
export function GoalsBoard({
  person, months, monthLabels, anchorMonth, goals, canWrite,
}: {
  person: { id: string; name: string; avatarUrl: string | null; jobTitle: string | null; colorHex: string | null };
  months: string[];
  monthLabels: string[];
  anchorMonth: string;
  goals: GoalRow[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  const shift = (delta: number) =>
    router.push(`/goals?p=${person.id}&m=${format(addMonths(parseISO(anchorMonth), delta), "yyyy-MM-01")}`);

  function run(key: string, fn: () => Promise<{ error?: string } | unknown>) {
    setError(null);
    setBusy(key);
    start(async () => {
      try {
        const res = (await fn()) as { error?: string };
        if (res && "error" in res && res.error) { setError(res.error); return; }
        router.refresh();
      } catch {
        setError("İşlem tamamlanamadı. Tekrar deneyin.");
      } finally {
        setBusy(null);
      }
    });
  }

  function add(month: string) {
    const title = (drafts[month] ?? "").trim();
    if (!title) return;
    setDrafts((d) => ({ ...d, [month]: "" }));
    run(`add:${month}`, () => createGoal({ member_id: person.id, period_month: month, title }));
  }

  async function remove(g: GoalRow) {
    if (!(await ask({
      title: "Hedef silinsin mi?",
      message: `“${g.title}” kaldırılacak.`,
      confirmLabel: "Sil",
      tone: "danger",
    }))) return;
    run(`del:${g.id}`, () => deleteGoal(g.id));
  }

  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      {/* Geri BOARD'a döner: kişi ızgarası artık orada, tek yerde. */}
      <Link
        href="/board"
        className="-ml-1 mb-1 inline-flex items-center gap-1 text-[13px] font-medium text-muted transition-colors duration-150 hover:text-ink"
      >
        <ChevronLeft size={15} aria-hidden /> Kişiler
      </Link>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <PersonAvatar name={person.name} photoUrl={person.avatarUrl} size="md" />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-tight text-ink">{person.name}</h1>
            {person.jobTitle && <p className="truncate text-[13px] text-muted">{person.jobTitle}</p>}
          </div>
          {/* İŞLER | HEDEFLER — Board'un kişi başlığındaki sekmenin aynısı;
              iki ekran arasında gidip gelmek tek tık. */}
          <span className="ml-1 inline-flex shrink-0 items-stretch overflow-hidden rounded-control border border-line bg-surface">
            {/* KİŞİYİ TAŞIR. Düz /board kişi ızgarasını açıyor ve seçili kişi
                kayboluyordu (Sıraç, 2026-09-10). */}
            <Link
              href={`/board?person=member:${person.id}`}
              className="inline-flex h-8 items-center px-3 text-[13px] font-medium text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink"
            >
              İşler
            </Link>
            <span className="inline-flex h-8 items-center border-l border-line bg-surface-muted px-3 text-[13px] font-semibold text-ink">
              Hedefler
            </span>
          </span>
        </div>

        {/* Pencere kaydırma — geçmiş aylar da okunabilsin. */}
        <div className="inline-flex h-9 shrink-0 items-stretch overflow-hidden rounded-control border border-line bg-surface">
          <button
            type="button" onClick={() => shift(-1)} aria-label="Önceki ay"
            className="tap-target inline-flex w-9 items-center justify-center text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="flex items-center whitespace-nowrap border-x border-line px-3 text-[13px] font-semibold text-ink">
            {monthLabels[0]} →
          </span>
          <button
            type="button" onClick={() => shift(1)} aria-label="Sonraki ay"
            className="tap-target inline-flex w-9 items-center justify-center text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="anim-fade-down mb-3 rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] font-medium text-danger">
          {error}
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        {months.map((month, i) => {
          const list = goals
            .filter((g) => g.period_month === month)
            .sort((a, b) => a.position - b.position);
          const isNow = i === 0;
          return (
            <section
              key={month}
              className={cn(
                "flex min-w-0 flex-col rounded-card border bg-surface p-3",
                isNow ? "border-brand-ring" : "border-line",
              )}
            >
              <h2 className={cn(
                "mb-2 text-[12px] font-semibold uppercase tracking-[0.08em]",
                isNow ? "text-brand-strong" : "text-subtle",
              )}>
                {monthLabels[i]}
              </h2>

              {list.length === 0 && (
                <p className="mb-2 text-[13px] text-subtle">Hedef yok.</p>
              )}

              <ul className="mb-2 space-y-1.5">
                {list.map((g) => {
                  const done = g.status === "done";
                  const dropped = g.status === "dropped";
                  const rowBusy = busy?.endsWith(g.id) && isPending;
                  return (
                    <li
                      key={g.id}
                      className={cn(
                        "group/goal flex items-start gap-1.5 rounded-control border border-hairline px-2 py-1.5",
                        done && "bg-success/8",
                        dropped && "opacity-55",
                      )}
                    >
                      <span className={cn(
                        "min-w-0 flex-1 text-[13.5px] leading-snug",
                        done ? "text-ink/70 line-through" : "text-ink",
                      )}>
                        {g.title}
                      </span>
                      {rowBusy && <Loader2 size={13} className="mt-0.5 shrink-0 animate-spin text-subtle" aria-hidden />}
                      {canWrite && !rowBusy && (
                        <span className="flex shrink-0 items-center gap-0.5">
                          <IconButton
                            size="sm"
                            aria-label={done ? "Tamamlandı işaretini kaldır" : "Tamamlandı işaretle"}
                            title={done ? "Geri al" : "Tamamlandı"}
                            onClick={() => run(`st:${g.id}`, () => updateGoal(g.id, { status: done ? "open" : "done" }))}
                            className={done ? "text-success" : "hover:text-success"}
                          >
                            {done ? <Undo2 size={13} /> : <Check size={13} />}
                          </IconButton>
                          {/* SONRAKİ AYA TAŞI — son sütunda hedef pencereden
                              çıkacağı için gizlenmez, taşınır ve oklarla
                              bulunur; "kayboldu" hissi olmasın diye ipucu var. */}
                          <IconButton
                            size="sm"
                            aria-label="Sonraki aya taşı"
                            title="Sonraki aya taşı"
                            onClick={() => run(`mv:${g.id}`, () => updateGoal(g.id, {
                              period_month: format(addMonths(parseISO(month), 1), "yyyy-MM-01"),
                            }))}
                            className="hover:text-brand"
                          >
                            <CornerDownRight size={13} />
                          </IconButton>
                          <IconButton
                            size="sm"
                            aria-label="Hedefi sil"
                            title="Sil"
                            onClick={() => void remove(g)}
                            className="hover:text-danger"
                          >
                            <Trash2 size={13} />
                          </IconButton>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>

              {canWrite && (
                <div className="mt-auto flex items-center gap-1.5">
                  <TextInput
                    value={drafts[month] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [month]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(month); } }}
                    placeholder="Hedef yaz…"
                    aria-label={`${monthLabels[i]} için hedef ekle`}
                    className="min-w-0 flex-1"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => add(month)}
                    disabled={!(drafts[month] ?? "").trim()}
                  >
                    <Plus size={13} aria-hidden /> Ekle
                  </Button>
                </div>
              )}
            </section>
          );
        })}
      </div>

      {!canWrite && (
        <p className="mt-3 text-[12.5px] text-subtle">
          Bu kişinin hedeflerini yönetici düzenler. Kendi hedeflerinizi kendi kartınızdan yazabilirsiniz.
        </p>
      )}
      {dialog}
    </div>
  );
}
