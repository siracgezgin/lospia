// Module: Realtime — task-detail activity subscription
// gated by NEXT_PUBLIC_FEATURE_REALTIME_ENABLED=true
//
// Only subscribes to task_activity for the current task.
// Must be used inside a Client Component with cleanup on unmount.
// If risky, leave REALTIME_ENABLED=false (default) — all other features work
// normally: server actions revalidate after every mutation, so the person who
// made a change always sees it.

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { featureFlags } from "@/lib/utils/feature-flags";
import type { TaskActivity } from "@/types";

interface UseTaskActivityRealtimeOptions {
  taskId: string;
  onNewActivity: (activity: TaskActivity) => void;
}

/**
 * Subscribe to task_activity inserts for a specific task.
 * Cleanup runs automatically on unmount. No-op when REALTIME_ENABLED=false.
 */
export function useTaskActivityRealtime({ taskId, onNewActivity }: UseTaskActivityRealtimeOptions): void {
  const callbackRef = useRef(onNewActivity);

  // Keep callback ref current without causing re-subscription
  useEffect(() => {
    callbackRef.current = onNewActivity;
  });

  useEffect(() => {
    if (!featureFlags.realtime || !taskId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`task-activity:${taskId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "task_activity",
          filter: `task_id=eq.${taskId}`,
        },
        (payload) => {
          callbackRef.current(payload.new as TaskActivity);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [taskId]);
}
