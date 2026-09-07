"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleDot, Loader2, Send, Undo2, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/Button";
import { Field, SelectInput, TextArea } from "@/components/ui/Field";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import {
  sendTaskToReview, approveReviewStep, returnTaskFromReview,
} from "@/lib/actions/task-review";

export type ReviewStep = {
  id: string;
  position: number;
  reviewer_id: string;
  approved_at: string | null;
  note: string | null;
};
export type ReviewPerson = { id: string; name: string; avatarUrl: string | null };

/**
 * KONTROL ZİNCİRİ — "ondan sonra bana gelsin".
 *
 * Aslı Hanım (2026-09-07): "Gül'ün yaptığını sen kontrol et. Senin yaptığını
 * Gül kontrol etsin. İkinizin yaptığını Nisa kontrol etsin. ONDAN SONRA BANA
 * GELSİN… Böylece bana gelene kadar zaten bitirmiş olursunuz. Böyle basit
 * hatalara bakmayız."
 *
 * Panel iki şey söyler: SIRA KİMDE ve KİM KONTROL ETTİ. Yöneticinin 'done'
 * yetkisi değişmez — zincir karar vermez, görünürlük verir.
 *
 * Sayı yok, yüzde yok, "2/3 tamamlandı" yok (sadelik kuralı: kişiyi puanlayan
 * sayı ekrana girmez). Satırda isim, işaret ve varsa not durur.
 */
