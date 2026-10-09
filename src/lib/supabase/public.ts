import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/*
  The public, session-free client: every request runs as anon, so a result is the same for every visitor and is
  safe to cache ("use cache"). Use it for the catalog, the salon data and the gallery only. Anything that depends on who is
  signed in uses src/lib/supabase/server.ts, which reads the cookies and must never run inside "use cache"
  (eslint: adli/no-session-in-cache).
*/
export function createPublicClient() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
