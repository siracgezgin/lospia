// Module: Realtime — task-detail activity subscription
// gated by NEXT_PUBLIC_FEATURE_REALTIME_ENABLED=true
//
// Only subscribes to task_activity for the current task.
// Must be used inside a Client Component with cleanup on unmount.
// If risky, leave REALTIME_ENABLED=false (default) — all other features work normally.

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { featureFlags } from "@/lib/utils/feature-flags";
import type { TaskActivity } from "@/types";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface UseTaskActivityRealtimeOptions {
  taskId: string;
  onNewActivity: (activity: TaskActivity) => void;
}

/**
 * Subscribe to task_activity inserts for a specific task.
 * Returns a cleanup function (called automatically on unmount via useEffect).
 * No-op when REALTIME_ENABLED=false.
 */
export function useTaskActivityRealtime({ taskId, onNewActivity }: UseTaskActivityRealtimeOptions): void {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const callbackRef = useRef(onNewActivity);

  // Keep callback ref current without causing re-subscription
  useEffect(() => {
    callbackRef.current = onNewActivity;
  });

  useEffect(() => {
    if (!featureFlags.realtime) return;

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
          const _activity = payload.new as TaskActivity;
          callbackRef.current(_activity);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel).catch(() => {});
      channelRef.current = null;
    };
  }, [taskId]);
}
