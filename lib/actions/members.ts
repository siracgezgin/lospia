"use server";

import { createClient } from "@/lib/supabase/server";

export async function markRulesSeen(): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("workspace_members")
    .update({ last_rules_seen_at: new Date().toISOString() })
    .eq("user_id", user.id);
}
