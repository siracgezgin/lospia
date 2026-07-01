import { redirect } from "next/navigation";
import { requireModuleAdmin } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { CrmView } from "@/components/crm/CrmView";
import { contactDescriptor, taskMatchesPerson, type PersonMatchTask } from "@/lib/utils/task-person-match";
import { maybeDatabaseSetupRequired } from "@/lib/utils/supabase-errors";
import type { WorkspaceContact, Profile } from "@/types";

export const dynamic = "force-dynamic";

export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<{ segment?: string }>;
}) {
  const params = await searchParams;
  const initialSegment = typeof params.segment === "string" ? params.segment : "";

  const { supabase, workspaceId, gate } = await requireModuleAdmin();
  if (gate === "login") redirect("/login");
  if (gate !== "ok" || !workspaceId) return <AccessDenied />;

  const [contactsResult, membersResult, tasksResult, probeResult] = await Promise.all([
    // Base contacts always load with select("*") — resilient even when the CRM
    // migration hasn't been applied yet (missing columns are simply absent).
    supabase
      .from("workspace_contacts")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("name"),
    supabase
      .from("workspace_members")
      .select("user_id, role, profiles(id, full_name, email)")
      .eq("workspace_id", workspaceId),
    // Fields needed to relate a task to a contact (same logic + scope the List
    // filter uses — non-deleted, non-archived — so the "X görev" count and the
    // list you land on agree).
    supabase
      .from("tasks")
      .select("responsible_contact_id, assignee_id, custom_fields")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .neq("status", "archived"),
    // Probe the additive CRM columns. If the Phase 1 migration hasn't been
    // applied yet this errors with PGRST204/42703 → we render a setup banner and
    // disable migration-dependent actions instead of leaking a raw error.
    supabase
      .from("workspace_contacts")
      .select("id, crm_status, segment, user_id")
      .eq("workspace_id", workspaceId)
      .limit(1),
  ]);

  const setup = maybeDatabaseSetupRequired(probeResult.error);

  const contacts = (contactsResult.data ?? []) as WorkspaceContact[];

  type ProfileLite = Pick<Profile, "id" | "full_name" | "email">;
  type MemberRow = { user_id: string; role: string; profiles: ProfileLite | ProfileLite[] | null };
  const members = ((membersResult.data ?? []) as unknown as MemberRow[]).map((m) => {
    const prof = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    return {
      userId: m.user_id,
      name: prof?.full_name ?? prof?.email ?? "—",
      email: prof?.email ?? null,
    };
  });

  // İlgili görev sayısı — count with the shared matcher so the number matches
  // exactly what /list?person=<contactId> will display.
  const tasks = (tasksResult.data ?? []) as PersonMatchTask[];
  const descriptors = contacts.map((c) => ({ id: c.id, d: contactDescriptor(c) }));
  const taskCounts: Record<string, number> = {};
  for (const { id, d } of descriptors) {
    let n = 0;
    for (const t of tasks) if (taskMatchesPerson(t, d)) n++;
    if (n > 0) taskCounts[id] = n;
  }

  return (
    <CrmView
      contacts={contacts}
      members={members}
      taskCounts={taskCounts}
      isAdmin
      initialSegment={initialSegment}
      setupRequired={setup.setupRequired}
      setupMessage={setup.message}
      setupTechnicalDetail={setup.technicalDetail}
    />
  );
}
