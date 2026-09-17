"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toActionErrorMessage, isMissingSchemaError } from "@/lib/utils/supabase-errors";

/**
 * KOLEKSİYON IZGARASINDA SÜRÜKLE BIRAK.
 *
 * Sıraç (2026-09-17): "Bu sıraya göre değil, bizim istediğimiz şekilde olsun."
 *
 * İSTEMCİ SIRA GÖNDERMEZ, KOMŞU GÖNDERİR. Taşınan kartın yeni yerindeki
 * önündeki ve arkasındaki ürünün kimliği yeterli; `sort_order` değerini sunucu
 * okuyup ortasını hesaplıyor. Böylece ekrandaki sayı tarayıcıdan gelmiyor —
 * iki kişi aynı anda sürüklerse ikincisinin komşuları gerçek durumdan okunur.
 *
 * TEK SATIR YAZILIR. Ortası alınabilen bir aralık (1024) verildiği için
 * tablonun geri kalanına dokunulmuyor.
 */
export async function reorderCollectionSheet(
  sheetId: string,
  prevId: string | null,
  nextId: string | null,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Kimlik doğrulama gerekli." };

  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) return { error: "Kimlik doğrulama gerekli." };
  const role = member.role as string;
  /* Vitrin sırası bir tasarım kararı — Yönetici de verir, üye vermez. */
  if (role !== "owner" && role !== "admin") {
    return { error: "Sıralama yöneticiye açık." };
  }
  const workspaceId = member.workspace_id as string;

  const neighbours = [prevId, nextId].filter((v): v is string => !!v);
  let prevOrder: number | null = null;
  let nextOrder: number | null = null;

  if (neighbours.length) {
    const { data, error } = await supabase
      .from("production_sheets")
      .select("id, sort_order")
      .eq("workspace_id", workspaceId)
      .in("id", neighbours);
    if (error) {
      if (isMissingSchemaError(error)) {
        return { error: "Veritabanı güncellemesi bekleniyor (20240349). Yönetici `supabase db push` çalıştırmalı." };
      }
      return { error: toActionErrorMessage(error) };
    }
    const byId = new Map((data ?? []).map((r) => [r.id as string, r.sort_order as number | null]));
    prevOrder = prevId ? byId.get(prevId) ?? null : null;
    nextOrder = nextId ? byId.get(nextId) ?? null : null;
  }

  /* Komşunun sırası boş olabilir (föy migration'dan sonra açıldıysa). O
     durumda listenin ucuna yazmak, kartı kullanıcının bıraktığı yerden
     kopartmaktan iyidir; bir sonraki sürükleme düzeltir. */
  const STEP = 1024;
  let target: number;
  if (prevOrder !== null && nextOrder !== null) target = (prevOrder + nextOrder) / 2;
  else if (prevOrder !== null) target = prevOrder + STEP;
  else if (nextOrder !== null) target = nextOrder - STEP;
  else target = 0;

  /* İki komşu birbirine o kadar yakınsa ki arada temsil edilebilir bir sayı
     kalmadıysa (float tükendi), yazma SESSİZCE yanlış yere düşerdi. Böyle bir
     durumda hata söylenir; kullanıcı bir şeyin olmadığını görür. */
  if (!Number.isFinite(target) || target === prevOrder || target === nextOrder) {
    return { error: "Sıra aralığı doldu. Kartı biraz uzağa bırakıp yeniden deneyin." };
  }

  const { error: upErr } = await supabase
    .from("production_sheets")
    .update({ sort_order: target })
    .eq("id", sheetId)
    .eq("workspace_id", workspaceId);
  if (upErr) {
    if (isMissingSchemaError(upErr)) {
      return { error: "Veritabanı güncellemesi bekleniyor (20240349). Yönetici `supabase db push` çalıştırmalı." };
    }
    return { error: toActionErrorMessage(upErr) };
  }

  /* `updated_at` BİLEREK DOKUNULMADI: sıralamak föyü düzenlemek değil. Föy
     listelerindeki "son güncelleme" sütunu kartı sürükleyince değişmemeli. */
  revalidatePath("/collection");
  return { ok: true };
}
