"use server";

import { createClient } from "@/lib/supabase/server";
import { getPersonDisplayName } from "@/lib/utils/person-display";

/**
 * TAKVİMİN ETKİNLİK GEÇMİŞİ — "kim ne yaptı, saat kaçta".
 *
 * Sıraç (2026-09-12): "Calendar'da da Excel'deki gibi üstte geçmiş hareketler
 * gibi bir etkinlik geçmişi kısmı olsun; kim ne yaptı, ne ekledi, sildi vs.
 * görülsün, saat kaçta."
 *
 * YENİ TABLO AÇILMADI. `workspace_activity_logs` (20240332) göreve bağlı
 * olmayan her olayın kapısı ve `action`/`entity_type` serbest metin. Takvim
 * oraya yazıyor; burası yalnız TAKVİM satırlarını süzüp okuyor. Kazancı:
 * migration beklemeden çalışır, /activity sayfasındaki genel akışta da aynı
 * satırlar görünür — denetim yaparken iki listeye bakılmaz.
 *
 * YETKİ: RLS "çalışma alanı üyesi okur" diyor, o yeterli. Ayrıca yönetici
 * şartı KOYMUYORUZ — takvimi görebilen onun geçmişini de görebilmeli; kim ne
 * yaptığını saklamak ekip içinde güven değil şüphe üretir.
 */

/** Takvimin yazdığı eylemler — okurken de bu liste süzer. */
const CALENDAR_ACTIONS = [
  "meeting_created", "meeting_renamed", "meeting_deleted", "meeting_duplicated",
  "meeting_invited", "topic_added", "topic_deleted", "topic_done",
  "topic_missed", "topic_moved",
] as const;

export interface CalendarActivityRow {
  id: string;
  action: string;
  createdAt: string;
  actorName: string;
  label: string | null;
  /** "8 Eylül · 10:00" gibi, varsa olayın işaret ettiği gün/saat. */
  whenLabel: string | null;
}

type MaybeArray<T> = T | T[] | null;
const one = <T,>(v: MaybeArray<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v);

export async function fetchCalendarActivity(
  limit = 60,
): Promise<CalendarActivityRow[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!member) return [];

  const { data, error } = await supabase
    .from("workspace_activity_logs")
    .select("id, action, entity_label, metadata, created_at, actor:profiles!actor_id(full_name, email)")
    .eq("workspace_id", (member as { workspace_id: string }).workspace_id)
    .in("action", CALENDAR_ACTIONS as unknown as string[])
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  /* Günlük OKUNAMAZSA ekran boş bir liste gösterir, hata fırlatmaz: geçmiş bir
     kolaylık, takvimin çalışmasının şartı değil. */
  if (error) return [];

  return ((data ?? []) as {
    id: string; action: string; entity_label: string | null;
    metadata: unknown; created_at: string;
    actor: MaybeArray<{ full_name: string | null; email: string | null }>;
  }[]).map((r) => {
    const a = one(r.actor);
    const meta = (r.metadata ?? {}) as { date?: string; slot?: string };
    const whenLabel = meta.date
      ? [formatDayTR(meta.date), meta.slot].filter(Boolean).join(" · ")
      : null;
    return {
      id: r.id,
      action: r.action,
      createdAt: r.created_at,
      actorName: getPersonDisplayName({ full_name: a?.full_name ?? null, email: a?.email ?? null }),
      label: r.entity_label,
      whenLabel,
    };
  });
}

/** "2026-09-08" → "8 Eylül". Bozuk değer olduğu gibi döner. */
function formatDayTR(iso: string): string {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long" }).format(d);
}
