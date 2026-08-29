import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * ÇALIŞMA ALANI GÜNLÜĞÜ — göreve bağlı OLMAYAN olayların tek yazma kapısı.
 *
 * Sıraç (2026-08-29): "Bu indirme, silme kısımları da loglarda çıksın."
 *
 * `task_activity_logs` bir GÖREVİN geçmişidir (task_id NOT NULL). Föy
 * indirmenin, kategori silmenin, klasör silmenin yazılacağı yer yoktu.
 *
 * İki kural:
 *  • Günlük İŞİ ENGELLEMEZ. Yazma başarısız olursa (migration henüz
 *    uygulanmamışsa, RLS reddederse) çağıran akış sessizce devam eder —
 *    föy indirilemedi diye kimse kalmamalı.
 *  • Silinen şeyin ADI satırda saklanır. Kayıt gittikten sonra tek okunur iz
 *    odur; yoksa günlük "bir şey silindi" demekten ibaret kalır.
 */

export const WORKSPACE_ACTIONS = {
  SHEET_DOWNLOADED: "sheet_downloaded",
  SHEET_PRINTED: "sheet_printed",
  SHEETS_EXPORTED: "sheets_exported",
  SHEET_DELETED: "sheet_deleted",
  SHEET_ARCHIVED: "sheet_archived",
  SHEET_SENT: "sheet_sent",
  CATEGORY_CREATED: "category_created",
  CATEGORY_RENAMED: "category_renamed",
  CATEGORY_DELETED: "category_deleted",
  DOCUMENT_DELETED: "document_deleted",
  FOLDER_DELETED: "folder_deleted",
  SPREADSHEET_DELETED: "spreadsheet_deleted",
  FILE_DOWNLOADED: "file_downloaded",
  CONTACT_DELETED: "contact_deleted",
} as const;

export type WorkspaceAction =
  (typeof WORKSPACE_ACTIONS)[keyof typeof WORKSPACE_ACTIONS];

export interface WorkspaceActivityEntry {
  workspaceId: string;
  actorId: string | null;
  action: WorkspaceAction | string;
  entityType: string;
  entityId?: string | null;
  /** Silinen kaydın adı — kayıt gittikten sonra okunur tek iz. */
  entityLabel?: string | null;
  metadata?: Record<string, unknown>;
}

export async function logWorkspaceActivity(
  supabase: SupabaseServerClient,
  entry: WorkspaceActivityEntry,
): Promise<void> {
  try {
    await supabase.from("workspace_activity_logs").insert({
      workspace_id: entry.workspaceId,
      actor_id: entry.actorId,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      entity_label: entry.entityLabel ?? null,
      metadata: entry.metadata ?? {},
    });
  } catch {
    /* Günlük hiçbir zaman işi engellemez. */
  }
}
