"use client";

import { useMemo } from "react";
import Image from "next/image";
import { LayoutList, CheckCircle2, Activity, Clock3, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { getPersonDisplayName, getPersonInitials } from "@/lib/utils/person-display";
import { assignPersonTones, assignPersonIcons, personStyles, type PersonChoice } from "@/lib/design/person-colors";
import type { Task } from "@/types";

export type GridPerson = {
  /** personFilter değeri — "member:<uuid>" ya da "contact:<uuid>". */
  filterKey: string;
  /** Renk/ikon tohumu — kişinin kalıcı id'si. */
  id: string;
  name: string;
  avatarUrl?: string | null;
  isAdmin?: boolean;
};

export type PersonLoad = {
  open: number;        // yapılacak + devam eden (açık iş)
  inProgress: number;  // devam ediyor / kontrolde
  done: number;        // tamamlandı
  overdue: number;     // gecikmiş
};

interface Props {
  people: GridPerson[];
  /** filterKey → yük özeti. */
  loadOf: Record<string, PersonLoad>;
  /** Şu an giriş yapan kişinin filterKey'i — kendi kartı öne alınır. */
  meKey?: string | null;
  onPick: (_filterKey: string) => void;
  onShowAll: () => void;
  totalTasks: number;
  /** Yöneticinin Ayarlar'dan seçtiği renk/ikon (id → seçim). Boşsa otomatik. */
  choices?: Record<string, PersonChoice>;
}

/**
 * Pano giriş ekranı — kişiler.
 *
 * Aslı Hanım (2026-08-19):
 *   "Ben ya burada dört sayfa göreyim… Gül, Selen, Kısmet, Nisa, Aslı, Esin,
 *    Sıraç diye göreyim. Ya onların renklerine gireyim ve işler açılsın."
 *   "Yukarıda küçük küçük yapman gerek yok. Ana sayfan o olsun. Kişi seçelim."
 *   "Ortada sıralansın. Büyük büyük. Seçelim bir tanesini, onun sayfasına gitsin."
 *
 * Yani kişi seçimi bir FİLTRE DEĞİL, panonun kapısıdır. Departman başlıkları
 * ("Üretim ve Tedarik Zinciri", "Finans ve Operasyon") burada bilerek yoktur —
 * "yoruyor onlar bizi".
 */
export function PeopleGrid({ people, loadOf, meKey, onPick, onShowAll, totalTasks, choices }: Props) {
  const tones = useMemo(() => assignPersonTones(people.map((p) => p.id), choices), [people, choices]);
  /* Renk katmanı hex'ten türer: hazır palet ile serbest renk (Ayarlar'daki
     hex seçici) birebir aynı görünsün. Tailwind sınıfı çalışma anında
     üretilemediği için satır içi stil tek doğru yol. */
  const styles = useMemo(() => {
    const out: Record<string, ReturnType<typeof personStyles>> = {};
    for (const [id, t] of Object.entries(tones)) out[id] = personStyles(t.hex);
    return out;
  }, [tones]);
  const icons = useMemo(() => assignPersonIcons(people.map((p) => p.id), choices), [people, choices]);

  // Sıra: önce ben, sonra açık işi olanlar (çok → az), sonra alfabetik.
  const ordered = useMemo(() => {
    return [...people].sort((a, b) => {
      if (meKey) {
        if (a.filterKey === meKey) return -1;
        if (b.filterKey === meKey) return 1;
      }
      const ao = loadOf[a.filterKey]?.open ?? 0;
      const bo = loadOf[b.filterKey]?.open ?? 0;
      if (ao !== bo) return bo - ao;
      return a.name.localeCompare(b.name, "tr");
    });
  }, [people, loadOf, meKey]);

  return (
    <div className="anim-fade px-4 py-6 sm:px-6 md:min-h-0 md:flex-1 md:overflow-y-auto lg:px-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-ink sm:text-xl">Kim ne yapıyor?</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            Bir kişiye tıklayın — tamamladığı, devam eden ve bekleyen işleri açılsın.
          </p>
        </div>
        <button
          onClick={onShowAll}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-muted transition-all duration-150 hover:border-line-strong hover:bg-surface-muted hover:text-ink active:scale-[0.98]"
        >
          <LayoutList size={14} />
          Tüm işler
          <span className="rounded-md bg-surface-muted px-1.5 py-px text-[11px] font-semibold tabular-nums text-muted">
            {totalTasks}
          </span>
        </button>
      </div>

      {ordered.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface px-4 py-6 text-center text-[13px] text-muted">
          Henüz ekip üyesi yok. Ayarlar → Ekip’ten kişi ekleyin.
        </p>
      ) : (
        <div className="stagger-children grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {ordered.map((p) => {
            const st = styles[p.id]!;
            const Icon = icons[p.id]!;
            const load = loadOf[p.filterKey] ?? { open: 0, inProgress: 0, done: 0, overdue: 0 };
            const isMe = p.filterKey === meKey;
            return (
              <button
                key={p.filterKey}
                onClick={() => onPick(p.filterKey)}
                className={cn(
                  "group relative flex flex-col overflow-hidden rounded-2xl border bg-surface text-left shadow-card transition-all duration-200 ease-standard",
                  "hover:-translate-y-0.5 hover:shadow-card-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                )}
                style={st.border}
              >
                {/* Kimlik çubuğu — kişinin rengi. cn() dışında absolute bar
                    (tailwind-merge border-l renklerini yutuyor: proje kuralı). */}
                <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: st.hex }} />

                <div className="flex items-center gap-3 px-4 pb-3 pt-5" style={st.soft}>
                  {/* Fotoğraf varsa fotoğraf; yoksa kişiye özel ikon + baş harf.
                      Aslı Hanım: "Ekip fotoğrafları olsun… Sen yap, sonra
                      değiştiririz." */}
                  {p.avatarUrl ? (
                    <Image
                      src={p.avatarUrl}
                      alt=""
                      width={56}
                      height={56}
                      className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-surface"
                      unoptimized
                    />
                  ) : (
                    <span
                      className="relative grid h-14 w-14 shrink-0 place-items-center rounded-full ring-2 ring-surface"
                      style={st.solid}
                    >
                      <Icon size={22} strokeWidth={1.9} />
                      <span className="absolute -bottom-0.5 -right-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-surface px-1 text-[9.5px] font-bold tracking-tight text-ink ring-1 ring-line">
                        {getPersonInitials(p.name)}
                      </span>
                    </span>
                  )}

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold tracking-tight text-ink" title={p.name}>
                      {getPersonDisplayName(p.name)}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-muted">
                      {isMe ? "Ben" : p.isAdmin ? "Yönetici" : "Ekip"}
                    </span>
                  </span>

                  {/* Açık iş sayısı — kartın tek büyük rakamı. */}
                  <span
                    className={cn(
                      "grid h-11 min-w-11 shrink-0 place-items-center rounded-xl border px-2 text-lg font-semibold tabular-nums",
                      "bg-surface",
                      load.open === 0 && "border-line text-subtle",
                    )}
                    style={load.open > 0 ? { ...st.text, ...st.border } : undefined}
                    title="Açık iş"
                  >
                    {load.open}
                  </span>
                </div>

                {/* Alt şerit — Aslı Hanım'ın istediği üç sayı:
                    tamamlanmış / devam eden / gecikmiş. */}
                <div className="grid grid-cols-3 divide-x divide-hairline border-t border-hairline text-[11.5px]">
                  <Stat icon={Activity} value={load.inProgress} label="devam" className="text-info" />
                  <Stat icon={CheckCircle2} value={load.done} label="bitti" className="text-success" />
                  {load.overdue > 0 ? (
                    <Stat icon={AlertTriangle} value={load.overdue} label="gecikti" className="text-danger" />
                  ) : (
                    <Stat icon={Clock3} value={0} label="zamanında" className="text-subtle" muted />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({
  icon: Icon, value, label, className, muted,
}: {
  icon: typeof CheckCircle2;
  value: number;
  label: string;
  className?: string;
  muted?: boolean;
}) {
  return (
    <span className="flex items-center justify-center gap-1 px-1.5 py-2">
      <Icon size={12} className={cn("shrink-0", className)} />
      {!muted && <b className={cn("font-semibold tabular-nums", className)}>{value}</b>}
      <span className="truncate text-subtle">{label}</span>
    </span>
  );
}

/** Kişi kartı yüklerini ham görevlerden hesaplar. */
export function buildPersonLoads(
  tasks: Task[],
  people: GridPerson[],
  todayIso: string,
): Record<string, PersonLoad> {
  const out: Record<string, PersonLoad> = {};
  for (const p of people) out[p.filterKey] = { open: 0, inProgress: 0, done: 0, overdue: 0 };

  for (const t of tasks) {
    const collabs = (t.custom_fields as Record<string, unknown> | null)?.collaborators;
    const collabList = Array.isArray(collabs) ? (collabs as string[]) : [];
    // Bir görev sorumlusuna VE iş birliği yapan kişilere sayılır — Aslı Hanım'ın
    // "sorumlu kişinin iş birliğini koyacaksın" isteğinin doğrudan sonucu.
    const ids = new Set<string>([
      ...(t.assignee_id ? [`member:${t.assignee_id}`] : []),
      ...(t.responsible_contact_id ? [`contact:${t.responsible_contact_id}`] : []),
      ...collabList.flatMap((id) => [`member:${id}`, `contact:${id}`]),
    ]);
    for (const key of ids) {
      const bucket = out[key];
      if (!bucket) continue;
      if (t.status === "done") { bucket.done++; continue; }
      bucket.open++;
      if (t.status === "in_progress" || t.status === "review") bucket.inProgress++;
      if (t.due_date && String(t.due_date).slice(0, 10) < todayIso) bucket.overdue++;
    }
  }
  return out;
}
