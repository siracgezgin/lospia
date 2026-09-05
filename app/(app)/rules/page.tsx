import { createClient, getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { redirectToSignIn } from "@/lib/auth/session-redirect";
import { RulesView } from "@/components/rules/RulesView";
import { markRulesSeen } from "@/lib/actions/members";
import type { WorkspaceRule, WorkspaceRole, WorkspaceDepartment } from "@/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Rules" };

export default async function RulesPage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirectToSignIn();

  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  const workspaceId = member?.workspace_id;
  const userRole = (member?.role ?? "member") as WorkspaceRole;
  if (!workspaceId) redirectToSignIn();

  const [rulesResult, deptsResult] = await Promise.all([
    supabase
      .from("workspace_rules")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("position")
      .order("created_at"),
    supabase
      .from("workspace_departments")
      .select("id, parent_id, name")
      .eq("workspace_id", workspaceId)
      .is("parent_id", null)
      .order("position"),
    markRulesSeen(),
  ]);

  const rules = (rulesResult.data ?? []) as WorkspaceRule[];
  const departmentNames = ((deptsResult.data ?? []) as Pick<WorkspaceDepartment, "name">[]).map((d) => d.name);

  return <RulesView rules={rules} workspaceId={workspaceId} userRole={userRole} departmentNames={departmentNames} />;
}
