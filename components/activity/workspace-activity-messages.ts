import { WORKSPACE_ACTIONS } from "@/lib/activity/log-workspace-activity";

/**
 * Günlük satırının insan diline çevrilmesi.
 *
 * Fiil ÖNCE gelir ("Föy indirdi — Beyaz Dantel Etek"): denetim yaparken
 * aranan şey eylemdir, nesne değil.
 */
export function workspaceActivityMessage(row: {
  action: string;
  entity_label: string | null;
  metadata: Record<string, unknown> | null;
}): string {
  const name = row.entity_label?.trim();
  const withName = (verb: string) => (name ? `${verb} — ${name}` : verb);

  switch (row.action) {
    case WORKSPACE_ACTIONS.SHEET_DOWNLOADED:  return withName("Föyü Excel olarak indirdi");
    case WORKSPACE_ACTIONS.SHEET_PRINTED:     return withName("Föyün çıktısını aldı");
    case WORKSPACE_ACTIONS.SHEETS_EXPORTED: {
      const n = Number(row.metadata?.count ?? 0);
      return n > 0 ? `Tüm föyleri indirdi (${n} föy)` : "Tüm föyleri indirdi";
    }
    case WORKSPACE_ACTIONS.SHEET_DELETED:     return withName("Föyü sildi");
    case WORKSPACE_ACTIONS.SHEET_ARCHIVED:    return withName("Föyü arşivledi");
    case WORKSPACE_ACTIONS.SHEET_SENT:        return withName("Föyü üreticiye gönderdi");
    case WORKSPACE_ACTIONS.CATEGORY_CREATED:  return withName("Kategori açtı");
    case WORKSPACE_ACTIONS.CATEGORY_RENAMED:  return withName("Kategoriyi yeniden adlandırdı");
    case WORKSPACE_ACTIONS.CATEGORY_DELETED:  return withName("Kategoriyi sildi");
    case WORKSPACE_ACTIONS.DOCUMENT_DELETED:  return withName("Dokümanı sildi");
    case WORKSPACE_ACTIONS.FOLDER_DELETED:    return withName("Klasörü sildi");
    case WORKSPACE_ACTIONS.SPREADSHEET_DELETED: return withName("Tabloyu sildi");
    case WORKSPACE_ACTIONS.FILE_DOWNLOADED:   return withName("Dosya indirdi");
    case WORKSPACE_ACTIONS.CONTACT_DELETED:   return withName("İlişki kaydını sildi");
    default:                                  return withName(row.action);
  }
}

/** Satırın tonu — silme kırmızı, indirme nötr. */
export function workspaceActivityTone(action: string): "danger" | "muted" {
  return action.endsWith("_deleted") ? "danger" : "muted";
}
