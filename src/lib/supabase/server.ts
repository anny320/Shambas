import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { supabaseAnonKey, supabaseUrl } from '@/lib/env';

/**
 * Supabase client for server components, route handlers and server actions.
 *
 * Always the anon key, never the service role: every query it makes is
 * constrained by Row Level Security, which is what keeps one institution out
 * of another's data.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server components cannot set cookies. The middleware refreshes
          // the session on every request, so it is safe to ignore here.
        }
      },
    },
  });
}
