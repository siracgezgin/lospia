import { STATUS_LABELS, PRIORITY_LABELS } from "@/lib/utils/task-constants";
import { formatDateTR } from "@/lib/utils/format-date";
import type { TaskStatus, TaskPriority, TaskActivityLog } from "@/types";

// Resolve a member/contact id to a display name. Returns null for unknown ids.
export type NameResolver = (_id: string | null | undefined) => string | null;

function statusLabel(v: unknown): string {
  if (typeof v === "string" && v in STATUS_LABELS) return STATUS_LABELS[v as TaskStatus];
  return String(v ?? "—");
}

function priorityLabel(v: unknown): string {
  if (typeof v === "string" && v in PRIORITY_LABELS) return PRIORITY_LABELS[v as TaskPriority];
  return String(v ?? "—");
}

function dateLabel(v: unknown): string {
  if (typeof v !== "string" || !v) return "—";
  try {
    return formatDateTR(v, { day: "numeric", month: "long" });
  } catch {
    return v;
  }
}

function transition(a: string, b: string): string {
  return `${a} → ${b}`;
}

// Sanitize a raw stored value for display: unwrap accidental surrounding quotes
// (e.g. a JSON-encoded string like "Test") and trim whitespace.
function cleanStr(v: unknown): string {
  if (v == null) return "—";
  let s = String(v).trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  return s || "—";
}

/**
 * Build the human-readable Turkish message body for a single audit log row.
 * The actor name is rendered separately by the UI, so this returns just the
 * verb phrase (e.g. "görevi oluşturdu.").
 */
export function activityMessage(
  log: Pick<TaskActivityLog, "action" | "old_value" | "new_value">,
  resolveName: NameResolver,
): string {
  const oldV = log.old_value;
  const newV = log.new_value;

  switch (log.action) {
    case "task_created":
      return "görevi oluşturdu.";
    case "task_completed":
      return "görevi tamamladı.";
    case "task_reopened":
      return "görevi yeniden açtı.";
    case "task_archived":
      return "görevi arşivledi.";
    case "task_unarchived":
      return "görevi arşivden çıkardı.";
    case "task_trashed":
      return "görevi çöpe taşıdı.";
    case "task_restored":
      return "görevi geri yükledi.";
    case "task_duplicated":
      return "görevi çoğalttı.";
    case "title_changed":
      return "başlığı değiştirdi.";
    case "description_changed":
      return "açıklamayı güncelledi.";
    case "tags_changed":
      return "etiketleri güncelledi.";
    case "approval_changed":
      return "onay durumunu güncelledi.";
    case "status_changed":
      return `durumu ${transition(statusLabel(oldV), statusLabel(newV))} olarak değiştirdi.`;
    case "priority_changed":
      return `önceliği ${transition(priorityLabel(oldV), priorityLabel(newV))} olarak değiştirdi.`;
    case "due_date_changed":
      return `teslim tarihini ${transition(dateLabel(oldV), dateLabel(newV))} olarak değiştirdi.`;
    case "category_changed":
      return `konuyu ${transition(cleanStr(oldV), cleanStr(newV))} olarak değiştirdi.`;
    case "assignee_changed": {
      const name = resolveName(typeof newV === "string" ? newV : null);
      return name
        ? `sorumluyu ${name} olarak değiştirdi.`
        : "sorumluyu kaldırdı.";
    }
    case "responsible_contact_changed": {
      const name = resolveName(typeof newV === "string" ? newV : null);
      return name
        ? `sorumlu kişiyi ${name} olarak değiştirdi.`
        : "sorumlu kişiyi kaldırdı.";
    }
    case "waiting_person_changed": {
      const nv = (newV ?? {}) as { member_id?: string | null; contact_id?: string | null };
      const name = resolveName(nv.member_id) ?? resolveName(nv.contact_id);
      return name
        ? `beklenen kişiyi ${name} olarak değiştirdi.`
        : "bekleme durumunu güncelledi.";
    }
    default:
      return "görevi güncelledi.";
  }
}
