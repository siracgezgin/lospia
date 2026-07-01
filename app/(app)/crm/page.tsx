import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/modules/context";
import { CrmView } from "@/components/crm/CrmView";
import type { WorkspaceContact, Profile } from "@/types";

export const dynamic = "force-dynamic";

export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<{ segment?: string }>;
}) {
  const params = await searchParams;
  const initialSegment = typeof params.segment === "string" ? params.segment : "";

  const { supabase, user, workspaceId, isAdmin } = await getWorkspaceContext();
  if (!user) redirect("/login");
  if (!workspaceId) {
    return <div className="p-8 text-muted">Çalışma alanı bulunamadı.</div>;
  }

  const [contactsResult, membersResult, taskContactResult] = await Promise.all([
    supabase
      .from("workspace_contacts")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("name"),
    supabase
      .from("workspace_members")
      .select("user_id, role, profiles(id, full_name, email)")
      .eq("workspace_id", workspaceId),
    supabase
      .from("tasks")
      .select("responsible_contact_id")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .not("responsible_contact_id", "is", null),
  ]);

  const contacts = (contactsResult.data ?? []) as WorkspaceContact[];

  type ProfileLite = Pick<Profile, "id" | "full_name" | "email">;
  type MemberRow = { user_id: string; role: string; profiles: ProfileLite | ProfileLite[] | null };
  const members = ((membersResult.data ?? []) as unknown as MemberRow[]).map((m) => {
    const prof = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    return {
      userId: m.user_id,
      name: prof?.full_name ?? prof?.email ?? "—",
    };
  });

  // İlgili görev sayısı — count tasks per responsible contact.
  const taskCountByContact = new Map<string, number>();
  for (const row of taskContactResult.data ?? []) {
    const id = row.responsible_contact_id as string | null;
    if (!id) continue;
    taskCountByContact.set(id, (taskCountByContact.get(id) ?? 0) + 1);
  }
  const taskCounts: Record<string, number> = {};
  for (const [id, n] of taskCountByContact) taskCounts[id] = n;

  return (
    <CrmView
      contacts={contacts}
      members={members}
      taskCounts={taskCounts}
      isAdmin={isAdmin}
      initialSegment={initialSegment}
    />
  );
}
