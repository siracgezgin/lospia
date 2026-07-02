/**
 * Single source of truth for "who can be assigned to a task".
 *
 * Every assignment UI (board quick-select, task-detail Sorumlu kişiler panel,
 * create-task form, list filters) builds its people list through
 * buildAssignablePeople so they always show the SAME people:
 *
 *   workspace members (auth users)  ∪  workspace_contacts (CRM)
 *
 * with contact↔user duplicates collapsed into one entry. A contact matches a
 * member when its explicit user_id link points at the member, or when the
 * normalized names are identical (Excel/CRM rows store names, not ids). The
 * member entry always wins; the matched contact's id is kept on it so callers
 * can still address the CRM row. Department membership NEVER filters this list.
 */

import { personNameKey } from "@/lib/utils/person-display";

export type AssignablePerson = {
  /** Stable select value: the auth user id for members, contact id otherwise. */
  id: string;
  type: "user" | "contact";
  /** workspace_members.id — the unit task participants (completions) use. */
  memberId: string | null;
  userId: string | null;
  contactId: string | null;
  name: string;
  email: string | null;
  isAdmin: boolean;
  /** True when a CRM contact was merged into this member entry. */
  isMatched: boolean;
};

export type AssignableMemberInput = {
  memberId: string;
  userId: string;
  name: string;
  email?: string | null;
  isAdmin?: boolean;
};

export type AssignableContactInput = {
  id: string;
  name: string;
  email?: string | null;
  user_id?: string | null;
};

export function buildAssignablePeople(input: {
  members: AssignableMemberInput[];
  contacts: AssignableContactInput[];
}): AssignablePerson[] {
  const people: AssignablePerson[] = input.members.map((m) => ({
    id: m.userId,
    type: "user",
    memberId: m.memberId,
    userId: m.userId,
    contactId: null,
    name: m.name,
    email: m.email ?? null,
    isAdmin: m.isAdmin ?? false,
    isMatched: false,
  }));

  const byUserId = new Map(people.map((p) => [p.userId as string, p]));
  const byNameKey = new Map(people.map((p) => [personNameKey(p.name), p]));

  for (const c of input.contacts) {
    const match =
      (c.user_id ? byUserId.get(c.user_id) : undefined) ??
      byNameKey.get(personNameKey(c.name));
    if (match) {
      match.isMatched = true;
      match.contactId ??= c.id;
      continue;
    }
    people.push({
      id: c.id,
      type: "contact",
      memberId: null,
      userId: c.user_id ?? null,
      contactId: c.id,
      name: c.name,
      email: c.email ?? null,
      isAdmin: false,
      isMatched: false,
    });
  }

  return people.sort((a, b) => a.name.localeCompare(b.name, "tr-TR"));
}
