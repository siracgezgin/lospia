/**
 * Shared "is this task related to this person?" logic.
 *
 * A person can be a workspace member (auth/profile) or a non-auth CRM contact.
 * A task relates to them when they are the assignee, the responsible contact, a
 * listed collaborator, or the original owner (the latter two live in
 * custom_fields and are matched by id OR by name, since Excel-imported rows
 * store names, not ids).
 *
 * Used by:
 *  - the List page person filter (?person=<id>) — one descriptor vs each task
 *  - the CRM contact "X görev" counts — every contact descriptor vs each task
 * so the count shown in CRM and the list you land on always agree.
 */

export type PersonMatchTask = {
  assignee_id?: string | null;
  responsible_contact_id?: string | null;
  custom_fields?: unknown;
};

export interface PersonDescriptor {
  /** The selected person id (contact id, or member auth/profile id). */
  id: string;
  /** Auth/profile ids that count as this person for assignee matching. */
  userIds: string[];
  /** Display names / aliases, matched (normalized) in collaborators/owner. */
  names: string[];
}

/** Diacritic-insensitive, lowercased, whitespace-collapsed name key. */
export function normalizePersonName(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/İ/g, "i").replace(/I/g, "i")
    .replace(/\s+/g, " ")
    .trim();
}

function customFieldStrings(cf: unknown, key: string): string[] {
  try {
    if (!cf || typeof cf !== "object" || Array.isArray(cf)) return [];
    const v = (cf as Record<string, unknown>)[key];
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
    if (typeof v === "string") return [v];
    return [];
  } catch {
    return [];
  }
}

export function taskMatchesPerson(task: PersonMatchTask, descriptor: PersonDescriptor): boolean {
  const { id, userIds, names } = descriptor;
  if (!id) return true;

  // Assignee — by the person's own id or any linked auth/profile id.
  if (task.assignee_id && (task.assignee_id === id || userIds.includes(task.assignee_id))) return true;

  // Responsible contact — the CRM contact id.
  if (task.responsible_contact_id && task.responsible_contact_id === id) return true;

  if (names.length === 0) return false;
  const nameKeys = new Set(names.map(normalizePersonName).filter(Boolean));
  if (nameKeys.size === 0) return false;

  // Collaborators (id or name) and original owner (name).
  const collabs = customFieldStrings(task.custom_fields, "collaborators");
  for (const c of collabs) {
    if (c === id) return true;
    if (nameKeys.has(normalizePersonName(c))) return true;
  }
  for (const o of customFieldStrings(task.custom_fields, "original_owner")) {
    if (nameKeys.has(normalizePersonName(o))) return true;
  }
  return false;
}

// ── Descriptor builders ───────────────────────────────────────────────────────

type ContactLike = { id: string; name: string; user_id?: string | null };
type ProfileLike = { id: string; full_name?: string | null; email?: string | null };

export function contactDescriptor(c: ContactLike): PersonDescriptor {
  return {
    id: c.id,
    userIds: c.user_id ? [c.user_id] : [],
    names: [c.name].filter((n): n is string => !!n),
  };
}

/**
 * Resolve a bare ?person=<id> into a full descriptor. The id is either a CRM
 * contact id or a member auth/profile id — they never collide.
 */
export function resolvePersonDescriptor(
  personId: string,
  data: { contacts: ContactLike[]; profiles: ProfileLike[] },
): PersonDescriptor {
  const contact = data.contacts.find((c) => c.id === personId);
  if (contact) return contactDescriptor(contact);

  const profile = data.profiles.find((p) => p.id === personId);
  if (profile) {
    return {
      id: personId,
      userIds: [personId],
      names: [profile.full_name, profile.email].filter((n): n is string => !!n),
    };
  }
  // Unknown id — still matches assignee/responsible by id.
  return { id: personId, userIds: [personId], names: [] };
}

/** Display name for the "<name> ile ilişkili görevler" banner. */
export function resolvePersonName(
  personId: string,
  data: { contacts: ContactLike[]; profiles: ProfileLike[] },
): string | null {
  const contact = data.contacts.find((c) => c.id === personId);
  if (contact) return contact.name;
  const profile = data.profiles.find((p) => p.id === personId);
  if (profile) return profile.full_name ?? profile.email ?? null;
  return null;
}