export function TaskReviewChain({
  taskId, status, steps, people, currentUserId, canSend, defaultChainCount,
}: {
  taskId: string;
  status: string;
  steps: ReviewStep[];
  people: ReviewPerson[];
  currentUserId: string;
  /** İşi bitiren kişi kontrole gönderebilir mi. */
  canSend: boolean;
  /** Çalışma alanının sabit kuyruğunda kaç kişi var — ipucu metni için. */
  defaultChainCount: number;
}) {
  const router = useRouter();
  const [peer, setPeer] = useState("");
  const [note, setNote] = useState("");
  const [returning, setReturning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "—";
  const photoOf = (id: string) => people.find((p) => p.id === id)?.avatarUrl ?? null;

  const ordered = [...steps].sort((a, b) => a.position - b.position);
  const pending = ordered.find((s) => !s.approved_at) ?? null;
  const myTurn = !!pending && pending.reviewer_id === currentUserId;
  const inReview = status === "review";

  function run(key: string, fn: () => Promise<{ error?: string } | unknown>) {
    setError(null);
    setBusy(key);
    start(async () => {
      try {
        const res = (await fn()) as { error?: string };
        if (res && "error" in res && res.error) { setError(res.error); return; }
        setNote("");
        setReturning(false);
        router.refresh();
      } catch {
        setError("İşlem tamamlanamadı. Tekrar deneyin.");
      } finally {
        setBusy(null);
      }
    });
  }

  /* Zincir yoksa ve görev kontrolde değilse: gönderme kutusu.
     Kuyruk da boşsa panel hiç çizilmez — kurulmamış bir özelliğin boş kutusu
     ekranda durmasın. */
  if (!inReview && ordered.length === 0) {
    if (!canSend || defaultChainCount === 0) return null;
    return (
      <section className="rounded-card border border-line bg-surface p-4 shadow-card">
        <h2 className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle">Kontrol</h2>
        <p className="mb-2.5 text-[13px] leading-relaxed text-muted">
          İşi bitirdiğinizde kontrole gönderin. İsterseniz önce bir ekip arkadaşınız
          çapraz kontrol etsin; sonra sabit kuyruk devreye girer.
        </p>
        {error && (
          <p role="alert" className="mb-2 rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] font-medium text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Çapraz kontrol (isteğe bağlı)" className="min-w-[180px] flex-1">
            <SelectInput value={peer} onChange={(e) => setPeer(e.target.value)}>
              <option value="">Seçilmedi</option>
              {people.filter((p) => p.id !== currentUserId).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </SelectInput>
          </Field>
          <Button
            onClick={() => run("send", () => sendTaskToReview(taskId, { peerReviewerId: peer || null }))}
            loading={busy === "send" && isPending}
          >
            {!(busy === "send" && isPending) && <Send size={14} aria-hidden />} Kontrole gönder
          </Button>
        </div>
      </section>
    );
  }

  if (ordered.length === 0) return null;

  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle">Kontrol zinciri</h2>

      {error && (
        <p role="alert" className="mb-2 rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] font-medium text-danger">
          {error}
        </p>
      )}

      <ol className="space-y-1.5">
        {ordered.map((s) => {
          const done = !!s.approved_at;
          const isCurrent = pending?.id === s.id;
          return (
            <li
              key={s.id}
              className={cn(
                "flex items-start gap-2 rounded-control border px-2.5 py-2",
                done ? "border-success/30 bg-success/8" : isCurrent ? "border-brand-ring bg-brand-soft/30" : "border-hairline",
              )}
            >
              {done ? (
                <Check size={16} className="mt-0.5 shrink-0 text-success" aria-label="Onayladı" />
              ) : isCurrent ? (
                <CircleDot size={16} className="mt-0.5 shrink-0 text-brand" aria-label="Sıra bunda" />
              ) : (
                <span className="mt-1 size-2 shrink-0 rounded-full bg-surface-sunken" aria-hidden />
              )}
              <PersonAvatar name={nameOf(s.reviewer_id)} photoUrl={photoOf(s.reviewer_id)} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-medium text-ink">{nameOf(s.reviewer_id)}</span>
                <span className="block text-[12.5px] text-subtle">
                  {done
                    ? `kontrol etti · ${new Date(s.approved_at!).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}`
                    : isCurrent ? "sıra bunda" : "bekliyor"}
                </span>
                {s.note && (
                  <span className="mt-0.5 block whitespace-pre-line text-[12.5px] leading-snug text-ink/80">{s.note}</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>

      {/* SIRA SİZDEYSE: onayla ya da geri gönder. Geri gönderirken not zorunlu —
          "eksik" demek yetmez, neyin eksik olduğu yazılmalı. */}
      {myTurn && (
        <div className="mt-3 space-y-2">
          {returning ? (
            <>
              <Field label="Neyin eksik olduğunu yazın" required>
                <TextArea
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Büst ölçüsünün inçi eksik…"
                  autoFocus
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => run("return", () => returnTaskFromReview(taskId, note))}
                  loading={busy === "return" && isPending}
                  disabled={!note.trim()}
                  className="hover:border-danger/40 hover:text-danger"
                >
                  {!(busy === "return" && isPending) && <Undo2 size={14} aria-hidden />} Geri gönder
                </Button>
                <Button variant="ghost" onClick={() => { setReturning(false); setNote(""); }}>Vazgeç</Button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => run("approve", () => approveReviewStep(pending!.id, null))}
                loading={busy === "approve" && isPending}
              >
                {!(busy === "approve" && isPending) && <UserCheck size={14} aria-hidden />} Kontrol ettim
              </Button>
              <Button variant="ghost" onClick={() => setReturning(true)}>
                <Undo2 size={14} aria-hidden /> Geri gönder
              </Button>
            </div>
          )}
        </div>
      )}

      {!myTurn && pending && (
        <p className="mt-2.5 flex items-center gap-1.5 text-[12.5px] text-muted">
          {isPending && <Loader2 size={12} className="animate-spin" aria-hidden />}
          Sıra <b className="font-semibold text-ink">{nameOf(pending.reviewer_id)}</b> kişisinde.
        </p>
      )}
      {!pending && (
        <p className="mt-2.5 text-[12.5px] text-success">
          Zincirdeki herkes kontrol etti — görev onaya hazır.
        </p>
      )}
    </section>
  );
}
