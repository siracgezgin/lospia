import { TOPIC_ROWS, type RuntimeBand } from "@/lib/planning/bands";
import type { PlanningMeetingWithTopics, PlanningTopic } from "@/types";

/**
 * (gün|saat) → toplantı(lar) ve "Konu N" satırları.
 *
 * Bu hesap PlanningBoard'un içinde gömülüydü. Ay görünümü de aynı gün kartını
 * açtığı için (Sıraç, 2026-09-10: "bir güne bastıktan sonra direkt haftalık
 * olan açılıyor, kendi yerinde kalmıyor") aynı veriye ihtiyaç duyuyor —
 * kopyalamak yerine tek kaynağa taşındı. İki ekran birebir aynı şeyi görür.
 */
export const DEFAULT_TOPIC_ROWS = 3;

export function buildCells(
  meetings: PlanningMeetingWithTopics[],
  days: string[],
  bands: RuntimeBand[],
): {
  byCell: Map<string, PlanningMeetingWithTopics[]>;
  topicRows: Map<string, (PlanningTopic | null)[]>;
  rowCountOfSlot: Map<string, number>;
  extraSlots: string[];
} {
  const byCell = new Map<string, PlanningMeetingWithTopics[]>();
  for (const m of meetings) {
    const key = `${m.meeting_date}|${m.time_slot}`;
    if (!byCell.has(key)) byCell.set(key, []);
    byCell.get(key)!.push(m);
  }

  const known = new Set(bands.map((b) => b.slot));
  const extraSlots = [...new Set(meetings.map((m) => m.time_slot))]
    .filter((s) => !known.has(s))
    .sort();

  const topicRows = new Map<string, (PlanningTopic | null)[]>();
  const rowCountOfSlot = new Map<string, number>();
  const slots = [...new Set(meetings.map((m) => m.time_slot).concat(bands.map((b) => b.slot)))];

  for (const slot of slots) {
    let used = 0;
    for (const iso of days) {
      const key = `${iso}|${slot}`;
      const all = (byCell.get(key) ?? [])
        .flatMap((m) => m.topics)
        .sort((a, b) => a.position - b.position);
      const rows: (PlanningTopic | null)[] = Array.from({ length: TOPIC_ROWS }, () => null);
      for (const t of all) {
        if (t.position >= 0 && t.position < TOPIC_ROWS && rows[t.position] === null) rows[t.position] = t;
        else rows.push(t);
      }
      topicRows.set(key, rows);
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i]) { used = Math.max(used, i + 1); break; }
      }
    }
    /* EN DOLU GÜNÜN ALTINDA HER ZAMAN BİR BOŞ SATIR.
       Sıraç (2026-10-27): pazartesinin "EF Bol Model Elbise"sini salının
       dördüncü konusunun altına sürüklemek istedi; salı dolu olduğu için
       bırakacak hücre yoktu. "+ Konu ekle" satırı bir düğmedir, bırakma
       hedefi değildir. Artık son dolu satırın altında boş bir "Konu N+1"
       hep durur; konu oraya sürüklenebilir. */
    rowCountOfSlot.set(slot, Math.max(used + 1, DEFAULT_TOPIC_ROWS));
  }

  return { byCell, topicRows, rowCountOfSlot, extraSlots };
}
