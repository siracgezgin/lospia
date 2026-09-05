/**
 * E-POSTA → GÖREV — /api/inbound-email
 *
 * NEXT_PUBLIC_FEATURE_EMAIL_TO_TASK_ENABLED bayrağı ile açılır; kapalıyken
 * uç nokta 404 döner (uygulamada bu akışa ait hiçbir düğme yoktur).
 *
 * Beklenen istek — Cloudflare Email Routing worker'ı
 * (modules/email-to-task/cloudflare-worker.ts) tam olarak bunu gönderir:
 *
 *   POST /api/inbound-email
 *   x-email-signature: <ham gövdenin HMAC-SHA256 imzası, hex>
 *   { "subject": "...", "body_text": "...", "from": "...",
 *     "workspace_alias": "<workspace slug>" }
 *
 * İMZA HAM GÖVDE ÜZERİNDEN doğrulanır. Eskiden imza gövdenin İÇİNDE
 * (hmac_signature alanı) taşınıyor ve sunucu gövdeyi yeniden JSON'a çevirip
 * imzalıyordu; alan sırası ya da tek bir boşluk değiştiğinde imza tutmuyordu.
 * Şimdi imzalanan bayt dizisi ile doğrulanan bayt dizisi aynı: `request.text()`.
 *
 * YETKİ: gelen istekte oturum yoktur, dolayısıyla RLS'in dayanacağı bir
 * auth.uid() de yoktur — normal istemciyle yapılan her insert sessizce
 * reddedilirdi (uç nokta bu yüzden hiç çalışmıyordu). Yazma bu sebeple
 * service_role istemcisiyle yapılır: bu SUNUCUYA ÖZEL bir dosyadır, anahtar
 * tarayıcıya asla gitmez ve kapı HMAC imzasıdır. Bayrak açıkken imza sırrı
 * (EMAIL_INBOUND_SECRET) zorunludur; yoksa uç nokta kapalı davranır —
 * "imzasız da kabul et" hâli, herkesin göreve kayıt açabilmesi demekti.
 */

import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { generateKeyBetween } from "fractional-indexing";
import { getAdminClient } from "@/lib/supabase/admin";
import { featureFlags } from "@/lib/utils/feature-flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Gövde üst sınırı — bir e-posta metni için fazlasıyla geniş, DoS'a kapalı. */
const MAX_BODY_BYTES = 512 * 1024;

/** Görev açıklamasına yazılan metnin üst sınırı. */
const MAX_TEXT_CHARS = 20_000;

const payloadSchema = z.object({
  subject: z.string().trim().min(1).max(500),
  body_text: z.string().max(MAX_TEXT_CHARS).nullish(),
  from: z.string().max(320).nullish(),
  // Workspace slug'ı: küçük harf, rakam ve tire (bkz. workspaces.slug).
  workspace_alias: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-zA-Z0-9_-]+$/, "workspace_alias yalnız harf, rakam, tire ve alt çizgi içerebilir"),
});

