import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { OnboardingForm } from './onboarding-form';

export const metadata = { title: 'Set up · Shamba Score' };

/**
 * Where a user lands when they have an auth identity but no institution.
 *
 * A pending invite is claimed automatically here, so an invited colleague
 * never sees this form. Everyone else names their institution and becomes
 * its first administrator.
 */
export default async function OnboardingPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: membership } = await supabase
    .from('users')
    .select('institution_id')
    .eq('id', user.id)
    .maybeSingle();

  if (membership) redirect('/applications');

  // An invited user joins the institution that invited them.
  const { data: claimed } = await supabase.rpc('claim_invite');
  if (claimed) redirect('/applications');

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div
          className="flex size-12 items-center justify-center rounded-2xl bg-brand-500 text-2xl"
          aria-hidden="true"
        >
          🏦
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-ink-900">
          Set up your institution
        </h1>
        <p className="mt-2 text-sm text-ink-500">
          Signed in as {user.email}. Name the lender, SACCO or dealer you work
          for. Everything you create from here on belongs to it, and no other
          institution can see any of it.
        </p>
        <div className="mt-6">
          <OnboardingForm />
        </div>
      </div>
    </main>
  );
}
