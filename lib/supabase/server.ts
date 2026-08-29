// Server Component + Server Action Supabase client
// Usage: const supabase = await createClient() — call inside server components or actions
// Note: Using untyped client here; Database generic applied in Phase 14 after schema generation.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

// react/cache: aynı istek içinde tek istemci. Kabuk (layout) ve sayfa aynı
// render geçişinde çalıştığı için client kurulumu tekrarlanmaz.
export const createClient = cache(async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // setAll called from Server Component — middleware will handle session refresh
          }
        },
      },
    }
  );
});

/**
 * Oturum kullanıcısı — istek başına TEK ağ çağrısı.
 *
 * supabase.auth.getUser() Supabase Auth'a gerçek bir HTTP isteği atar. Kabuk
 * (app/(app)/layout.tsx) ve açılan sayfa aynı istekte ayrı ayrı çağırdığı için
 * her gezinmede en az iki tur atılıyordu; react/cache ile tek tura iner.
 */
export const getAuthUser = cache(async function getAuthUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});

/**
 * Kullanıcının çalışma alanı üyeliği — istek başına TEK sorgu. Kabuk ve sayfa
 * aynı satırı ayrı ayrı çekiyordu.
 */
export const getMembership = cache(async function getMembership(userId: string) {
  const supabase = await createClient();
  /* Çalışma alanının ADI da bu turda gelir (gömülü ilişki).
     Kabuk eskiden önce üyeliği çekip workspace_id'yi öğreniyor, SONRA ikinci
     bir turla workspaces satırını alıyordu — iki bağımlı tur, her gezinmede.
     Supabase uzaktayken bu tek başına ~60ms'ti. */
  const { data } = await supabase
    .from("workspace_members")
    // job_title: kabuk rol yerine ÜNVANI yazar (bkz. lib/utils/roles.ts).
    .select("workspace_id, role, notification_email, job_title, workspaces(id, name)")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as {
    workspace_id: string; role: string; notification_email: string | null;
    job_title?: string | null;
    workspaces: { id: string; name: string } | { id: string; name: string }[] | null;
  };
  const ws = Array.isArray(row.workspaces) ? row.workspaces[0] ?? null : row.workspaces;
  return {
    workspace_id: row.workspace_id,
    role: row.role,
    notification_email: row.notification_email,
    job_title: row.job_title ?? null,
    workspace: ws,
  };
});

/**
 * Kullanıcının profil satırı — istek başına TEK sorgu.
 * Kabuk (ad + e-posta) ve Ana Sayfa (selamlama) aynı satırı ayrı ayrı
 * çekiyordu; her gezinmede iki profiles isteği görünüyordu.
 */
export const getProfile = cache(async function getProfile(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("full_name, email, avatar_url")
    .eq("id", userId)
    .maybeSingle();
  return (data ?? null) as
    | { full_name: string | null; email: string | null; avatar_url: string | null }
    | null;
});
