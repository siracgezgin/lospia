"use server";
// Module: AI — summarizeTask server action
// gated by NEXT_PUBLIC_FEATURE_AI_ENABLED=true
// Uses Anthropic Claude. App boots fine without API key (returns disabled state).

import { featureFlags } from "@/lib/utils/feature-flags";
import { createClient } from "@/lib/supabase/server";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const AI_MODEL = process.env.AI_MODEL ?? "claude-opus-4-8";

export type SummarizeResult =
  | { summary: string }
  | { disabled: true; reason: string }
  | { error: string };

export async function summarizeTask(taskId: string): Promise<SummarizeResult> {
  if (!featureFlags.ai) {
    return { disabled: true, reason: "AI feature is disabled (set NEXT_PUBLIC_FEATURE_AI_ENABLED=true)" };
  }

  if (!ANTHROPIC_API_KEY) {
    return { disabled: true, reason: "No ANTHROPIC_API_KEY configured" };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Fetch task + recent activity
  const [taskResult, activityResult] = await Promise.all([
    supabase.from("tasks").select("*").eq("id", taskId).single(),
    supabase
      .from("task_activity")
      .select("type, content, created_at")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  if (!taskResult.data) return { error: "Task not found" };

  const task = taskResult.data as { title: string; description: string | null; status: string; priority: string; tags: string[] };
  const activity = activityResult.data ?? [];

  const prompt = `Summarize this task concisely in 2-3 sentences for a team standup:

Title: ${task.title}
Status: ${task.status}
Priority: ${task.priority}
Description: ${task.description ?? "(none)"}
Tags: ${task.tags.join(", ") || "(none)"}
Recent activity (newest first):
${activity.map((a: { type: string; content: string | null; created_at: string }) => `- [${a.type}] ${a.content ?? ""}`).join("\n") || "(no activity)"}

Focus on: current status, what's blocking it (if any), and what action is needed next.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 256,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return { error: `AI API error: ${response.status} ${err.slice(0, 200)}` };
    }

    const json = await response.json();
    const summary = json.content?.[0]?.text ?? "";
    return { summary };
  } catch (err) {
    return { error: `Network error: ${String(err)}` };
  }
}
