import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { env } from '@/lib/env';

/** Request-scoped client that respects RLS as the signed-in user. */
export function getServerClient() {
  const cookieStore = cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items: { name: string; value: string; options?: Record<string, unknown> }[]) => {
        try {
          items.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options as never),
          );
        } catch {
          // Called from a Server Component: middleware refreshes the session instead.
        }
      },
    },
  });
}

export async function getCurrentUser() {
  const { data } = await getServerClient().auth.getUser();
  return data.user ?? null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error('UNAUTHENTICATED');
  return user;
}
