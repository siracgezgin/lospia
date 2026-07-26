"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { featureFlags } from "@/lib/utils/feature-flags";
import type { RealtimeChannel } from "@supabase/supabase-js";

// Tables whose changes should surface on the board/list without a manual reload.
const WATCHED_TABLES = [
  "tasks",
  "workspace_notes",
  "workspace_rules",
  "workspace_members",
  "notifications",
] as const;

// Polling cadence for the fallback path. Her refresh, layout + sayfanın TÜM
// server sorgularını yeniden çalıştırır; 15sn'lik tempo uygulamayı sürekli
// meşgul edip "donma" hissi yaratıyordu. 60sn: değişiklik yine kendiliğinden
// gelir, etkileşim akıcı kalır. (Anlık senkron istenirse REALTIME_ENABLED aç.)
const POLL_MS = 60_000;

/**
 * Keeps a workspace-scoped view fresh without a manual reload.
 *
 * Two layers, either of which is enough on its own:
 *   1. Server actions already `revalidatePath` after every mutation, so the
 *      person who made a change sees it immediately.
 *   2. This component covers *other people's* changes:
 *      - REALTIME_ENABLED → Supabase Postgres change subscription (workspace
 *        scoped) → debounced `router.refresh()`.
 *      - otherwise → light polling that only runs while the tab is visible.
 *
 * Renders nothing. Mount once per live view (e.g. the board).
 */
export function WorkspaceLiveRefresh({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce refreshes so a burst of changes triggers a single re-render.
  function scheduleRefresh() {
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      if (document.visibilityState === "visible") router.refresh();
    }, 400);
  }

  // ── Realtime path ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!featureFlags.realtime || !workspaceId) return;
    const supabase = createClient();
    const channel: RealtimeChannel = supabase.channel(`workspace-live:${workspaceId}`);
    for (const table of WATCHED_TABLES) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `workspace_id=eq.${workspaceId}` },
        () => scheduleRefresh(),
      );
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Polling fallback ─────────────────────────────────────────────────────
  useEffect(() => {
    if (featureFlags.realtime) return; // realtime already covers it
    let timer: ReturnType<typeof setInterval> | null = null;

    function start() {
      if (timer) return;
      timer = setInterval(() => {
        if (document.visibilityState === "visible") router.refresh();
      }, POLL_MS);
    }
    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
    }
    function onVisibility() {
      if (document.visibilityState === "visible") { router.refresh(); start(); }
      else stop();
    }

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);

  return null;
}
