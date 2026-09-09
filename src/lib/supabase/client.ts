'use client';

import { createBrowserClient } from '@supabase/ssr';
import { supabaseAnonKey, supabaseUrl } from '@/lib/env';

/** Supabase client for client components. Anon key only. */
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabaseAnonKey());
}
