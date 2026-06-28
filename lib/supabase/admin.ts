// Server-only Supabase admin client (service_role).
//
// SECURITY: This uses SUPABASE_SERVICE_ROLE_KEY and bypasses RLS. It must NEVER
// be imported from a client component or shipped to the browser. It is only used
// inside "use server" actions. The runtime guard below hard-fails if it is ever
// evaluated in a browser context.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

if (typeof window !== "undefined") {
  throw new Error("lib/supabase/admin.ts must never be imported in the browser");
}

let cached: SupabaseClient | null = null;

/** Returns a service-role client, or null if the server isn't configured. */
export function getAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  if (cached) return cached;
  cached = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
