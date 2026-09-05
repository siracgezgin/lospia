import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getPersonDisplayName } from "@/lib/utils/person-display";
import type { ActivityRow } from "@/components/activity/ActivityLogView";

/**
 * HAREKET AKIŞININ VERİSİ — sayfa ve "daha fazla yükle" eylemi AYNI yerden
 * okur.
 *
 * İki günlük tek akışta birleşir: `task_activity_logs` bir GÖREVİN geçmişidir,
 * `workspace_activity_logs` göreve bağlı olmayan olayları (föy indirme,
 * kategori silme) tutar. Denetim yaparken iki listeye bakılmaz.
 *
 * SAYFALAMA neden imleçli (created_at) ve neden "sınırı büyüt" değil: akış
 * sonsuz büyür; her "daha fazla"da 200 satırı yeniden çekmek her seferinde
 * daha yavaşlar. İmleçle her tur sabit maliyettedir.
 *
 * BOŞLUK GÜVENCESİ: iki tablodan ayrı ayrı N satır çekilip birleştirilirse,
 * biri çok hareketliyse diğerinin o aralıktaki satırları atlanabilir. Her iki
 * taraf da dolu döndüyse birleşim, İKİ TARAFIN EN ESKİSİNİN DAHA YENİSİNDE
 * kesilir — kesilen kısım bir sonraki turda eksiksiz gelir.
 */

/** Bir turda her tablodan çekilen satır sayısı. */
export const ACTIVITY_PAGE_SIZE = 100;

type RawActor = { full_name: string | null; email: string | null };
type MaybeArray<T> = T | T[] | null;

const one = <T,>(v: MaybeArray<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v);

type TaskLogRow = {
  id: string;
  action: string;
  created_at: string;
  task_id: string | null;
  old_value: unknown;
  new_value: unknown;
  metadata: unknown;
  actor: MaybeArray<RawActor>;
  task: MaybeArray<{ title: string | null }>;
};

type WorkspaceLogRow = {
  id: string;
  action: string;
  created_at: string;
  entity_label: string | null;
  metadata: unknown;
  actor: MaybeArray<RawActor>;
};

export type ActivityPage = {
  rows: ActivityRow[];
  /** Bir sonraki turun başlangıcı (bu zamandan ESKİ kayıtlar). */
  nextCursor: string | null;
};

export async function fetchActivityPage(
  workspaceId: string,
  before: string | null,
): Promise<ActivityPage> {
  const supabase = await createClient();

  /* `.lt()` süzgeç kademesinde uygulanır: `.order()`/`.limit()` sonrası
     dönen dönüştürücü zincirinde süzgeç metotları yok. */
  let taskFilter = supabase
    .from("task_activity_logs")
    .select(
      "id, action, created_at, task_id, old_value, new_value, metadata, actor:profiles!task_activity_logs_actor_id_fkey(full_name, email), task:tasks(title)",
    )
    .eq("workspace_id", workspaceId);
  if (before) taskFilter = taskFilter.lt("created_at", before);

  let wsFilter = supabase
    .from("workspace_activity_logs")
    .select(
      "id, action, created_at, entity_type, entity_id, entity_label, metadata, actor:profiles!workspace_activity_logs_actor_id_fkey(full_name, email)",
    )
    .eq("workspace_id", workspaceId);
  if (before) wsFilter = wsFilter.lt("created_at", before);

  const [taskResult, wsResult] = await Promise.all([
    taskFilter.order("created_at", { ascending: false }).limit(ACTIVITY_PAGE_SIZE),
    wsFilter.order("created_at", { ascending: false }).limit(ACTIVITY_PAGE_SIZE),
  ]);

  const taskLogs = (taskResult.error ? [] : (taskResult.data ?? [])) as unknown as TaskLogRow[];
  /* `workspace_activity_logs` henüz migrate edilmemişse akış yalnız görev
     günlüğünü gösterir — sayfa çökmez. */
  const wsLogs = (wsResult.error ? [] : (wsResult.data ?? [])) as unknown as WorkspaceLogRow[];

  const taskRows: ActivityRow[] = taskLogs.map((r) => {
    const actor = one(r.actor);
    const task = one(r.task);
    return {
      id: r.id,
      action: r.action,
      created_at: r.created_at,
      task_id: r.task_id,
      old_value: r.old_value,
      new_value: r.new_value,
      metadata: r.metadata,
      actor_name: actor ? getPersonDisplayName(actor.full_name ?? actor.email) : null,
      task_title: task?.title ?? null,
    };
  });

  const wsRows: ActivityRow[] = wsLogs.map((r) => {
    const actor = one(r.actor);
    return {
      id: `w-${r.id}`,
      action: r.action,
      created_at: r.created_at,
      // Göreve bağlı değil: satır bir göreve LİNK VERMEZ, nesnenin adını yazar.
      task_id: null,
      old_value: null,
      new_value: null,
      metadata: r.metadata,
      actor_name: actor ? getPersonDisplayName(actor.full_name ?? actor.email) : null,
      task_title: r.entity_label,
    };
  });

  const merged = [...taskRows, ...wsRows].sort((a, b) =>
    a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
  );

  // Dolu dönen tarafların en eskisi — birleşim bunun ilerisine geçemez.
  const taskFull = taskRows.length === ACTIVITY_PAGE_SIZE;
  const wsFull = wsRows.length === ACTIVITY_PAGE_SIZE;
  const boundaries = [
    taskFull ? taskRows[taskRows.length - 1]!.created_at : null,
    wsFull ? wsRows[wsRows.length - 1]!.created_at : null,
  ].filter((v): v is string => v !== null);
  const boundary = boundaries.length ? boundaries.reduce((a, b) => (a > b ? a : b)) : null;

  const rows = boundary ? merged.filter((r) => r.created_at >= boundary) : merged;
  const hasMore = taskFull || wsFull;
  const nextCursor = hasMore
    ? rows.length > 0
      ? rows[rows.length - 1]!.created_at
      : boundary
    : null;

  return { rows, nextCursor };
}
