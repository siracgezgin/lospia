// ---------------------------------------------------------------------------
// Display normalization for legacy notification rows
// ---------------------------------------------------------------------------
// Production already holds notifications written before the copy was
// standardized — English ("You were assigned: kursa"), verbose Turkish
// ("Göreviniz tamamlandı olarak işaretlendi"), etc. A data migration rewrites
// what it safely can, but this client-side pass guarantees nothing English or
// off-standard ever reaches the panel, even for rows the migration missed.

interface DisplayInput {
  title: string;
  body: string | null;
}

/** Pull the task name out of an "X: task name" style legacy title. */
function tail(title: string): string | null {
  const idx = title.indexOf(":");
  if (idx === -1) return null;
  const rest = title.slice(idx + 1).trim();
  return rest.length > 0 ? rest : null;
}

export function normalizeNotificationDisplay(n: DisplayInput): {
  title: string;
  body: string | null;
} {
  const title = (n.title ?? "").trim();
  const body = n.body;

  // English legacy titles -------------------------------------------------
  if (/^you were assigned/i.test(title)) {
    return { title: "Yeni görev atandı", body: body ?? tail(title) };
  }
  if (/^new comment on/i.test(title)) {
    return { title: "Göreve yorum eklendi", body: body ?? tail(title) };
  }
  if (/^task assigned/i.test(title)) {
    return { title: "Yeni görev atandı", body };
  }
  if (/^task (status changed|awaiting review)/i.test(title)) {
    return { title: "Görev onay bekliyor", body };
  }
  if (/^task completed/i.test(title)) {
    return { title: "Görev tamamlandı", body };
  }

  // Verbose / superseded Turkish titles -----------------------------------
  const TR_MAP: Record<string, string> = {
    "Size bir görev atandı": "Yeni görev atandı",
    "Bir göreve dahil edildiniz": "Göreve dahil edildiniz",
    "Görev kontrol bekliyor": "Görev onay bekliyor",
    "Göreviniz tamamlandı olarak işaretlendi": "Görev tamamlandı",
    "Bir göreviniz onaylandı. Puanınız güncellendi.": "Puanınız güncellendi",
    "Bir göreviniz yeniden açıldı. Puanınız güncellendi.": "Görev yeniden açıldı",
    "Bir göreve not eklendi": "Göreve not eklendi",
    "Bir görev sizi bekliyor": "Görev sizi bekliyor",
  };
  if (TR_MAP[title]) {
    return { title: TR_MAP[title], body };
  }

  return { title, body };
}
