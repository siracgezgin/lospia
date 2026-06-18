import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { RulesView } from "@/components/rules/RulesView";
import { markRulesSeen } from "@/lib/actions/members";
import type { WorkspaceRule } from "@/types";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const workspaceId = member?.workspace_id;
  if (!workspaceId) redirect("/login");

  const [rulesResult] = await Promise.all([
    supabase
      .from("workspace_rules")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("position")
      .order("created_at"),
    markRulesSeen(),
  ]);

  const rules = (rulesResult.data ?? []) as WorkspaceRule[];

  return <RulesView rules={rules} workspaceId={workspaceId} />;
}
