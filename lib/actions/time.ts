"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function startTimer(
  taskId: string,
  workspaceId: string
): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // The DB trigger enforces one-active-timer-per-user; no extra check needed here.
  const { data, error } = await supabase
    .from("time_entries")
    .insert({
      task_id: taskId,
      workspace_id: workspaceId,
      user_id: user.id,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  // Log activity
  await supabase.from("task_activity").insert({
    task_id: taskId,
    workspace_id: workspaceId,
    user_id: user.id,
    type: "timer_start",
    content: null,
    metadata: { entry_id: (data as { id: string }).id },
  });

  revalidatePath(`/tasks/${taskId}`);
  return { id: (data as { id: string }).id };
}

export async function stopTimer(
  entryId: string,
  workspaceId: string,
  taskId: string
): Promise<{ duration_seconds: number } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Fetch the entry to compute duration
  const { data: entry, error: fetchError } = await supabase
    .from("time_entries")
    .select("started_at")
    .eq("id", entryId)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !entry) return { error: fetchError?.message ?? "Entry not found" };

  const stoppedAt = new Date();
  const startedAt = new Date((entry as { started_at: string }).started_at);
  const durationSeconds = Math.floor((stoppedAt.getTime() - startedAt.getTime()) / 1000);

  const { error } = await supabase
    .from("time_entries")
    .update({
      stopped_at: stoppedAt.toISOString(),
      duration_seconds: durationSeconds,
    })
    .eq("id", entryId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  // Log activity
  await supabase.from("task_activity").insert({
    task_id: taskId,
    workspace_id: workspaceId,
    user_id: user.id,
    type: "timer_stop",
    content: null,
    metadata: { entry_id: entryId, duration_seconds: durationSeconds },
  });

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/dashboard");
  return { duration_seconds: durationSeconds };
}

export async function getActiveTimer(
  userId: string,
  workspaceId: string
): Promise<{ id: string; task_id: string | null; started_at: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("time_entries")
    .select("id, task_id, started_at")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .is("stopped_at", null)
    .maybeSingle();

  return (data as { id: string; task_id: string | null; started_at: string } | null) ?? null;
}
