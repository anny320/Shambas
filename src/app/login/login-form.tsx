'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Mode = 'signin' | 'signup';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setPending(true);

    const supabase = createClient();

    try {
      if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) throw signUpError;

        // With email confirmation switched on there is no session yet, so
        // say so rather than bouncing the user to a page they cannot reach.
        if (!data.session) {
          setNotice(
            'Check your inbox to confirm your email address, then sign in.',
          );
          setPending(false);
          return;
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
      }

      const next = searchParams.get('next');
      router.replace(next && next.startsWith('/') ? next : '/applications');
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Something went wrong.',
      );
      setPending(false);
    }
  }

  const field =
    'mt-1.5 w-full rounded-lg border border-ink-200 px-3 py-2.5 text-sm outline-none placeholder:text-ink-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-50';

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-2xl border border-ink-200 bg-white p-6"
    >
      <div>
        <label htmlFor="email" className="block text-sm font-semibold">
          Work email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={field}
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-semibold">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={field}
        />
        {mode === 'signup' && (
          <p className="mt-1.5 text-xs text-ink-500">At least 8 characters.</p>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-danger-50 px-3 py-2 text-sm font-medium text-danger-700"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-lg bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700"
        >
          {notice}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand-700 px-3 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
      >
        {pending
          ? 'Working…'
          : mode === 'signin'
            ? 'Sign in'
            : 'Create account'}
      </button>

      <button
        type="button"
        onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin');
          setError(null);
          setNotice(null);
        }}
        className="w-full text-center text-sm font-medium text-plum-700 underline underline-offset-4 hover:text-plum-800"
      >
        {mode === 'signin'
          ? 'New institution? Create an account'
          : 'Already have an account? Sign in'}
      </button>
    </form>
  );
}
