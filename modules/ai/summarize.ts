"use server";
// Module: AI — summarizeTask server action
// gated by NEXT_PUBLIC_FEATURE_AI_ENABLED=true
//
// Uses the Anthropic Messages API over plain HTTPS (the project intentionally
// carries no Anthropic SDK dependency). The app boots and runs normally with
// the flag off or the key missing — every path returns a described state
// instead of throwing, so no screen can break because of this module.

import { featureFlags } from "@/lib/utils/feature-flags";
import { createClient } from "@/lib/supabase/server";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
/** Model id — override with AI_MODEL only for a deliberate, tested change. */
const AI_MODEL = process.env.AI_MODEL ?? "claude-opus-5";
/** Thinking runs by default on this model; leave room or the text is cut off. */
const MAX_TOKENS = 4096;
/** Sunucu isteği burada asılı kalmasın — sayfa bir özet için beklemez. */
const TIMEOUT_MS = 30_000;

export type SummarizeResult =
  | { summary: string }
  | { disabled: true; reason: string }
  | { error: string };

/** Anthropic yanıtının yalnız kullandığımız alanları. */
interface AnthropicMessageResponse {
  content?: Array<{ type: string; text?: string }>;
  stop_reason?: string | null;
}

export async function summarizeTask(taskId: string): Promise<SummarizeResult> {
  if (!featureFlags.ai) {
    return { disabled: true, reason: "AI özeti kapalı (NEXT_PUBLIC_FEATURE_AI_ENABLED=true yapın)." };
  }

  if (!ANTHROPIC_API_KEY) {
    return { disabled: true, reason: "AI anahtarı sunucuda tanımlı değil (ANTHROPIC_API_KEY)." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };

  // Görev + son hareketler. Okuma RLS ile yapılır: kişi göremediği bir görevin
  // özetini de alamaz.
  const [taskResult, activityResult] = await Promise.all([
    supabase
      .from("tasks")
      .select("title, description, status, priority, tags")
      .eq("id", taskId)
      .maybeSingle(),
    supabase
      .from("task_activity")
      .select("type, content, created_at")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  if (taskResult.error) return { error: "Görev okunamadı." };
  if (!taskResult.data) return { error: "Görev bulunamadı." };

  const task = taskResult.data as {
    title: string;
    description: string | null;
    status: string;
    priority: string;
    tags: string[] | null;
  };
  const activity = (activityResult.data ?? []) as Array<{
    type: string;
    content: string | null;
  }>;

  const prompt = `Aşağıdaki görevi ekip toplantısı için 2-3 cümlede özetle. Türkçe yaz.

Başlık: ${task.title}
Durum: ${task.status}
Öncelik: ${task.priority}
Açıklama: ${task.description ?? "(yok)"}
Etiketler: ${(task.tags ?? []).join(", ") || "(yok)"}
Son hareketler (yeniden eskiye):
${activity.map((a) => `- [${a.type}] ${a.content ?? ""}`).join("\n") || "(hareket yok)"}

Şunlara odaklan: mevcut durum, varsa engel, sıradaki adım. Yalnız özeti yaz.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
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
        max_tokens: MAX_TOKENS,
        // Kısa bir özet için düşük eforun kalitesi yeter, maliyeti düşüktür.
        output_config: { effort: "low" },
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      // Durum kodu ve sağlayıcının mesajı loglanır; ANAHTAR asla loglanmaz ve
      // kullanıcıya sağlayıcı metni değil, sade bir cümle döner.
      const detail = await response.text().catch(() => "");
      console.error(`[ai] özet alınamadı: ${response.status} ${detail.slice(0, 300)}`);
      return { error: "Özet alınamadı, birazdan tekrar deneyin." };
    }

    const json = (await response.json()) as AnthropicMessageResponse;

    if (json.stop_reason === "refusal") {
      return { error: "Model bu içeriği özetlemeyi reddetti." };
    }

    // İlk METİN bloğu alınır: yanıtın başında düşünme blokları olabilir,
    // content[0] her zaman metin değildir.
    const summary = (json.content ?? []).find((b) => b.type === "text")?.text?.trim() ?? "";
    if (!summary) {
      if (json.stop_reason === "max_tokens") {
        return { error: "Özet sığmadı; görev metni çok uzun." };
      }
      return { error: "Model boş yanıt döndürdü." };
    }
    return { summary };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    console.error("[ai] özet isteği başarısız:", error instanceof Error ? error.message : String(error));
    return { error: aborted ? "Özet zaman aşımına uğradı." : "Özet servisine ulaşılamadı." };
  } finally {
    clearTimeout(timer);
  }
}
