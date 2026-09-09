import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import type { AppUser, Institution } from '@/lib/types/database';

export interface Session {
  user: User;
  membership: AppUser;
  institution: Institution;
}

/**
 * The signed-in user together with their institution.
 *
 * A user with an auth identity but no membership row can see nothing at all
 * (current_institution_id() returns NULL for them), so they are sent to
 * onboarding rather than shown an empty app.
 */
export async function requireSession(): Promise<Session> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: membership } = await supabase
    .from('users')
    .select('id, institution_id, email, role, created_at')
    .eq('id', user.id)
    .maybeSingle<AppUser>();

  if (!membership) redirect('/onboarding');

  const { data: institution } = await supabase
    .from('institutions')
    .select('id, name, created_at')
    .eq('id', membership.institution_id)
    .maybeSingle<Institution>();

  if (!institution) redirect('/onboarding');

  return { user, membership, institution };
}

/** The signed-in user, without requiring a membership. */
export async function getUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
