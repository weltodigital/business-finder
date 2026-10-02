import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

let cached: SupabaseClient | null = null;

/**
 * Service-role client for server-side pipeline code. Bypasses RLS — never
 * import this from a client component or expose it over an unauthenticated route.
 */
export function getAdminClient(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
