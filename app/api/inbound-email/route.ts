// Module: Email-to-task inbound route
// gated by NEXT_PUBLIC_FEATURE_EMAIL_TO_TASK_ENABLED=true
//
// Expected payload (Cloudflare Email Routing worker or local mock):
//   { subject, body_text, from, workspace_alias, hmac_signature? }
//
// Cloudflare Email Routing worker stub: see scripts/cloudflare-email-worker.ts

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { featureFlags } from "@/lib/utils/feature-flags";

const EMAIL_SECRET = process.env.EMAIL_INBOUND_SECRET ?? "";

interface InboundPayload {
  subject: string;
  body_text?: string;
  from?: string;
  workspace_alias: string;
  hmac_signature?: string;
}

function verifyHmac(payload: string, signature: string): boolean {
  if (!EMAIL_SECRET) return false;
  const computed = createHmac("sha256", EMAIL_SECRET)
    .update(payload)
    .digest("hex");
  try {
    return timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!featureFlags.emailToTask) {
    return NextResponse.json({ error: "Email-to-task feature is disabled" }, { status: 404 });
  }

  let body: InboundPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Verify HMAC if secret is configured
  if (EMAIL_SECRET) {
    const rawBody = JSON.stringify(body);
    const sig = body.hmac_signature ?? request.headers.get("x-email-signature") ?? "";
    if (!verifyHmac(rawBody, sig)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  const { subject, body_text, workspace_alias } = body;
  if (!subject || !workspace_alias) {
    return NextResponse.json({ error: "Missing subject or workspace_alias" }, { status: 400 });
  }

  const supabase = await createClient();

  // Resolve workspace by slug
  const { data: workspace, error: wsError } = await supabase
    .from("workspaces")
    .select("id, created_by")
    .eq("slug", workspace_alias)
    .single();

  if (wsError || !workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Log to webhook_events for audit
  const { error: logError } = await supabase
    .from("webhook_events")
    .insert({
      workspace_id: (workspace as { id: string }).id,
      source: "email",
      raw_payload: body as unknown as Record<string, unknown>,
      processed: false,
    });

  if (logError) {
    return NextResponse.json({ error: "Failed to log event" }, { status: 500 });
  }

  // Create task (use workspace owner as creator since no auth in email flow)
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .insert({
      workspace_id: (workspace as { id: string; created_by: string }).id,
      title: subject.slice(0, 500),
      description: body_text ?? null,
      status: "backlog",
      priority: "medium",
      fractional_index: "a0",
      created_by: (workspace as { id: string; created_by: string }).created_by,
      tags: ["email-to-task"],
    })
    .select("id")
    .single();

  if (taskError) {
    return NextResponse.json({ error: taskError.message }, { status: 500 });
  }

  // Update webhook_event with created task
  await supabase
    .from("webhook_events")
    .update({ processed: true, created_task_id: (task as { id: string }).id })
    .eq("workspace_id", (workspace as { id: string }).id)
    .eq("processed", false);

  return NextResponse.json({ task_id: (task as { id: string }).id });
}