/** Anahtar/oturum bilgisi taşımayan düz hata metni. */
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Sabit süreli karşılaştırma — uzunluk farkında da patlamaz. */
function signatureMatches(expected: string, received: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  // Bayrak kapalı → bu uç nokta yokmuş gibi davranır.
  if (!featureFlags.emailToTask) {
    return NextResponse.json(
      { error: "disabled", mesaj: "E-posta ile görev açma kapalı." },
      { status: 404 },
    );
  }

  const secret = process.env.EMAIL_INBOUND_SECRET ?? "";
  if (!secret) {
    console.error("[inbound-email] EMAIL_INBOUND_SECRET tanımsız — istek reddedildi");
    return NextResponse.json(
      {
        error: "not_configured",
        mesaj: "E-posta girişi sunucuda yapılandırılmamış (imza sırrı eksik).",
      },
      { status: 503 },
    );
  }

  const admin = getAdminClient();
  if (!admin) {
    console.error("[inbound-email] service_role istemcisi yapılandırılmamış");
    return NextResponse.json(
      { error: "not_configured", mesaj: "E-posta girişi sunucuda yapılandırılmamış." },
      { status: 503 },
    );
  }

  // ── Ham gövde: imza da ayrıştırma da AYNI bayt dizisi üzerinden ──────────
  let raw: string;
  try {
    raw = await request.text();
  } catch (error) {
    console.error("[inbound-email] gövde okunamadı:", message(error));
    return NextResponse.json(
      { error: "unreadable_body", mesaj: "İstek gövdesi okunamadı." },
      { status: 400 },
    );
  }
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "payload_too_large", mesaj: "İstek gövdesi çok büyük." },
      { status: 413 },
    );
  }

  const signature = request.headers.get("x-email-signature")?.trim() ?? "";
  if (!signature) {
    return NextResponse.json(
      {
        error: "missing_signature",
        mesaj: "İmza eksik: ham gövdenin HMAC-SHA256 imzası x-email-signature başlığında beklenir.",
      },
      { status: 401 },
    );
  }
  const expected = createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  if (!signatureMatches(expected, signature)) {
    console.error("[inbound-email] imza doğrulanamadı");
    return NextResponse.json(
      { error: "invalid_signature", mesaj: "İmza doğrulanamadı." },
      { status: 401 },
    );
  }

  // ── Girdi doğrulama — kötü girdi 4xx döner, sessizce yutulmaz ────────────
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "invalid_json", mesaj: "Gövde geçerli bir JSON değil." },
      { status: 400 },
    );
  }

  const parsed = payloadSchema.safeParse(parsedJson);
  if (!parsed.success) {
    // Alan adı + sebep döner; gelen içeriğin kendisi loglanmaz.
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(gövde)"}: ${i.message}`);
    console.error("[inbound-email] geçersiz girdi:", issues.join(" | "));
    return NextResponse.json(
      { error: "invalid_payload", mesaj: "Eksik ya da geçersiz alanlar var.", alanlar: issues },
      { status: 400 },
    );
  }
  const payload = parsed.data;

  // ── Çalışma alanı ───────────────────────────────────────────────────────
  const { data: workspaceRow, error: wsError } = await admin
    .from("workspaces")
    .select("id, created_by")
    .eq("slug", payload.workspace_alias)
    .maybeSingle();
  const workspace = workspaceRow as { id: string; created_by: string } | null;

  if (wsError) {
    console.error("[inbound-email] çalışma alanı okunamadı:", wsError.message);
    return NextResponse.json(
      { error: "lookup_failed", mesaj: "Çalışma alanı okunamadı." },
      { status: 500 },
    );
  }
  if (!workspace) {
    return NextResponse.json(
      { error: "workspace_not_found", mesaj: "Bu adrese karşılık gelen çalışma alanı yok." },
      { status: 404 },
    );
  }

  const bodyText = payload.body_text?.trim() ? payload.body_text.trim() : null;

  // ── Denetim kaydı: önce olay, sonra görev ───────────────────────────────
  // Olay satırı görevden ÖNCE yazılır ki görev açma patlarsa bile gelen
  // e-postanın izi kalsın (aksi hâlde e-posta sessizce kaybolurdu).
  const { data: eventRow, error: eventError } = await admin
    .from("webhook_events")
    .insert({
      workspace_id: workspace.id,
      source: "email",
      raw_payload: {
        subject: payload.subject,
        from: payload.from ?? null,
        workspace_alias: payload.workspace_alias,
        body_text: bodyText,
      },
      processed: false,
    })
    .select("id")
    .single();
  const event = eventRow as { id: string } | null;

  if (eventError || !event) {
    console.error("[inbound-email] olay kaydı yazılamadı:", eventError?.message ?? "boş yanıt");
    return NextResponse.json(
      { error: "log_failed", mesaj: "Gelen e-posta kaydedilemedi." },
      { status: 500 },
    );
  }

  // Panoda en sona düşsün: mevcut en büyük sıradan sonrası. Hesaplanamazsa
  // varsayılan 'a0' kullanılır — görev yine açılır, yalnız sırası başa gelir.
  let fractionalIndex = "a0";
  try {
    const { data: lastRow } = await admin
      .from("tasks")
      .select("fractional_index")
      .eq("workspace_id", workspace.id)
      .order("fractional_index", { ascending: false })
      .limit(1)
      .maybeSingle();
    const last = lastRow as { fractional_index: string | null } | null;
    fractionalIndex = generateKeyBetween(last?.fractional_index ?? null, null);
  } catch (error) {
    console.error("[inbound-email] sıra anahtarı üretilemedi:", message(error));
  }

  const { data: taskRow, error: taskError } = await admin
    .from("tasks")
    .insert({
      workspace_id: workspace.id,
      title: payload.subject.slice(0, 500),
      description: bodyText,
      status: "backlog",
      priority: "medium",
      fractional_index: fractionalIndex,
      // Oturum yok: kaydı çalışma alanının kurucusu açmış sayılır.
      created_by: workspace.created_by,
      tags: ["email-to-task"],
    })
    .select("id")
    .single();
  const task = taskRow as { id: string } | null;

  if (taskError || !task) {
    const reason = taskError?.message ?? "boş yanıt";
    console.error("[inbound-email] görev açılamadı:", reason);
    // Başarısızlık da SESSİZ KALMAZ: olay satırına sebebi yazılır.
    await admin
      .from("webhook_events")
      .update({ error: reason.slice(0, 500) })
      .eq("id", event.id);
    return NextResponse.json(
      { error: "task_create_failed", mesaj: "Görev açılamadı." },
      { status: 500 },
    );
  }

  // YALNIZ bu olay işaretlenir. (Eskiden güncelleme `processed = false` olan
  // TÜM satırlara uygulanıyordu; bir hata yığılması olduğunda hepsi bu görevin
  // kimliğiyle "işlendi" damgası yiyordu.)
  const { error: markError } = await admin
    .from("webhook_events")
    .update({ processed: true, created_task_id: task.id })
    .eq("id", event.id);
  if (markError) {
    // Görev açıldı; yalnız denetim satırı güncellenemedi — istek başarılıdır.
    console.error("[inbound-email] olay işaretlenemedi:", markError.message);
  }

  return NextResponse.json({ ok: true, task_id: task.id }, { status: 201 });
}
