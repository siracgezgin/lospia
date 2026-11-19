import { getWorkspaceContext } from "@/lib/modules/context";

/**
 * MÜŞTERİ CRM'i KAPISI — rol değil, İZİN LİSTESİ (customer_access).
 *
 * Yönetici olmak yetmez; satır yalnız service_role ile eklenir (bkz.
 * 20240379). Liste okunamazsa (tablo yok, satır yok) kapı KAPALIDIR.
 */
export async function requireCustomerAccess() {
  const ctx = await getWorkspaceContext();
  if (!ctx.user) return { ...ctx, gate: "login" as const, canMarkTop: false, setupError: null as { message?: string; code?: string } | null };
  if (!ctx.workspaceId) return { ...ctx, gate: "denied" as const, canMarkTop: false, setupError: null };
  const { data, error } = await ctx.supabase
    .from("customer_access")
    .select("can_mark_top")
    .eq("workspace_id", ctx.workspaceId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (error) return { ...ctx, gate: "denied" as const, canMarkTop: false, setupError: error as { message?: string; code?: string } };
  if (!data) return { ...ctx, gate: "denied" as const, canMarkTop: false, setupError: null };
  return { ...ctx, gate: "ok" as const, canMarkTop: !!(data as { can_mark_top: boolean }).can_mark_top, setupError: null };
}

/** Yalnız "kapı var mı?" — /crm sayfasındaki bağlantı için tek sorgu. */
export async function hasCustomerAccess(): Promise<boolean> {
  return (await requireCustomerAccess()).gate === "ok";
}
