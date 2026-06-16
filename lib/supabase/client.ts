// Browser (Client Component) Supabase client
// Usage: const supabase = createClient() — call inside client components
// Note: Using untyped client here; Database generic applied in Phase 14 after schema generation.
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
